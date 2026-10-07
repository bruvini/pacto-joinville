-- Piso da Enfermagem — Etapa 8: notificação institucional por e-mail via SEI.
-- A antiga etapa 8 (Encerramento) passa a ser a etapa 9.
-- Competências já encerradas são preservadas como legado, sem reabertura automática.

CREATE TABLE IF NOT EXISTS public.prestador_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prestador_emails_email_check
    CHECK (
      email = lower(btrim(email))
      AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  UNIQUE (prestador_id, email)
);

CREATE INDEX IF NOT EXISTS idx_prestador_emails_prestador
  ON public.prestador_emails (prestador_id, email);

ALTER TABLE public.prestador_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prestador_emails FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestador_emails TO authenticated;
GRANT ALL ON public.prestador_emails TO service_role;

DROP POLICY IF EXISTS "prestador emails read" ON public.prestador_emails;
CREATE POLICY "prestador emails read"
  ON public.prestador_emails
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "prestador emails insert" ON public.prestador_emails;
CREATE POLICY "prestador emails insert"
  ON public.prestador_emails
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "prestador emails update" ON public.prestador_emails;
CREATE POLICY "prestador emails update"
  ON public.prestador_emails
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "prestador emails delete" ON public.prestador_emails;
CREATE POLICY "prestador emails delete"
  ON public.prestador_emails
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

CREATE TABLE IF NOT EXISTS public.piso_notificacoes_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE CASCADE,
  participante_id uuid NOT NULL REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_piso_notificacoes_email_competencia
  ON public.piso_notificacoes_email (competencia_id, created_at);

ALTER TABLE public.piso_notificacoes_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piso_notificacoes_email FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piso_notificacoes_email TO authenticated;
GRANT ALL ON public.piso_notificacoes_email TO service_role;

DROP POLICY IF EXISTS "piso notificacao email read" ON public.piso_notificacoes_email;
CREATE POLICY "piso notificacao email read"
  ON public.piso_notificacoes_email
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "piso notificacao email insert" ON public.piso_notificacoes_email;
CREATE POLICY "piso notificacao email insert"
  ON public.piso_notificacoes_email
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "piso notificacao email update" ON public.piso_notificacoes_email;
CREATE POLICY "piso notificacao email update"
  ON public.piso_notificacoes_email
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "piso notificacao email delete" ON public.piso_notificacoes_email;
CREATE POLICY "piso notificacao email delete"
  ON public.piso_notificacoes_email
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

CREATE OR REPLACE FUNCTION public.piso_notificacao_email_validar_escopo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_competencia uuid;
  v_email text;
BEGIN
  SELECT p.competencia_id
    INTO v_competencia
    FROM public.piso_participantes p
    WHERE p.id = NEW.participante_id;

  IF v_competencia IS NULL THEN
    RAISE EXCEPTION 'Participante do Piso não encontrado.' USING ERRCODE = '23503';
  END IF;

  IF NEW.competencia_id IS DISTINCT FROM v_competencia THEN
    RAISE EXCEPTION 'A notificação deve pertencer à mesma competência do participante.'
      USING ERRCODE = '23514';
  END IF;

  FOREACH v_email IN ARRAY COALESCE(NEW.destinatarios, '{}'::text[]) LOOP
    IF v_email IS NULL
      OR v_email <> lower(btrim(v_email))
      OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN
      RAISE EXCEPTION 'Destinatário de e-mail inválido: %', COALESCE(v_email, '[nulo]')
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NEW.enviado_em IS NOT NULL THEN
    IF cardinality(COALESCE(NEW.destinatarios, '{}'::text[])) = 0
      OR btrim(COALESCE(NEW.assunto, '')) = ''
      OR btrim(COALESCE(NEW.corpo, '')) = ''
      OR NEW.enviado_por IS NULL
      OR btrim(COALESCE(NEW.enviado_por_nome, '')) = ''
    THEN
      RAISE EXCEPTION 'O envio exige destinatário, assunto, corpo e responsável.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.enviado_em IS NOT NULL AND NEW.enviado_em IS NOT NULL THEN
    IF NEW.destinatarios IS DISTINCT FROM OLD.destinatarios
      OR NEW.assunto IS DISTINCT FROM OLD.assunto
      OR NEW.corpo IS DISTINCT FROM OLD.corpo
      OR NEW.enviado_em IS DISTINCT FROM OLD.enviado_em
      OR NEW.enviado_por IS DISTINCT FROM OLD.enviado_por
      OR NEW.enviado_por_nome IS DISTINCT FROM OLD.enviado_por_nome
    THEN
      RAISE EXCEPTION 'Reabra o registro do envio antes de alterar destinatários ou conteúdo.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.enviado_em IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.enviado_em IS NULL)
    AND auth.uid() IS NOT NULL
    AND NEW.enviado_por IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'O responsável pelo envio deve ser o usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piso_notificacoes_email_escopo ON public.piso_notificacoes_email;
