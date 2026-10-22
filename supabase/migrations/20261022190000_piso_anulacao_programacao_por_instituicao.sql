-- Correção da Etapa 7A: depende da programação por obrigação, não da conclusão do pagamento.
-- Substitui apenas a função de validação; preserva dados, pagamentos e marcações históricas.
BEGIN;
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
      WHEN 10 THEN ARRAY[]::integer[]
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
        LEFT JOIN public.piso_documentos pr
          ON pr.obrigacao_id=o.id AND pr.tipo='programacao_pagamento'
        LEFT JOIN public.piso_documentos s
          ON s.obrigacao_id=o.id AND s.tipo='solicitacao_anulacao'
        LEFT JOIN public.piso_documentos a
          ON a.obrigacao_id=o.id AND a.tipo='aviso_anulacao'
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
          AND (
            o.valor_anulado IS NULL OR abs(o.valor_anulado-(o.valor_empenhado-o.valor_a_liquidar))>0.01
            OR nullif(btrim(pr.numero_sei),'') IS NULL
            OR nullif(btrim(pr.link_sei),'') IS NULL OR pr.data_documento IS NULL
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



-- Mesmo acesso direto à API não pode cadastrar anulação para instituição
-- cuja Programação de Pagamento ainda não foi documentada.
CREATE OR REPLACE FUNCTION public.piso_bloquear_anulacao_sem_programacao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $programacao$
BEGIN
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') AND NOT EXISTS (
    SELECT 1 FROM public.piso_documentos pr
    WHERE pr.obrigacao_id=NEW.obrigacao_id
      AND pr.tipo='programacao_pagamento'
      AND nullif(btrim(pr.numero_sei),'') IS NOT NULL
      AND nullif(btrim(pr.link_sei),'') IS NOT NULL
      AND pr.data_documento IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Preencha primeiro a Programação de Pagamento desta instituição na Etapa 7.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$programacao$;
DROP TRIGGER IF EXISTS trg_piso_bloquear_anulacao_sem_programacao ON public.piso_documentos;
CREATE TRIGGER trg_piso_bloquear_anulacao_sem_programacao
BEFORE INSERT OR UPDATE OF tipo, obrigacao_id ON public.piso_documentos
FOR EACH ROW EXECUTE FUNCTION public.piso_bloquear_anulacao_sem_programacao();
COMMIT;
