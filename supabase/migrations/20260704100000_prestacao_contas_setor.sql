-- =====================================================================
-- PRESTAÇÃO DE CONTAS + SETOR DO USUÁRIO
-- 1) convenios.prazo_prestacao_contas_dias: prazo (em dias corridos após
--    o fim do mês de competência) para o prestador prestar contas.
-- 2) profiles.setor: setor de trabalho do usuário (para alertas/e-mail).
-- 3) prestacoes_contas: sprint de prestação de contas por lançamento
--    (status, prazos, links SEI) + interações (ofícios e respostas).
-- =====================================================================

-- 1) Prazo de prestação de contas no convênio
ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS prazo_prestacao_contas_dias INTEGER;

-- 2) Setor do usuário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setor TEXT;

-- Admin pode atualizar o perfil de qualquer usuário (definir setor em Configurações)
DROP POLICY IF EXISTS "Admin updates any profile" ON public.profiles;
CREATE POLICY "Admin updates any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- handle_new_user passa a gravar também o setor informado no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email, setor)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'setor'
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  -- Demais usuários ficam PENDENTES (sem papel) até aprovação do admin.
  RETURN NEW;
END; $$;

-- 3) Prestação de contas (1 registro por lançamento)
CREATE TABLE IF NOT EXISTS public.prestacoes_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL UNIQUE REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'recebida', 'aprovada', 'reprovada')),
  data_recebimento DATE,
  link_prestacao_sei TEXT,
  parecer TEXT,
  decidido_por TEXT,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestacoes_contas TO authenticated;
GRANT ALL ON public.prestacoes_contas TO service_role;
ALTER TABLE public.prestacoes_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read pc" ON public.prestacoes_contas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert pc" ON public.prestacoes_contas
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "update pc" ON public.prestacoes_contas
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "delete pc" ON public.prestacoes_contas
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.prestacoes_contas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_pc_lancamento ON public.prestacoes_contas(lancamento_id);

-- Interações do sprint (ofícios enviados, respostas do prestador etc.)
CREATE TABLE IF NOT EXISTS public.prestacoes_contas_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestacao_id UUID NOT NULL REFERENCES public.prestacoes_contas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('oficio', 'resposta', 'outro')),
  link_sei TEXT,
  descricao TEXT,
  autor_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.prestacoes_contas_interacoes TO authenticated;
GRANT ALL ON public.prestacoes_contas_interacoes TO service_role;
ALTER TABLE public.prestacoes_contas_interacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read pci" ON public.prestacoes_contas_interacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert pci" ON public.prestacoes_contas_interacoes
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "delete pci" ON public.prestacoes_contas_interacoes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_pci_prestacao ON public.prestacoes_contas_interacoes(prestacao_id);
