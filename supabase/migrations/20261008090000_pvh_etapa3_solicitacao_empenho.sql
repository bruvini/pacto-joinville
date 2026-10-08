-- PVH — Etapa 3: Solicitação de NE -> assinaturas -> SEFAZ -> Nota de Empenho
-- Mantém a modelagem N:N das NEs, mas separa o ciclo documental anterior à emissão.

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
  ADD COLUMN IF NOT EXISTS solicitacao_competencia_id uuid
    REFERENCES public.pvh_competencias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_sefaz boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_por uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solicitacao_enviada_por_nome text;

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
    OR (motivo_revogacao IS NOT NULL AND length(btrim(motivo_revogacao)) > 0)
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

-- Se dados materiais da solicitação mudarem depois do envio, a confirmação
-- precisa ser refeita. A NE já emitida não é apagada: preservamos o fato e
-- exigimos reconferência do encaminhamento.
CREATE OR REPLACE FUNCTION public.pvh_reabrir_envio_solicitacao_empenho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.solicitacao_enviada_sefaz = true
     AND (
       NEW.solicitacao_sei_numero IS DISTINCT FROM OLD.solicitacao_sei_numero OR
       NEW.solicitacao_sei_link IS DISTINCT FROM OLD.solicitacao_sei_link OR
       NEW.solicitacao_data IS DISTINCT FROM OLD.solicitacao_data OR
       NEW.cr_dotacao IS DISTINCT FROM OLD.cr_dotacao OR
       NEW.fonte_recurso IS DISTINCT FROM OLD.fonte_recurso
     ) THEN
    NEW.solicitacao_enviada_sefaz := false;
    NEW.solicitacao_enviada_em := NULL;
    NEW.solicitacao_enviada_por := NULL;
    NEW.solicitacao_enviada_por_nome := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reabrir_envio_solicitacao_empenho()
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
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reabrir_envio_solicitacao_empenho();

-- Retirar uma assinatura obrigatória também reabre a confirmação de envio.
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
$;

REVOKE EXECUTE ON FUNCTION public.pvh_reabrir_envio_por_assinatura()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_reabrir_envio_por_assinatura
  ON public.pvh_empenho_solicitacao_assinaturas;
CREATE TRIGGER trg_pvh_reabrir_envio_por_assinatura
  AFTER INSERT OR UPDATE ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reabrir_envio_por_assinatura();

-- A auditoria financeira passa a localizar também a competência de origem da
-- Solicitação de NE e suas assinaturas.
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
  v_empenho uuid;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  row_json := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  old_json := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  IF TG_TABLE_NAME = 'pvh_empenhos' THEN
    comp := COALESCE(NEW.solicitacao_competencia_id, OLD.solicitacao_competencia_id);
  ELSIF TG_TABLE_NAME = 'pvh_empenho_solicitacao_assinaturas' THEN
    v_empenho := COALESCE(NEW.empenho_id, OLD.empenho_id);
    SELECT solicitacao_competencia_id
      INTO comp
      FROM public.pvh_empenhos
     WHERE id = v_empenho;
  ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_financeiro()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_empenho_solicitacao_assinaturas_audit
  ON public.pvh_empenho_solicitacao_assinaturas;
CREATE TRIGGER trg_pvh_empenho_solicitacao_assinaturas_audit
  AFTER INSERT OR UPDATE ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_audit_financeiro();

-- Qualquer mudança material no empenho, nas assinaturas ou nas alocações
-- reabre a Etapa 3 somente nas competências já concluídas que são afetadas.
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
          JOIN public.pvh_participantes p ON p.id = a.participante_id
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
$;

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
    solicitacao_enviada_sefaz,
    numero_ne,
    valor_total,
    nota_empenho_sei_numero,
    nota_empenho_sei_link,
    status
  ON public.pvh_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

DROP TRIGGER IF EXISTS trg_pvh_empenho_assinaturas_reconferir_etapa3
  ON public.pvh_empenho_solicitacao_assinaturas;
CREATE TRIGGER trg_pvh_empenho_assinaturas_reconferir_etapa3
  AFTER INSERT OR UPDATE ON public.pvh_empenho_solicitacao_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

DROP TRIGGER IF EXISTS trg_pvh_alocacoes_reconferir_etapa3
  ON public.pvh_empenho_alocacoes;
CREATE TRIGGER trg_pvh_alocacoes_reconferir_etapa3
  AFTER INSERT OR UPDATE OR DELETE ON public.pvh_empenho_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_reconferir_empenho_relacionado();

-- Impede que uma solicitação ainda sem NE emitida seja usada para cobertura.
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
  v_envio_ok boolean;
  v_ja_alocado numeric(16,2);
