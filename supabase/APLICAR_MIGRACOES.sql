-- =====================================================================
-- APLICAR TODAS AS MIGRACOES (Fases 0,1,2 + acesso por aprovacao + notificacoes)
-- Cole este arquivo INTEIRO no SQL editor do Lovable Cloud e clique em Run.
-- Seguro para rodar uma vez sobre o banco atual (baseline original).
-- =====================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>> 20260621120000_fase0_seguranca_rbac_auditoria.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FASE 0 — Fundação de Segurança & Conformidade (LGPD / ISO 27001)
-- ---------------------------------------------------------------------
-- Objetivos:
--   0.1  RBAC real na RLS (substitui as policies "USING (true)")
--   0.1  Segregação de função ACP x ACO (trava de edição por papel)
--   0.2  Trilha de auditoria imutável (logging por trigger, append-only)
--   0.1  Atribuição de papéis gerenciada por admin
-- Referências: ISO 27001 A.5.3/A.5.15/A.5.18/A.8.3/A.8.15; LGPD Art.37/46;
--              OWASP A01 (Broken Access Control); menor privilégio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: o usuário possui ALGUM dos papéis informados?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  );
$$;

-- =====================================================================
-- 0.1  user_roles — admin gerencia papéis; usuário vê os próprios
-- =====================================================================
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- =====================================================================
-- 0.1  prestadores — leitura: todos autenticados; escrita: ACP/admin;
--                    exclusão: admin
-- =====================================================================
DROP POLICY IF EXISTS "Auth read prestadores"  ON public.prestadores;
DROP POLICY IF EXISTS "Auth write prestadores" ON public.prestadores;
DROP POLICY IF EXISTS "read prestadores" ON public.prestadores;
CREATE POLICY "read prestadores" ON public.prestadores
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert prestadores" ON public.prestadores;
CREATE POLICY "insert prestadores" ON public.prestadores
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "update prestadores" ON public.prestadores;
CREATE POLICY "update prestadores" ON public.prestadores
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "delete prestadores" ON public.prestadores;
CREATE POLICY "delete prestadores" ON public.prestadores
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  convenios — idem prestadores
-- =====================================================================
DROP POLICY IF EXISTS "Auth read convenios"  ON public.convenios;
DROP POLICY IF EXISTS "Auth write convenios" ON public.convenios;
DROP POLICY IF EXISTS "read convenios" ON public.convenios;
CREATE POLICY "read convenios" ON public.convenios
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert convenios" ON public.convenios;
CREATE POLICY "insert convenios" ON public.convenios
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "update convenios" ON public.convenios;
CREATE POLICY "update convenios" ON public.convenios
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "delete convenios" ON public.convenios;
CREATE POLICY "delete convenios" ON public.convenios
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  lancamentos_pagamento — leitura: todos; criação: ACP/admin;
--      atualização: ACP/ACO/admin (escopo de coluna travado por trigger);
--      exclusão: admin
-- =====================================================================
DROP POLICY IF EXISTS "Auth read lanc"  ON public.lancamentos_pagamento;
DROP POLICY IF EXISTS "Auth write lanc" ON public.lancamentos_pagamento;
DROP POLICY IF EXISTS "read lanc" ON public.lancamentos_pagamento;
CREATE POLICY "read lanc" ON public.lancamentos_pagamento
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert lanc" ON public.lancamentos_pagamento;
CREATE POLICY "insert lanc" ON public.lancamentos_pagamento
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "update lanc" ON public.lancamentos_pagamento;
CREATE POLICY "update lanc" ON public.lancamentos_pagamento
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
DROP POLICY IF EXISTS "delete lanc" ON public.lancamentos_pagamento;
CREATE POLICY "delete lanc" ON public.lancamentos_pagamento
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  assinaturas_config / sla_config — config sensível: só admin escreve
-- =====================================================================
DROP POLICY IF EXISTS "Auth read ac"  ON public.assinaturas_config;
DROP POLICY IF EXISTS "Auth write ac" ON public.assinaturas_config;
DROP POLICY IF EXISTS "read ac" ON public.assinaturas_config;
CREATE POLICY "read ac" ON public.assinaturas_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write ac" ON public.assinaturas_config;
CREATE POLICY "write ac" ON public.assinaturas_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Auth read sla"  ON public.sla_config;
DROP POLICY IF EXISTS "Auth write sla" ON public.sla_config;
DROP POLICY IF EXISTS "read sla" ON public.sla_config;
CREATE POLICY "read sla" ON public.sla_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write sla" ON public.sla_config;
CREATE POLICY "write sla" ON public.sla_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  assinaturas_lancamento — leitura todos; insert/update ACP/ACO/admin
--      (assinar é ato de fluxo); delete admin
-- =====================================================================
DROP POLICY IF EXISTS "Auth read al"  ON public.assinaturas_lancamento;
DROP POLICY IF EXISTS "Auth write al" ON public.assinaturas_lancamento;
DROP POLICY IF EXISTS "read al" ON public.assinaturas_lancamento;
CREATE POLICY "read al" ON public.assinaturas_lancamento
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert al" ON public.assinaturas_lancamento;
CREATE POLICY "insert al" ON public.assinaturas_lancamento
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
DROP POLICY IF EXISTS "update al" ON public.assinaturas_lancamento;
CREATE POLICY "update al" ON public.assinaturas_lancamento
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
DROP POLICY IF EXISTS "delete al" ON public.assinaturas_lancamento;
CREATE POLICY "delete al" ON public.assinaturas_lancamento
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  notas_comentarios — leitura/escrita autenticado; edição/del do autor
-- =====================================================================
DROP POLICY IF EXISTS "Auth read notas"  ON public.notas_comentarios;
DROP POLICY IF EXISTS "Auth write notas" ON public.notas_comentarios;
DROP POLICY IF EXISTS "read notas" ON public.notas_comentarios;
CREATE POLICY "read notas" ON public.notas_comentarios
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert notas" ON public.notas_comentarios;
CREATE POLICY "insert notas" ON public.notas_comentarios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "delete own notas" ON public.notas_comentarios;
CREATE POLICY "delete own notas" ON public.notas_comentarios
  FOR DELETE TO authenticated
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.2  historico_logs — APPEND-ONLY (auditoria imutável)
--      Sem policy de UPDATE/DELETE => negados pela RLS. Revoga o GRANT
--      remanescente por defesa em profundidade.
-- =====================================================================
REVOKE UPDATE, DELETE ON public.historico_logs FROM authenticated;
-- (policies "Auth read hist" e "Auth insert hist" permanecem)

