-- PVH · Etapa 7 — conferência e encerramento administrativo-financeiro
-- Executar APÓS as migrations anteriores do PVH, no SQL Editor do Supabase/Lovable.
-- Não altera dados de competências já existentes nem as encerra automaticamente.

-- A troca de status para "encerrada" só deve ocorrer pela RPC validada.
-- SECURITY DEFINER executa como o proprietário da função e ultrapassa a RLS.
DROP POLICY IF EXISTS "pvh competencias update" ON public.pvh_competencias;
CREATE POLICY "pvh competencias update"
  ON public.pvh_competencias FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::public.app_role[])
    AND status <> 'encerrada'
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::public.app_role[])
    AND status <> 'encerrada'
  );

-- Impede edição direta dos documentos/lançamentos após o encerramento.
-- Uma eventual correção exige reabertura motivada antes da alteração.
CREATE OR REPLACE FUNCTION public.pvh_bloquear_filho_encerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp uuid;
  v_part uuid;
  v_alocacao uuid;
  v_sub uuid;
BEGIN
  IF TG_TABLE_NAME IN (
    'pvh_participantes','pvh_documentos','pvh_pagamentos','pvh_notificacoes_email'
  ) THEN
    v_comp := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.competencia_id ELSE NEW.competencia_id END;
  ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    v_part := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.participante_id ELSE NEW.participante_id END;
    SELECT competencia_id INTO v_comp FROM public.pvh_participantes WHERE id = v_part;
  ELSIF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    v_alocacao := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.alocacao_id ELSE NEW.alocacao_id END;
    SELECT p.competencia_id INTO v_comp
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE a.id = v_alocacao;
  ELSIF TG_TABLE_NAME = 'pvh_subempenho_assinaturas' THEN
    v_sub := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.subempenho_id ELSE NEW.subempenho_id END;
    SELECT p.competencia_id INTO v_comp
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE s.id = v_sub;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pvh_competencias
     WHERE id = v_comp AND status = 'encerrada'
  ) THEN
    RAISE EXCEPTION
      'Competência PVH encerrada: reabra-a formalmente antes de alterar seus registros.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pvh_bloquear_filho_encerrado() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pvh_participantes',
    'pvh_documentos',
    'pvh_empenho_alocacoes',
    'pvh_subempenhos',
    'pvh_subempenho_assinaturas',
    'pvh_pagamentos',
    'pvh_notificacoes_email'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_pvh_bloquear_encerrado ON public.%I', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_pvh_bloquear_encerrado BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pvh_bloquear_filho_encerrado()', t
    );
  END LOOP;
END;
$$;

-- Encerramento atômico, com validação no banco e trilha já existente em historico_logs.
CREATE OR REPLACE FUNCTION public.pvh_encerrar_competencia(
  p_comp uuid,
  p_conferido boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_etapa integer;
  v_estado numeric;
  v_municipio numeric;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Somente Administração/ACP pode encerrar a competência PVH.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conferido IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirme a conferência financeira antes de encerrar.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_comp.status = 'encerrada' THEN
    RAISE EXCEPTION 'Esta competência já está encerrada.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_etapa IN 1..6 LOOP
    IF COALESCE((v_comp.etapas_concluidas ->> v_etapa::text)::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'A Etapa % precisa estar concluída.', v_etapa
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF cardinality(COALESCE(v_comp.etapas_reconferir, '{}'::integer[])) > 0 THEN
    RAISE EXCEPTION 'Existem etapas aguardando reconferência.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(valor_estadual), 0),
         COALESCE(SUM(valor_municipal), 0)
    INTO v_estado, v_municipio
    FROM public.pvh_participantes
   WHERE competencia_id = p_comp;

  IF NOT EXISTS (SELECT 1 FROM public.pvh_participantes WHERE competencia_id = p_comp)
     OR v_estado <= 0
     OR v_municipio <= 0
     OR ABS(v_estado - v_municipio) >= 0.01
     OR v_comp.recurso_fms_data IS NULL
     OR v_comp.recurso_fms_valor IS NULL
     OR ABS(v_comp.recurso_fms_valor - v_estado) >= 0.01
  THEN
    RAISE EXCEPTION 'Os valores oficiais, municipais e o crédito FMS não estão conciliados.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND (
         COALESCE(p.valor_estadual, 0) <= 0
         OR COALESCE(p.valor_municipal, 0) <= 0
         OR ABS(p.valor_estadual - p.valor_municipal) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(a.valor_alocado)
               FROM public.pvh_empenho_alocacoes a
              WHERE a.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(s.valor)
               FROM public.pvh_subempenhos s
               JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
              WHERE a.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(pg.valor_pago)
               FROM public.pvh_pagamentos pg
              WHERE pg.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE(p.valor_pago, 0) -
           COALESCE((
             SELECT SUM(pg.valor_pago)
               FROM public.pvh_pagamentos pg
              WHERE pg.participante_id = p.id
           ), 0)
         ) >= 0.01
       )
  ) THEN
    RAISE EXCEPTION
      'Há divergência financeira por instituição (Estado, Município, NE, subempenho ou pagamento).'
      USING ERRCODE = '23514';
  END IF;

  -- Prestação de contas futura não é confundida com pagamento: a obrigação
  -- por instituição continua identificada e acompanhável após o encerramento.
  UPDATE public.pvh_competencias
     SET status = 'encerrada',
         encerrada_em = now(),
         encerrada_por = auth.uid(),
         etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{7}', 'true'::jsonb, true
         )
   WHERE id = p_comp;
END;
$$;

REVOKE ALL ON FUNCTION public.pvh_encerrar_competencia(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_encerrar_competencia(uuid, boolean)
  TO authenticated, service_role;

-- Reabertura somente ACP/Admin, com justificativa auditada em observacao
-- e no diff já registrado automaticamente em historico_logs.
CREATE OR REPLACE FUNCTION public.pvh_reabrir_competencia(
  p_comp uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reabrir esta competência.'
      USING ERRCODE = '42501';
  END IF;

  IF length(btrim(COALESCE(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'Informe uma justificativa com pelo menos 10 caracteres.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_comp FROM public.pvh_competencias
   WHERE id = p_comp FOR UPDATE;
  IF NOT FOUND OR v_comp.status <> 'encerrada' THEN
    RAISE EXCEPTION 'A competência não está encerrada.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET status = 'ativa',
         encerrada_em = NULL,
         encerrada_por = NULL,
         etapas_concluidas = COALESCE(etapas_concluidas, '{}'::jsonb) - '7',
         observacao = concat_ws(E'\n',
           NULLIF(observacao, ''),
           'REABERTURA PVH (' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
           '): ' || btrim(p_motivo))
   WHERE id = p_comp;
END;
$$;

REVOKE ALL ON FUNCTION public.pvh_reabrir_competencia(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_reabrir_competencia(uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
