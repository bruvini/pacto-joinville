-- ============================================================================
-- MÓDULO DIETA CACON
-- Competência mensal do HMSJ → auditoria do relatório → Memorando SMS → SES.UFI
-- Dados individuais de pacientes NÃO são persistidos; apenas agregados e evidências.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cacon_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL CHECK (competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','concluida')),

  -- Etapa 1 · recebimento
  data_recebimento date,
  hmsj_memorando_numero text,
  hmsj_memorando_link text,
  hmsj_anexo_numero text,
  hmsj_anexo_link text,

  -- Referência normativa usada no Memorando SMS
  portaria_referencia text NOT NULL DEFAULT 'Portaria SES/SC nº 68, de 29/01/2014',
  portaria_sei_numero text NOT NULL DEFAULT '0016111061',
  portaria_sei_link text,

  -- Etapa 2 · resultados derivados exclusivamente do PDF processado no servidor
  total_unidades integer,
  valor_medio_unitario numeric(14,2),
  valor_medio_dia numeric(14,2),
  valor_fornecido numeric(14,2),
  pacientes_oral integer,
  dias_oral integer,
  pacientes_enteral integer,
  dias_enteral integer,
  extracao jsonb NOT NULL DEFAULT '{}'::jsonb,
  auditoria jsonb NOT NULL DEFAULT '{}'::jsonb,
  processado_em timestamptz,

  -- Etapa 3 · Memorando SMS
  sms_memorando_numero text,
  sms_memorando_link text,
  sms_memorando_data date,
  encaminhado_ses_ufi_em timestamptz,
  encaminhado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  encaminhado_por_nome text,

  relatorio_gerado_em timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cacon_competencia_prestador_unico UNIQUE (competencia, prestador_id)
);

CREATE TABLE IF NOT EXISTS public.cacon_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.cacon_competencias(id) ON DELETE CASCADE,
  categoria text NOT NULL DEFAULT 'relatorio_cacon' CHECK (categoria IN ('relatorio_cacon')),
  nome_original text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  tamanho bigint,
  sha256 text NOT NULL,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_por_nome text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cacon_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.cacon_competencias(id) ON DELETE CASCADE,
  slot text NOT NULL DEFAULT 'fiscal' CHECK (slot = 'fiscal'),
  servidor_nome text NOT NULL,
  cargo text NOT NULL DEFAULT 'Fiscal',
  assinado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cacon_assinatura_unica UNIQUE (competencia_id, slot, servidor_nome)
);

