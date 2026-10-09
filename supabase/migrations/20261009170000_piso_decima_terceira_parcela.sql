-- PACTO Joinville | Piso da Enfermagem: 12 parcelas mensais + 13ª anual.
-- Referências: cartilha MS 2026 (questão 18); Portaria de Consolidação
-- GM/MS 6/2017, Título IX-A; Lei 4.320/1964; MCASP 11ª ed.
-- NÃO presume valores da 13ª, não replica financeiros e não altera fluxos existentes.
-- Executar no SQL Editor do Lovable ANTES da publicação do frontend.
BEGIN;

ALTER TABLE public.piso_competencias
  ADD COLUMN IF NOT EXISTS tipo_parcela text NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS exercicio_referencia integer;

UPDATE public.piso_competencias
   SET exercicio_referencia = substring(competencia FROM 4 FOR 4)::integer
 WHERE exercicio_referencia IS NULL
   AND competencia ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$';

-- Não migrar silenciosamente competências legadas cujo formato não seja MM/AAAA.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.piso_competencias WHERE exercicio_referencia IS NULL) THEN
    RAISE EXCEPTION 'Há competências antigas com período inválido. Corrija-as antes da migração.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.piso_validar_tipo_parcela()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE ano_periodo integer;
BEGIN
  IF NEW.competencia IS NULL OR
     NEW.competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' THEN
    RAISE EXCEPTION 'Competência deve ter formato MM/AAAA (2000–2099).'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo_parcela IS NULL OR NEW.tipo_parcela NOT IN ('mensal','decimo_terceiro') THEN
    RAISE EXCEPTION 'Tipo de parcela inválido.' USING ERRCODE = '23514';
  END IF;
  ano_periodo := substring(NEW.competencia FROM 4 FOR 4)::integer;
  IF NEW.exercicio_referencia IS NULL THEN
    NEW.exercicio_referencia := ano_periodo;
  END IF;
  IF NEW.exercicio_referencia NOT BETWEEN 2000 AND 2099 THEN
    RAISE EXCEPTION 'Exercício de referência inválido.' USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo_parcela = 'mensal' AND NEW.exercicio_referencia <> ano_periodo THEN
    RAISE EXCEPTION 'Parcela mensal deve pertencer ao exercício de sua competência.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piso_validar_tipo_parcela ON public.piso_competencias;
CREATE TRIGGER trg_piso_validar_tipo_parcela
  BEFORE INSERT OR UPDATE ON public.piso_competencias
  FOR EACH ROW EXECUTE FUNCTION public.piso_validar_tipo_parcela();

ALTER TABLE public.piso_competencias
  ALTER COLUMN exercicio_referencia SET NOT NULL;

-- Substitui a antiga unicidade simples por duas regras com escopos explícitos.
-- Descobre a constraint legada por sua definição, sem assumir o nome gerado.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class tab ON tab.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = tab.relnamespace
     WHERE ns.nspname = 'public'
       AND tab.relname = 'piso_competencias'
       AND con.contype = 'u'
       AND (
         SELECT array_agg(att.attname ORDER BY cols.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = tab.oid AND att.attnum = cols.attnum
       ) = ARRAY['competencia']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.piso_competencias DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS piso_competencias_mensal_unica
  ON public.piso_competencias (competencia)
  WHERE tipo_parcela = 'mensal';

CREATE UNIQUE INDEX IF NOT EXISTS piso_competencias_decimo_exercicio_unico
  ON public.piso_competencias (exercicio_referencia)
  WHERE tipo_parcela = 'decimo_terceiro';

-- Nunca substitui os vínculos originais de participante, documento, nota,
-- pagamento, auditoria, logs, arquivos e prestações de contas.
COMMENT ON COLUMN public.piso_competencias.tipo_parcela IS
  'mensal: uma por MM/AAAA; decimo_terceiro: uma AFC adicional por exercício.';
COMMENT ON COLUMN public.piso_competencias.exercicio_referencia IS
  'Exercício a que se refere o direito; pode ser diferente do ano do repasse da 13ª.';

-- Não concede permissões adicionais: mantém RLS e políticas existentes.
COMMIT;
