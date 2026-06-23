-- =====================================================================
-- Base da reengenharia de assinaturas por etapa (slots de cargo) + cadeia
-- de checkpoints (bloco p/ revisão, envio SEFAZ). Rode no SQL editor.
-- O "pool" de signatários é public.assinaturas_config (nome_servidor + cargo).
-- =====================================================================

-- Assinaturas registradas por bloco de cada lançamento.
CREATE TABLE IF NOT EXISTS public.assinaturas_etapa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  bloco TEXT NOT NULL,            -- 'etapa1' | 'etapa4' | 'etapa5' | 'rel_tecnico' | 'rel_analise'
  slot TEXT NOT NULL,             -- rótulo do slot (ex.: 'Fiscal', 'Gerente/Coordenador', ...)
  servidor_nome TEXT,
  cargo TEXT,
  assinado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  assinado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas_etapa TO authenticated;
GRANT ALL ON public.assinaturas_etapa TO service_role;
ALTER TABLE public.assinaturas_etapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read ae" ON public.assinaturas_etapa;
CREATE POLICY "read ae" ON public.assinaturas_etapa FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write ae" ON public.assinaturas_etapa;
CREATE POLICY "write ae" ON public.assinaturas_etapa FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
CREATE INDEX IF NOT EXISTS idx_ae_lanc ON public.assinaturas_etapa(lancamento_id, bloco);

-- Cadeia de checkpoints no lançamento.
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS em_bloco_revisao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sefaz_etapa1_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sefaz_etapa4_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sefaz_etapa5_em TIMESTAMPTZ;
