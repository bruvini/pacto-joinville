-- PVH — fundação do módulo (competências, normativa e configuração por instituição)
-- Fase 1: estrutura-base para rastreabilidade e execução instrucional.
-- As estruturas financeiras N:N (empenhos/alocações/subempenhos/pagamentos)
-- entram em migration própria para manter evolução aditiva e auditável.

CREATE TABLE IF NOT EXISTS public.pvh_normativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'deliberacao',
  numero text,
  data_ato date,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  url_oficial text,
  observacao text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pvh_normativas_vigencia_check
    CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

INSERT INTO public.pvh_normativas (
  codigo,
  titulo,
  tipo,
  numero,
  data_ato,
  vigencia_inicio,
  url_oficial,
  observacao,
  ativa
)
VALUES (
  '416-CIB-2026',
  'Deliberação 416/CIB/2026',
  'deliberacao',
  '416/CIB/2026',
  DATE '2026-06-17',
  DATE '2026-07-01',
  'https://www.saude.sc.gov.br/index.php/pt/legislacao/legislacao-geral/deliberacoes/deliberacoes-2026/416-09-06-pvh-politica-de-valorizacao-hospitalar-13-jul/download',
  'Revisão do PVH com efeitos a partir da competência julho/2026. Revoga a Deliberação 745/CIB/2023.',
  true
)
ON CONFLICT (codigo) DO UPDATE
SET titulo = EXCLUDED.titulo,
    numero = EXCLUDED.numero,
    data_ato = EXCLUDED.data_ato,
    vigencia_inicio = EXCLUDED.vigencia_inicio,
    url_oficial = EXCLUDED.url_oficial,
    observacao = EXCLUDED.observacao,
    ativa = EXCLUDED.ativa;

