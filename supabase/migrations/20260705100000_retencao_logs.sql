-- =====================================================================
-- RETENÇÃO DE LOGS (LGPD Art. 15/16 + Marco Civil Art. 15)
-- A LGPD manda eliminar dados quando deixarem de ser necessários; o
-- Marco Civil da Internet exige guardar logs de acesso a aplicação por
-- NO MÍNIMO 6 meses. Política adotada: retenção configurável (padrão
-- 24 meses, nunca abaixo de 6), com limpeza automática mensal.
-- =====================================================================

-- Config simples de sistema (chave/valor) — editável só por admin.
CREATE TABLE IF NOT EXISTS public.sistema_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.sistema_config TO authenticated;
GRANT ALL ON public.sistema_config TO service_role;
ALTER TABLE public.sistema_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read config" ON public.sistema_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update config" ON public.sistema_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.sistema_config (chave, valor, descricao) VALUES
  ('retencao_logs_acesso_meses', '24', 'Meses de retenção da trilha de acessos (mínimo legal: 6 — Marco Civil Art. 15).'),
  ('retencao_notificacoes_lidas_meses', '12', 'Meses de retenção de notificações já lidas.')
ON CONFLICT (chave) DO NOTHING;

-- Limpeza conforme a política de retenção. Idempotente e segura:
-- nunca retém menos que 6 meses de logs de acesso.
CREATE OR REPLACE FUNCTION public.aplicar_retencao_logs()
RETURNS TABLE (logs_removidos INTEGER, notificacoes_removidas INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meses_logs INTEGER;
  meses_notif INTEGER;
  n1 INTEGER; n2 INTEGER;
BEGIN
  SELECT GREATEST(COALESCE(valor::int, 24), 6) INTO meses_logs
    FROM public.sistema_config WHERE chave = 'retencao_logs_acesso_meses';
  meses_logs := COALESCE(meses_logs, 24);
  SELECT GREATEST(COALESCE(valor::int, 12), 1) INTO meses_notif
    FROM public.sistema_config WHERE chave = 'retencao_notificacoes_lidas_meses';
  meses_notif := COALESCE(meses_notif, 12);

  DELETE FROM public.logs_acesso
    WHERE created_at < now() - (meses_logs || ' months')::interval;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  DELETE FROM public.notificacoes
    WHERE lida AND created_at < now() - (meses_notif || ' months')::interval;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN QUERY SELECT n1, n2;
END; $$;

-- RPC (idempotente) como rede de segurança caso o pg_cron não exista.
GRANT EXECUTE ON FUNCTION public.aplicar_retencao_logs() TO authenticated;

-- Agenda mensal (dia 1, 3h UTC) — se o pg_cron estiver disponível.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('aplicar-retencao-logs', '0 3 1 * *', 'SELECT public.aplicar_retencao_logs()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — a retenção rodará via app (RPC) ao abrir o painel.';
END $$;