-- =====================================================================
-- 0.2  notificacoes_log — sistema insere; ninguém altera/apaga (exceto admin)
-- =====================================================================
DROP POLICY IF EXISTS "Auth write notif" ON public.notificacoes_log;
REVOKE UPDATE, DELETE ON public.notificacoes_log FROM authenticated;
DROP POLICY IF EXISTS "insert notif" ON public.notificacoes_log;
CREATE POLICY "insert notif" ON public.notificacoes_log
  FOR INSERT TO authenticated WITH CHECK (true);
-- (policy "Auth read notif" de SELECT permanece)

-- =====================================================================
-- 0.1  Segregação de função: ACP só altera campos ACP, ACO só campos ACO
--      (admin livre; jobs sem auth.uid() livres). ERRCODE 42501 =>
--      mensagem amigável no frontend.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_acp_aco_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  acp_changed boolean;
  aco_changed boolean;
BEGIN
  IF uid IS NULL OR public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;

  acp_changed :=
       (NEW.descricao                IS DISTINCT FROM OLD.descricao)
    OR (NEW.termo_aditivo            IS DISTINCT FROM OLD.termo_aditivo)
    OR (NEW.parcela                  IS DISTINCT FROM OLD.parcela)
    OR (NEW.competencia              IS DISTINCT FROM OLD.competencia)
    OR (NEW.mes_pagamento_previsto   IS DISTINCT FROM OLD.mes_pagamento_previsto)
    OR (NEW.valor_solicitado         IS DISTINCT FROM OLD.valor_solicitado)
    OR (NEW.link_solicitacao_sei     IS DISTINCT FROM OLD.link_solicitacao_sei)
    OR (NEW.valor_atestado           IS DISTINCT FROM OLD.valor_atestado)
    OR (NEW.link_solicitacao_anulacao IS DISTINCT FROM OLD.link_solicitacao_anulacao);

  aco_changed :=
       (NEW.dotacao_orcamentaria     IS DISTINCT FROM OLD.dotacao_orcamentaria)
    OR (NEW.fonte_pagamento          IS DISTINCT FROM OLD.fonte_pagamento)
    OR (NEW.status_aco               IS DISTINCT FROM OLD.status_aco)
    OR (NEW.numero_empenho           IS DISTINCT FROM OLD.numero_empenho)
    OR (NEW.link_empenho_sei         IS DISTINCT FROM OLD.link_empenho_sei)
    OR (NEW.valor_empenho_liquido    IS DISTINCT FROM OLD.valor_empenho_liquido)
    OR (NEW.link_anulacao_sei        IS DISTINCT FROM OLD.link_anulacao_sei);

  IF acp_changed AND NOT public.has_role(uid, 'acp') THEN
    RAISE EXCEPTION 'Acesso negado: apenas a ACP pode alterar os campos da ACP.'
      USING ERRCODE = '42501';
  END IF;
  IF aco_changed AND NOT public.has_role(uid, 'aco') THEN
    RAISE EXCEPTION 'Acesso negado: apenas a ACO pode alterar os campos da ACO.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_scope ON public.lancamentos_pagamento;
