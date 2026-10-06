-- ============================================================================
-- SECURITY HARDENING — Lovable security findings (2026-10-06)
-- 1) Remove leitura ampla de usuários autenticados ainda sem papel aprovado.
-- 2) Restringir escritas/logs que ainda aceitavam qualquer authenticated.
-- 3) Impedir criação arbitrária de notificações pelo cliente (fanout é server-side).
-- ============================================================================

-- Perfis: o próprio usuário pode ver o próprio perfil; dados de terceiros só
-- ficam visíveis a usuários já aprovados no RBAC.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles approved or own" ON public.profiles;
CREATE POLICY "Profiles approved or own" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[])
  );

-- Catálogos, processos e trilhas operacionais: leitura apenas por usuário aprovado.
DROP POLICY IF EXISTS "Auth read prestadores" ON public.prestadores;
DROP POLICY IF EXISTS "read prestadores" ON public.prestadores;
CREATE POLICY "read prestadores" ON public.prestadores
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read convenios" ON public.convenios;
DROP POLICY IF EXISTS "read convenios" ON public.convenios;
CREATE POLICY "read convenios" ON public.convenios
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read lanc" ON public.lancamentos_pagamento;
DROP POLICY IF EXISTS "read lanc" ON public.lancamentos_pagamento;
CREATE POLICY "read lanc" ON public.lancamentos_pagamento
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read ac" ON public.assinaturas_config;
DROP POLICY IF EXISTS "read ac" ON public.assinaturas_config;
CREATE POLICY "read ac" ON public.assinaturas_config
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read al" ON public.assinaturas_lancamento;
DROP POLICY IF EXISTS "read al" ON public.assinaturas_lancamento;
CREATE POLICY "read al" ON public.assinaturas_lancamento
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read sla" ON public.sla_config;
DROP POLICY IF EXISTS "read sla" ON public.sla_config;
CREATE POLICY "read sla" ON public.sla_config
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read hist" ON public.historico_logs;
DROP POLICY IF EXISTS "read hist approved" ON public.historico_logs;
CREATE POLICY "read hist approved" ON public.historico_logs
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read notas" ON public.notas_comentarios;
DROP POLICY IF EXISTS "read notas" ON public.notas_comentarios;
CREATE POLICY "read notas" ON public.notas_comentarios
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read notif" ON public.notificacoes_log;
DROP POLICY IF EXISTS "read notif approved" ON public.notificacoes_log;
CREATE POLICY "read notif approved" ON public.notificacoes_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read ta" ON public.termos_aditivos;
CREATE POLICY "read ta" ON public.termos_aditivos
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read ae" ON public.assinaturas_etapa;
CREATE POLICY "read ae" ON public.assinaturas_etapa
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read rev" ON public.revisoes_empenho;
CREATE POLICY "read rev" ON public.revisoes_empenho
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read pc" ON public.prestacoes_contas;
CREATE POLICY "read pc" ON public.prestacoes_contas
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read pci" ON public.prestacoes_contas_interacoes;
CREATE POLICY "read pci" ON public.prestacoes_contas_interacoes
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read avisos" ON public.prestacao_prazo_avisos;
CREATE POLICY "read avisos" ON public.prestacao_prazo_avisos
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read config" ON public.sistema_config;
CREATE POLICY "read config" ON public.sistema_config
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read amo" ON public.assinaturas_manual_override;
CREATE POLICY "Auth read amo" ON public.assinaturas_manual_override
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "Auth read marco_tempo" ON public.lancamento_marco_tempo;
CREATE POLICY "Auth read marco_tempo" ON public.lancamento_marco_tempo
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read" ON public.piso_feriados;
CREATE POLICY "read" ON public.piso_feriados
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "read" ON public.piso_assinatura_matriz;
CREATE POLICY "read" ON public.piso_assinatura_matriz
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "prestador cnes read" ON public.prestador_cnes;
CREATE POLICY "prestador cnes read" ON public.prestador_cnes
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

-- Trilha histórica: se houver inserção direta pelo cliente, ela precisa ser
-- atribuída ao próprio usuário e ele já deve possuir papel aprovado.
DROP POLICY IF EXISTS "Auth insert hist" ON public.historico_logs;
DROP POLICY IF EXISTS "insert hist approved own" ON public.historico_logs;
CREATE POLICY "insert hist approved own" ON public.historico_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[])
  );

-- Log de notificações: não aceitar usuário pendente.
DROP POLICY IF EXISTS "insert notif" ON public.notificacoes_log;
CREATE POLICY "insert notif" ON public.notificacoes_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

-- Overrides de signatários são configuração administrativa.
DROP POLICY IF EXISTS "Auth write amo" ON public.assinaturas_manual_override;
CREATE POLICY "Auth write amo" ON public.assinaturas_manual_override
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Notificações são criadas exclusivamente por triggers SECURITY DEFINER.
-- O cliente continua podendo ler/marcar/apagar apenas as próprias notificações,
-- mas não pode fabricar mensagens que acionariam o webhook de e-mail.
DROP POLICY IF EXISTS "inserir propria notificacao" ON public.notificacoes;
REVOKE INSERT ON public.notificacoes FROM authenticated;
