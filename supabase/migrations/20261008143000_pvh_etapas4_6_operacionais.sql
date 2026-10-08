-- PVH — Etapas 4, 5 e 6 operacionais
--
-- Etapa 4: Solicitação de Subempenho/Liquidação, Aviso de Movimento —
-- Empenho em Liquidação, assinaturas e encaminhamento à SEFAZ.UAF.ADE,
-- Aviso de Movimento — Subempenho.
-- Etapa 5: Programação de Pagamento + Comprovante de Pagamento, com parcelas.
-- Etapa 6: comunicação institucional por e-mail conforme snapshot
-- pvh_participantes.notificar_email.

-- ============================================================================
-- 1. Etapa 4 — assinaturas e encaminhamento
-- ============================================================================

ALTER TABLE public.pvh_subempenhos
  ADD COLUMN IF NOT EXISTS movimento_liquidacao_encaminhado_sefaz boolean
    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS movimento_liquidacao_encaminhado_em timestamptz,
  ADD COLUMN IF NOT EXISTS movimento_liquidacao_encaminhado_por uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movimento_liquidacao_encaminhado_por_nome text;

CREATE TABLE IF NOT EXISTS public.pvh_subempenho_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subempenho_id uuid NOT NULL
    REFERENCES public.pvh_subempenhos(id) ON DELETE RESTRICT,
  documento_tipo text NOT NULL,
  slot text NOT NULL,
  assinante_nome text NOT NULL,
  cargo text NOT NULL,
  codigo_sei text,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_por_nome text,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_por_nome text,
  motivo_revogacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_sub_ass_documento_check
    CHECK (documento_tipo IN ('solicitacao','movimento_liquidacao')),
  CONSTRAINT pvh_sub_ass_slot_check
    CHECK (slot IN ('fiscal','comissao')),
  CONSTRAINT pvh_sub_ass_nome_check
    CHECK (length(btrim(assinante_nome)) > 0),
  CONSTRAINT pvh_sub_ass_cargo_check
    CHECK (length(btrim(cargo)) > 0),
  CONSTRAINT pvh_sub_ass_revogacao_check
    CHECK (
      revogado_em IS NULL
      OR (
        motivo_revogacao IS NOT NULL
        AND length(btrim(motivo_revogacao)) > 0
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_sub_ass_slot_ativo
  ON public.pvh_subempenho_assinaturas (
    subempenho_id,
    documento_tipo,
    slot
  )
  WHERE revogado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_pvh_sub_ass_subempenho
  ON public.pvh_subempenho_assinaturas (
    subempenho_id,
    documento_tipo,
    assinado_em
  );

DROP TRIGGER IF EXISTS trg_pvh_sub_ass_updated_at
  ON public.pvh_subempenho_assinaturas;

CREATE TRIGGER trg_pvh_sub_ass_updated_at
  BEFORE UPDATE ON public.pvh_subempenho_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE OR REPLACE FUNCTION public.pvh_reabrir_encaminhamento_movimento_liquidacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW.movimento_liquidacao_sei_numero
      IS DISTINCT FROM OLD.movimento_liquidacao_sei_numero
    OR NEW.movimento_liquidacao_sei_link
      IS DISTINCT FROM OLD.movimento_liquidacao_sei_link
  )
  AND OLD.movimento_liquidacao_encaminhado_sefaz = true
  THEN
    NEW.movimento_liquidacao_encaminhado_sefaz := false;
    NEW.movimento_liquidacao_encaminhado_em := NULL;
    NEW.movimento_liquidacao_encaminhado_por := NULL;
    NEW.movimento_liquidacao_encaminhado_por_nome := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_reabrir_encaminhamento_movimento_liquidacao()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_sub_reabrir_encaminhamento
  ON public.pvh_subempenhos;

CREATE TRIGGER trg_pvh_sub_reabrir_encaminhamento
  BEFORE UPDATE OF
    movimento_liquidacao_sei_numero,
    movimento_liquidacao_sei_link
  ON public.pvh_subempenhos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reabrir_encaminhamento_movimento_liquidacao();


CREATE OR REPLACE FUNCTION public.pvh_reabrir_encaminhamento_por_assinatura_sub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub uuid;
  v_tem_comissao boolean;
BEGIN
  v_sub := NEW.subempenho_id;

  IF NEW.documento_tipo <> 'movimento_liquidacao' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.pvh_subempenho_assinaturas s
     WHERE s.subempenho_id = v_sub
       AND s.documento_tipo = 'movimento_liquidacao'
       AND s.slot = 'comissao'
       AND s.revogado_em IS NULL
  )
  INTO v_tem_comissao;

  IF NOT v_tem_comissao THEN
    UPDATE public.pvh_subempenhos
       SET movimento_liquidacao_encaminhado_sefaz = false,
           movimento_liquidacao_encaminhado_em = NULL,
           movimento_liquidacao_encaminhado_por = NULL,
           movimento_liquidacao_encaminhado_por_nome = NULL
     WHERE id = v_sub
       AND movimento_liquidacao_encaminhado_sefaz = true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_reabrir_encaminhamento_por_assinatura_sub()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_sub_ass_reabrir_encaminhamento
  ON public.pvh_subempenho_assinaturas;

