-- Piso da Enfermagem · Etapa 7A condicional de anulação de empenho.
-- Aditiva e sem reescrever competências, pagamentos, documentos ou auditorias antigas.
BEGIN;
ALTER TABLE public.piso_obrigacoes
  ADD COLUMN IF NOT EXISTS valor_empenhado numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_anulado numeric(14,2);
ALTER TABLE public.piso_obrigacoes
  DROP CONSTRAINT IF EXISTS piso_obrigacoes_valores_anulacao_nao_negativos;
ALTER TABLE public.piso_obrigacoes
  ADD CONSTRAINT piso_obrigacoes_valores_anulacao_nao_negativos
  CHECK ((valor_empenhado IS NULL OR valor_empenhado>=0)
     AND (valor_anulado IS NULL OR valor_anulado>=0));
COMMENT ON COLUMN public.piso_obrigacoes.valor_empenhado
  IS 'Valor original da NE, inclusive projeção de final de exercício; distinto do valor devido conciliado.';
COMMENT ON COLUMN public.piso_obrigacoes.valor_anulado
  IS 'Valor efetivamente anulado conforme aviso da SEFAZ; não preencher automaticamente pela projeção.';

-- Matriz: a mesma conferência humana usada na Solicitação de NE do Piso.
-- A anulação só libera o aviso após documento assinado e encaminhado.
INSERT INTO public.piso_assinatura_matriz
(tipo_documento,slot_key,label,cargos,manual,qualquer,opcional,ordem)
SELECT 'solicitacao_anulacao',slot_key,label,cargos,manual,qualquer,opcional,ordem
FROM public.piso_assinatura_matriz WHERE tipo_documento='solicitacao_ne'
ON CONFLICT (tipo_documento,slot_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.piso_marcar_reconferencia(p_comp uuid, p_etapa int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  dependentes integer[];
  novas integer[];
BEGIN
  dependentes := CASE p_etapa
    WHEN 1 THEN ARRAY[2,3,4,9]
    WHEN 2 THEN ARRAY[3,4,9]
    WHEN 3 THEN ARRAY[4,9]
    WHEN 4 THEN ARRAY[9]
    WHEN 5 THEN ARRAY[6,7,10,8,9]
    WHEN 6 THEN ARRAY[7,10,8,9]
    WHEN 7 THEN ARRAY[10,8,9]
    WHEN 10 THEN ARRAY[8,9]
    WHEN 8 THEN ARRAY[9]
    ELSE ARRAY[]::integer[]
  END;
  IF cardinality(dependentes) = 0 THEN RETURN; END IF;

  SELECT COALESCE(array_agg(DISTINCT n ORDER BY n), ARRAY[]::integer[])
    INTO novas
    FROM public.piso_competencias c
    CROSS JOIN LATERAL unnest(dependentes) AS dep(n)
   WHERE c.id = p_comp
     AND c.status <> 'encerrada'
     AND (c.tipo_parcela IS DISTINCT FROM 'decimo_terceiro' OR n >= 2)
     AND c.etapas_concluidas ->> n::text = 'true'
     AND NOT (n = ANY(COALESCE(c.etapas_reconferir, ARRAY[]::integer[])));

  IF cardinality(novas) > 0 THEN
    UPDATE public.piso_competencias c
       SET etapas_reconferir = (
         SELECT array_agg(DISTINCT etapa ORDER BY etapa)
           FROM unnest(COALESCE(c.etapas_reconferir, ARRAY[]::integer[]) || novas) AS x(etapa)
       )
     WHERE c.id = p_comp AND c.status <> 'encerrada';
  END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.piso_etapa_doc(p_tipo text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $doc$
 SELECT CASE
 WHEN p_tipo IN ('minuta','memorando','portaria_municipal') THEN 3
 WHEN p_tipo='credito_fms' THEN 4
 WHEN p_tipo IN ('solicitacao_ne','nota_empenho') THEN 5
 WHEN p_tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') THEN 6
 WHEN p_tipo IN ('programacao_pagamento','comprovante_pagamento') THEN 7
 WHEN p_tipo IN ('solicitacao_anulacao','aviso_anulacao') THEN 10
 ELSE 2 END;
$doc$;
CREATE OR REPLACE FUNCTION public.piso_validar_dependencias_conclusao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
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
    IF NOT precisa_validar THEN CONTINUE; END IF;

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
      WHEN 10 THEN ARRAY[5,6,7]
      WHEN 9 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3,4,5,6,7,8]
        ELSE ARRAY[1,2,3,4,5,6,7,8] END
      ELSE ARRAY[]::integer[]
    END;

    -- A 7A é obrigatória somente quando existe excedente real de empenho.
    -- Em competências antigas, nenhum valor empenhado foi declarado:
    -- isso NÃO retroage uma obrigação inexistente.
    IF n IN (8,9) AND EXISTS (
      SELECT 1
      FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=NEW.id
        AND o.valor_empenhado IS NOT NULL AND o.valor_a_liquidar IS NOT NULL
        AND o.valor_empenhado-o.valor_a_liquidar > 0.009
    ) THEN
      requisitos := array_append(requisitos,10);
    END IF;
    IF n=10 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
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
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
          AND (
            o.valor_anulado IS NULL OR abs(o.valor_anulado-(o.valor_empenhado-o.valor_a_liquidar))>0.01
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
$fn$;


-- Não confundir um valor digitado com anulação confirmada: exigir Aviso SEI
-- antes de gravar valor_anulado. O aviso não substitui a solicitação assinada.
CREATE OR REPLACE FUNCTION public.piso_validar_aviso_anulacao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.valor_anulado IS NOT NULL AND NEW.valor_anulado>0
    AND NEW.valor_anulado IS DISTINCT FROM OLD.valor_anulado
    AND NOT EXISTS (
      SELECT 1 FROM public.piso_documentos a
      WHERE a.obrigacao_id=NEW.id AND a.tipo='aviso_anulacao'
        AND nullif(btrim(a.numero_sei),'') IS NOT NULL
        AND a.link_sei ~* '^https://[^ /]+/' AND a.data_documento IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'Registre antes o Aviso de Movimento de Anulação e a evidência SEI.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_piso_validar_aviso_anulacao ON public.piso_obrigacoes;
CREATE TRIGGER trg_piso_validar_aviso_anulacao
BEFORE UPDATE OF valor_anulado ON public.piso_obrigacoes
FOR EACH ROW EXECUTE FUNCTION public.piso_validar_aviso_anulacao();

-- Garantia adicional ao modificar valores após a conclusão (competências abertas).
CREATE OR REPLACE FUNCTION public.piso_reconferir_anulacao_financeira()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE comp uuid;
BEGIN
  IF NEW.valor_empenhado IS DISTINCT FROM OLD.valor_empenhado OR
     NEW.valor_anulado IS DISTINCT FROM OLD.valor_anulado OR
     NEW.valor_a_liquidar IS DISTINCT FROM OLD.valor_a_liquidar THEN
    SELECT competencia_id INTO comp FROM public.piso_participantes WHERE id=NEW.participante_id;
    PERFORM public.piso_marcar_reconferencia(comp,10);
    IF (NEW.valor_empenhado IS DISTINCT FROM OLD.valor_empenhado) AND
      (OLD.valor_empenhado IS NULL) THEN
      PERFORM public.piso_marcar_reconferencia(comp,7);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.piso_reconferir_anulacao_financeira()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_piso_reconferir_anulacao_financeira ON public.piso_obrigacoes;
CREATE TRIGGER trg_piso_reconferir_anulacao_financeira
AFTER UPDATE OF valor_empenhado,valor_anulado,valor_a_liquidar ON public.piso_obrigacoes
FOR EACH ROW EXECUTE FUNCTION public.piso_reconferir_anulacao_financeira();
COMMIT;