CREATE TABLE IF NOT EXISTS public.cacon_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.cacon_competencias(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome text,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cacon_comp_status
  ON public.cacon_competencias(status, competencia);
CREATE INDEX IF NOT EXISTS idx_cacon_comp_prestador
  ON public.cacon_competencias(prestador_id);
CREATE INDEX IF NOT EXISTS idx_cacon_arq_comp
  ON public.cacon_arquivos(competencia_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cacon_logs_comp
  ON public.cacon_logs(competencia_id, ocorrido_em DESC);

-- Atualização automática da trilha temporal.
CREATE OR REPLACE FUNCTION public.cacon_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cacon_touch_updated_at ON public.cacon_competencias;
CREATE TRIGGER trg_cacon_touch_updated_at
BEFORE UPDATE ON public.cacon_competencias
FOR EACH ROW EXECUTE FUNCTION public.cacon_touch_updated_at();

-- Resultados de análise do PDF não podem ser escolhidos pelo navegador.
CREATE OR REPLACE FUNCTION public.cacon_bloquear_resultados_derivados()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  papel text := COALESCE(auth.role(), '');
  manutencao boolean := current_user IN ('postgres', 'supabase_admin');
BEGIN
  IF manutencao OR papel = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.total_unidades IS NOT NULL
       OR NEW.valor_medio_unitario IS NOT NULL
       OR NEW.valor_medio_dia IS NOT NULL
       OR NEW.valor_fornecido IS NOT NULL
       OR NEW.pacientes_oral IS NOT NULL
       OR NEW.dias_oral IS NOT NULL
       OR NEW.pacientes_enteral IS NOT NULL
       OR NEW.dias_enteral IS NOT NULL
       OR COALESCE(NEW.extracao, '{}'::jsonb) <> '{}'::jsonb
       OR COALESCE(NEW.auditoria, '{}'::jsonb) <> '{}'::jsonb
       OR NEW.processado_em IS NOT NULL
    THEN
      RAISE EXCEPTION 'Resultados CACON derivados do PDF não podem ser definidos pelo cliente.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.total_unidades IS DISTINCT FROM OLD.total_unidades
     OR NEW.valor_medio_unitario IS DISTINCT FROM OLD.valor_medio_unitario
     OR NEW.valor_medio_dia IS DISTINCT FROM OLD.valor_medio_dia
     OR NEW.valor_fornecido IS DISTINCT FROM OLD.valor_fornecido
     OR NEW.pacientes_oral IS DISTINCT FROM OLD.pacientes_oral
     OR NEW.dias_oral IS DISTINCT FROM OLD.dias_oral
     OR NEW.pacientes_enteral IS DISTINCT FROM OLD.pacientes_enteral
     OR NEW.dias_enteral IS DISTINCT FROM OLD.dias_enteral
     OR NEW.extracao IS DISTINCT FROM OLD.extracao
     OR NEW.auditoria IS DISTINCT FROM OLD.auditoria
     OR NEW.processado_em IS DISTINCT FROM OLD.processado_em
  THEN
    RAISE EXCEPTION 'Resultados CACON só podem ser atualizados pelo processamento server-side.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cacon_bloquear_resultados_derivados()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cacon_resultados_derivados ON public.cacon_competencias;
CREATE TRIGGER trg_cacon_resultados_derivados
BEFORE INSERT OR UPDATE ON public.cacon_competencias
FOR EACH ROW EXECUTE FUNCTION public.cacon_bloquear_resultados_derivados();

-- RLS
ALTER TABLE public.cacon_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cacon_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cacon_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cacon_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cacon read competencias" ON public.cacon_competencias;
CREATE POLICY "cacon read competencias" ON public.cacon_competencias
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "cacon insert competencias" ON public.cacon_competencias;
CREATE POLICY "cacon insert competencias" ON public.cacon_competencias
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
  );

DROP POLICY IF EXISTS "cacon update competencias" ON public.cacon_competencias;
CREATE POLICY "cacon update competencias" ON public.cacon_competencias
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "cacon delete competencias" ON public.cacon_competencias;
CREATE POLICY "cacon delete competencias" ON public.cacon_competencias
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "cacon read arquivos" ON public.cacon_arquivos;
CREATE POLICY "cacon read arquivos" ON public.cacon_arquivos
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "cacon insert arquivos" ON public.cacon_arquivos;
CREATE POLICY "cacon insert arquivos" ON public.cacon_arquivos
  FOR INSERT TO authenticated
  WITH CHECK (
    enviado_por = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
  );

DROP POLICY IF EXISTS "cacon update arquivos" ON public.cacon_arquivos;
CREATE POLICY "cacon update arquivos" ON public.cacon_arquivos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "cacon delete arquivos" ON public.cacon_arquivos;
CREATE POLICY "cacon delete arquivos" ON public.cacon_arquivos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "cacon read assinaturas" ON public.cacon_assinaturas;
CREATE POLICY "cacon read assinaturas" ON public.cacon_assinaturas
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "cacon write assinaturas" ON public.cacon_assinaturas;
CREATE POLICY "cacon write assinaturas" ON public.cacon_assinaturas
  FOR INSERT TO authenticated
  WITH CHECK (
    assinado_por = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
  );

DROP POLICY IF EXISTS "cacon delete assinaturas" ON public.cacon_assinaturas;
CREATE POLICY "cacon delete assinaturas" ON public.cacon_assinaturas
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "cacon read logs" ON public.cacon_logs;
CREATE POLICY "cacon read logs" ON public.cacon_logs
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

DROP POLICY IF EXISTS "cacon insert logs" ON public.cacon_logs;
CREATE POLICY "cacon insert logs" ON public.cacon_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[])
  );

-- Storage privado da Dieta CACON.
INSERT INTO storage.buckets (id, name, public)
VALUES ('cacon-arquivos', 'cacon-arquivos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "cacon storage read" ON storage.objects;
CREATE POLICY "cacon storage read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cacon-arquivos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[])
  );

DROP POLICY IF EXISTS "cacon storage insert" ON storage.objects;
CREATE POLICY "cacon storage insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cacon-arquivos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
  );

DROP POLICY IF EXISTS "cacon storage update" ON storage.objects;
CREATE POLICY "cacon storage update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cacon-arquivos'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'cacon-arquivos'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "cacon storage delete" ON storage.objects;
CREATE POLICY "cacon storage delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cacon-arquivos'
    AND public.has_role(auth.uid(), 'admin')
  );
