-- PVH — configuração operacional e domínio financeiro N:N
-- Ajustes: bases normativas gerenciáveis, processos SEI anuais versionados,
-- empenhos reutilizáveis por múltiplas competências, alocações e subempenhos.

-- Referência histórica anterior à Deliberação 416/CIB/2026.
INSERT INTO public.pvh_normativas (
  codigo, titulo, tipo, numero, data_ato, vigencia_inicio, vigencia_fim,
  url_oficial, observacao, ativa
)
VALUES (
  '745-CIB-2023',
  'Deliberação 745/CIB/2023',
  'deliberacao',
  '745/CIB/2023',
  NULL,
  DATE '2024-01-01',
  DATE '2026-06-30',
  NULL,
  'Regra histórica do PVH aplicada às competências anteriores à revisão com efeitos financeiros em julho/2026.',
  true
)
ON CONFLICT (codigo) DO NOTHING;

-- Administradores/ACP podem manter a base normativa pelo próprio módulo.
GRANT INSERT, UPDATE ON public.pvh_normativas TO authenticated;

DROP POLICY IF EXISTS "pvh normativas insert" ON public.pvh_normativas;
CREATE POLICY "pvh normativas insert"
  ON public.pvh_normativas FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

DROP POLICY IF EXISTS "pvh normativas update" ON public.pvh_normativas;
CREATE POLICY "pvh normativas update"
  ON public.pvh_normativas FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

-- A configuração da instituição guarda apenas regras institucionais.
-- Classificação orçamentária e processos anuais deixaram de ser snapshot da competência.
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

    -- Campos legados são deliberadamente limpos: não são regras fixas do prestador.
    NEW.cr_dotacao := NULL;
    NEW.natureza_despesa := NULL;
    NEW.fonte_recurso := NULL;
    NEW.processo_empenho_sei := NULL;
    NEW.processo_subempenho_sei := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_snapshot_participante()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.pvh_processos_anuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  tipo text NOT NULL,
  numero_sei text NOT NULL,
  link_sei text,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pvh_processos_anuais_ano_check CHECK (ano BETWEEN 2024 AND 2100),
  CONSTRAINT pvh_processos_anuais_tipo_check CHECK (
    tipo IN ('empenho','liquidacao_pagamento','aplicacao_recursos','comunicacao','outro')
  ),
  UNIQUE (prestador_id, ano, tipo, numero_sei)
);

CREATE INDEX IF NOT EXISTS idx_pvh_processos_anuais_prestador
  ON public.pvh_processos_anuais (prestador_id, ano DESC, tipo);

CREATE TABLE IF NOT EXISTS public.pvh_empenhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
  processo_anual_id uuid REFERENCES public.pvh_processos_anuais(id) ON DELETE SET NULL,
  ano integer NOT NULL,
  numero_ne text NOT NULL,

  solicitacao_sei_numero text,
  solicitacao_sei_link text,
  solicitacao_data date,

  nota_empenho_sei_numero text,
  nota_empenho_sei_link text,
  data_emissao date,

  valor_total numeric(16,2) NOT NULL,
  cr_dotacao text,
  natureza_despesa text,
  fonte_recurso text,
  observacao text,
  status text NOT NULL DEFAULT 'ativo',

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_empenhos_ano_check CHECK (ano BETWEEN 2024 AND 2100),
  CONSTRAINT pvh_empenhos_valor_check CHECK (valor_total > 0),
  CONSTRAINT pvh_empenhos_status_check CHECK (status IN ('ativo','cancelado')),
  UNIQUE (prestador_id, ano, numero_ne)
);

CREATE INDEX IF NOT EXISTS idx_pvh_empenhos_prestador
  ON public.pvh_empenhos (prestador_id, ano DESC, numero_ne);

CREATE TABLE IF NOT EXISTS public.pvh_empenho_alocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empenho_id uuid NOT NULL REFERENCES public.pvh_empenhos(id) ON DELETE RESTRICT,
  participante_id uuid NOT NULL REFERENCES public.pvh_participantes(id) ON DELETE CASCADE,
  valor_alocado numeric(16,2) NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_empenho_alocacoes_valor_check CHECK (valor_alocado > 0),
  UNIQUE (empenho_id, participante_id)
);

