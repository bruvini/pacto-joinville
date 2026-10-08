-- PVH — Etapa 2 com FMS obrigatório + fluxo ACO -> assinaturas -> SEFAZ da Etapa 3
--
-- Esta migration também repara instalações em que a UI da Etapa 3 já foi
-- publicada, mas a evolução 20261008090000 ainda não chegou ao banco.
-- Todos os ADD COLUMN/TABLE relevantes são idempotentes.

-- ============================================================================
-- 1. Estrutura da Solicitação de Nota de Empenho
-- ============================================================================

ALTER TABLE public.pvh_empenhos
  ALTER COLUMN numero_ne DROP NOT NULL,
  ALTER COLUMN valor_total DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'solicitada';

ALTER TABLE public.pvh_empenhos
  DROP CONSTRAINT IF EXISTS pvh_empenhos_valor_check,
  DROP CONSTRAINT IF EXISTS pvh_empenhos_status_check;

ALTER TABLE public.pvh_empenhos
  ADD CONSTRAINT pvh_empenhos_valor_check
    CHECK (valor_total IS NULL OR valor_total > 0),
  ADD CONSTRAINT pvh_empenhos_status_check
    CHECK (status IN ('solicitada','ativo','cancelado'));

ALTER TABLE public.pvh_empenhos
  ADD COLUMN IF NOT EXISTS solicitacao_competencia_id uuid,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_aco boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_aco_em timestamptz,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_aco_por uuid,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_aco_por_nome text,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_sefaz boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_por uuid,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_por_nome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pvh_empenhos'::regclass
       AND conname = 'pvh_empenhos_solicitacao_competencia_id_fkey'
  ) THEN
    ALTER TABLE public.pvh_empenhos
      ADD CONSTRAINT pvh_empenhos_solicitacao_competencia_id_fkey
      FOREIGN KEY (solicitacao_competencia_id)
      REFERENCES public.pvh_competencias(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pvh_empenhos'::regclass
       AND conname = 'pvh_empenhos_solicitacao_enviada_aco_por_fkey'
  ) THEN
    ALTER TABLE public.pvh_empenhos
      ADD CONSTRAINT pvh_empenhos_solicitacao_enviada_aco_por_fkey
      FOREIGN KEY (solicitacao_enviada_aco_por)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pvh_empenhos'::regclass
       AND conname = 'pvh_empenhos_solicitacao_enviada_por_fkey'
  ) THEN
    ALTER TABLE public.pvh_empenhos
      ADD CONSTRAINT pvh_empenhos_solicitacao_enviada_por_fkey
      FOREIGN KEY (solicitacao_enviada_por)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_pvh_empenhos_solicitacao_competencia
  ON public.pvh_empenhos (solicitacao_competencia_id, created_at DESC);


CREATE TABLE IF NOT EXISTS public.pvh_empenho_solicitacao_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empenho_id uuid NOT NULL REFERENCES public.pvh_empenhos(id) ON DELETE RESTRICT,
  slot text NOT NULL,
  servidor_nome text NOT NULL,
  cargo text,
  codigo_sei text,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  assinado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assinado_por_nome text,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_por_nome text,
  motivo_revogacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pvh_empenho_sol_ass_slot_check CHECK (
    slot IN (
      'coord_orc',
      'fiscal',
      'gestao',
      'diretor_servicos_complementares',
      'diretor_financeiro'
    )
  ),
  CONSTRAINT pvh_empenho_sol_ass_nome_check CHECK (
    length(btrim(servidor_nome)) > 0
  ),
  CONSTRAINT pvh_empenho_sol_ass_revogacao_check CHECK (
    revogado_em IS NULL
    OR (
      motivo_revogacao IS NOT NULL
      AND length(btrim(motivo_revogacao)) > 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_empenho_sol_ass_slot_ativo
  ON public.pvh_empenho_solicitacao_assinaturas (empenho_id, slot)
  WHERE revogado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_pvh_empenho_sol_ass_empenho
  ON public.pvh_empenho_solicitacao_assinaturas (empenho_id, assinado_em);

DROP TRIGGER IF EXISTS trg_pvh_empenho_sol_ass_updated_at
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE TRIGGER trg_pvh_empenho_sol_ass_updated_at
  BEFORE UPDATE ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


ALTER TABLE public.pvh_empenho_solicitacao_assinaturas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_empenho_solicitacao_assinaturas
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.pvh_empenho_solicitacao_assinaturas
  TO authenticated;

GRANT ALL
  ON public.pvh_empenho_solicitacao_assinaturas
  TO service_role;

DROP POLICY IF EXISTS "pvh empenho solicitacao assinaturas read"
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE POLICY "pvh empenho solicitacao assinaturas read"
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh empenho solicitacao assinaturas insert"
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE POLICY "pvh empenho solicitacao assinaturas insert"
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "pvh empenho solicitacao assinaturas update"
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE POLICY "pvh empenho solicitacao assinaturas update"
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','acp','aco']::public.app_role[]
    )
  );

