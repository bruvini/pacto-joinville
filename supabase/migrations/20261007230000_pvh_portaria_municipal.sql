-- PVH — Etapa 2: domínio documental da Portaria Municipal
-- Estrutura aditiva para documentos, assinaturas por papel/função,
-- conciliação Estado × Município e conclusão server-side da etapa.

CREATE TABLE IF NOT EXISTS public.pvh_documento_tipos (
  codigo text PRIMARY KEY,
  etapa smallint NOT NULL,
  titulo text NOT NULL,
  descricao text,
  ordem smallint NOT NULL DEFAULT 0,
  exige_numero boolean NOT NULL DEFAULT false,
  exige_numero_sei boolean NOT NULL DEFAULT false,
  exige_link boolean NOT NULL DEFAULT true,
  exige_data boolean NOT NULL DEFAULT false,
  exige_assinatura boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pvh_documento_tipos_etapa_check CHECK (etapa BETWEEN 1 AND 8)
);

INSERT INTO public.pvh_documento_tipos (
  codigo, etapa, titulo, descricao, ordem,
  exige_numero, exige_numero_sei, exige_link, exige_data, exige_assinatura, ativo
)
VALUES
  (
    'minuta_portaria_municipal',
    2,
    'Minuta da Portaria Municipal',
    'Minuta preparada para formalizar o repasse municipal da competência.',
    10,
    false, true, true, false, true, true
  ),
  (
    'memorando_portaria_municipal',
    2,
    'Memorando de encaminhamento',
    'Memorando que encaminha a minuta para o fluxo institucional de assinatura/publicação.',
    20,
    false, true, true, false, true, true
  ),
  (
    'portaria_municipal_publicada',
    2,
    'Portaria Municipal publicada',
    'Ato municipal final publicado para a competência.',
    30,
    true, false, true, true, false, true
  )
ON CONFLICT (codigo) DO UPDATE
SET etapa = EXCLUDED.etapa,
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    ordem = EXCLUDED.ordem,
    exige_numero = EXCLUDED.exige_numero,
    exige_numero_sei = EXCLUDED.exige_numero_sei,
    exige_link = EXCLUDED.exige_link,
    exige_data = EXCLUDED.exige_data,
    exige_assinatura = EXCLUDED.exige_assinatura,
    ativo = EXCLUDED.ativo;

CREATE TABLE IF NOT EXISTS public.pvh_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL
    REFERENCES public.pvh_competencias(id) ON DELETE CASCADE,
  participante_id uuid
    REFERENCES public.pvh_participantes(id) ON DELETE SET NULL,
  tipo_codigo text NOT NULL
    REFERENCES public.pvh_documento_tipos(codigo) ON DELETE RESTRICT,

  numero text,
  numero_sei text,
  link_documento text,
  data_documento date,

  normativa_referenciada_id uuid
    REFERENCES public.pvh_normativas(id) ON DELETE SET NULL,
  referencia_normativa_texto text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_nome text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_documentos_comp_tipo_global
  ON public.pvh_documentos (competencia_id, tipo_codigo)
  WHERE participante_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_documentos_comp_part_tipo
  ON public.pvh_documentos (competencia_id, participante_id, tipo_codigo)
  WHERE participante_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pvh_documentos_competencia
  ON public.pvh_documentos (competencia_id, tipo_codigo);