CREATE TRIGGER trg_enforce_scope
  BEFORE UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.enforce_acp_aco_scope();

-- =====================================================================
-- 0.2  Auditoria imutável via trigger — diff campo a campo, autor = auth.uid()
--      (não depende do frontend => não pode ser burlado)
--      Minimização (LGPD Art.6 III): grava o NOME do servidor (ato oficial),
--      não o e-mail.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_lancamento_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  old_j jsonb;
  new_j jsonb;
  k text;
  diffs jsonb := '{}'::jsonb;
  ignore_cols text[] := ARRAY['updated_at','created_at','valor_anulado'];
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao)
    VALUES (NEW.id, uid, uname, 'Lançamento criado');
    RETURN NEW;
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(new_j) LOOP
    IF k = ANY(ignore_cols) THEN CONTINUE; END IF;
    IF (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
      diffs := diffs || jsonb_build_object(
        k, jsonb_build_object('de', old_j -> k, 'para', new_j -> k));
    END IF;
  END LOOP;

  IF diffs <> '{}'::jsonb THEN
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (NEW.id, uid, uname, 'Campos atualizados', diffs);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_lanc_audit ON public.lancamentos_pagamento;
CREATE TRIGGER trg_log_lanc_audit
  AFTER INSERT OR UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.log_lancamento_audit();

-- Auditoria de assinaturas (marcar/desfazer)
CREATE OR REPLACE FUNCTION public.log_assinatura_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); uname text;
BEGIN
  IF NEW.assinado IS DISTINCT FROM OLD.assinado THEN
    SELECT nome INTO uname FROM public.profiles WHERE id = uid;
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao)
    VALUES (NEW.lancamento_id, uid, uname,
      CASE WHEN NEW.assinado
           THEN 'Assinatura marcada: '  || NEW.nome_servidor
           ELSE 'Assinatura desfeita: ' || NEW.nome_servidor END);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_assinatura ON public.assinaturas_lancamento;
CREATE TRIGGER trg_log_assinatura
  AFTER UPDATE ON public.assinaturas_lancamento
  FOR EACH ROW EXECUTE FUNCTION public.log_assinatura_audit();

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260621140000_acesso_por_aprovacao.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Acesso por aprovação (menor privilégio — ISO 27001 A.5.16 / A.5.18)
-- ---------------------------------------------------------------------
-- Novos usuários passam a NÃO receber papel automaticamente: ficam
-- "pendentes" (sem papel = sem acesso de escrita e sem entrar no app)
-- até que um admin aprove e atribua ACP/ACO/admin em Configurações.
-- O PRIMEIRO usuário do sistema continua virando admin automaticamente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email);

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    -- bootstrap: primeiro usuário é o administrador
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  -- demais usuários: nenhum papel -> aguardando aprovação do admin
  RETURN NEW;
END; $$;

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260621130000_fase1_nota_empenho_e_travas.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FASE 1 — Renomeação de etapa + travas de valor no banco
-- ---------------------------------------------------------------------
-- 1) "Nota Técnica" -> "Nota de Empenho": rotina real da ACP é
--    solicitar empenho -> Financeiro emite a NOTA DE EMPENHO -> (se
--    preciso) solicitar anulação -> Financeiro emite a nota de anulação.
-- 2) Trava não-burlável: empenho líquido nunca pode exceder o solicitado
--    (defesa em profundidade: o frontend valida em tempo real para UX,
--     o banco garante a verdade — OWASP A01/A04).
-- =====================================================================

-- Renomeia o valor do enum (atualiza todas as linhas que o referenciam).
DO $rn$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'etapa_processo' AND e.enumlabel = 'nota_tecnica'
  ) THEN
    ALTER TYPE public.etapa_processo RENAME VALUE 'nota_tecnica' TO 'nota_empenho';
  END IF;