-- ============================================================================
-- 2. Mudança material na Solicitação reabre os encaminhamentos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_reabrir_envios_solicitacao_empenho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
       NEW.solicitacao_sei_numero IS DISTINCT FROM OLD.solicitacao_sei_numero
       OR NEW.solicitacao_sei_link IS DISTINCT FROM OLD.solicitacao_sei_link
       OR NEW.solicitacao_data IS DISTINCT FROM OLD.solicitacao_data
       OR NEW.cr_dotacao IS DISTINCT FROM OLD.cr_dotacao
       OR NEW.fonte_recurso IS DISTINCT FROM OLD.fonte_recurso
     )
     AND (
       OLD.solicitacao_enviada_aco = true
       OR OLD.solicitacao_enviada_sefaz = true
     )
  THEN
    NEW.solicitacao_enviada_aco := false;
    NEW.solicitacao_enviada_aco_em := NULL;
    NEW.solicitacao_enviada_aco_por := NULL;
    NEW.solicitacao_enviada_aco_por_nome := NULL;

    NEW.solicitacao_enviada_sefaz := false;
    NEW.solicitacao_enviada_em := NULL;
    NEW.solicitacao_enviada_por := NULL;
    NEW.solicitacao_enviada_por_nome := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reabrir_envios_solicitacao_empenho()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_reabrir_envio_solicitacao
  ON public.pvh_empenhos;

CREATE TRIGGER trg_pvh_reabrir_envio_solicitacao
  BEFORE UPDATE OF
    solicitacao_sei_numero,
    solicitacao_sei_link,
    solicitacao_data,
    cr_dotacao,
    fonte_recurso
  ON public.pvh_empenhos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reabrir_envios_solicitacao_empenho();


CREATE OR REPLACE FUNCTION public.pvh_reabrir_envio_por_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empenho uuid;
  v_qtd integer;
BEGIN
  v_empenho := NEW.empenho_id;

  SELECT count(DISTINCT slot)
    INTO v_qtd
    FROM public.pvh_empenho_solicitacao_assinaturas
   WHERE empenho_id = v_empenho
     AND revogado_em IS NULL
     AND slot = ANY (
       ARRAY[
         'coord_orc',
         'fiscal',
         'gestao',
         'diretor_servicos_complementares',
         'diretor_financeiro'
       ]::text[]
     );

  IF v_qtd < 5 THEN
    UPDATE public.pvh_empenhos
       SET solicitacao_enviada_sefaz = false,
           solicitacao_enviada_em = NULL,
           solicitacao_enviada_por = NULL,
           solicitacao_enviada_por_nome = NULL
     WHERE id = v_empenho
       AND solicitacao_enviada_sefaz = true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reabrir_envio_por_assinatura()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_reabrir_envio_por_assinatura
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE TRIGGER trg_pvh_reabrir_envio_por_assinatura
  AFTER INSERT OR UPDATE
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reabrir_envio_por_assinatura();

