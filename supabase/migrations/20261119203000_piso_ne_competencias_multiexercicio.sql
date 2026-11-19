-- Permite cobertura da NE em múltiplos exercícios, sem alterar o exercício original da nota.
-- Mantém as proteções de vínculo, saldo e anulação da migração anterior.
BEGIN;
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
   SELECT 1 FROM unnest(NEW.ne_competencias) k WHERE k IS NULL OR k !~ '^(0[1-9]|1[0-3])/[0-9]{4}$' OR right(k,4)<'2020')
   OR cardinality(NEW.ne_competencias)<>(SELECT count(DISTINCT k) FROM unnest(NEW.ne_competencias) k)
  THEN RAISE EXCEPTION 'Selecione competências válidas (MM/AAAA ou 13/AAAA), sem duplicidade e incluindo a atual.'; END IF;
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

-- Ordena a competência de anulação por ano e mês, inclusive o 13º.
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
    right(public.piso_chave_competencia_ne(c.competencia,c.tipo_parcela,c.exercicio_referencia),4) DESC,
    left(public.piso_chave_competencia_ne(c.competencia,c.tipo_parcela,c.exercicio_referencia),2) DESC,c.id
  LIMIT 1
) destino ON true
WHERE o.ne_origem_id IS NULL AND cardinality(o.ne_competencias)>1 AND o.valor_empenhado IS NOT NULL;
REVOKE ALL ON public.piso_ne_compartilhadas FROM PUBLIC, anon;
GRANT SELECT ON public.piso_ne_compartilhadas TO authenticated, service_role;


COMMIT;