CREATE INDEX IF NOT EXISTS idx_pvh_alocacoes_participante
  ON public.pvh_empenho_alocacoes (participante_id, empenho_id);

CREATE TABLE IF NOT EXISTS public.pvh_subempenhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alocacao_id uuid NOT NULL REFERENCES public.pvh_empenho_alocacoes(id) ON DELETE RESTRICT,
  processo_anual_id uuid REFERENCES public.pvh_processos_anuais(id) ON DELETE SET NULL,
  valor numeric(16,2) NOT NULL,

  solicitacao_sei_numero text,
  solicitacao_sei_link text,
  solicitacao_data date,

  movimento_liquidacao_sei_numero text,
  movimento_liquidacao_sei_link text,
  movimento_liquidacao_data date,

  movimento_subempenho_sei_numero text,
  movimento_subempenho_sei_link text,
  movimento_subempenho_data date,
  numero_subempenho text,

  programacao_pagamento_sei_numero text,
  programacao_pagamento_sei_link text,
  programacao_pagamento_data date,

  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pvh_subempenhos_valor_check CHECK (valor > 0)
);

CREATE INDEX IF NOT EXISTS idx_pvh_subempenhos_alocacao
  ON public.pvh_subempenhos (alocacao_id, created_at);

-- Classificação orçamentária pertence à NE. Não é regra fixa da instituição.
COMMENT ON COLUMN public.pvh_empenhos.cr_dotacao IS
  'CR/dotação observada na própria Nota de Empenho; pode mudar entre empenhos.';
COMMENT ON COLUMN public.pvh_empenhos.natureza_despesa IS
  'Natureza da despesa da própria Nota de Empenho; não é configuração fixa do prestador.';
COMMENT ON COLUMN public.pvh_empenhos.fonte_recurso IS
  'Fonte da própria Nota de Empenho; pode variar ao longo do exercício.';

-- Impede alocação para prestador diferente e utilização acima do valor total da NE.
CREATE OR REPLACE FUNCTION public.pvh_validar_alocacao_empenho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_prestador_empenho uuid;
  v_prestador_participante uuid;
  v_valor_empenho numeric(16,2);
  v_ja_alocado numeric(16,2);
BEGIN
  SELECT prestador_id, valor_total
    INTO v_prestador_empenho, v_valor_empenho
    FROM public.pvh_empenhos
   WHERE id = NEW.empenho_id
   FOR UPDATE;

  SELECT prestador_id
    INTO v_prestador_participante
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id;

  IF v_prestador_empenho IS NULL OR v_prestador_participante IS NULL THEN
    RAISE EXCEPTION 'Empenho ou participante PVH não encontrado.';
  END IF;

  IF v_prestador_empenho <> v_prestador_participante THEN
    RAISE EXCEPTION 'A Nota de Empenho pertence a outra instituição.';
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_ja_alocado
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = NEW.empenho_id
     AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_ja_alocado + NEW.valor_alocado > v_valor_empenho + 0.009 THEN
    RAISE EXCEPTION 'A alocação excede o saldo disponível da Nota de Empenho.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_validar_alocacao_empenho()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_validar_alocacao_empenho
  ON public.pvh_empenho_alocacoes;
CREATE TRIGGER trg_pvh_validar_alocacao_empenho
  BEFORE INSERT OR UPDATE ON public.pvh_empenho_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_validar_alocacao_empenho();

-- Impede subempenhos acima do valor alocado naquela NE/competência.
CREATE OR REPLACE FUNCTION public.pvh_validar_subempenho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_alocado numeric(16,2);
  v_ja_subempenhado numeric(16,2);
BEGIN
  SELECT valor_alocado
    INTO v_alocado
    FROM public.pvh_empenho_alocacoes
   WHERE id = NEW.alocacao_id
   FOR UPDATE;

  IF v_alocado IS NULL THEN
    RAISE EXCEPTION 'Alocação de empenho não encontrada.';
  END IF;

  SELECT COALESCE(SUM(valor), 0)
    INTO v_ja_subempenhado
    FROM public.pvh_subempenhos
   WHERE alocacao_id = NEW.alocacao_id
     AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_ja_subempenhado + NEW.valor > v_alocado + 0.009 THEN
    RAISE EXCEPTION 'Os subempenhos excedem o valor alocado dessa Nota de Empenho.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_validar_subempenho()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_validar_subempenho ON public.pvh_subempenhos;