CREATE TABLE IF NOT EXISTS public.pvh_prestador_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  notificar_email boolean NOT NULL DEFAULT false,
  exige_prestacao_contas boolean NOT NULL DEFAULT false,
  prazo_prestacao_contas_dias integer,
  cr_dotacao text,
  natureza_despesa text,
  fonte_recurso text,
  processo_empenho_sei text,
  processo_subempenho_sei text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pvh_prestador_config_vigencia_check
    CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT pvh_prestador_config_prazo_pc_check
    CHECK (prazo_prestacao_contas_dias IS NULL OR prazo_prestacao_contas_dias > 0),
  UNIQUE (prestador_id, vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS idx_pvh_prestador_config_vigencia
  ON public.pvh_prestador_config (prestador_id, vigencia_inicio DESC);

CREATE TABLE IF NOT EXISTS public.pvh_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'preparacao',
  normativa_id uuid REFERENCES public.pvh_normativas(id) ON DELETE SET NULL,

  portaria_estadual_numero text,
  portaria_estadual_data date,
  portaria_estadual_url text,
  portaria_estadual_sei_numero text,
  portaria_estadual_sei_link text,

  minuta_municipal_numero text,
  minuta_municipal_link text,
  memorando_municipal_numero text,
  memorando_municipal_link text,
  portaria_municipal_numero text,
  portaria_municipal_data date,
  portaria_municipal_link text,
  justificativa_divergencia text,

  recurso_fms_data date,
  recurso_fms_valor numeric(16,2),
  recurso_fms_referencia text,
  recurso_fms_link text,

  etapas_concluidas jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapas_reconferir integer[] NOT NULL DEFAULT '{}'::integer[],
  observacao text,
  encerrada_em timestamptz,
  encerrada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_competencias_competencia_check
    CHECK (competencia ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'),
  CONSTRAINT pvh_competencias_status_check
    CHECK (status IN ('preparacao','ativa','encerrada')),
  CONSTRAINT pvh_competencias_recurso_check
    CHECK (recurso_fms_valor IS NULL OR recurso_fms_valor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pvh_competencias_status
  ON public.pvh_competencias (status, competencia);

CREATE TABLE IF NOT EXISTS public.pvh_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.pvh_competencias(id) ON DELETE CASCADE,
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,

  valor_estadual numeric(16,2),
  valor_municipal numeric(16,2),
  valor_pago numeric(16,2) NOT NULL DEFAULT 0,

  config_origem_id uuid REFERENCES public.pvh_prestador_config(id) ON DELETE SET NULL,
  notificar_email boolean NOT NULL DEFAULT false,
  exige_prestacao_contas boolean NOT NULL DEFAULT false,
  prazo_prestacao_contas_dias integer,
  cr_dotacao text,
  natureza_despesa text,
  fonte_recurso text,
  processo_empenho_sei text,
  processo_subempenho_sei text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_participantes_valores_check CHECK (
    (valor_estadual IS NULL OR valor_estadual >= 0)
    AND (valor_municipal IS NULL OR valor_municipal >= 0)
    AND valor_pago >= 0
  ),
  UNIQUE (competencia_id, prestador_id)
);

CREATE INDEX IF NOT EXISTS idx_pvh_participantes_competencia
  ON public.pvh_participantes (competencia_id, prestador_id);

-- Snapshot da configuração válida na competência.
CREATE OR REPLACE FUNCTION public.pvh_snapshot_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_comp text;
  v_ref date;
  v_cfg public.pvh_prestador_config%ROWTYPE;
BEGIN
  SELECT competencia INTO v_comp
  FROM public.pvh_competencias
  WHERE id = NEW.competencia_id;

  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.' USING ERRCODE = '23503';
  END IF;

  v_ref := to_date('01/' || v_comp, 'DD/MM/YYYY');

  SELECT *
    INTO v_cfg
    FROM public.pvh_prestador_config
   WHERE prestador_id = NEW.prestador_id
     AND ativo = true
     AND vigencia_inicio <= v_ref
     AND (vigencia_fim IS NULL OR vigencia_fim >= v_ref)
   ORDER BY vigencia_inicio DESC, created_at DESC
   LIMIT 1;

  IF FOUND THEN
    NEW.config_origem_id := v_cfg.id;
    NEW.notificar_email := v_cfg.notificar_email;
    NEW.exige_prestacao_contas := v_cfg.exige_prestacao_contas;
    NEW.prazo_prestacao_contas_dias := v_cfg.prazo_prestacao_contas_dias;
    NEW.cr_dotacao := v_cfg.cr_dotacao;
    NEW.natureza_despesa := v_cfg.natureza_despesa;
    NEW.fonte_recurso := v_cfg.fonte_recurso;
    NEW.processo_empenho_sei := v_cfg.processo_empenho_sei;
    NEW.processo_subempenho_sei := v_cfg.processo_subempenho_sei;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_snapshot_participante() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_snapshot_participante ON public.pvh_participantes;
CREATE TRIGGER trg_pvh_snapshot_participante
  BEFORE INSERT ON public.pvh_participantes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_snapshot_participante();

DROP TRIGGER IF EXISTS trg_pvh_prestador_config_updated_at ON public.pvh_prestador_config;
CREATE TRIGGER trg_pvh_prestador_config_updated_at
  BEFORE UPDATE ON public.pvh_prestador_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_competencias_updated_at ON public.pvh_competencias;
CREATE TRIGGER trg_pvh_competencias_updated_at
  BEFORE UPDATE ON public.pvh_competencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_participantes_updated_at ON public.pvh_participantes;
CREATE TRIGGER trg_pvh_participantes_updated_at
  BEFORE UPDATE ON public.pvh_participantes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.historico_logs
  ADD COLUMN IF NOT EXISTS pvh_competencia_id uuid
    REFERENCES public.pvh_competencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_historico_logs_pvh
  ON public.historico_logs (pvh_competencia_id, data_hora DESC);

-- Auditoria inicial da competência e dos participantes.
CREATE OR REPLACE FUNCTION public.pvh_audit_basico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  acao_text text;
  detalhes_json jsonb;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;

  IF TG_TABLE_NAME = 'pvh_competencias' THEN
    comp := COALESCE(NEW.id, OLD.id);
  ELSE
    comp := COALESCE(NEW.competencia_id, OLD.competencia_id);
  END IF;

  acao_text := 'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME;
  detalhes_json := jsonb_strip_nulls(
    jsonb_build_object(
      'antes', CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
      'depois', CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES
    (comp, uid, uname, acao_text, detalhes_json);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_basico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_competencias_audit ON public.pvh_competencias;
DROP TRIGGER IF EXISTS trg_pvh_competencias_audit_delete ON public.pvh_competencias;
CREATE TRIGGER trg_pvh_competencias_audit
  AFTER INSERT OR UPDATE ON public.pvh_competencias
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_basico();
CREATE TRIGGER trg_pvh_competencias_audit_delete
  BEFORE DELETE ON public.pvh_competencias
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_basico();

DROP TRIGGER IF EXISTS trg_pvh_participantes_audit ON public.pvh_participantes;
DROP TRIGGER IF EXISTS trg_pvh_participantes_audit_delete ON public.pvh_participantes;
CREATE TRIGGER trg_pvh_participantes_audit
  AFTER INSERT OR UPDATE ON public.pvh_participantes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_basico();
CREATE TRIGGER trg_pvh_participantes_audit_delete
  BEFORE DELETE ON public.pvh_participantes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_basico();

-- RLS
ALTER TABLE public.pvh_normativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_prestador_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_participantes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_normativas FROM anon, authenticated;
REVOKE ALL ON public.pvh_prestador_config FROM anon, authenticated;
REVOKE ALL ON public.pvh_competencias FROM anon, authenticated;
REVOKE ALL ON public.pvh_participantes FROM anon, authenticated;

GRANT SELECT ON public.pvh_normativas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pvh_prestador_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_competencias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_participantes TO authenticated;

GRANT ALL ON public.pvh_normativas TO service_role;
GRANT ALL ON public.pvh_prestador_config TO service_role;
GRANT ALL ON public.pvh_competencias TO service_role;
GRANT ALL ON public.pvh_participantes TO service_role;

DROP POLICY IF EXISTS "pvh normativas read" ON public.pvh_normativas;
CREATE POLICY "pvh normativas read"
  ON public.pvh_normativas FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh config read" ON public.pvh_prestador_config;
CREATE POLICY "pvh config read"
  ON public.pvh_prestador_config FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh config insert" ON public.pvh_prestador_config;
CREATE POLICY "pvh config insert"
  ON public.pvh_prestador_config FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "pvh config update" ON public.pvh_prestador_config;
CREATE POLICY "pvh config update"
  ON public.pvh_prestador_config FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "pvh competencias read" ON public.pvh_competencias;
CREATE POLICY "pvh competencias read"
  ON public.pvh_competencias FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh competencias insert" ON public.pvh_competencias;
CREATE POLICY "pvh competencias insert"
  ON public.pvh_competencias FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "pvh competencias update" ON public.pvh_competencias;
CREATE POLICY "pvh competencias update"
  ON public.pvh_competencias FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh competencias delete" ON public.pvh_competencias;
CREATE POLICY "pvh competencias delete"
  ON public.pvh_competencias FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin']::app_role[]));

DROP POLICY IF EXISTS "pvh participantes read" ON public.pvh_participantes;
CREATE POLICY "pvh participantes read"
  ON public.pvh_participantes FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh participantes insert" ON public.pvh_participantes;
CREATE POLICY "pvh participantes insert"
  ON public.pvh_participantes FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "pvh participantes update" ON public.pvh_participantes;
CREATE POLICY "pvh participantes update"
  ON public.pvh_participantes FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "pvh participantes delete" ON public.pvh_participantes;
CREATE POLICY "pvh participantes delete"
  ON public.pvh_participantes FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));
