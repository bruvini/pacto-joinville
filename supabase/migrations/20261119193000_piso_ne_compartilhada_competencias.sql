-- NEs de cobertura pluricompetência: uma origem, vínculos de execução e saldo global.
BEGIN;
ALTER TABLE public.piso_obrigacoes ADD COLUMN IF NOT EXISTS ne_competencias text[];
ALTER TABLE public.piso_obrigacoes ADD COLUMN IF NOT EXISTS ne_origem_id uuid REFERENCES public.piso_obrigacoes(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS piso_ne_vinculo_unico ON public.piso_obrigacoes(participante_id,ne_origem_id) WHERE ne_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS piso_ne_origem_idx ON public.piso_obrigacoes(ne_origem_id) WHERE ne_origem_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.piso_chave_competencia_ne(p_competencia text,p_tipo text,p_exercicio integer)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_tipo='decimo_terceiro' THEN '13/'||p_exercicio::text ELSE p_competencia END;
$$;

-- Visão de leitura mantém as permissões/RLS de todas as tabelas subjacentes.
CREATE OR REPLACE VIEW public.piso_ne_compartilhadas WITH (security_invoker=true) AS
SELECT o.id AS origem_id,p.prestador_id,o.ne_competencias AS competencias,
  n.numero,o.valor_empenhado,
  g.qtd_vinculos,g.total_subempenhado,g.total_anulado,
  greatest(o.valor_empenhado-g.total_subempenhado,0) AS saldo_bruto,
  greatest(o.valor_empenhado-g.total_subempenhado-g.total_anulado,0) AS saldo_disponivel,
  COALESCE(ancora.competencia_id, destino.competencia_id) AS competencia_anulacao_id
FROM public.piso_obrigacoes o
JOIN public.piso_participantes p ON p.id=o.participante_id
JOIN public.piso_documentos n ON n.obrigacao_id=o.id AND n.tipo='nota_empenho' AND n.participante_id IS NULL
CROSS JOIN LATERAL (
  SELECT count(*) AS qtd_vinculos,
    COALESCE(sum(greatest(COALESCE((SELECT sum(s.valor) FROM public.piso_subempenhos s WHERE s.obrigacao_id=v.id),0),COALESCE(v.valor_pago,0))),0) AS total_subempenhado,
    COALESCE(sum(v.valor_anulado),0) AS total_anulado
  FROM public.piso_obrigacoes v WHERE v.id=o.id OR v.ne_origem_id=o.id
) g
LEFT JOIN LATERAL (
  SELECT pv.competencia_id FROM public.piso_obrigacoes v
  JOIN public.piso_participantes pv ON pv.id=v.participante_id
  WHERE (v.id=o.id OR v.ne_origem_id=o.id) AND
    (COALESCE(v.valor_anulado,0)>0 OR EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=v.id AND d.tipo IN ('solicitacao_anulacao','aviso_anulacao')))
  ORDER BY v.id LIMIT 1
) ancora ON true
LEFT JOIN LATERAL (
  SELECT c.id AS competencia_id FROM public.piso_competencias c
  WHERE public.piso_chave_competencia_ne(c.competencia,c.tipo_parcela,c.exercicio_referencia)=ANY(o.ne_competencias)
    AND c.status<>'encerrada'
    AND c.etapas_concluidas->>'6'='true' AND NOT (6=ANY(c.etapas_reconferir))
    -- Nunca anular enquanto alguma outra competência prevista não tiver concluído o pagamento.
    AND NOT EXISTS (
      SELECT 1 FROM unnest(o.ne_competencias) k(chave)
      WHERE k.chave<>public.piso_chave_competencia_ne(c.competencia,c.tipo_parcela,c.exercicio_referencia)
        AND NOT EXISTS (SELECT 1 FROM public.piso_competencias outra
          WHERE public.piso_chave_competencia_ne(outra.competencia,outra.tipo_parcela,outra.exercicio_referencia)=k.chave
            AND outra.etapas_concluidas->>'7'='true' AND NOT (7=ANY(outra.etapas_reconferir)))
    )
  ORDER BY (c.etapas_concluidas->>'7' IS DISTINCT FROM 'true') DESC,
    public.piso_chave_competencia_ne(c.competencia,c.tipo_parcela,c.exercicio_referencia) DESC,c.id
  LIMIT 1
) destino ON true
WHERE o.ne_origem_id IS NULL AND cardinality(o.ne_competencias)>1 AND o.valor_empenhado IS NOT NULL;
REVOKE ALL ON public.piso_ne_compartilhadas FROM PUBLIC, anon;
GRANT SELECT ON public.piso_ne_compartilhadas TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.piso_saldo_anulavel_ne(p_obrigacao uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN o.ne_origem_id IS NOT NULL OR cardinality(o.ne_competencias)>1
  THEN CASE WHEN v.competencia_anulacao_id=p.competencia_id THEN v.saldo_bruto ELSE 0 END
  ELSE greatest(o.valor_empenhado-o.valor_a_liquidar,0) END
 FROM public.piso_obrigacoes o JOIN public.piso_participantes p ON p.id=o.participante_id
 LEFT JOIN public.piso_ne_compartilhadas v ON v.origem_id=COALESCE(o.ne_origem_id,o.id)
 WHERE o.id=p_obrigacao;
$$;
REVOKE EXECUTE ON FUNCTION public.piso_saldo_anulavel_ne(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piso_saldo_anulavel_ne(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.piso_validar_ne_compartilhada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE raiz record; destino record; chave text;
BEGIN
 SELECT p.prestador_id,c.competencia,c.tipo_parcela,c.exercicio_referencia INTO destino
 FROM public.piso_participantes p JOIN public.piso_competencias c ON c.id=p.competencia_id WHERE p.id=NEW.participante_id;
 chave:=public.piso_chave_competencia_ne(destino.competencia,destino.tipo_parcela,destino.exercicio_referencia);
 IF TG_OP='UPDATE' AND NEW.ne_origem_id IS DISTINCT FROM OLD.ne_origem_id THEN RAISE EXCEPTION 'Vínculo de origem da NE é imutável.'; END IF;
 IF NEW.ne_origem_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_ne_global:'||NEW.ne_origem_id::text,0));
  SELECT o.*,p.prestador_id INTO raiz FROM public.piso_obrigacoes o JOIN public.piso_participantes p ON p.id=o.participante_id WHERE o.id=NEW.ne_origem_id;
  IF NOT FOUND OR raiz.ne_origem_id IS NOT NULL OR raiz.prestador_id<>destino.prestador_id OR NOT COALESCE(chave=ANY(raiz.ne_competencias),false)
    OR NEW.participante_id=raiz.participante_id OR NEW.ne_competencias IS NOT NULL
    OR (NEW.valor_empenhado,NEW.valor_solicitado,NEW.fonte,NEW.cr_dotacao,NEW.exercicio,NEW.origem_recurso) IS DISTINCT FROM
       (raiz.valor_empenhado,raiz.valor_solicitado,raiz.fonte,raiz.cr_dotacao,raiz.exercicio,raiz.origem_recurso)
  THEN RAISE EXCEPTION 'NE compartilhada incompatível com a instituição, competência ou dados originais.'; END IF;
 ELSIF NEW.ne_competencias IS NOT NULL THEN
  IF cardinality(NEW.ne_competencias)=0 OR NOT (chave=ANY(NEW.ne_competencias)) OR EXISTS(
   SELECT 1 FROM unnest(NEW.ne_competencias) k WHERE k IS NULL OR k !~ '^(0[1-9]|1[0-3])/[0-9]{4}$' OR right(k,4)<>right(chave,4))
   OR cardinality(NEW.ne_competencias)<>(SELECT count(DISTINCT k) FROM unnest(NEW.ne_competencias) k)
  THEN RAISE EXCEPTION 'Selecione competências válidas do mesmo exercício, incluindo a atual.'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.ne_origem_id IS NULL AND
   (NEW.ne_competencias,NEW.valor_empenhado,NEW.valor_solicitado,NEW.fonte,NEW.cr_dotacao,NEW.exercicio,NEW.origem_recurso) IS DISTINCT FROM
   (OLD.ne_competencias,OLD.valor_empenhado,OLD.valor_solicitado,OLD.fonte,OLD.cr_dotacao,OLD.exercicio,OLD.origem_recurso) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_ne_global:'||NEW.id::text,0));
  IF EXISTS(SELECT 1 FROM public.piso_obrigacoes WHERE ne_origem_id=NEW.id) THEN RAISE EXCEPTION 'Dados da NE original já vinculada são imutáveis.'; END IF;
  IF (cardinality(NEW.ne_competencias)>1 OR cardinality(OLD.ne_competencias)>1) AND NEW.ne_competencias IS DISTINCT FROM OLD.ne_competencias AND (COALESCE(NEW.valor_anulado,0)>0 OR EXISTS(SELECT 1 FROM public.piso_documentos WHERE obrigacao_id=NEW.id AND tipo IN ('solicitacao_anulacao','aviso_anulacao'))) THEN
    RAISE EXCEPTION 'Não amplie a cobertura de NE que já possui anulação registrada.';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.valor_anulado IS DISTINCT FROM OLD.valor_anulado AND COALESCE(NEW.valor_anulado,0)>0
   AND (NEW.ne_origem_id IS NOT NULL OR cardinality(NEW.ne_competencias)>1)
   AND (COALESCE(public.piso_saldo_anulavel_ne(NEW.id),0)<=0 OR abs(NEW.valor_anulado-public.piso_saldo_anulavel_ne(NEW.id))>0.01)
 THEN RAISE EXCEPTION 'Anulação antecipada ou divergente do saldo global da NE.'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS piso_ne_compartilhada_guard ON public.piso_obrigacoes;
CREATE TRIGGER piso_ne_compartilhada_guard BEFORE INSERT OR UPDATE ON public.piso_obrigacoes FOR EACH ROW EXECUTE FUNCTION public.piso_validar_ne_compartilhada();

-- As referências documentais são copiadas com os autores/datas originais, em uma única transação.
CREATE OR REPLACE FUNCTION public.piso_vincular_ne_compartilhada(p_origem uuid,p_participante uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE raiz record; alvo record; novo uuid; d record; nd uuid; chave text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]) THEN
   RAISE EXCEPTION 'Sem permissão para vincular NE.' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:'||p_participante::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('piso_ne_global:'||p_origem::text,0));
 SELECT o.*,p.prestador_id INTO raiz FROM public.piso_obrigacoes o JOIN public.piso_participantes p ON p.id=o.participante_id WHERE o.id=p_origem;
 SELECT p.prestador_id,p.competencia_id,c.competencia,c.tipo_parcela,c.exercicio_referencia,c.status INTO alvo
 FROM public.piso_participantes p JOIN public.piso_competencias c ON c.id=p.competencia_id WHERE p.id=p_participante;
 IF raiz.id IS NULL OR alvo.competencia_id IS NULL OR raiz.valor_empenhado IS NULL OR raiz.valor_empenhado<=0 OR raiz.ne_origem_id IS NOT NULL OR raiz.prestador_id<>alvo.prestador_id OR alvo.status='encerrada' OR raiz.participante_id=p_participante
   OR COALESCE(cardinality(raiz.ne_competencias),0)<2 OR NOT COALESCE(public.piso_chave_competencia_ne(alvo.competencia,alvo.tipo_parcela,alvo.exercicio_referencia)=ANY(raiz.ne_competencias), false)
 THEN RAISE EXCEPTION 'Esta NE não é reutilizável neste período/instituição.'; END IF;
 IF EXISTS(SELECT 1 FROM public.piso_obrigacoes WHERE participante_id=p_participante AND ne_origem_id=p_origem) THEN RAISE EXCEPTION 'NE já vinculada.'; END IF;
 IF EXISTS(SELECT 1 FROM public.piso_obrigacoes v JOIN public.piso_documentos d ON d.obrigacao_id=v.id WHERE (v.id=p_origem OR v.ne_origem_id=p_origem) AND d.tipo IN ('solicitacao_anulacao','aviso_anulacao')) THEN RAISE EXCEPTION 'NE em anulação não pode ser reutilizada.'; END IF;
 IF (SELECT count(DISTINCT d.tipo) FROM public.piso_documentos d WHERE d.obrigacao_id=p_origem AND d.tipo IN ('solicitacao_ne','nota_empenho') AND NULLIF(btrim(d.numero_sei),'') IS NOT NULL AND NULLIF(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.piso_assinatura_matriz m WHERE m.tipo_documento=d.tipo AND NOT m.opcional AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=d.id AND a.slot=m.slot_key))
    AND (d.tipo<>'solicitacao_ne' OR (SELECT e.acao FROM public.piso_encaminhamentos e WHERE e.documento_id=d.id ORDER BY e.ocorrido_em DESC LIMIT 1)='encaminhado'))=2 THEN NULL;
 ELSE RAISE EXCEPTION 'Complete os documentos originais de solicitação e NE antes de reutilizar.'; END IF;
 INSERT INTO public.piso_obrigacoes(participante_id,ne_origem_id,origem_recurso,fonte,cr_dotacao,exercicio,valor_empenhado,valor_solicitado,alocacao_manual,observacao)
 VALUES(p_participante,p_origem,raiz.origem_recurso,raiz.fonte,raiz.cr_dotacao,raiz.exercicio,raiz.valor_empenhado,raiz.valor_solicitado,true,'Referência à NE compartilhada original; sem nova solicitação.')
 RETURNING id INTO novo;
 FOR d IN SELECT * FROM public.piso_documentos WHERE obrigacao_id=p_origem AND tipo IN ('solicitacao_ne','nota_empenho') AND participante_id IS NULL AND subempenho_id IS NULL LOOP
   INSERT INTO public.piso_documentos(competencia_id,obrigacao_id,tipo,numero,numero_sei,link_sei,data_documento,dados,updated_by,updated_by_nome)
   VALUES(alvo.competencia_id,novo,d.tipo,d.numero,d.numero_sei,d.link_sei,d.data_documento,COALESCE(d.dados,'{}'::jsonb)||jsonb_build_object('ne_documento_origem_id',d.id),d.updated_by,d.updated_by_nome)
   RETURNING id INTO nd;
   INSERT INTO public.piso_documento_assinaturas(documento_id,slot,servidor_nome,cargo,assinado_em,assinado_por)
   SELECT nd,slot,servidor_nome,cargo,assinado_em,assinado_por FROM public.piso_documento_assinaturas WHERE documento_id=d.id;
   INSERT INTO public.piso_encaminhamentos(documento_id,acao,destino,motivo,usuario_id,usuario_nome,ocorrido_em)
   SELECT nd,acao,destino,motivo,usuario_id,usuario_nome,ocorrido_em FROM public.piso_encaminhamentos WHERE documento_id=d.id;
 END LOOP;
 RETURN novo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.piso_vincular_ne_compartilhada(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.piso_vincular_ne_compartilhada(uuid,uuid) TO authenticated,service_role;

-- Limite compartilhado: serializa o consumo do mesmo empenho entre competências.
CREATE OR REPLACE FUNCTION public.piso_validar_saldo_ne_global()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE oid uuid; raiz uuid; origem_anterior uuid; anterior_compartilhada boolean; teto numeric; total numeric; compartilhada boolean; chave_lock uuid;
BEGIN
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD.obrigacao_id ELSE NEW.obrigacao_id END;
 SELECT COALESCE(o.ne_origem_id,o.id),o.ne_origem_id IS NOT NULL OR cardinality(o.ne_competencias)>1 INTO raiz,compartilhada FROM public.piso_obrigacoes o WHERE o.id=oid;
 IF TG_OP='UPDATE' AND OLD.obrigacao_id IS DISTINCT FROM NEW.obrigacao_id THEN
   SELECT COALESCE(o.ne_origem_id,o.id),o.ne_origem_id IS NOT NULL OR cardinality(o.ne_competencias)>1 INTO origem_anterior,anterior_compartilhada FROM public.piso_obrigacoes o WHERE o.id=OLD.obrigacao_id;
 END IF;
 FOR chave_lock IN SELECT DISTINCT x FROM unnest(ARRAY[CASE WHEN compartilhada THEN raiz END,CASE WHEN anterior_compartilhada THEN origem_anterior END]) AS u(x) WHERE x IS NOT NULL ORDER BY x LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('piso_ne_global:'||chave_lock::text,0));
   IF EXISTS(SELECT 1 FROM public.piso_obrigacoes o JOIN public.piso_documentos d ON d.obrigacao_id=o.id WHERE (o.id=chave_lock OR o.ne_origem_id=chave_lock) AND d.tipo IN ('solicitacao_anulacao','aviso_anulacao')) THEN
     RAISE EXCEPTION 'A NE compartilhada está em anulação; não altere o consumo sem regularizar a anulação.';
   END IF;
 END LOOP;
 IF compartilhada IS NOT TRUE THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 SELECT valor_empenhado INTO teto FROM public.piso_obrigacoes WHERE id=raiz;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT COALESCE(sum(greatest(COALESCE((SELECT sum(s.valor) FROM public.piso_subempenhos s WHERE s.obrigacao_id=o.id AND s.id<>NEW.id),0)
  + CASE WHEN o.id=oid THEN COALESCE(NEW.valor,0) ELSE 0 END,COALESCE(o.valor_pago,0))),0) INTO total
 FROM public.piso_obrigacoes o WHERE o.id=raiz OR o.ne_origem_id=raiz;
 IF COALESCE(total,0)>teto THEN RAISE EXCEPTION 'Subempenhos de todas as competências excedem o saldo da NE compartilhada.'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS piso_zz_saldo_ne_global ON public.piso_subempenhos;
CREATE TRIGGER piso_zz_saldo_ne_global BEFORE INSERT OR UPDATE OR DELETE ON public.piso_subempenhos FOR EACH ROW EXECUTE FUNCTION public.piso_validar_saldo_ne_global();

CREATE OR REPLACE FUNCTION public.piso_bloquear_anulacao_sem_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE raiz uuid;
BEGIN
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') THEN
    SELECT COALESCE(o.ne_origem_id,o.id) INTO raiz FROM public.piso_obrigacoes o WHERE o.id=NEW.obrigacao_id AND (o.ne_origem_id IS NOT NULL OR cardinality(o.ne_competencias)>1);
    IF raiz IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('piso_ne_global:'||raiz::text,0)); END IF;
  END IF;
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') AND NOT (
    EXISTS (
      SELECT 1 FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE o.id=NEW.obrigacao_id AND p.competencia_id=NEW.competencia_id
    ) AND public.piso_programacao_pagamento_pronta(NEW.competencia_id)
  ) THEN
    RAISE EXCEPTION 'Registre ao menos uma Programação de pagamento completa na competência.'
      USING ERRCODE='23514';
  END IF;
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') AND EXISTS(SELECT 1 FROM public.piso_obrigacoes o WHERE o.id=NEW.obrigacao_id AND (o.ne_origem_id IS NOT NULL OR cardinality(o.ne_competencias)>1))
    AND COALESCE(public.piso_saldo_anulavel_ne(NEW.obrigacao_id),0)<=0 THEN
    RAISE EXCEPTION 'A NE compartilhada ainda está reservada às competências previstas ou não possui saldo a anular.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_validar_dependencias_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  n integer;
  requisito integer;
  requisitos integer[];
  precisa_validar boolean;