BEGIN
  SELECT
    prestador_id,
    valor_total,
    status,
    solicitacao_competencia_id,
    solicitacao_enviada_sefaz
    INTO
      v_prestador_empenho,
      v_valor_empenho,
      v_status,
      v_comp_origem,
      v_envio_ok
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

  IF v_status <> 'ativo' OR v_valor_empenho IS NULL THEN
    RAISE EXCEPTION
      'A Solicitação ainda não possui Nota de Empenho emitida e não pode ser alocada.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp_origem IS NOT NULL AND v_envio_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'A Solicitação de NE precisa estar confirmada como enviada à SEFAZ.UCG.AEO.'
      USING ERRCODE = '23514';
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

-- Confirmação formal de envio: não depende apenas do estado visual do botão.
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
    RAISE EXCEPTION 'Sem permissão para confirmar o envio da Solicitação de NE.'
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
      'Este empenho é um registro histórico anterior ao fluxo de confirmação.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_emp.solicitacao_sei_numero), '') IS NULL
     OR NULLIF(btrim(v_emp.solicitacao_sei_link), '') IS NULL
     OR v_emp.solicitacao_sei_link ~* '^(javascript|data|vbscript):'
     OR v_emp.solicitacao_sei_link !~* '^(https?://)?[^[:space:]]+\.[^[:space:]]{2,}'
     OR v_emp.solicitacao_data IS NULL
     OR NULLIF(btrim(v_emp.cr_dotacao), '') IS NULL
     OR NULLIF(btrim(v_emp.fonte_recurso), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete Nº SEI, Link SEI, data, dotação e fonte da Solicitação de NE.'
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

  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();

  UPDATE public.pvh_empenhos
     SET solicitacao_enviada_sefaz = true,
         solicitacao_enviada_em = now(),
         solicitacao_enviada_por = auth.uid(),
         solicitacao_enviada_por_nome = v_nome
   WHERE id = p_empenho;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  TO authenticated, service_role;

-- Conclusão da Etapa 3 validada no servidor.
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
    JOIN public.prestadores pr ON pr.id = p.prestador_id
    WHERE p.competencia_id = p_comp
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_coberto
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE a.participante_id = v_part.id
       AND e.status = 'ativo';

    IF v_part.devido <= 0 OR abs(v_coberto - v_part.devido) >= 0.01 THEN
      RAISE EXCEPTION
        'A cobertura de empenho de % não fecha o valor da competência.',
        v_part.nome_instituicao
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Requisitos comuns a toda NE utilizada. Registros históricos anteriores
  -- ao novo fluxo preservam a regra antiga; o novo fluxo recebe validação ampliada abaixo.
  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND (
         e.status <> 'ativo'
         OR NULLIF(btrim(e.numero_ne), '') IS NULL
         OR e.numero_ne !~ '^\d{1,8}/\d{4}

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND e.solicitacao_competencia_id IS NOT NULL
       AND (
         e.solicitacao_enviada_sefaz IS DISTINCT FROM true
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
      'Toda Solicitação de NE do novo fluxo precisa das cinco assinaturas e do envio confirmado à SEFAZ.UCG.AEO.'
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

ALTER TABLE public.pvh_empenho_solicitacao_assinaturas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_empenho_solicitacao_assinaturas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pvh_empenho_solicitacao_assinaturas TO authenticated;
GRANT ALL ON public.pvh_empenho_solicitacao_assinaturas TO service_role;

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
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND e.solicitacao_competencia_id IS NOT NULL
       AND (
         NULLIF(btrim(e.solicitacao_sei_link), '') IS NULL
         OR e.solicitacao_sei_link ~* '^(javascript|data|vbscript):'
         OR e.solicitacao_sei_link !~* '^(https?://)?[^[:space:]]+\.[^[:space:]]{2,}'
         OR e.solicitacao_data IS NULL
         OR NULLIF(btrim(e.cr_dotacao), '') IS NULL
         OR NULLIF(btrim(e.fonte_recurso), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_link), '') IS NULL
         OR e.nota_empenho_sei_link ~* '^(javascript|data|vbscript):'
         OR e.nota_empenho_sei_link !~* '^(https?://)?[^[:space:]]+\.[^[:space:]]{2,}'
       )
  ) THEN
    RAISE EXCEPTION
      'As NEs do novo fluxo precisam de Links SEI válidos, data, dotação e fonte da solicitação.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND e.solicitacao_competencia_id IS NOT NULL
       AND (
         e.solicitacao_enviada_sefaz IS DISTINCT FROM true
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
      'Toda Solicitação de NE do novo fluxo precisa das cinco assinaturas e do envio confirmado à SEFAZ.UCG.AEO.'
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

ALTER TABLE public.pvh_empenho_solicitacao_assinaturas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pvh_empenho_solicitacao_assinaturas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pvh_empenho_solicitacao_assinaturas TO authenticated;
GRANT ALL ON public.pvh_empenho_solicitacao_assinaturas TO service_role;

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