-- ============================================================================
-- 3. Encaminhamento: ACO -> assinaturas -> SEFAZ
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_confirmar_envio_solicitacao_aco(
  p_empenho uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_nome text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para confirmar o envio da Solicitação de NE para SES.UFI.ACO.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de NE não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NULL THEN
    RAISE EXCEPTION
      'Este empenho pertence ao fluxo histórico anterior e não exige confirmação retroativa.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_emp.solicitacao_sei_numero), '') IS NULL
     OR NULLIF(btrim(v_emp.solicitacao_sei_link), '') IS NULL
     OR v_emp.solicitacao_sei_link !~* '^https?://'
     OR v_emp.solicitacao_data IS NULL
     OR NULLIF(btrim(v_emp.cr_dotacao), '') IS NULL
     OR NULLIF(btrim(v_emp.fonte_recurso), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete Nº SEI, Link SEI, data, dotação e fonte da Solicitação de NE.'
      USING ERRCODE = '23514';
  END IF;

  SELECT nome
    INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  UPDATE public.pvh_empenhos
     SET solicitacao_enviada_aco = true,
         solicitacao_enviada_aco_em = now(),
         solicitacao_enviada_aco_por = auth.uid(),
         solicitacao_enviada_aco_por_nome = v_nome
   WHERE id = p_empenho;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_confirmar_envio_solicitacao_aco(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.pvh_confirmar_envio_solicitacao_aco(uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(
  p_empenho uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_qtd_assinaturas integer;
  v_nome text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para confirmar o envio da Solicitação de NE à SEFAZ.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de NE não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NULL THEN
    RAISE EXCEPTION
      'Este empenho pertence ao fluxo histórico anterior e não exige confirmação retroativa.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_enviada_aco IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Confirme primeiro o envio da Solicitação para SES.UFI.ACO.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT slot)
    INTO v_qtd_assinaturas
    FROM public.pvh_empenho_solicitacao_assinaturas
   WHERE empenho_id = p_empenho
     AND revogado_em IS NULL
     AND slot = ANY (
       ARRAY[
         'coord_orc',
         'fiscal',
         'gestao',
         'diretor_servicos_complementares',
         'diretor_financeiro'
       ]::text[]
     );

  IF v_qtd_assinaturas <> 5 THEN
    RAISE EXCEPTION
      'A Solicitação de NE exige as cinco assinaturas antes do envio à SEFAZ.UCG.AEO.'
      USING ERRCODE = '23514';
  END IF;

  SELECT nome
    INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  UPDATE public.pvh_empenhos
     SET solicitacao_enviada_sefaz = true,
         solicitacao_enviada_em = now(),
         solicitacao_enviada_por = auth.uid(),
         solicitacao_enviada_por_nome = v_nome
   WHERE id = p_empenho;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  TO authenticated, service_role;

-- ============================================================================
-- 4. Integridade de alocação e reconferência da Etapa 3
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_validar_alocacao_empenho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_prestador_empenho uuid;
  v_prestador_participante uuid;
  v_valor_empenho numeric(16,2);
  v_status text;
  v_comp_origem uuid;
  v_aco_ok boolean;
  v_sefaz_ok boolean;
  v_ja_alocado numeric(16,2);
BEGIN
  SELECT
    prestador_id,
    valor_total,
    status,
    solicitacao_competencia_id,
    solicitacao_enviada_aco,
    solicitacao_enviada_sefaz
    INTO
      v_prestador_empenho,
      v_valor_empenho,
      v_status,
      v_comp_origem,
      v_aco_ok,
      v_sefaz_ok
    FROM public.pvh_empenhos
   WHERE id = NEW.empenho_id
   FOR UPDATE;

  SELECT prestador_id
    INTO v_prestador_participante
    FROM public.pvh_participantes
   WHERE id = NEW.participante_id;

  IF v_prestador_empenho IS NULL
     OR v_prestador_participante IS NULL THEN
    RAISE EXCEPTION 'Empenho ou participante PVH não encontrado.';
  END IF;

  IF v_prestador_empenho <> v_prestador_participante THEN
    RAISE EXCEPTION 'A Nota de Empenho pertence a outra instituição.';
  END IF;

  IF v_status <> 'ativo' OR v_valor_empenho IS NULL THEN
    RAISE EXCEPTION
      'A Solicitação ainda não possui Nota de Empenho emitida e não pode ser alocada.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp_origem IS NOT NULL
     AND (
       v_aco_ok IS DISTINCT FROM true
       OR v_sefaz_ok IS DISTINCT FROM true
     ) THEN
    RAISE EXCEPTION
      'A Solicitação de NE precisa passar por SES.UFI.ACO, assinaturas e SEFAZ.UCG.AEO antes da alocação.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_ja_alocado
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = NEW.empenho_id
     AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_ja_alocado + NEW.valor_alocado > v_valor_empenho + 0.009 THEN
    RAISE EXCEPTION
      'A alocação excede o saldo disponível da Nota de Empenho.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_validar_alocacao_empenho()
  FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.pvh_reconferir_empenho_relacionado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_empenho uuid;
  v_participante uuid;
  v_comp uuid;
BEGIN
  IF TG_TABLE_NAME = 'pvh_empenho_solicitacao_assinaturas' THEN
    v_empenho := NEW.empenho_id;

  ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    IF TG_OP = 'DELETE' THEN
      v_empenho := OLD.empenho_id;
      v_participante := OLD.participante_id;
    ELSE
      v_empenho := NEW.empenho_id;
      v_participante := NEW.participante_id;
    END IF;

  ELSE
    v_empenho := NEW.id;
  END IF;

  FOR v_comp IN
    SELECT competencia_id
      FROM (
        SELECT e.solicitacao_competencia_id AS competencia_id
          FROM public.pvh_empenhos e
         WHERE e.id = v_empenho

        UNION

        SELECT p.competencia_id
          FROM public.pvh_empenho_alocacoes a
          JOIN public.pvh_participantes p
            ON p.id = a.participante_id
         WHERE a.empenho_id = v_empenho

        UNION

        SELECT p.competencia_id
          FROM public.pvh_participantes p
         WHERE p.id = v_participante
      ) afetadas
     WHERE competencia_id IS NOT NULL
  LOOP
    PERFORM public.pvh_marcar_reconferencia(v_comp, 3);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_empenho_relacionado()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_empenhos_reconferir_etapa3
  ON public.pvh_empenhos;

CREATE TRIGGER trg_pvh_empenhos_reconferir_etapa3
  AFTER UPDATE OF
    solicitacao_sei_numero,
    solicitacao_sei_link,
    solicitacao_data,
    cr_dotacao,
    fonte_recurso,
    solicitacao_enviada_aco,
    solicitacao_enviada_sefaz,
    numero_ne,
    valor_total,
    nota_empenho_sei_numero,
    nota_empenho_sei_link,
    status
  ON public.pvh_empenhos
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

DROP TRIGGER IF EXISTS trg_pvh_empenho_assinaturas_reconferir_etapa3
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE TRIGGER trg_pvh_empenho_assinaturas_reconferir_etapa3
  AFTER INSERT OR UPDATE
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

DROP TRIGGER IF EXISTS trg_pvh_alocacoes_reconferir_etapa3
  ON public.pvh_empenho_alocacoes;

CREATE TRIGGER trg_pvh_alocacoes_reconferir_etapa3
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_empenho_alocacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

-- Auditoria das assinaturas, inclusive quando a migration 0900 não foi aplicada.
DROP TRIGGER IF EXISTS trg_pvh_empenho_solicitacao_assinaturas_audit
  ON public.pvh_empenho_solicitacao_assinaturas;

CREATE TRIGGER trg_pvh_empenho_solicitacao_assinaturas_audit
  AFTER INSERT OR UPDATE
  ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_audit_financeiro();

-- ============================================================================
-- 5. Etapa 2 só conclui com Minuta + Memorando + Portaria + recurso no FMS
-- ============================================================================

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
  v_destinatarios jsonb;
  v_total_estado numeric(16,2);
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
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '1')::boolean, false)
     IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conclua a Etapa 1 antes da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui instituições participantes.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
       AND COALESCE(valor_estadual, 0) <= 0
  ) THEN
    RAISE EXCEPTION
      'Todas as instituições precisam ter valor estadual positivo e conferido na Etapa 1.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(valor_estadual), 0)
    INTO v_total_estado
    FROM public.pvh_participantes
   WHERE competencia_id = p_comp;

  SELECT *
    INTO v_minuta
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'minuta_portaria_municipal'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_minuta.numero_sei), '') IS NULL
     OR v_minuta.data_documento IS NULL
     OR NULLIF(btrim(v_minuta.link_documento), '') IS NULL THEN
    RAISE EXCEPTION
      'Registre Nº SEI, Link SEI e data da Minuta da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_minuta.dados ->> 'autoridade_nome'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'autoridade_cargo'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'portaria_geral_numero'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'portaria_geral_sei'), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete os dados de construção do texto-base da Minuta.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND NULLIF(
         btrim(
           COALESCE(
             v_minuta.dados
               -> 'cnes_por_prestador'
               ->> p.prestador_id::text,
             ''
           )
         ),
         ''
       ) IS NULL
  ) THEN
    RAISE EXCEPTION
      'Informe o CNES de todas as instituições no Anexo I da Minuta.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_minuta.id
       AND a.slot = 'gestao'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Minuta exige assinatura de Gerente ou Coordenador.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_minuta.id
       AND a.slot = 'diretor_servicos_complementares'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Minuta exige assinatura do Diretor de Serviços Complementares.'
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
     OR v_memorando.data_documento IS NULL
     OR NULLIF(btrim(v_memorando.link_documento), '') IS NULL THEN
    RAISE EXCEPTION
      'Registre Nº SEI, Link SEI e data do Memorando de encaminhamento.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_memorando.dados ->> 'memorando_pgm_numero'), '') IS NULL
     OR NULLIF(btrim(v_memorando.dados ->> 'memorando_sap_numero'), '') IS NULL
     OR NULLIF(btrim(v_memorando.dados ->> 'processo_referencia'), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete as referências institucionais do Memorando.'
      USING ERRCODE = '23514';
  END IF;

  v_destinatarios := v_memorando.dados -> 'destinatarios';

  IF v_destinatarios IS NULL
     OR jsonb_typeof(v_destinatarios) <> 'array'
     OR jsonb_array_length(v_destinatarios) < 2
     OR EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_destinatarios) AS dest
        WHERE NULLIF(btrim(dest ->> 'unidade'), '') IS NULL
           OR NULLIF(btrim(dest ->> 'nome'), '') IS NULL
           OR NULLIF(btrim(dest ->> 'cargo'), '') IS NULL
     ) THEN
    RAISE EXCEPTION
      'Informe Unidade SEI, nome e cargo dos destinatários do Memorando.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_memorando.id
       AND a.slot = 'fiscal'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'O Memorando exige assinatura de um Fiscal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_memorando.id
       AND a.slot = 'gestao'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'O Memorando exige assinatura de Gerente ou Coordenador.'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(
       (v_memorando.dados ->> 'encaminhado_ses_uap')::boolean,
       false
     ) IS DISTINCT FROM true
     OR COALESCE(
       (v_memorando.dados ->> 'encaminhado_ses_uap_apa')::boolean,
       false
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Confirme o encaminhamento do Memorando para SES.UAP e SES.UAP.APA.'
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
    RAISE EXCEPTION
      'Registre número, data e Link SEI da Portaria Municipal publicada.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp.recurso_fms_data IS NULL
     OR COALESCE(v_comp.recurso_fms_valor, 0) <= 0
     OR NULLIF(btrim(v_comp.recurso_fms_referencia), '') IS NULL
     OR NULLIF(btrim(v_comp.recurso_fms_link), '') IS NULL
     OR v_comp.recurso_fms_link !~* '^https?://'
     OR abs(COALESCE(v_comp.recurso_fms_valor, 0) - v_total_estado) >= 0.01 THEN
    RAISE EXCEPTION
      'Complete o recebimento no FMS com data, valor conciliado, Número SEI e Link SEI antes de concluir a Etapa 2.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_participantes
     SET valor_municipal = valor_estadual
   WHERE competencia_id = p_comp
     AND valor_municipal IS DISTINCT FROM valor_estadual;

  UPDATE public.pvh_competencias
     SET minuta_municipal_numero = v_minuta.numero_sei,
         minuta_municipal_link = v_minuta.link_documento,
         memorando_municipal_numero = v_memorando.numero_sei,
         memorando_municipal_link = v_memorando.link_documento,
         portaria_municipal_numero = v_portaria.numero,
         portaria_municipal_data = v_portaria.data_documento,
         portaria_municipal_link = v_portaria.link_documento
   WHERE id = p_comp;

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


-- O FMS agora faz parte da Etapa 2. Qualquer alteração material posterior
-- reabre a Etapa 2 (e apenas etapas posteriores já concluídas).
CREATE OR REPLACE FUNCTION public.pvh_reconferir_recurso_fms_etapa2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
       OLD.recurso_fms_data IS DISTINCT FROM NEW.recurso_fms_data
       OR OLD.recurso_fms_valor IS DISTINCT FROM NEW.recurso_fms_valor
       OR OLD.recurso_fms_referencia IS DISTINCT FROM NEW.recurso_fms_referencia
       OR OLD.recurso_fms_link IS DISTINCT FROM NEW.recurso_fms_link
     )
     AND COALESCE(
       (OLD.etapas_concluidas ->> '2')::boolean,
       false
     ) = true
  THEN
    PERFORM public.pvh_marcar_reconferencia(NEW.id, 2);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_recurso_fms_etapa2()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_competencias_reconferir_fms_etapa2
  ON public.pvh_competencias;