CREATE TRIGGER trg_piso_notificacoes_email_escopo
  BEFORE INSERT OR UPDATE
  ON public.piso_notificacoes_email
  FOR EACH ROW EXECUTE FUNCTION public.piso_notificacao_email_validar_escopo();

DROP TRIGGER IF EXISTS trg_piso_notificacoes_email_updated_at ON public.piso_notificacoes_email;
CREATE TRIGGER trg_piso_notificacoes_email_updated_at
  BEFORE UPDATE ON public.piso_notificacoes_email
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Renumera somente o marco de encerramento legado.
-- A trava da competência bloqueia UPDATE em registros já encerrados; ela é
-- suspensa exclusivamente durante esta conversão histórica e reativada logo após.
ALTER TABLE public.piso_competencias DISABLE TRIGGER trg_piso_guarda;

UPDATE public.piso_competencias
SET etapas_concluidas = CASE
      WHEN status = 'encerrada'
        OR COALESCE((COALESCE(etapas_concluidas, '{}'::jsonb)->>'8')::boolean, false)
      THEN jsonb_set(
        jsonb_set(COALESCE(etapas_concluidas, '{}'::jsonb), '{8}', 'true'::jsonb, true),
        '{9}',
        'true'::jsonb,
        true
      )
      ELSE COALESCE(etapas_concluidas, '{}'::jsonb) - '9'
    END,
    etapas_reconferir = ARRAY(
      SELECT DISTINCT mapped
      FROM (
        SELECT CASE WHEN etapa = 8 THEN 9 ELSE etapa END AS mapped
        FROM unnest(COALESCE(piso_competencias.etapas_reconferir, '{}'::int[])) AS etapa
      ) renumeradas
      ORDER BY mapped
    );

ALTER TABLE public.piso_competencias ENABLE TRIGGER trg_piso_guarda;

CREATE OR REPLACE FUNCTION public.piso_audit_notificacao_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  part uuid;
  prest uuid;
  inst text;
  old_j jsonb;
  new_j jsonb;
  diffs jsonb := '{}'::jsonb;
  k text;
BEGIN
  old_j := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_j := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  part := COALESCE(
    NULLIF(new_j->>'participante_id', '')::uuid,
    NULLIF(old_j->>'participante_id', '')::uuid
  );

  SELECT p.competencia_id, p.prestador_id
    INTO comp, prest
    FROM public.piso_participantes p
    WHERE p.id = part;

  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  SELECT nome_instituicao INTO inst FROM public.prestadores WHERE id = prest;

  IF comp IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs
      (piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (
      comp,
      uid,
      uname,
      'Piso · criado: piso_notificacoes_email',
      jsonb_strip_nulls(
        jsonb_build_object(
          'participante_id', part,
          'prestador_id', prest,
          'instituicao_nome', inst,
          'destinatarios', new_j->'destinatarios',
          'assunto', new_j->'assunto',
          'enviado_em', new_j->'enviado_em',
          'enviado_por_nome', new_j->'enviado_por_nome',
          'processo_sei_numero', new_j->'processo_sei_numero',
          'processo_sei_link', new_j->'processo_sei_link'
        )
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_logs
      (piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (
      comp,
      uid,
      uname,
      'Piso · removido: piso_notificacoes_email',
      jsonb_build_object(
        'participante_id', part,
        'prestador_id', prest,
        'instituicao_nome', inst
      )
    );
  ELSE
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k = ANY(ARRAY['id','competencia_id','participante_id','created_at','updated_at','enviado_por']) THEN
        CONTINUE;
      END IF;
      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(
          k,
          jsonb_build_object('de', old_j->k, 'para', new_j->k)
        );
      END IF;
    END LOOP;

    IF diffs <> '{}'::jsonb THEN
      INSERT INTO public.historico_logs
        (piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (
        comp,
        uid,
        uname,
        'Piso · atualizado: piso_notificacoes_email',
        jsonb_build_object(
          'participante_id', part,
          'prestador_id', prest,
          'instituicao_nome', inst
        ) || diffs
      );
    END IF;
  END IF;

  PERFORM public.piso_marcar_reconferencia(comp, 8);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_audit_notificacao_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_notificacoes_email_audit ON public.piso_notificacoes_email;
CREATE TRIGGER trg_piso_notificacoes_email_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.piso_notificacoes_email
  FOR EACH ROW EXECUTE FUNCTION public.piso_audit_notificacao_email();
