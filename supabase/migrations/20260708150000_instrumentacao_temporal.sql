-- ============================================================================
-- INSTRUMENTAÇÃO TEMPORAL (event sourcing de marcos / process mining)
-- Carimba, no banco (fonte de verdade), o instante EXATO em que cada processo
-- cruza um marco de etapa e quando é concluído. Permite medir o tempo REAL de
-- retenção por etapa (Teoria das Filas) e o Lead Time real (Lei de Little),
-- substituindo os proxies antes calculados a partir de assinado_em/updated_at.
--
-- Referências de método:
--  * Event sourcing: cada transição é um fato imutável e append-only.
--  * Process mining (Van der Aalst): a sequência de marcos reconstrói o fluxo
--    real do caso (case = lançamento) para análise de gargalos.
--  * Idempotência: o primeiro carimbo de cada marco vence (ON CONFLICT DO NOTHING),
--    tornando o registro seguro contra reprocessamento e compatível com o Modo
--    Retroativo (marcos preenchidos fora de ordem não sobrescrevem os já datados).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lancamento_marco_tempo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  marco TEXT NOT NULL,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lancamento_id, marco)
);

CREATE INDEX IF NOT EXISTS idx_marco_tempo_lancamento ON public.lancamento_marco_tempo (lancamento_id);

ALTER TABLE public.lancamento_marco_tempo ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Auth read marco_tempo" ON public.lancamento_marco_tempo FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.lancamento_marco_tempo IS
  'Marcos temporais (append-only) de cada lançamento: instante real de cruzamento de cada etapa e da conclusão. Base dos SLAs de retenção e do Lead Time.';

-- Marcos canônicos (ordem do fluxo):
--   criado, e1_analise, e2_solicitacao, e3_revisao, e4_sefaz, e5_empenho,
--   e6_sefaz_lib, e6_pagamento, e7_sefaz_anul, concluido.

CREATE OR REPLACE FUNCTION public.registrar_marco_tempo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  setado BOOLEAN;
BEGIN
  -- Helper inline via INSERT idempotente: o 1º carimbo de cada marco vence.
  -- 'criado' herda o created_at do próprio lançamento.
  INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco, ocorrido_em)
    VALUES (NEW.id, 'criado', COALESCE(NEW.created_at, now()))
    ON CONFLICT (lancamento_id, marco) DO NOTHING;

  IF COALESCE(NEW.dotacao_orcamentaria, '') <> '' AND COALESCE(NEW.fonte_pagamento, '') <> '' THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e1_analise') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.em_bloco_revisao IS TRUE THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e2_solicitacao') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.revisao_status = 'aprovado' THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e3_revisao') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.sefaz_etapa1_em IS NOT NULL THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e4_sefaz') ON CONFLICT DO NOTHING;
  END IF;
  IF COALESCE(NEW.numero_empenho, '') <> '' THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e5_empenho') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.sefaz_etapa4_em IS NOT NULL THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e6_sefaz_lib') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.data_pagamento IS NOT NULL THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e6_pagamento') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.sefaz_etapa5_em IS NOT NULL THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'e7_sefaz_anul') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.concluido IS TRUE THEN
    INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco) VALUES (NEW.id, 'concluido') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_marco_tempo ON public.lancamentos_pagamento;
CREATE TRIGGER trg_marco_tempo
  AFTER INSERT OR UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.registrar_marco_tempo();

-- Backfill defensivo (sem inventar tempos intermediários que não existem):
--  * 'criado' = created_at (exato) para todos os lançamentos.
--  * 'concluido' = updated_at (melhor proxy) para os já concluídos — habilita o
--    Lead Time histórico. Os marcos intermediários só passam a existir para as
--    transições que ocorrerem daqui pra frente (medidas com precisão real).
INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco, ocorrido_em)
  SELECT id, 'criado', created_at FROM public.lancamentos_pagamento WHERE created_at IS NOT NULL
  ON CONFLICT (lancamento_id, marco) DO NOTHING;

INSERT INTO public.lancamento_marco_tempo (lancamento_id, marco, ocorrido_em)
  SELECT id, 'concluido', COALESCE(updated_at, created_at, now()) FROM public.lancamentos_pagamento WHERE concluido IS TRUE
  ON CONFLICT (lancamento_id, marco) DO NOTHING;
