-- Fase 4: revisão como etapa com histórico + reestruturação do processo.
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS revisao_status TEXT NOT NULL DEFAULT 'pendente'; -- pendente | aprovado | negado

CREATE TABLE IF NOT EXISTS public.revisoes_empenho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  decisao TEXT NOT NULL,            -- 'aprovado' | 'negado'
  justificativa TEXT,
  autor_id UUID REFERENCES auth.users(id),
  autor_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revisoes_empenho TO authenticated;
GRANT ALL ON public.revisoes_empenho TO service_role;
ALTER TABLE public.revisoes_empenho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read rev" ON public.revisoes_empenho;
CREATE POLICY "read rev" ON public.revisoes_empenho FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write rev" ON public.revisoes_empenho;
CREATE POLICY "write rev" ON public.revisoes_empenho FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
CREATE INDEX IF NOT EXISTS idx_rev_lanc ON public.revisoes_empenho(lancamento_id, created_at DESC);