CREATE TRIGGER trg_pvh_sub_ass_reabrir_encaminhamento
  AFTER INSERT OR UPDATE
  ON public.pvh_subempenho_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reabrir_encaminhamento_por_assinatura_sub();


CREATE OR REPLACE FUNCTION public.pvh_confirmar_movimento_liquidacao_sefaz(
  p_subempenho uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.pvh_subempenhos%ROWTYPE;
  v_nome text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para confirmar o encaminhamento à SEFAZ.UAF.ADE.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_sub
    FROM public.pvh_subempenhos
   WHERE id = p_subempenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subempenho PVH não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF NULLIF(btrim(v_sub.movimento_liquidacao_sei_numero), '') IS NULL
     OR NULLIF(btrim(v_sub.movimento_liquidacao_sei_link), '') IS NULL
     OR v_sub.movimento_liquidacao_sei_link !~* '^https?://'
  THEN
    RAISE EXCEPTION
      'Complete Número SEI e Link SEI do Aviso de Movimento — Empenho em Liquidação.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_subempenho_assinaturas s
     WHERE s.subempenho_id = p_subempenho
       AND s.documento_tipo = 'movimento_liquidacao'
       AND s.slot = 'comissao'
       AND s.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'Registre a assinatura obrigatória da Comissão antes do encaminhamento.'
      USING ERRCODE = '23514';
  END IF;

  SELECT nome
    INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  UPDATE public.pvh_subempenhos
     SET movimento_liquidacao_encaminhado_sefaz = true,
         movimento_liquidacao_encaminhado_em = now(),
         movimento_liquidacao_encaminhado_por = auth.uid(),
         movimento_liquidacao_encaminhado_por_nome = v_nome
   WHERE id = p_subempenho;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_confirmar_movimento_liquidacao_sefaz(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.pvh_confirmar_movimento_liquidacao_sefaz(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 2. Etapa 5 — pagamentos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pvh_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL
    REFERENCES public.pvh_competencias(id) ON DELETE CASCADE,
  participante_id uuid NOT NULL
    REFERENCES public.pvh_participantes(id) ON DELETE CASCADE,

  programacao_sei_numero text,
  programacao_sei_link text,

  comprovante_sei_numero text,
  comprovante_sei_link text,
  data_programacao date,
  data_pagamento date,
  valor_pago numeric(16,2),

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_pagamentos_valor_check
    CHECK (valor_pago IS NULL OR valor_pago > 0),
  CONSTRAINT pvh_pagamentos_datas_check
    CHECK (
      data_programacao IS NULL
      OR data_pagamento IS NULL
      OR data_pagamento >= data_programacao
    )
);

CREATE INDEX IF NOT EXISTS idx_pvh_pagamentos_comp_part
  ON public.pvh_pagamentos (
    competencia_id,
    participante_id,
    created_at
  );

DROP TRIGGER IF EXISTS trg_pvh_pagamentos_updated_at
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_updated_at
  BEFORE UPDATE ON public.pvh_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE OR REPLACE FUNCTION public.pvh_validar_pagamento_escopo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_comp uuid;
BEGIN
  SELECT competencia_id
    INTO v_comp
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id;

  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'Participante PVH não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.competencia_id IS DISTINCT FROM v_comp THEN
    RAISE EXCEPTION
      'O pagamento deve pertencer à mesma competência do participante.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.competencia_id IS DISTINCT FROM OLD.competencia_id
       OR NEW.participante_id IS DISTINCT FROM OLD.participante_id
     )
  THEN
    RAISE EXCEPTION
      'Competência e instituição do pagamento não podem ser alteradas depois da criação.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_validar_pagamento_escopo()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_pagamentos_escopo
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_escopo_insert
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_escopo_update
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_escopo_insert
  BEFORE INSERT
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_validar_pagamento_escopo();

CREATE TRIGGER trg_pvh_pagamentos_escopo_update
  BEFORE UPDATE OF competencia_id, participante_id
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_validar_pagamento_escopo();


CREATE OR REPLACE FUNCTION public.pvh_validar_pagamento_valor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
DECLARE
  v_devido numeric(16,2);
  v_pago_outros numeric(16,2);
BEGIN
  IF NEW.valor_pago IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(valor_municipal, valor_estadual, 0)
    INTO v_devido
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id
   FOR UPDATE;

  IF v_devido <= 0 THEN
    RAISE EXCEPTION
      'A instituição não possui valor devido definido para esta competência.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(valor_pago), 0)
    INTO v_pago_outros
    FROM public.pvh_pagamentos
   WHERE participante_id = NEW.participante_id
     AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_pago_outros + NEW.valor_pago > v_devido + 0.009 THEN
    RAISE EXCEPTION
      'A soma dos pagamentos excede o valor devido à instituição nesta competência.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_validar_pagamento_valor()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_pagamentos_validar_valor
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_validar_valor_insert
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_validar_valor_update
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_validar_valor_insert
  BEFORE INSERT
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_validar_pagamento_valor();

CREATE TRIGGER trg_pvh_pagamentos_validar_valor_update
  BEFORE UPDATE OF valor_pago, participante_id
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_validar_pagamento_valor();


CREATE OR REPLACE FUNCTION public.pvh_sincronizar_valor_pago()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part uuid;
BEGIN
  v_part := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.participante_id
    ELSE NEW.participante_id
  END;

  UPDATE public.pvh_participantes p
     SET valor_pago = COALESCE(
       (
         SELECT SUM(pg.valor_pago)
           FROM public.pvh_pagamentos pg
          WHERE pg.participante_id = v_part
       ),
       0
     )
   WHERE p.id = v_part;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_sincronizar_valor_pago()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_pagamentos_sincronizar
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_sincronizar_insert_delete
  ON public.pvh_pagamentos;
DROP TRIGGER IF EXISTS trg_pvh_pagamentos_sincronizar_update
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_sincronizar_insert_delete
  AFTER INSERT OR DELETE
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_sincronizar_valor_pago();

CREATE TRIGGER trg_pvh_pagamentos_sincronizar_update
  AFTER UPDATE OF valor_pago
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_sincronizar_valor_pago();


-- ============================================================================
-- 3. Etapa 6 — comunicação institucional
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pvh_notificacoes_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL
    REFERENCES public.pvh_competencias(id) ON DELETE CASCADE,
  participante_id uuid NOT NULL
    REFERENCES public.pvh_participantes(id) ON DELETE CASCADE,
  destinatarios text[] NOT NULL DEFAULT '{}',
  assunto text NOT NULL DEFAULT '',
  corpo text NOT NULL DEFAULT '',
  enviado_em timestamptz,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_por_nome text,
  processo_sei_numero text,
  processo_sei_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participante_id)
);

