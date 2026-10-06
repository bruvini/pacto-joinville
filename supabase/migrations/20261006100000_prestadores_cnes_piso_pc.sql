-- CNES vinculados ao cadastro mestre de prestadores e prestação de contas do Piso.
CREATE TABLE IF NOT EXISTS public.prestador_cnes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  cnes text NOT NULL CHECK (cnes ~ '^\d{7}$'),
  nome_estabelecimento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prestador_id, cnes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestador_cnes TO authenticated;
GRANT ALL ON public.prestador_cnes TO service_role;
ALTER TABLE public.prestador_cnes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prestador cnes read" ON public.prestador_cnes FOR SELECT TO authenticated USING (true);
CREATE POLICY "prestador cnes write" ON public.prestador_cnes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

ALTER TABLE public.piso_competencias
  ADD COLUMN IF NOT EXISTS prestacao_status text NOT NULL DEFAULT 'nao_iniciada',
  ADD COLUMN IF NOT EXISTS prestacao_prazo date,
  ADD COLUMN IF NOT EXISTS prestacao_recebida_em date,
  ADD COLUMN IF NOT EXISTS prestacao_aprovada_em date,
  ADD COLUMN IF NOT EXISTS prestacao_observacao text;

ALTER TABLE public.piso_competencias
  DROP CONSTRAINT IF EXISTS piso_competencias_prestacao_status_check;
ALTER TABLE public.piso_competencias
  ADD CONSTRAINT piso_competencias_prestacao_status_check
  CHECK (prestacao_status IN ('nao_iniciada','aguardando','recebida','aprovada','reprovada'));