BEGIN
  FOR n IN 1..10 LOOP
    IF n = 1 AND NEW.tipo_parcela = 'decimo_terceiro'
      AND NEW.etapas_concluidas ->> '1' = 'true'
      AND OLD.etapas_concluidas ->> '1' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Etapa 1 mensal não é aplicável à 13ª parcela do Piso.'
        USING ERRCODE = '23514';
    END IF;

    precisa_validar := NEW.etapas_concluidas ->> n::text = 'true'
      AND (
        OLD.etapas_concluidas ->> n::text IS DISTINCT FROM 'true'
        OR (
          n = ANY(COALESCE(OLD.etapas_reconferir, ARRAY[]::integer[]))
          AND NOT (n = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[])))
        )
      );
    IF precisa_validar IS NOT TRUE THEN CONTINUE; END IF;

    requisitos := CASE n
      WHEN 2 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[]::integer[] ELSE ARRAY[1] END
      WHEN 3 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2] ELSE ARRAY[1,2] END
      WHEN 4 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3] ELSE ARRAY[1,2,3] END
      WHEN 6 THEN ARRAY[5]
      WHEN 7 THEN ARRAY[5,6]
      WHEN 8 THEN ARRAY[5,6]
      WHEN 10 THEN ARRAY[5,6]
      WHEN 9 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3,4,5,6,7,8]
        ELSE ARRAY[1,2,3,4,5,6,7,8] END
      ELSE ARRAY[]::integer[]
    END;

    -- A 7A é obrigatória somente quando existe excedente real de empenho.
    -- Em competências antigas, nenhum valor empenhado foi declarado:
    -- isso NÃO retroage uma obrigação inexistente.
    IF n = 9 AND EXISTS (
      SELECT 1
      FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=NEW.id
        AND public.piso_saldo_anulavel_ne(o.id)>0.009
    ) THEN
      requisitos := array_append(requisitos,10);
    END IF;
    IF n IN (8,9,10) AND NOT public.piso_programacao_pagamento_pronta(NEW.id) THEN
      RAISE EXCEPTION 'Registre ao menos uma Programação de pagamento completa na competência.'
        USING ERRCODE='23514';
    END IF;
    IF n=9 AND EXISTS(SELECT 1 FROM public.piso_ne_compartilhadas v WHERE v.competencia_anulacao_id=NEW.id AND v.saldo_bruto>0.009 AND NOT EXISTS(
      SELECT 1 FROM public.piso_obrigacoes o JOIN public.piso_participantes p ON p.id=o.participante_id WHERE p.competencia_id=NEW.id AND COALESCE(o.ne_origem_id,o.id)=v.origem_id
    )) THEN RAISE EXCEPTION 'Vincule nesta competência a NE compartilhada para tratar o saldo final.'; END IF;
    IF n=10 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        WHERE p.competencia_id=NEW.id
          AND public.piso_saldo_anulavel_ne(o.id)>0.009
      ) THEN
        RAISE EXCEPTION 'A etapa 7A só é aplicável com excedente confirmado de empenho.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        LEFT JOIN public.piso_documentos s
          ON s.obrigacao_id=o.id AND s.tipo='solicitacao_anulacao'
        LEFT JOIN public.piso_documentos a
          ON a.obrigacao_id=o.id AND a.tipo='aviso_anulacao'
        WHERE p.competencia_id=NEW.id
          AND public.piso_saldo_anulavel_ne(o.id)>0.009
          AND (
            o.valor_anulado IS NULL OR abs(o.valor_anulado-public.piso_saldo_anulavel_ne(o.id))>0.01
            OR s.numero_sei IS NULL OR s.link_sei IS NULL OR s.data_documento IS NULL
            OR a.numero_sei IS NULL OR a.link_sei IS NULL OR a.data_documento IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.piso_encaminhamentos e
              WHERE e.documento_id=s.id AND e.acao='encaminhado'
              AND NOT EXISTS(SELECT 1 FROM public.piso_encaminhamentos e2
                WHERE e2.documento_id=e.documento_id AND e2.ocorrido_em>e.ocorrido_em))
            OR EXISTS (
              SELECT 1 FROM public.piso_assinatura_matriz m
              WHERE m.tipo_documento='solicitacao_anulacao' AND NOT m.opcional
                AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas sig
                  WHERE sig.documento_id=s.id AND sig.slot=m.slot_key)
            )
          )
      ) THEN
        RAISE EXCEPTION 'Anulação de empenho incompleta: confira valor, documento assinado, envio SEFAZ e aviso.';
      END IF;
    END IF;
    FOREACH requisito IN ARRAY requisitos LOOP
      IF NEW.etapas_concluidas ->> requisito::text IS DISTINCT FROM 'true'
        OR requisito = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[]))
      THEN
        RAISE EXCEPTION 'Etapa % do Piso depende da Etapa % concluída e sem reconferência.', n, requisito
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.piso_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  etapa int := NULL;
  old_j jsonb;
  new_j jsonb;
  base_j jsonb;
  k text;
  diffs jsonb := '{}'::jsonb;
  rotulo text := TG_TABLE_NAME;
  part uuid;
  prest uuid;
  inst text;
  doc_id uuid;
  obrigacao_id uuid;
  categoria_arquivo text;
  tipo_documento text;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;

  old_j := CASE
    WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD)
    ELSE '{}'::jsonb
  END;

  new_j := CASE
    WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW)
    ELSE '{}'::jsonb
  END;

  IF TG_TABLE_NAME = 'piso_competencias' THEN
    comp := COALESCE(
      NULLIF(new_j->>'id','')::uuid,
      NULLIF(old_j->>'id','')::uuid
    );

  ELSIF TG_TABLE_NAME = 'piso_participantes' THEN
    comp := COALESCE(
      NULLIF(new_j->>'competencia_id','')::uuid,
      NULLIF(old_j->>'competencia_id','')::uuid
    );

    part := COALESCE(
      NULLIF(new_j->>'id','')::uuid,
      NULLIF(old_j->>'id','')::uuid
    );

    prest := COALESCE(
      NULLIF(new_j->>'prestador_id','')::uuid,
      NULLIF(old_j->>'prestador_id','')::uuid
    );

  ELSIF TG_TABLE_NAME IN ('piso_arquivos','piso_documentos') THEN
    comp := COALESCE(
      NULLIF(new_j->>'competencia_id','')::uuid,
      NULLIF(old_j->>'competencia_id','')::uuid
    );

    part := COALESCE(
      NULLIF(new_j->>'participante_id','')::uuid,
      NULLIF(old_j->>'participante_id','')::uuid
    );

    IF part IS NULL AND TG_TABLE_NAME = 'piso_documentos' THEN
      obrigacao_id := COALESCE(
        NULLIF(new_j->>'obrigacao_id','')::uuid,
        NULLIF(old_j->>'obrigacao_id','')::uuid
      );

      IF obrigacao_id IS NOT NULL THEN
        SELECT participante_id
        INTO part
        FROM public.piso_obrigacoes
        WHERE id = obrigacao_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME IN ('piso_participante_cnes','piso_obrigacoes') THEN
    part := COALESCE(
      NULLIF(new_j->>'participante_id','')::uuid,
      NULLIF(old_j->>'participante_id','')::uuid
    );

    IF part IS NOT NULL THEN
      SELECT competencia_id, prestador_id
      INTO comp, prest
      FROM public.piso_participantes
      WHERE id = part;
    END IF;

  ELSIF TG_TABLE_NAME IN (
    'piso_documento_assinaturas',
    'piso_encaminhamentos'
  ) THEN
    doc_id := COALESCE(
      NULLIF(new_j->>'documento_id','')::uuid,
      NULLIF(old_j->>'documento_id','')::uuid
    );

    IF doc_id IS NOT NULL THEN
      SELECT
        d.competencia_id,
        COALESCE(d.participante_id, o.participante_id)
      INTO comp, part
      FROM public.piso_documentos d
      LEFT JOIN public.piso_obrigacoes o
        ON o.id = d.obrigacao_id
      WHERE d.id = doc_id;
    END IF;
  END IF;

  IF part IS NOT NULL AND prest IS NULL THEN
    SELECT prestador_id
    INTO prest
    FROM public.piso_participantes
    WHERE id = part;
  END IF;

  IF prest IS NOT NULL THEN
    SELECT nome_instituicao
    INTO inst
    FROM public.prestadores
    WHERE id = prest;
  END IF;

  IF comp IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  base_j := jsonb_strip_nulls(
    jsonb_build_object(
      'participante_id', part,
      'prestador_id', prest,
      'instituicao_nome', inst
    )
  );

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · removido: ' || rotulo,
      base_j || jsonb_strip_nulls(
        jsonb_build_object(
          'tipo', old_j->'tipo',
          'slot', old_j->'slot',
          'arquivo', old_j->'nome_original'
        )
      )
    );

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · criado: ' || rotulo,
      base_j || jsonb_strip_nulls(
        jsonb_build_object(
          'competencia', new_j->'competencia',
          'tipo', new_j->'tipo',
          'slot', new_j->'slot',
          'servidor', new_j->'servidor_nome',
          'acao', new_j->'acao',
          'destino', new_j->'destino',
          'arquivo', new_j->'nome_original',
          'sha256', new_j->'sha256',
          'categoria', new_j->'categoria',
          'valor_a_liquidar', new_j->'valor_a_liquidar'
        )
      )
    );

  ELSE
    FOR k IN
      SELECT jsonb_object_keys(new_j)
    LOOP
      IF k = ANY(
        ARRAY[
          'updated_at',
          'created_at',
          'etapas_reconferir',
          'investsus_resumo',
          'investsus_auditoria',
          'auditoria_resumo'
        ]
      ) THEN
        CONTINUE;
      END IF;

      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(
          k,
          jsonb_build_object(
            'de', old_j->k,
            'para', new_j->k
          )
        );
      END IF;
    END LOOP;

    IF TG_TABLE_NAME = 'piso_participantes'
      AND (new_j->'auditoria_resumo')
        IS DISTINCT FROM
          (old_j->'auditoria_resumo')
    THEN
      diffs := diffs || jsonb_build_object(
        'auditoria_planilha',
        jsonb_build_object(
          'linhas',
          new_j->'auditoria_resumo'->'linhas',
          'ocorrencias',
          new_j->'auditoria_resumo'->'ocorrencias'
        )
      );
    END IF;

    IF TG_TABLE_NAME = 'piso_competencias'
      AND (new_j->'investsus_auditoria')
        IS DISTINCT FROM
          (old_j->'investsus_auditoria')
    THEN
      diffs := diffs || jsonb_build_object(
        'conciliacao_auditoria',
        jsonb_build_object(
          'criticas',
          new_j->'investsus_auditoria'->'conciliacao'->'criticas',
          'alertas',
          new_j->'investsus_auditoria'->'conciliacao'->'alertas'
        )
      );
    END IF;

    IF diffs = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · atualizado: ' || rotulo,
      base_j || diffs
    );
  END IF;

  IF TG_TABLE_NAME = 'piso_competencias'
    AND TG_OP = 'UPDATE'
  THEN
    IF diffs ?| ARRAY[
      'investsus_carga_em',
      'investsus_confirmacao_em',
      'investsus_ocorrencia'
    ] THEN
      etapa := 1;

    ELSIF diffs ?| ARRAY[
      'valor_apurado_investsus',
      'valor_homologado',
      'desconto_saldo',
      'acerto_contas',
      'valor_transferido',
      'portaria_gm_numero',
      'portaria_gm_url_dou'
    ] THEN
      etapa := 2;

    ELSIF diffs ?| ARRAY[
      'total_publicado_municipal',
      'municipal_config'
    ] THEN
      etapa := 3;

    ELSIF diffs ?| ARRAY[
      'credito_fms_valor',
      'credito_fms_data',
      'credito_fms_referencia'
    ] THEN
      etapa := 4;
    END IF;

  ELSIF TG_TABLE_NAME = 'piso_arquivos' THEN
    categoria_arquivo := COALESCE(
      new_j->>'categoria',
      old_j->>'categoria'
    );

    etapa := CASE
      WHEN categoria_arquivo IN ('investsus','portaria_gm')
        THEN 2
      ELSE 1
    END;

  ELSIF TG_TABLE_NAME IN (
    'piso_participantes',
    'piso_participante_cnes'
  ) THEN
    etapa := 1;

  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN
    etapa := CASE
      WHEN diffs ? 'ne_competencias' AND (diffs - 'ne_competencias') = '{}'::jsonb THEN 10
      WHEN diffs ? 'valor_anulado' AND (diffs - 'valor_anulado') = '{}'::jsonb THEN 10
      WHEN diffs ?| ARRAY[
        'valor_pago',
        'data_pagamento',
        'data_programacao'
      ] THEN 7

      WHEN diffs ? 'valor_a_liquidar' AND (diffs - 'valor_a_liquidar') = '{}'::jsonb THEN 6
      WHEN diffs ?| ARRAY[
        'data_solicitacao_liquidacao',
        'data_movimento_liquidacao',
        'movimento_transmitido'
      ] THEN 6

      ELSE 5
    END;

  ELSIF TG_TABLE_NAME = 'piso_documentos' THEN
    tipo_documento := COALESCE(
      new_j->>'tipo',
      old_j->>'tipo'
    );

    etapa := public.piso_etapa_doc(tipo_documento);
  END IF;

  IF etapa IS NOT NULL THEN
    PERFORM public.piso_marcar_reconferencia(
      comp,
      etapa
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_proteger_documento_ne_compartilhada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE oid uuid; original uuid; nota_tipo text;
BEGIN
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD.obrigacao_id ELSE NEW.obrigacao_id END;
 nota_tipo:=CASE WHEN TG_OP='DELETE' THEN OLD.tipo ELSE NEW.tipo END;
 IF nota_tipo NOT IN ('solicitacao_ne','nota_empenho') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 SELECT ne_origem_id INTO original FROM public.piso_obrigacoes WHERE id=oid;
 IF EXISTS(SELECT 1 FROM public.piso_obrigacoes WHERE ne_origem_id=oid) OR
   (original IS NOT NULL AND TG_OP='UPDATE') THEN
   RAISE EXCEPTION 'Documentação da NE compartilhada vinculada é somente leitura.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
DROP TRIGGER IF EXISTS piso_proteger_documento_ne_compartilhada ON public.piso_documentos;
CREATE TRIGGER piso_proteger_documento_ne_compartilhada BEFORE UPDATE OR DELETE ON public.piso_documentos FOR EACH ROW EXECUTE FUNCTION public.piso_proteger_documento_ne_compartilhada();

-- Cobertura informada expressamente pelo usuário para a NE 8110/2026 (BOJ).
UPDATE public.piso_obrigacoes o SET ne_competencias=ARRAY['10/2026','11/2026','12/2026','13/2026']
WHERE o.id='6fce2600-757e-4aee-8b11-d4cd862455c5'::uuid AND o.ne_competencias IS NULL
AND EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=o.id AND d.tipo='nota_empenho' AND regexp_replace(d.numero,'[[:space:]]','','g')='8110/2026');
COMMIT;
