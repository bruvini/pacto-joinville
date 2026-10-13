-- Piso da Enfermagem: dois eixos independentes até a conclusão da competência.
-- Etapas mensais: 1→2→3→4 e 5→6→(7,8), ambas exigidas para 9.
-- 13ª: 2→3→4 e 5→6→(7,8), ambas exigidas para 9.
-- Não recria tabelas, não altera tipos, não apaga histórico nem reescreve competência.
-- Depende da fundação Piso (01/10) e do tipo_parcela (09/10).
BEGIN;

DO $preflight$
DECLARE campo text;
BEGIN
  IF to_regclass('public.piso_competencias') IS NULL THEN
    RAISE EXCEPTION 'Piso não instalado: execute as migrations anteriores do módulo.'
      USING ERRCODE = '42P01';
  END IF;
  FOREACH campo IN ARRAY ARRAY['etapas_concluidas','etapas_reconferir','tipo_parcela','status'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'piso_competencias'
         AND column_name = campo
    ) THEN
      RAISE EXCEPTION 'Schema Piso desatualizado: falta piso_competencias.%. Aplique as migrations anteriores.', campo
        USING ERRCODE = '42703';
    END IF;
  END LOOP;
END;
$preflight$;

-- Os documentos afetam apenas as etapas realmente dependentes, jamais
-- todas as etapas posteriores por número. Mantém marcações existentes.
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
    WHEN 5 THEN ARRAY[6,7,8,9]
    WHEN 6 THEN ARRAY[7,8,9]
    WHEN 7 THEN ARRAY[9]
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

REVOKE ALL ON FUNCTION public.piso_marcar_reconferencia(uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- Segunda camada de proteção: não confiar somente no desbloqueio do navegador.
-- Valida a transição de conclusão e a retirada de reconferência. Não aplica
-- retroativamente as regras novas a competências históricas já concluídas.
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
  FOR n IN 1..9 LOOP
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
      WHEN 9 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3,4,5,6,7,8]
        ELSE ARRAY[1,2,3,4,5,6,7,8] END
      ELSE ARRAY[]::integer[]
    END;

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

DROP TRIGGER IF EXISTS trg_piso_validar_dependencias_conclusao
  ON public.piso_competencias;
CREATE TRIGGER trg_piso_validar_dependencias_conclusao
  BEFORE UPDATE OF etapas_concluidas, etapas_reconferir
  ON public.piso_competencias
  FOR EACH ROW
  EXECUTE FUNCTION public.piso_validar_dependencias_conclusao();

COMMENT ON FUNCTION public.piso_marcar_reconferencia(uuid,integer)
  IS 'Marca reconferência somente em descendentes da etapa no grafo paralelo do Piso.';
COMMENT ON FUNCTION public.piso_validar_dependencias_conclusao()
  IS 'Protege transições de conclusão das etapas paralelas do Piso, sem retroagir histórico.';
COMMIT;