CREATE TRIGGER trg_pvh_competencias_reconferir_fms_etapa2
  AFTER UPDATE OF
    recurso_fms_data,
    recurso_fms_valor,
    recurso_fms_referencia,
    recurso_fms_link
  ON public.pvh_competencias
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_recurso_fms_etapa2();

-- ============================================================================
-- 6. Conclusão da Etapa 3 exige o novo fluxo completo nas solicitações novas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa3(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_part record;
  v_coberto numeric(16,2);
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 3 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '2')::boolean, false)
     IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conclua a Etapa 2 antes dos empenhos.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_part IN
    SELECT
      p.id,
      COALESCE(p.valor_municipal, p.valor_estadual, 0) AS devido,
      pr.nome_instituicao
    FROM public.pvh_participantes p
    JOIN public.prestadores pr
      ON pr.id = p.prestador_id
    WHERE p.competencia_id = p_comp
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_coberto
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE a.participante_id = v_part.id
       AND e.status = 'ativo';

    IF v_part.devido <= 0
       OR abs(v_coberto - v_part.devido) >= 0.01 THEN
      RAISE EXCEPTION
        'A cobertura de empenho de % não fecha o valor da competência.',
        v_part.nome_instituicao
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND (
         e.status <> 'ativo'
         OR NULLIF(btrim(e.numero_ne), '') IS NULL
         OR e.numero_ne !~ '^\d{1,8}/\d{4}$'
         OR COALESCE(e.valor_total, 0) <= 0
         OR NULLIF(btrim(e.solicitacao_sei_numero), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_numero), '') IS NULL
       )
  ) THEN
    RAISE EXCEPTION
      'Toda NE utilizada precisa ter Solicitação e Nota de Empenho rastreadas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND e.solicitacao_competencia_id IS NOT NULL
       AND (
         e.solicitacao_enviada_aco IS DISTINCT FROM true
         OR e.solicitacao_enviada_sefaz IS DISTINCT FROM true
         OR NULLIF(btrim(e.solicitacao_sei_link), '') IS NULL
         OR e.solicitacao_sei_link !~* '^https?://'
         OR e.solicitacao_data IS NULL
         OR NULLIF(btrim(e.cr_dotacao), '') IS NULL
         OR NULLIF(btrim(e.fonte_recurso), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_link), '') IS NULL
         OR e.nota_empenho_sei_link !~* '^https?://'
         OR (
           SELECT count(DISTINCT s.slot)
             FROM public.pvh_empenho_solicitacao_assinaturas s
            WHERE s.empenho_id = e.id
              AND s.revogado_em IS NULL
              AND s.slot = ANY (
                ARRAY[
                  'coord_orc',
                  'fiscal',
                  'gestao',
                  'diretor_servicos_complementares',
                  'diretor_financeiro'
                ]::text[]
              )
         ) <> 5
       )
  ) THEN
    RAISE EXCEPTION
      'Toda Solicitação nova precisa passar por SES.UFI.ACO, cinco assinaturas e SEFAZ.UCG.AEO antes da conclusão da Etapa 3.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{3}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           3
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa3(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa3(uuid)
  TO authenticated, service_role;


-- Força o PostgREST/Supabase a enxergar imediatamente as novas colunas/RPCs.
NOTIFY pgrst, 'reload schema';
