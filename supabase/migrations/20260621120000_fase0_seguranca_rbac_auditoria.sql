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
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
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
CREATE POLICY "read prestadores" ON public.prestadores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert prestadores" ON public.prestadores
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "update prestadores" ON public.prestadores
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "delete prestadores" ON public.prestadores
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  convenios — idem prestadores
-- =====================================================================
DROP POLICY IF EXISTS "Auth read convenios"  ON public.convenios;
DROP POLICY IF EXISTS "Auth write convenios" ON public.convenios;
CREATE POLICY "read convenios" ON public.convenios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert convenios" ON public.convenios
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "update convenios" ON public.convenios
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "delete convenios" ON public.convenios
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  lancamentos_pagamento — leitura: todos; criação: ACP/admin;
--      atualização: ACP/ACO/admin (escopo de coluna travado por trigger);
--      exclusão: admin
-- =====================================================================
DROP POLICY IF EXISTS "Auth read lanc"  ON public.lancamentos_pagamento;
DROP POLICY IF EXISTS "Auth write lanc" ON public.lancamentos_pagamento;
CREATE POLICY "read lanc" ON public.lancamentos_pagamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert lanc" ON public.lancamentos_pagamento
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','admin']::app_role[]));
CREATE POLICY "update lanc" ON public.lancamentos_pagamento
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
CREATE POLICY "delete lanc" ON public.lancamentos_pagamento
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  assinaturas_config / sla_config — config sensível: só admin escreve
-- =====================================================================
DROP POLICY IF EXISTS "Auth read ac"  ON public.assinaturas_config;
DROP POLICY IF EXISTS "Auth write ac" ON public.assinaturas_config;
CREATE POLICY "read ac" ON public.assinaturas_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "write ac" ON public.assinaturas_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Auth read sla"  ON public.sla_config;
DROP POLICY IF EXISTS "Auth write sla" ON public.sla_config;
CREATE POLICY "read sla" ON public.sla_config
  FOR SELECT TO authenticated USING (true);
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
CREATE POLICY "read al" ON public.assinaturas_lancamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert al" ON public.assinaturas_lancamento
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
CREATE POLICY "update al" ON public.assinaturas_lancamento
  FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['acp','aco','admin']::app_role[]));
CREATE POLICY "delete al" ON public.assinaturas_lancamento
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 0.1  notas_comentarios — leitura/escrita autenticado; edição/del do autor
-- =====================================================================
DROP POLICY IF EXISTS "Auth read notas"  ON public.notas_comentarios;
DROP POLICY IF EXISTS "Auth write notas" ON public.notas_comentarios;
CREATE POLICY "read notas" ON public.notas_comentarios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert notas" ON public.notas_comentarios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);
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