CREATE TRIGGER trg_pvh_validar_subempenho
  BEFORE INSERT OR UPDATE ON public.pvh_subempenhos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_validar_subempenho();

-- Reutiliza o updated_at institucional.
DROP TRIGGER IF EXISTS trg_pvh_processos_anuais_updated_at ON public.pvh_processos_anuais;
CREATE TRIGGER trg_pvh_processos_anuais_updated_at
  BEFORE UPDATE ON public.pvh_processos_anuais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_empenhos_updated_at ON public.pvh_empenhos;
CREATE TRIGGER trg_pvh_empenhos_updated_at
  BEFORE UPDATE ON public.pvh_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_alocacoes_updated_at ON public.pvh_empenho_alocacoes;
CREATE TRIGGER trg_pvh_alocacoes_updated_at
  BEFORE UPDATE ON public.pvh_empenho_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pvh_subempenhos_updated_at ON public.pvh_subempenhos;
CREATE TRIGGER trg_pvh_subempenhos_updated_at
  BEFORE UPDATE ON public.pvh_subempenhos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auditoria financeira. Empenhos/processos anuais podem abranger várias competências;
-- nesses casos o evento fica sem competência. Alocações/subempenhos herdam a competência.
CREATE OR REPLACE FUNCTION public.pvh_audit_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  row_json jsonb;
  old_json jsonb;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  row_json := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  old_json := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  IF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_participantes pp
     WHERE pp.id = COALESCE(NEW.participante_id, OLD.participante_id);
  ELSIF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_empenho_alocacoes pa
      JOIN public.pvh_participantes pp ON pp.id = pa.participante_id
     WHERE pa.id = COALESCE(NEW.alocacao_id, OLD.alocacao_id);
  ELSE
    comp := NULL;
  END IF;

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    comp,
    uid,
    uname,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(jsonb_build_object('antes', old_json, 'depois', row_json))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_financeiro()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pvh_processos_anuais',
    'pvh_empenhos',
    'pvh_empenho_alocacoes',
    'pvh_subempenhos'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_audit', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_audit_delete', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_financeiro()',
      'trg_' || t || '_audit', t
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_financeiro()',
      'trg_' || t || '_audit_delete', t
    );
  END LOOP;
END $$;

-- Alterações em dados financeiros já concluídos exigem reconferência da etapa
-- afetada e das etapas posteriores.
CREATE OR REPLACE FUNCTION public.pvh_marcar_reconferencia(
  p_comp uuid,
  p_etapa integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_etapa < 1 OR p_etapa > 8 THEN
    RAISE EXCEPTION 'Etapa PVH inválida.';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_reconferir = (
       SELECT ARRAY(
         SELECT DISTINCT n
           FROM unnest(COALESCE(etapas_reconferir, '{}'::integer[])) AS n
         UNION
         SELECT generate_series(p_etapa, 8)
         ORDER BY 1
       )
     )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_marcar_reconferencia(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_marcar_reconferencia(uuid, integer)
  TO authenticated, service_role;

-- RLS
ALTER TABLE public.pvh_processos_anuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_empenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_empenho_alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_subempenhos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_processos_anuais FROM anon, authenticated;
REVOKE ALL ON public.pvh_empenhos FROM anon, authenticated;
REVOKE ALL ON public.pvh_empenho_alocacoes FROM anon, authenticated;
REVOKE ALL ON public.pvh_subempenhos FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_processos_anuais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_empenhos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_empenho_alocacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvh_subempenhos TO authenticated;

GRANT ALL ON public.pvh_processos_anuais TO service_role;
GRANT ALL ON public.pvh_empenhos TO service_role;
GRANT ALL ON public.pvh_empenho_alocacoes TO service_role;
GRANT ALL ON public.pvh_subempenhos TO service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pvh_processos_anuais',
    'pvh_empenhos',
    'pvh_empenho_alocacoes',
    'pvh_subempenhos'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pvh %s read" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "pvh %s read" ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS "pvh %s insert" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "pvh %s insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS "pvh %s update" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "pvh %s update" ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS "pvh %s delete" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "pvh %s delete" ON public.%I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'']::app_role[]))',
      t, t
    );
  END LOOP;
END $$;