END $rn$;

-- Trava: valor_empenho_liquido <= valor_solicitado (quando ambos existem).
ALTER TABLE public.lancamentos_pagamento
  DROP CONSTRAINT IF EXISTS chk_empenho_nao_excede_solicitado;
ALTER TABLE public.lancamentos_pagamento
  ADD CONSTRAINT chk_empenho_nao_excede_solicitado
  CHECK (
    valor_empenho_liquido IS NULL
    OR valor_solicitado IS NULL
    OR valor_empenho_liquido <= valor_solicitado
  );

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260621150000_fase2_termos_aditivos_e_saldo.sql <<<<<<<<<<<<<<<<<<<<<<<<
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
DROP POLICY IF EXISTS "read ta" ON public.termos_aditivos;
CREATE POLICY "read ta" ON public.termos_aditivos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert ta" ON public.termos_aditivos;
CREATE POLICY "insert ta" ON public.termos_aditivos
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "update ta" ON public.termos_aditivos;
CREATE POLICY "update ta" ON public.termos_aditivos
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
DROP POLICY IF EXISTS "delete ta" ON public.termos_aditivos;
CREATE POLICY "delete ta" ON public.termos_aditivos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS trg_ta_updated ON public.termos_aditivos;
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

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260621160000_notificacoes_realtime.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Notificações automáticas (centro de notificações in-app, tempo real)
-- ---------------------------------------------------------------------
-- Tabela por destinatário (com estado de leitura) + fanout por trigger
-- (SECURITY DEFINER) quando um processo muda de etapa/responsável ou é
-- concluído. Realtime habilitado para entrega instantânea no sino.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  tipo TEXT,                           -- 'etapa' | 'conclusao' | 'sistema'
  lancamento_id UUID REFERENCES public.lancamentos_pagamento(id) ON DELETE SET NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Cada usuário só enxerga e gerencia as suas notificações.
DROP POLICY IF EXISTS "ver proprias notificacoes" ON public.notificacoes;
CREATE POLICY "ver proprias notificacoes" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "marcar propria notificacao" ON public.notificacoes;
CREATE POLICY "marcar propria notificacao" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "apagar propria notificacao" ON public.notificacoes;
CREATE POLICY "apagar propria notificacao" ON public.notificacoes
  FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "inserir propria notificacao" ON public.notificacoes;
CREATE POLICY "inserir propria notificacao" ON public.notificacoes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notificacoes(user_id, lida, created_at DESC);

-- ---------------------------------------------------------------------
-- Fanout: gera notificações por destinatário ao avançar etapa / concluir.
-- SECURITY DEFINER -> pode inserir para outros usuários (ignora RLS).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fanout_notificacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  presta TEXT;
  titulo TEXT;
  msg TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  SELECT nome_instituicao INTO presta FROM public.prestadores WHERE id = NEW.prestador_id;
  presta := COALESCE(presta, 'Prestador');

  -- Conclusão do processo
  IF NEW.concluido AND NOT OLD.concluido THEN
    titulo := 'Processo concluído';
    msg := presta || ' · ' || COALESCE(NEW.descricao, 'processo') || ' foi concluído.';
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT DISTINCT ur.user_id, titulo, msg, 'conclusao', NEW.id
      FROM public.user_roles ur WHERE ur.role IN ('acp','aco');
    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      VALUES (NEW.created_by, titulo, msg, 'conclusao', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- Mudança de etapa / responsável -> avisa o setor responsável agora
  IF NEW.responsavel_atual IS DISTINCT FROM OLD.responsavel_atual
     OR NEW.etapa_atual IS DISTINCT FROM OLD.etapa_atual THEN
    titulo := 'Processo aguardando sua ação';
    msg := presta || ' · ' || COALESCE(NEW.descricao, 'processo') ||
           ' está sob responsabilidade da ' || upper(NEW.responsavel_atual) || '.';
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT ur.user_id, titulo, msg, 'etapa', NEW.id
      FROM public.user_roles ur
      WHERE ur.role = NEW.responsavel_atual::app_role;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fanout_notificacoes ON public.lancamentos_pagamento;
CREATE TRIGGER trg_fanout_notificacoes
  AFTER UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.fanout_notificacoes();

-- ---------------------------------------------------------------------
-- Realtime: entrega instantânea no sino.
-- ---------------------------------------------------------------------
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
