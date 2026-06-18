
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'acp', 'aco');
CREATE TYPE public.etapa_processo AS ENUM ('solicitacao_empenho', 'nota_tecnica', 'solicitacao_anulacao', 'anulacao_executada');
CREATE TYPE public.status_aco AS ENUM ('aguardando_indicacao', 'aguardando_descontingenciamento', 'orcamento_disponivel', 'empenhado');
CREATE TYPE public.status_convenio AS ENUM ('ativo', 'suspenso', 'encerrado');
CREATE TYPE public.status_prestador AS ENUM ('ativo', 'inativo');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cargo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + default admin role for first user, acp for others
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email);
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'acp');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prestadores
CREATE TABLE public.prestadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_instituicao TEXT NOT NULL,
  cnpj TEXT,
  status status_prestador NOT NULL DEFAULT 'ativo',
  data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestadores TO authenticated;
GRANT ALL ON public.prestadores TO service_role;
ALTER TABLE public.prestadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read prestadores" ON public.prestadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write prestadores" ON public.prestadores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_prestadores_updated BEFORE UPDATE ON public.prestadores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Convenios
CREATE TABLE public.convenios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  numero_processo_sei_mae TEXT,
  objeto TEXT,
  status_convenio status_convenio NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convenios TO authenticated;
GRANT ALL ON public.convenios TO service_role;
ALTER TABLE public.convenios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read convenios" ON public.convenios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write convenios" ON public.convenios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_convenios_updated BEFORE UPDATE ON public.convenios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lancamentos
CREATE TABLE public.lancamentos_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID REFERENCES public.prestadores(id) ON DELETE SET NULL,
  convenio_id UUID REFERENCES public.convenios(id) ON DELETE SET NULL,
  -- ACP
  descricao TEXT,
  termo_aditivo TEXT,
  parcela TEXT,
  competencia TEXT, -- "MM/AAAA"
  mes_pagamento_previsto TEXT,
  valor_solicitado NUMERIC(14,2) DEFAULT 0,
  link_solicitacao_sei TEXT,
  numero_empenho TEXT,
  link_empenho_sei TEXT,
  valor_atestado NUMERIC(14,2),
  link_solicitacao_anulacao TEXT,
  link_anulacao_sei TEXT,
  -- ACO
  dotacao_orcamentaria TEXT,
  fonte_pagamento TEXT,
  status_aco status_aco NOT NULL DEFAULT 'aguardando_indicacao',
  valor_empenho_liquido NUMERIC(14,2),
  -- Workflow
  etapa_atual etapa_processo NOT NULL DEFAULT 'solicitacao_empenho',
  responsavel_atual TEXT NOT NULL DEFAULT 'aco',
  concluido BOOLEAN NOT NULL DEFAULT false,
  data_limite TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN valor_anulado NUMERIC(14,2)
  GENERATED ALWAYS AS (COALESCE(valor_solicitado,0) - COALESCE(valor_atestado,0)) STORED;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos_pagamento TO authenticated;
GRANT ALL ON public.lancamentos_pagamento TO service_role;
ALTER TABLE public.lancamentos_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read lanc" ON public.lancamentos_pagamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write lanc" ON public.lancamentos_pagamento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_lanc_updated BEFORE UPDATE ON public.lancamentos_pagamento FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_lanc_competencia ON public.lancamentos_pagamento(competencia);
CREATE INDEX idx_lanc_prestador ON public.lancamentos_pagamento(prestador_id);

-- Config assinaturas (matriz vigente)
CREATE TABLE public.assinaturas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa etapa_processo NOT NULL,
  nome_servidor TEXT NOT NULL,
  cargo TEXT NOT NULL,
  codigo_sei TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas_config TO authenticated;
GRANT ALL ON public.assinaturas_config TO service_role;
ALTER TABLE public.assinaturas_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read ac" ON public.assinaturas_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write ac" ON public.assinaturas_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ac_updated BEFORE UPDATE ON public.assinaturas_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Assinaturas snapshot por lançamento
CREATE TABLE public.assinaturas_lancamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  etapa etapa_processo NOT NULL,
  nome_servidor TEXT NOT NULL,
  cargo TEXT NOT NULL,
  codigo_sei TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  assinado BOOLEAN NOT NULL DEFAULT false,
  assinado_em TIMESTAMPTZ,
  assinado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas_lancamento TO authenticated;
GRANT ALL ON public.assinaturas_lancamento TO service_role;
ALTER TABLE public.assinaturas_lancamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read al" ON public.assinaturas_lancamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write al" ON public.assinaturas_lancamento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_al_lanc ON public.assinaturas_lancamento(lancamento_id);

-- SLA config
CREATE TABLE public.sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parametro_nome TEXT NOT NULL UNIQUE,
  dias_uteis_prazo INTEGER,
  data_limite_mensal INTEGER, -- dia do mês
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_config TO authenticated;
GRANT ALL ON public.sla_config TO service_role;
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read sla" ON public.sla_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write sla" ON public.sla_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sla_updated BEFORE UPDATE ON public.sla_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Historico logs (audit trail)
CREATE TABLE public.historico_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_logs TO authenticated;
GRANT ALL ON public.historico_logs TO service_role;
ALTER TABLE public.historico_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read hist" ON public.historico_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert hist" ON public.historico_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_hist_lanc ON public.historico_logs(lancamento_id, data_hora DESC);

-- Notas comentarios
CREATE TABLE public.notas_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  setor TEXT,
  mensagem TEXT NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_comentarios TO authenticated;
GRANT ALL ON public.notas_comentarios TO service_role;
ALTER TABLE public.notas_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read notas" ON public.notas_comentarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write notas" ON public.notas_comentarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notificacoes log
CREATE TABLE public.notificacoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  destinatario TEXT,
  assunto TEXT,
  mensagem TEXT,
  data_envio TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_log TO authenticated;
GRANT ALL ON public.notificacoes_log TO service_role;
ALTER TABLE public.notificacoes_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read notif" ON public.notificacoes_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write notif" ON public.notificacoes_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
