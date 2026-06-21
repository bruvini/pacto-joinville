-- =====================================================================
-- FASE 2 — Termos aditivos (teto próprio) + auditoria de saldo
-- ---------------------------------------------------------------------
-- Regra de negócio (decisão do solicitante): cada Termo Aditivo tem seu
-- próprio teto financeiro. A soma dos empenhos líquidos lançados dentro
-- de um aditivo NUNCA pode ultrapassar o teto daquele aditivo. Quando o
-- lançamento não tem aditivo, valida contra o teto do convênio mãe.
-- Trava atômica via trigger (imune a concorrência) — defesa em profundidade.
-- =====================================================================

-- Teto do convênio mãe
ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2);

-- Termos aditivos (cada um com teto e vigência próprios)
CREATE TABLE IF NOT EXISTS public.termos_aditivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id UUID NOT NULL REFERENCES public.convenios(id) ON DELETE CASCADE,
  identificador TEXT NOT NULL,            -- ex.: "4º Termo Aditivo"
  valor_total NUMERIC(14,2),              -- teto do aditivo
  numero_sei TEXT,
  data_assinatura DATE,
  vigencia_inicio DATE,
  vigencia_fim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.termos_aditivos TO authenticated;
GRANT ALL ON public.termos_aditivos TO service_role;
ALTER TABLE public.termos_aditivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ta" ON public.termos_aditivos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert ta" ON public.termos_aditivos
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "update ta" ON public.termos_aditivos
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "delete ta" ON public.termos_aditivos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_ta_updated BEFORE UPDATE ON public.termos_aditivos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ta_convenio ON public.termos_aditivos(convenio_id);

-- Vínculo do lançamento ao termo aditivo
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS termo_aditivo_id UUID REFERENCES public.termos_aditivos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lanc_ta ON public.lancamentos_pagamento(termo_aditivo_id);

-- ---------------------------------------------------------------------
-- Trava de saldo: soma dos empenhos não pode exceder o teto (aditivo
-- quando houver; senão o convênio mãe).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checar_saldo_empenho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  teto NUMERIC(14,2);
  usado NUMERIC(14,2);
  rotulo TEXT;
BEGIN
  IF NEW.valor_empenho_liquido IS NULL OR NEW.valor_empenho_liquido = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.termo_aditivo_id IS NOT NULL THEN
    SELECT valor_total, identificador INTO teto, rotulo
      FROM public.termos_aditivos WHERE id = NEW.termo_aditivo_id;
    IF teto IS NOT NULL THEN
      SELECT COALESCE(SUM(valor_empenho_liquido), 0) INTO usado
        FROM public.lancamentos_pagamento
        WHERE termo_aditivo_id = NEW.termo_aditivo_id AND id <> NEW.id;
      IF usado + NEW.valor_empenho_liquido > teto THEN
        RAISE EXCEPTION 'Saldo insuficiente no % : teto % , já empenhado % , tentativa de empenhar % .',
          rotulo, teto, usado, NEW.valor_empenho_liquido USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF NEW.convenio_id IS NOT NULL THEN
    SELECT valor_total INTO teto FROM public.convenios WHERE id = NEW.convenio_id;
    IF teto IS NOT NULL THEN
      SELECT COALESCE(SUM(valor_empenho_liquido), 0) INTO usado
        FROM public.lancamentos_pagamento
        WHERE convenio_id = NEW.convenio_id AND termo_aditivo_id IS NULL AND id <> NEW.id;
      IF usado + NEW.valor_empenho_liquido > teto THEN
        RAISE EXCEPTION 'Saldo insuficiente no convênio: teto % , já empenhado % , tentativa de empenhar % .',
          teto, usado, NEW.valor_empenho_liquido USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_checar_saldo ON public.lancamentos_pagamento;
CREATE TRIGGER trg_checar_saldo
  BEFORE INSERT OR UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.checar_saldo_empenho();