CREATE INDEX IF NOT EXISTS idx_pvh_notificacoes_email_comp
  ON public.pvh_notificacoes_email (
    competencia_id,
    participante_id
  );

DROP TRIGGER IF EXISTS trg_pvh_notificacoes_email_updated_at
  ON public.pvh_notificacoes_email;

CREATE TRIGGER trg_pvh_notificacoes_email_updated_at
  BEFORE UPDATE ON public.pvh_notificacoes_email
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE OR REPLACE FUNCTION public.pvh_validar_notificacao_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_comp uuid;
  v_prestador uuid;
  v_notificar boolean;
  v_email text;
BEGIN
  SELECT competencia_id, prestador_id, notificar_email
    INTO v_comp, v_prestador, v_notificar
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id;

  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'Participante PVH não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.competencia_id IS DISTINCT FROM v_comp THEN
    RAISE EXCEPTION
      'A comunicação deve pertencer à mesma competência do participante.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.competencia_id IS DISTINCT FROM OLD.competencia_id
       OR NEW.participante_id IS DISTINCT FROM OLD.participante_id
     )
  THEN
    RAISE EXCEPTION
      'Competência e instituição da comunicação não podem ser alteradas depois da criação.'
      USING ERRCODE = '23514';
  END IF;

  IF v_notificar IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'A configuração vigente desta instituição não exige comunicação por e-mail.'
      USING ERRCODE = '23514';
  END IF;

  FOREACH v_email IN ARRAY COALESCE(NEW.destinatarios, '{}'::text[])
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.prestador_emails pe
       WHERE pe.prestador_id = v_prestador
         AND pe.email = lower(btrim(v_email))
    ) THEN
      RAISE EXCEPTION
        'O destinatário % não pertence ao cadastro mestre de e-mails da instituição.',
        COALESCE(v_email, '[nulo]')
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NEW.enviado_em IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NEW.enviado_por IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION
      'O responsável pelo envio deve ser o usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.enviado_em IS NOT NULL THEN
    IF cardinality(COALESCE(NEW.destinatarios, '{}'::text[])) = 0
       OR btrim(COALESCE(NEW.assunto, '')) = ''
       OR btrim(COALESCE(NEW.corpo, '')) = ''
       OR btrim(COALESCE(NEW.processo_sei_numero, '')) = ''
       OR btrim(COALESCE(NEW.processo_sei_link, '')) = ''
       OR NEW.processo_sei_link !~* '^https?://'
       OR NEW.enviado_por IS NULL
       OR btrim(COALESCE(NEW.enviado_por_nome, '')) = ''
    THEN
      RAISE EXCEPTION
        'O envio exige destinatários, conteúdo, Número SEI, Link SEI e responsável.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.enviado_em IS NOT NULL
     AND NEW.enviado_em IS NOT NULL
     AND (
       NEW.destinatarios IS DISTINCT FROM OLD.destinatarios
       OR NEW.assunto IS DISTINCT FROM OLD.assunto
       OR NEW.corpo IS DISTINCT FROM OLD.corpo
       OR NEW.processo_sei_numero IS DISTINCT FROM OLD.processo_sei_numero
       OR NEW.processo_sei_link IS DISTINCT FROM OLD.processo_sei_link
       OR NEW.enviado_em IS DISTINCT FROM OLD.enviado_em
       OR NEW.enviado_por IS DISTINCT FROM OLD.enviado_por
       OR NEW.enviado_por_nome IS DISTINCT FROM OLD.enviado_por_nome
     )
  THEN
    RAISE EXCEPTION
      'Reabra a comunicação antes de alterar destinatários, conteúdo ou registro SEI.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_validar_notificacao_email()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_notificacoes_email_validar
  ON public.pvh_notificacoes_email;