CREATE TABLE IF NOT EXISTS public.pvh_documento_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL
    REFERENCES public.pvh_documentos(id) ON DELETE RESTRICT,

  papel_funcao text NOT NULL,
  assinante_nome text NOT NULL,
  assinado_em timestamptz NOT NULL DEFAULT now(),

  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_por_nome text,

  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_por_nome text,
  motivo_revogacao text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_documento_assinaturas_papel_check
    CHECK (length(btrim(papel_funcao)) > 0),
  CONSTRAINT pvh_documento_assinaturas_nome_check
    CHECK (length(btrim(assinante_nome)) > 0),
  CONSTRAINT pvh_documento_assinaturas_revogacao_check
    CHECK (
      revogado_em IS NULL
      OR (motivo_revogacao IS NOT NULL AND length(btrim(motivo_revogacao)) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_assinatura_ativa_documento_papel_nome
  ON public.pvh_documento_assinaturas (
    documento_id,
    lower(btrim(papel_funcao)),
    lower(btrim(assinante_nome))
  )
  WHERE revogado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_pvh_assinaturas_documento
  ON public.pvh_documento_assinaturas (documento_id, assinado_em DESC);

-- Um documento vinculado a participante jamais pode apontar para participante
-- de outra competência.
CREATE OR REPLACE FUNCTION public.pvh_validar_documento_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_competencia_participante uuid;
BEGIN
  IF NEW.participante_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT competencia_id
    INTO v_competencia_participante
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id;

  IF v_competencia_participante IS NULL THEN
    RAISE EXCEPTION 'Participante PVH não encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_competencia_participante <> NEW.competencia_id THEN
    RAISE EXCEPTION
      'O documento e o participante devem pertencer à mesma competência PVH.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_validar_documento_participante()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_validar_documento_participante
  ON public.pvh_documentos;
CREATE TRIGGER trg_pvh_validar_documento_participante
  BEFORE INSERT OR UPDATE OF competencia_id, participante_id
  ON public.pvh_documentos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_validar_documento_participante();

DROP TRIGGER IF EXISTS trg_pvh_documentos_updated_at
  ON public.pvh_documentos;
CREATE TRIGGER trg_pvh_documentos_updated_at
  BEFORE UPDATE ON public.pvh_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_documento_assinaturas_updated_at
  ON public.pvh_documento_assinaturas;
CREATE TRIGGER trg_pvh_documento_assinaturas_updated_at
  BEFORE UPDATE ON public.pvh_documento_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auditoria documental vinculada à competência do PVH.
CREATE OR REPLACE FUNCTION public.pvh_audit_documental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  documento uuid;
  row_json jsonb;
  old_json jsonb;
BEGIN
  SELECT nome INTO uname
    FROM public.profiles
   WHERE id = uid;

  IF TG_OP = 'DELETE' THEN
    row_json := NULL;
    old_json := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    row_json := to_jsonb(NEW);
    old_json := NULL;
  ELSE
    row_json := to_jsonb(NEW);
    old_json := to_jsonb(OLD);
  END IF;

  IF TG_TABLE_NAME = 'pvh_documentos' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
  ELSIF TG_TABLE_NAME = 'pvh_documento_assinaturas' THEN
    documento := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    SELECT competencia_id
      INTO comp
      FROM public.pvh_documentos
     WHERE id = documento;
  END IF;

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    comp,
    uid,
    uname,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(
      jsonb_build_object(
        'antes', old_json,
        'depois', row_json
      )
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_documental()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_documentos_audit
  ON public.pvh_documentos;
CREATE TRIGGER trg_pvh_documentos_audit
  AFTER INSERT OR UPDATE ON public.pvh_documentos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_documental();

DROP TRIGGER IF EXISTS trg_pvh_documentos_audit_delete
  ON public.pvh_documentos;
CREATE TRIGGER trg_pvh_documentos_audit_delete
  BEFORE DELETE ON public.pvh_documentos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_documental();

DROP TRIGGER IF EXISTS trg_pvh_documento_assinaturas_audit
  ON public.pvh_documento_assinaturas;
CREATE TRIGGER trg_pvh_documento_assinaturas_audit
  AFTER INSERT OR UPDATE ON public.pvh_documento_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_documental();

DROP TRIGGER IF EXISTS trg_pvh_documento_assinaturas_audit_delete
  ON public.pvh_documento_assinaturas;
CREATE TRIGGER trg_pvh_documento_assinaturas_audit_delete
  BEFORE DELETE ON public.pvh_documento_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_documental();

-- Se a Etapa 2 já estava concluída, qualquer alteração material em seus dados
-- reabre a necessidade de conferência da Etapa 2 e das posteriores.
CREATE OR REPLACE FUNCTION public.pvh_reconferir_etapa2_por_comp(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.pvh_competencias
     WHERE id = p_comp
       AND COALESCE((etapas_concluidas ->> '2')::boolean, false) = true
  ) THEN
    PERFORM public.pvh_marcar_reconferencia(p_comp, 2);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_etapa2_por_comp(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pvh_reconferir_documento_etapa2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp uuid;
  v_doc uuid;
  v_tipo text;
BEGIN
  IF TG_TABLE_NAME = 'pvh_documentos' THEN
    v_comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
    v_tipo := CASE WHEN TG_OP = 'DELETE' THEN OLD.tipo_codigo ELSE NEW.tipo_codigo END;
  ELSE
    v_doc := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    SELECT d.competencia_id, d.tipo_codigo
      INTO v_comp, v_tipo
      FROM public.pvh_documentos d
     WHERE d.id = v_doc;
  END IF;

  IF v_tipo IN (
    'minuta_portaria_municipal',
    'memorando_portaria_municipal',
    'portaria_municipal_publicada'
  ) THEN
    PERFORM public.pvh_reconferir_etapa2_por_comp(v_comp);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_documento_etapa2()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_documentos_reconferir_etapa2
  ON public.pvh_documentos;
CREATE TRIGGER trg_pvh_documentos_reconferir_etapa2
  AFTER INSERT OR UPDATE OR DELETE ON public.pvh_documentos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_documento_etapa2();

DROP TRIGGER IF EXISTS trg_pvh_assinaturas_reconferir_etapa2
  ON public.pvh_documento_assinaturas;
CREATE TRIGGER trg_pvh_assinaturas_reconferir_etapa2
  AFTER INSERT OR UPDATE OR DELETE ON public.pvh_documento_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_documento_etapa2();

CREATE OR REPLACE FUNCTION public.pvh_reconferir_valor_municipal_etapa2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.valor_municipal IS DISTINCT FROM OLD.valor_municipal THEN
    PERFORM public.pvh_reconferir_etapa2_por_comp(NEW.competencia_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_valor_municipal_etapa2()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_participantes_reconferir_etapa2
  ON public.pvh_participantes;
CREATE TRIGGER trg_pvh_participantes_reconferir_etapa2
  AFTER UPDATE OF valor_municipal ON public.pvh_participantes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_valor_municipal_etapa2();

CREATE OR REPLACE FUNCTION public.pvh_reconferir_competencia_etapa2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF
    NEW.minuta_municipal_numero IS DISTINCT FROM OLD.minuta_municipal_numero OR
    NEW.minuta_municipal_link IS DISTINCT FROM OLD.minuta_municipal_link OR
    NEW.memorando_municipal_numero IS DISTINCT FROM OLD.memorando_municipal_numero OR
    NEW.memorando_municipal_link IS DISTINCT FROM OLD.memorando_municipal_link OR
    NEW.portaria_municipal_numero IS DISTINCT FROM OLD.portaria_municipal_numero OR
    NEW.portaria_municipal_data IS DISTINCT FROM OLD.portaria_municipal_data OR
    NEW.portaria_municipal_link IS DISTINCT FROM OLD.portaria_municipal_link OR
    NEW.justificativa_divergencia IS DISTINCT FROM OLD.justificativa_divergencia
  THEN
    PERFORM public.pvh_reconferir_etapa2_por_comp(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_competencia_etapa2()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_competencias_reconferir_etapa2
  ON public.pvh_competencias;
CREATE TRIGGER trg_pvh_competencias_reconferir_etapa2
  AFTER UPDATE OF
    minuta_municipal_numero,
    minuta_municipal_link,
    memorando_municipal_numero,
    memorando_municipal_link,
    portaria_municipal_numero,
    portaria_municipal_data,
    portaria_municipal_link,
    justificativa_divergencia
  ON public.pvh_competencias
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_competencia_etapa2();

-- Conclusão da Etapa 2 validada no servidor. Não depende apenas do botão/UI.
CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa2(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_minuta public.pvh_documentos%ROWTYPE;
  v_memorando public.pvh_documentos%ROWTYPE;
  v_portaria public.pvh_documentos%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 2 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.' USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '1')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conclua a Etapa 1 antes da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pvh_participantes WHERE competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui instituições participantes.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
       AND (
         COALESCE(valor_estadual, 0) <= 0
         OR COALESCE(valor_municipal, 0) <= 0
       )
  ) THEN
    RAISE EXCEPTION
      'Todas as instituições precisam ter valor estadual e valor municipal positivos.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_minuta
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'minuta_portaria_municipal'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_minuta.numero_sei), '') IS NULL
     OR NULLIF(btrim(v_minuta.link_documento), '') IS NULL THEN
    RAISE EXCEPTION 'Registre o Nº SEI e o link da Minuta da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas
     WHERE documento_id = v_minuta.id
       AND revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Registre ao menos uma assinatura ativa na Minuta.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_memorando
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'memorando_portaria_municipal'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_memorando.numero_sei), '') IS NULL
     OR NULLIF(btrim(v_memorando.link_documento), '') IS NULL THEN
    RAISE EXCEPTION 'Registre o Nº SEI e o link do Memorando de encaminhamento.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas
     WHERE documento_id = v_memorando.id
       AND revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Registre ao menos uma assinatura ativa no Memorando.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_portaria
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'portaria_municipal_publicada'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_portaria.numero), '') IS NULL
     OR v_portaria.data_documento IS NULL
     OR NULLIF(btrim(v_portaria.link_documento), '') IS NULL THEN
    RAISE EXCEPTION 'Registre número, data e link da Portaria Municipal publicada.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
       AND abs(valor_municipal - valor_estadual) >= 0.01
  )
  AND NULLIF(btrim(v_comp.justificativa_divergencia), '') IS NULL THEN
    RAISE EXCEPTION
      'Há divergência Estado × Município. Registre a justificativa formal antes de concluir.'
      USING ERRCODE = '23514';
  END IF;

  -- Espelha o domínio documental nos campos legados já existentes para preservar
  -- compatibilidade com resumos/consultas anteriores. Os documentos permanecem
  -- como fonte rastreável da evidência.
  UPDATE public.pvh_competencias
     SET minuta_municipal_numero = v_minuta.numero_sei,
         minuta_municipal_link = v_minuta.link_documento,
         memorando_municipal_numero = v_memorando.numero_sei,
         memorando_municipal_link = v_memorando.link_documento,
         portaria_municipal_numero = v_portaria.numero,
         portaria_municipal_data = v_portaria.data_documento,
         portaria_municipal_link = v_portaria.link_documento
   WHERE id = p_comp;

  -- Remove somente a própria reconferência. Marcações posteriores permanecem,
  -- pois uma alteração já concluída pode ter impactado etapas seguintes.
  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{2}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           2
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa2(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa2(uuid)
  TO authenticated, service_role;

-- RLS e privilégios.
ALTER TABLE public.pvh_documento_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_documento_assinaturas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_documento_tipos FROM anon, authenticated;
REVOKE ALL ON public.pvh_documentos FROM anon, authenticated;
REVOKE ALL ON public.pvh_documento_assinaturas FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.pvh_documento_tipos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pvh_documentos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pvh_documento_assinaturas TO authenticated;

GRANT ALL ON public.pvh_documento_tipos TO service_role;
GRANT ALL ON public.pvh_documentos TO service_role;
GRANT ALL ON public.pvh_documento_assinaturas TO service_role;

DROP POLICY IF EXISTS "pvh documento tipos read" ON public.pvh_documento_tipos;
CREATE POLICY "pvh documento tipos read"
  ON public.pvh_documento_tipos FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documento tipos insert" ON public.pvh_documento_tipos;
CREATE POLICY "pvh documento tipos insert"
  ON public.pvh_documento_tipos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documento tipos update" ON public.pvh_documento_tipos;
CREATE POLICY "pvh documento tipos update"
  ON public.pvh_documento_tipos FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documentos read" ON public.pvh_documentos;
CREATE POLICY "pvh documentos read"
  ON public.pvh_documentos FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documentos insert" ON public.pvh_documentos;
CREATE POLICY "pvh documentos insert"
  ON public.pvh_documentos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documentos update" ON public.pvh_documentos;
CREATE POLICY "pvh documentos update"
  ON public.pvh_documentos FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documento assinaturas read" ON public.pvh_documento_assinaturas;
CREATE POLICY "pvh documento assinaturas read"
  ON public.pvh_documento_assinaturas FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documento assinaturas insert" ON public.pvh_documento_assinaturas;
CREATE POLICY "pvh documento assinaturas insert"
  ON public.pvh_documento_assinaturas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh documento assinaturas update" ON public.pvh_documento_assinaturas;
CREATE POLICY "pvh documento assinaturas update"
  ON public.pvh_documento_assinaturas FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp']::public.app_role[]
    )
  );