CREATE TRIGGER trg_pvh_notificacoes_email_validar
  BEFORE INSERT OR UPDATE
  ON public.pvh_notificacoes_email
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_validar_notificacao_email();


-- ============================================================================
-- 4. Auditoria + reconferência
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_audit_operacional_etapas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  row_j jsonb;
  old_j jsonb;
  v_sub uuid;
  v_part uuid;
BEGIN
  SELECT nome INTO uname
    FROM public.profiles
   WHERE id = uid;

  row_j := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  old_j := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  IF TG_TABLE_NAME = 'pvh_subempenho_assinaturas' THEN
    v_sub := CASE WHEN TG_OP = 'DELETE' THEN OLD.subempenho_id ELSE NEW.subempenho_id END;

    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
      JOIN public.pvh_participantes pp ON pp.id = a.participante_id
     WHERE s.id = v_sub;

  ELSIF TG_TABLE_NAME = 'pvh_pagamentos' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;

  ELSIF TG_TABLE_NAME = 'pvh_notificacoes_email' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;

  ELSE
    comp := NULL;
  END IF;

  INSERT INTO public.historico_logs (
    pvh_competencia_id,
    usuario_id,
    usuario_nome,
    acao,
    detalhes
  )
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE comp END,
    uid,
    uname,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(
      jsonb_build_object(
        'pvh_competencia_id_original', comp,
        'antes', old_j,
        'depois', row_j
      )
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_audit_operacional_etapas()
  FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.pvh_reconferir_operacional_etapas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  comp uuid;
  etapa integer;
  v_sub uuid;
BEGIN
  IF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes pp ON pp.id = a.participante_id
     WHERE a.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.alocacao_id ELSE NEW.alocacao_id END;
    etapa := 4;

  ELSIF TG_TABLE_NAME = 'pvh_subempenho_assinaturas' THEN
    v_sub := CASE WHEN TG_OP = 'DELETE' THEN OLD.subempenho_id ELSE NEW.subempenho_id END;

    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
      JOIN public.pvh_participantes pp ON pp.id = a.participante_id
     WHERE s.id = v_sub;
    etapa := 4;

  ELSIF TG_TABLE_NAME = 'pvh_pagamentos' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
    etapa := 5;

  ELSIF TG_TABLE_NAME = 'pvh_notificacoes_email' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
    etapa := 6;
  END IF;

  IF comp IS NOT NULL THEN
    PERFORM public.pvh_marcar_reconferencia(comp, etapa);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_reconferir_operacional_etapas()
  FROM PUBLIC, anon, authenticated;


DROP TRIGGER IF EXISTS trg_pvh_subempenhos_reconferir_operacional
  ON public.pvh_subempenhos;

CREATE TRIGGER trg_pvh_subempenhos_reconferir_operacional
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_subempenhos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_operacional_etapas();


DROP TRIGGER IF EXISTS trg_pvh_sub_ass_audit
  ON public.pvh_subempenho_assinaturas;

CREATE TRIGGER trg_pvh_sub_ass_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_subempenho_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_audit_operacional_etapas();

DROP TRIGGER IF EXISTS trg_pvh_sub_ass_reconferir
  ON public.pvh_subempenho_assinaturas;

CREATE TRIGGER trg_pvh_sub_ass_reconferir
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_subempenho_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_operacional_etapas();


DROP TRIGGER IF EXISTS trg_pvh_pagamentos_audit
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_audit_operacional_etapas();

DROP TRIGGER IF EXISTS trg_pvh_pagamentos_reconferir
  ON public.pvh_pagamentos;

CREATE TRIGGER trg_pvh_pagamentos_reconferir
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_operacional_etapas();


DROP TRIGGER IF EXISTS trg_pvh_notificacoes_email_audit
  ON public.pvh_notificacoes_email;

CREATE TRIGGER trg_pvh_notificacoes_email_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_notificacoes_email
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_audit_operacional_etapas();

DROP TRIGGER IF EXISTS trg_pvh_notificacoes_email_reconferir
  ON public.pvh_notificacoes_email;

CREATE TRIGGER trg_pvh_notificacoes_email_reconferir
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_notificacoes_email
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_operacional_etapas();


-- ============================================================================
-- 5. Conclusões server-side
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa4(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 4 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '2')::boolean, false)
       IS DISTINCT FROM true
     OR COALESCE((v_comp.etapas_concluidas ->> '3')::boolean, false)
       IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION
      'Conclua as Etapas 2 e 3 antes de concluir o Subempenho.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui alocações de empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
       AND (
         abs(
           COALESCE(
             (
               SELECT SUM(s.valor)
                 FROM public.pvh_subempenhos s
                WHERE s.alocacao_id = a.id
             ),
             0
           )
           - a.valor_alocado
         ) >= 0.01
         OR NOT EXISTS (
           SELECT 1
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
         )
         OR EXISTS (
           SELECT 1
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
              AND (
                NULLIF(btrim(s.solicitacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.solicitacao_sei_link), '') IS NULL
                OR s.solicitacao_sei_link !~* '^https?://'
                OR NULLIF(btrim(s.movimento_liquidacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_liquidacao_sei_link), '') IS NULL
                OR s.movimento_liquidacao_sei_link !~* '^https?://'
                OR s.movimento_liquidacao_encaminhado_sefaz IS DISTINCT FROM true
                OR NULLIF(btrim(s.movimento_subempenho_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_subempenho_sei_link), '') IS NULL
                OR s.movimento_subempenho_sei_link !~* '^https?://'
                OR NOT EXISTS (
                  SELECT 1
                    FROM public.pvh_subempenho_assinaturas ass
                   WHERE ass.subempenho_id = s.id
                     AND ass.documento_tipo = 'solicitacao'
                     AND ass.slot = 'comissao'
                     AND ass.revogado_em IS NULL
                )
                OR NOT EXISTS (
                  SELECT 1
                    FROM public.pvh_subempenho_assinaturas ass
                   WHERE ass.subempenho_id = s.id
                     AND ass.documento_tipo = 'movimento_liquidacao'
                     AND ass.slot = 'comissao'
                     AND ass.revogado_em IS NULL
                )
              )
         )
       )
  ) THEN
    RAISE EXCEPTION
      'Todas as instituições precisam ter a cadeia de Subempenho completa, assinada e encaminhada.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{4}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           4
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa4(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa4(uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa5(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 5 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '4')::boolean, false)
       IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Conclua a Etapa 4 antes do pagamento.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND (
         COALESCE(p.valor_municipal, p.valor_estadual, 0) <= 0
         OR abs(
           COALESCE(
             (
               SELECT SUM(pg.valor_pago)
                 FROM public.pvh_pagamentos pg
                WHERE pg.participante_id = p.id
             ),
             0
           )
           - COALESCE(p.valor_municipal, p.valor_estadual, 0)
         ) >= 0.01
         OR NOT EXISTS (
           SELECT 1
             FROM public.pvh_pagamentos pg
            WHERE pg.participante_id = p.id
         )
         OR EXISTS (
           SELECT 1
             FROM public.pvh_pagamentos pg
            WHERE pg.participante_id = p.id
              AND (
                NULLIF(btrim(pg.programacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(pg.programacao_sei_link), '') IS NULL
                OR pg.programacao_sei_link !~* '^https?://'
                OR NULLIF(btrim(pg.comprovante_sei_numero), '') IS NULL
                OR NULLIF(btrim(pg.comprovante_sei_link), '') IS NULL
                OR pg.comprovante_sei_link !~* '^https?://'
                OR pg.data_programacao IS NULL
                OR pg.data_pagamento IS NULL
                OR COALESCE(pg.valor_pago, 0) <= 0
              )
         )
       )
  ) THEN
    RAISE EXCEPTION
      'Todos os pagamentos precisam estar completos e o total pago deve fechar o valor devido de cada instituição.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{5}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           5
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa5(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa5(uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa6(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 6 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '5')::boolean, false)
       IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Conclua a Etapa 5 antes da comunicação.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND p.notificar_email = true
       AND NOT EXISTS (
         SELECT 1
           FROM public.pvh_notificacoes_email n
          WHERE n.participante_id = p.id
            AND n.enviado_em IS NOT NULL
            AND cardinality(COALESCE(n.destinatarios, '{}'::text[])) > 0
            AND NULLIF(btrim(n.assunto), '') IS NOT NULL
            AND NULLIF(btrim(n.corpo), '') IS NOT NULL
            AND NULLIF(btrim(n.processo_sei_numero), '') IS NOT NULL
            AND NULLIF(btrim(n.processo_sei_link), '') IS NOT NULL
            AND n.processo_sei_link ~* '^https?://'
            AND n.enviado_por IS NOT NULL
            AND NULLIF(btrim(n.enviado_por_nome), '') IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION
      'Há instituição com comunicação obrigatória ainda pendente.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{6}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           6
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa6(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa6(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 6. Exclusão administrativa da competência compatível com os novos filhos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_excluir_competencia(
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_competencia text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Somente administradores podem excluir competências do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT competencia
    INTO v_competencia
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  -- Assinaturas documentais usam RESTRICT e precisam sair antes dos documentos.
  DELETE FROM public.pvh_documento_assinaturas a
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_documentos d
      WHERE d.id = a.documento_id
        AND d.competencia_id = p_comp
   );

  -- As novas assinaturas da cadeia de subempenho também usam RESTRICT.
  DELETE FROM public.pvh_subempenho_assinaturas ass
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_subempenhos s
       JOIN public.pvh_empenho_alocacoes a
         ON a.id = s.alocacao_id
       JOIN public.pvh_participantes p
         ON p.id = a.participante_id
      WHERE ass.subempenho_id = s.id
        AND p.competencia_id = p_comp
   );

  -- Remove os subempenhos protegidos por RESTRICT antes das alocações.
  DELETE FROM public.pvh_subempenhos s
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_empenho_alocacoes a
       JOIN public.pvh_participantes p
         ON p.id = a.participante_id
      WHERE a.id = s.alocacao_id
        AND p.competencia_id = p_comp
   );

  -- Pagamentos e comunicações possuem CASCADE pela competência/participante.
  -- NEs permanecem preservadas: são entidades N:N e podem atender outros meses.
  DELETE FROM public.pvh_competencias
   WHERE id = p_comp;
END;
$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 7. RLS
-- ============================================================================

ALTER TABLE public.pvh_subempenho_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_notificacoes_email ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_subempenho_assinaturas FROM anon, authenticated;
REVOKE ALL ON public.pvh_pagamentos FROM anon, authenticated;
REVOKE ALL ON public.pvh_notificacoes_email FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pvh_subempenho_assinaturas
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pvh_pagamentos
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pvh_notificacoes_email
  TO authenticated;

GRANT ALL ON public.pvh_subempenho_assinaturas TO service_role;
GRANT ALL ON public.pvh_pagamentos TO service_role;
GRANT ALL ON public.pvh_notificacoes_email TO service_role;


DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pvh_subempenho_assinaturas',
    'pvh_pagamentos',
    'pvh_notificacoes_email'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "pvh %s read" ON public.%I',
      t,
      t
    );
    EXECUTE format(
      'CREATE POLICY "pvh %s read" ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::public.app_role[]))',
      t,
      t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "pvh %s insert" ON public.%I',
      t,
      t
    );
    EXECUTE format(
      'CREATE POLICY "pvh %s insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::public.app_role[]))',
      t,
      t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "pvh %s update" ON public.%I',
      t,
      t
    );
    EXECUTE format(
      'CREATE POLICY "pvh %s update" ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::public.app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::public.app_role[]))',
      t,
      t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "pvh %s delete" ON public.%I',
      t,
      t
    );
    EXECUTE format(
      'CREATE POLICY "pvh %s delete" ON public.%I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'']::public.app_role[]))',
      t,
      t
    );
  END LOOP;
END $$;


NOTIFY pgrst, 'reload schema';
