-- PVH — Etapa 3: Comissão, vinculação automática da NE e exclusão segura do fluxo
--
-- Ajustes:
-- • adiciona assinatura manual de membro da Comissão de Gestão e Controle de Despesa;
-- • passa a exigir 6 assinaturas antes do envio à SEFAZ;
-- • registra a NE e cria automaticamente a alocação para a competência de origem;
-- • mantém o N:N: eventual saldo da NE permanece disponível para outras competências;
-- • disponibiliza RPC para reaproveitar saldo em outra competência sem digitar valor manual;
-- • cria exclusão controlada do fluxo, bloqueando quando já há uso em outra competência
--   ou subempenho vinculado.

-- ============================================================================
-- 1. Sexta assinatura: Comissão de Gestão e Controle de Despesa
-- ============================================================================

ALTER TABLE public.pvh_empenho_solicitacao_assinaturas
  DROP CONSTRAINT IF EXISTS pvh_empenho_sol_ass_slot_check;

ALTER TABLE public.pvh_empenho_solicitacao_assinaturas
  ADD CONSTRAINT pvh_empenho_sol_ass_slot_check
  CHECK (
    slot IN (
      'coord_orc',
      'fiscal',
      'gestao',
      'diretor_servicos_complementares',
      'comissao',
      'diretor_financeiro'
    )
  );

-- Solicitações que já tinham sido enviadas à SEFAZ com apenas as cinco
-- assinaturas anteriores precisam ser reconferidas após a inclusão da Comissão.
UPDATE public.pvh_empenhos e
   SET solicitacao_enviada_sefaz = false,
       solicitacao_enviada_em = NULL,
       solicitacao_enviada_por = NULL,
       solicitacao_enviada_por_nome = NULL
 WHERE e.solicitacao_competencia_id IS NOT NULL
   AND e.solicitacao_enviada_sefaz = true
   AND NOT EXISTS (
     SELECT 1
       FROM public.pvh_empenho_solicitacao_assinaturas s
      WHERE s.empenho_id = e.id
        AND s.slot = 'comissao'
        AND s.revogado_em IS NULL
   );


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
         'comissao',
         'diretor_financeiro'
       ]::text[]
     );

  IF v_qtd < 6 THEN
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
         'comissao',
         'diretor_financeiro'
       ]::text[]
     );

  IF v_qtd_assinaturas <> 6 THEN
    RAISE EXCEPTION
      'A Solicitação de NE exige as seis assinaturas antes do envio à SEFAZ.UCG.AEO.'
      USING ERRCODE = '23514';
  END IF;

  SELECT nome INTO v_nome
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

REVOKE EXECUTE ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_confirmar_envio_solicitacao_empenho(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 2. Registro da NE com alocação automática à competência de origem
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_registrar_nota_empenho(
  p_empenho uuid,
  p_participante uuid,
  p_numero_ne text,
  p_valor_total numeric,
  p_numero_sei text,
  p_link_sei text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_part public.pvh_participantes%ROWTYPE;
  v_qtd_assinaturas integer;
  v_total_alocado_outros numeric(16,2);
  v_cobertura_outras_ne numeric(16,2);
  v_alocacao_atual numeric(16,2);
  v_devido numeric(16,2);
  v_restante numeric(16,2);
  v_saldo_ne numeric(16,2);
  v_auto numeric(16,2);
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para registrar Nota de Empenho do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fluxo de empenho não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  SELECT *
    INTO v_part
    FROM public.pvh_participantes
   WHERE id = p_participante
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante PVH não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_part.prestador_id <> v_emp.prestador_id THEN
    RAISE EXCEPTION
      'A Nota de Empenho pertence a outra instituição.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL
     AND v_emp.solicitacao_competencia_id <> v_part.competencia_id THEN
    RAISE EXCEPTION
      'Este fluxo de Solicitação foi aberto em outra competência.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_numero_ne), '') IS NULL
     OR p_numero_ne !~ '^\d{1,8}/\d{4}

  IF COALESCE(p_valor_total, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe um valor total positivo para a Nota de Empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_numero_sei), '') IS NULL
     OR NULLIF(btrim(p_link_sei), '') IS NULL
     OR p_link_sei !~* '^https?://' THEN
    RAISE EXCEPTION
      'Informe Nº SEI e Link SEI válidos da Nota de Empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL THEN
    IF v_emp.solicitacao_enviada_aco IS DISTINCT FROM true
       OR v_emp.solicitacao_enviada_sefaz IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'A Solicitação precisa passar por SES.UFI.ACO e SEFAZ.UCG.AEO antes do registro da NE.'
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
           'comissao',
           'diretor_financeiro'
         ]::text[]
       );

    IF v_qtd_assinaturas <> 6 THEN
      RAISE EXCEPTION
        'A Solicitação de NE exige seis assinaturas antes do registro da Nota de Empenho.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_total_alocado_outros
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id <> p_participante;

  SELECT valor_alocado
    INTO v_alocacao_atual
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id = p_participante
   LIMIT 1;

  IF COALESCE(v_total_alocado_outros, 0)
       + COALESCE(v_alocacao_atual, 0)
       > p_valor_total + 0.009 THEN
    RAISE EXCEPTION
      'O novo valor total da NE é menor que o valor já alocado às competências.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_empenhos
     SET numero_ne = btrim(p_numero_ne),
         valor_total = p_valor_total,
         nota_empenho_sei_numero = btrim(p_numero_sei),
         nota_empenho_sei_link = btrim(p_link_sei),
         status = 'ativo'
   WHERE id = p_empenho;

  -- Se já existe alocação nesta competência, não a reescrevemos silenciosamente.
  IF v_alocacao_atual IS NOT NULL THEN
    RETURN v_alocacao_atual;
  END IF;

  -- A vinculação automática só acontece para a competência em que a Solicitação
  -- foi aberta. Isso preserva a modelagem N:N e evita apropriar saldo futuro
  -- sem intenção do usuário.
  IF v_emp.solicitacao_competencia_id IS DISTINCT FROM v_part.competencia_id THEN
    RETURN 0;
  END IF;

  v_devido := COALESCE(v_part.valor_municipal, v_part.valor_estadual, 0);

  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_cobertura_outras_ne
    FROM public.pvh_empenho_alocacoes a
   WHERE a.participante_id = p_participante
     AND a.empenho_id <> p_empenho;

  v_restante := GREATEST(v_devido - COALESCE(v_cobertura_outras_ne, 0), 0);
  v_saldo_ne := GREATEST(p_valor_total - COALESCE(v_total_alocado_outros, 0), 0);
  v_auto := LEAST(v_restante, v_saldo_ne);

  IF v_auto > 0.009 THEN
    INSERT INTO public.pvh_empenho_alocacoes (
      empenho_id,
      participante_id,
      valor_alocado,
      observacao,
      created_by
    )
    VALUES (
      p_empenho,
      p_participante,
      v_auto,
      'Vinculação automática à competência de origem da Solicitação de NE.',
      auth.uid()
    );
  END IF;

  RETURN COALESCE(v_auto, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) TO authenticated, service_role;


-- ============================================================================
-- 3. Reaproveitamento de saldo de NE em outra competência, sem input manual
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_alocar_saldo_empenho(
  p_empenho uuid,
  p_participante uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_part public.pvh_participantes%ROWTYPE;
  v_existente numeric(16,2);
  v_total_alocado numeric(16,2);
  v_cobertura_atual numeric(16,2);
  v_devido numeric(16,2);
  v_saldo numeric(16,2);
  v_restante numeric(16,2);
  v_valor numeric(16,2);
  v_qtd_assinaturas integer;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para vincular saldo de Nota de Empenho.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  SELECT *
    INTO v_part
    FROM public.pvh_participantes
   WHERE id = p_participante
   FOR UPDATE;

  IF v_emp.id IS NULL OR v_part.id IS NULL THEN
    RAISE EXCEPTION 'Nota de Empenho ou participante não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.prestador_id <> v_part.prestador_id THEN
    RAISE EXCEPTION 'A Nota de Empenho pertence a outra instituição.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.status <> 'ativo' OR COALESCE(v_emp.valor_total, 0) <= 0 THEN
    RAISE EXCEPTION 'A Nota de Empenho ainda não está emitida.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL THEN
    IF v_emp.solicitacao_enviada_aco IS DISTINCT FROM true
       OR v_emp.solicitacao_enviada_sefaz IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'A Solicitação desta NE precisa estar confirmada em SES.UFI.ACO e SEFAZ.UCG.AEO.'
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
           'comissao',
           'diretor_financeiro'
         ]::text[]
       );

    IF v_qtd_assinaturas <> 6 THEN
      RAISE EXCEPTION
        'A Solicitação desta NE não possui as seis assinaturas ativas.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT valor_alocado
    INTO v_existente
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id = p_participante
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_total_alocado
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_cobertura_atual
    FROM public.pvh_empenho_alocacoes
   WHERE participante_id = p_participante;

  v_devido := COALESCE(v_part.valor_municipal, v_part.valor_estadual, 0);
  v_saldo := GREATEST(COALESCE(v_emp.valor_total, 0) - v_total_alocado, 0);
  v_restante := GREATEST(v_devido - v_cobertura_atual, 0);
  v_valor := LEAST(v_saldo, v_restante);

  IF v_valor <= 0.009 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.pvh_empenho_alocacoes (
    empenho_id,
    participante_id,
    valor_alocado,
    observacao,
    created_by
  )
  VALUES (
    p_empenho,
    p_participante,
    v_valor,
    'Saldo de NE reaproveitado automaticamente nesta competência.',
    auth.uid()
  );

  RETURN v_valor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 4. Exclusão segura do fluxo criado na própria competência
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_excluir_fluxo_empenho(
  p_empenho uuid,
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_nome text;
  v_assinaturas jsonb;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir fluxo de empenho.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fluxo de empenho não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.solicitacao_competencia_id IS DISTINCT FROM p_comp THEN
    RAISE EXCEPTION
      'Este fluxo não foi criado nesta competência e não pode ser excluído por aqui.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
     WHERE a.empenho_id = p_empenho
       AND p.competencia_id <> p_comp
  ) THEN
    RAISE EXCEPTION
      'Esta NE já foi utilizada em outra competência. Preserve o fluxo e remova apenas vínculos específicos, quando permitido.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a
        ON a.id = s.alocacao_id
     WHERE a.empenho_id = p_empenho
  ) THEN
    RAISE EXCEPTION
      'Este fluxo já possui subempenho vinculado e não pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    INTO v_assinaturas
    FROM public.pvh_empenho_solicitacao_assinaturas s
   WHERE s.empenho_id = p_empenho;

  SELECT nome INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  INSERT INTO public.historico_logs (
    pvh_competencia_id,
    usuario_id,
    usuario_nome,
    acao,
    detalhes
  )
  VALUES (
    p_comp,
    auth.uid(),
    v_nome,
    'PVH · exclusão controlada do fluxo de empenho',
    jsonb_build_object(
      'empenho', to_jsonb(v_emp),
      'assinaturas', v_assinaturas
    )
  );

  DELETE FROM public.pvh_empenho_solicitacao_assinaturas
   WHERE empenho_id = p_empenho;

  DELETE FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho;

  DELETE FROM public.pvh_empenhos
   WHERE id = p_empenho;

  -- Se a Etapa 3 já havia sido concluída, a exclusão deve aparecer como
  -- pendência de reconferência, nunca como regressão silenciosa.
  PERFORM public.pvh_marcar_reconferencia(p_comp, 3);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_fluxo_empenho(uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_fluxo_empenho(uuid, uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 5. Conclusão da Etapa 3 passa a exigir as 6 assinaturas
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
    JOIN public.prestadores pr ON pr.id = p.prestador_id
    WHERE p.competencia_id = p_comp
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_coberto
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
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
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND (
         e.status <> 'ativo'
         OR NULLIF(btrim(e.numero_ne), '') IS NULL
         OR e.numero_ne !~ '^\d{1,8}/\d{4}$'
         OR COALESCE(e.valor_total, 0) <= 0
         OR NULLIF(btrim(e.solicitacao_sei_numero), '') IS NULL
         OR NULLIF(btrim(e.solicitacao_sei_link), '') IS NULL
         OR e.solicitacao_sei_link !~* '^https?://'
         OR e.solicitacao_data IS NULL
         OR NULLIF(btrim(e.cr_dotacao), '') IS NULL
         OR NULLIF(btrim(e.fonte_recurso), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_numero), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_link), '') IS NULL
         OR e.nota_empenho_sei_link !~* '^https?://'
       )
  ) THEN
    RAISE EXCEPTION
      'Toda NE utilizada precisa ter Solicitação e Nota de Empenho integralmente rastreadas.'
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
         e.solicitacao_enviada_aco IS DISTINCT FROM true
         OR e.solicitacao_enviada_sefaz IS DISTINCT FROM true
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
                  'comissao',
                  'diretor_financeiro'
                ]::text[]
              )
         ) <> 6
       )
  ) THEN
    RAISE EXCEPTION
      'Toda Solicitação nova precisa passar por SES.UFI.ACO, seis assinaturas e SEFAZ.UCG.AEO antes da conclusão da Etapa 3.'
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


NOTIFY pgrst, 'reload schema';
 THEN
    RAISE EXCEPTION
      'Número da NE inválido. Use o formato XXXX/% e o exercício da competência.',
      v_emp.ano
      USING ERRCODE = '23514';
  END IF;

  IF split_part(p_numero_ne, '/', 2)::integer <> v_emp.ano THEN
    RAISE EXCEPTION
      'O exercício da Nota de Empenho deve ser %.',
      v_emp.ano
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(p_valor_total, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe um valor total positivo para a Nota de Empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_numero_sei), '') IS NULL
     OR NULLIF(btrim(p_link_sei), '') IS NULL
     OR p_link_sei !~* '^https?://' THEN
    RAISE EXCEPTION
      'Informe Nº SEI e Link SEI válidos da Nota de Empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL THEN
    IF v_emp.solicitacao_enviada_aco IS DISTINCT FROM true
       OR v_emp.solicitacao_enviada_sefaz IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'A Solicitação precisa passar por SES.UFI.ACO e SEFAZ.UCG.AEO antes do registro da NE.'
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
           'comissao',
           'diretor_financeiro'
         ]::text[]
       );

    IF v_qtd_assinaturas <> 6 THEN
      RAISE EXCEPTION
        'A Solicitação de NE exige seis assinaturas antes do registro da Nota de Empenho.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_total_alocado_outros
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id <> p_participante;

  SELECT valor_alocado
    INTO v_alocacao_atual
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id = p_participante
   LIMIT 1;

  IF COALESCE(v_total_alocado_outros, 0)
       + COALESCE(v_alocacao_atual, 0)
       > p_valor_total + 0.009 THEN
    RAISE EXCEPTION
      'O novo valor total da NE é menor que o valor já alocado às competências.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_empenhos
     SET numero_ne = btrim(p_numero_ne),
         valor_total = p_valor_total,
         nota_empenho_sei_numero = btrim(p_numero_sei),
         nota_empenho_sei_link = btrim(p_link_sei),
         status = 'ativo'
   WHERE id = p_empenho;

  -- Se já existe alocação nesta competência, não a reescrevemos silenciosamente.
  IF v_alocacao_atual IS NOT NULL THEN
    RETURN v_alocacao_atual;
  END IF;

  -- A vinculação automática só acontece para a competência em que a Solicitação
  -- foi aberta. Isso preserva a modelagem N:N e evita apropriar saldo futuro
  -- sem intenção do usuário.
  IF v_emp.solicitacao_competencia_id IS DISTINCT FROM v_part.competencia_id THEN
    RETURN 0;
  END IF;

  v_devido := COALESCE(v_part.valor_municipal, v_part.valor_estadual, 0);

  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_cobertura_outras_ne
    FROM public.pvh_empenho_alocacoes a
   WHERE a.participante_id = p_participante
     AND a.empenho_id <> p_empenho;

  v_restante := GREATEST(v_devido - COALESCE(v_cobertura_outras_ne, 0), 0);
  v_saldo_ne := GREATEST(p_valor_total - COALESCE(v_total_alocado_outros, 0), 0);
  v_auto := LEAST(v_restante, v_saldo_ne);

  IF v_auto > 0.009 THEN
    INSERT INTO public.pvh_empenho_alocacoes (
      empenho_id,
      participante_id,
      valor_alocado,
      observacao,
      created_by
    )
    VALUES (
      p_empenho,
      p_participante,
      v_auto,
      'Vinculação automática à competência de origem da Solicitação de NE.',
      auth.uid()
    );
  END IF;

  RETURN COALESCE(v_auto, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) TO authenticated, service_role;


-- ============================================================================
-- 3. Reaproveitamento de saldo de NE em outra competência, sem input manual
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_alocar_saldo_empenho(
  p_empenho uuid,
  p_participante uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_part public.pvh_participantes%ROWTYPE;
  v_existente numeric(16,2);
  v_total_alocado numeric(16,2);
  v_cobertura_atual numeric(16,2);
  v_devido numeric(16,2);
  v_saldo numeric(16,2);
  v_restante numeric(16,2);
  v_valor numeric(16,2);
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para vincular saldo de Nota de Empenho.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  SELECT *
    INTO v_part
    FROM public.pvh_participantes
   WHERE id = p_participante
   FOR UPDATE;

  IF v_emp.id IS NULL OR v_part.id IS NULL THEN
    RAISE EXCEPTION 'Nota de Empenho ou participante não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.prestador_id <> v_part.prestador_id THEN
    RAISE EXCEPTION 'A Nota de Empenho pertence a outra instituição.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.status <> 'ativo' OR COALESCE(v_emp.valor_total, 0) <= 0 THEN
    RAISE EXCEPTION 'A Nota de Empenho ainda não está emitida.'
      USING ERRCODE = '23514';
  END IF;

  SELECT valor_alocado
    INTO v_existente
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho
     AND participante_id = p_participante
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_total_alocado
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho;

  SELECT COALESCE(SUM(valor_alocado), 0)
    INTO v_cobertura_atual
    FROM public.pvh_empenho_alocacoes
   WHERE participante_id = p_participante;

  v_devido := COALESCE(v_part.valor_municipal, v_part.valor_estadual, 0);
  v_saldo := GREATEST(COALESCE(v_emp.valor_total, 0) - v_total_alocado, 0);
  v_restante := GREATEST(v_devido - v_cobertura_atual, 0);
  v_valor := LEAST(v_saldo, v_restante);

  IF v_valor <= 0.009 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.pvh_empenho_alocacoes (
    empenho_id,
    participante_id,
    valor_alocado,
    observacao,
    created_by
  )
  VALUES (
    p_empenho,
    p_participante,
    v_valor,
    'Saldo de NE reaproveitado automaticamente nesta competência.',
    auth.uid()
  );

  RETURN v_valor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 4. Exclusão segura do fluxo criado na própria competência
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_excluir_fluxo_empenho(
  p_empenho uuid,
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_nome text;
  v_assinaturas jsonb;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir fluxo de empenho.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fluxo de empenho não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.solicitacao_competencia_id IS DISTINCT FROM p_comp THEN
    RAISE EXCEPTION
      'Este fluxo não foi criado nesta competência e não pode ser excluído por aqui.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
     WHERE a.empenho_id = p_empenho
       AND p.competencia_id <> p_comp
  ) THEN
    RAISE EXCEPTION
      'Esta NE já foi utilizada em outra competência. Preserve o fluxo e remova apenas vínculos específicos, quando permitido.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a
        ON a.id = s.alocacao_id
     WHERE a.empenho_id = p_empenho
  ) THEN
    RAISE EXCEPTION
      'Este fluxo já possui subempenho vinculado e não pode ser excluído.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    INTO v_assinaturas
    FROM public.pvh_empenho_solicitacao_assinaturas s
   WHERE s.empenho_id = p_empenho;

  SELECT nome INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  INSERT INTO public.historico_logs (
    pvh_competencia_id,
    usuario_id,
    usuario_nome,
    acao,
    detalhes
  )
  VALUES (
    p_comp,
    auth.uid(),
    v_nome,
    'PVH · exclusão controlada do fluxo de empenho',
    jsonb_build_object(
      'empenho', to_jsonb(v_emp),
      'assinaturas', v_assinaturas
    )
  );

  DELETE FROM public.pvh_empenho_solicitacao_assinaturas
   WHERE empenho_id = p_empenho;

  DELETE FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = p_empenho;

  DELETE FROM public.pvh_empenhos
   WHERE id = p_empenho;

  -- Se a Etapa 3 já havia sido concluída, a exclusão deve aparecer como
  -- pendência de reconferência, nunca como regressão silenciosa.
  PERFORM public.pvh_marcar_reconferencia(p_comp, 3);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_fluxo_empenho(uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_fluxo_empenho(uuid, uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 5. Conclusão da Etapa 3 passa a exigir as 6 assinaturas
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
    JOIN public.prestadores pr ON pr.id = p.prestador_id
    WHERE p.competencia_id = p_comp
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_coberto
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
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
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_empenhos e ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND (
         e.status <> 'ativo'
         OR NULLIF(btrim(e.numero_ne), '') IS NULL
         OR e.numero_ne !~ '^\d{1,8}/\d{4}$'
         OR COALESCE(e.valor_total, 0) <= 0
         OR NULLIF(btrim(e.solicitacao_sei_numero), '') IS NULL
         OR NULLIF(btrim(e.solicitacao_sei_link), '') IS NULL
         OR e.solicitacao_sei_link !~* '^https?://'
         OR e.solicitacao_data IS NULL
         OR NULLIF(btrim(e.cr_dotacao), '') IS NULL
         OR NULLIF(btrim(e.fonte_recurso), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_numero), '') IS NULL
         OR NULLIF(btrim(e.nota_empenho_sei_link), '') IS NULL
         OR e.nota_empenho_sei_link !~* '^https?://'
       )
  ) THEN
    RAISE EXCEPTION
      'Toda NE utilizada precisa ter Solicitação e Nota de Empenho integralmente rastreadas.'
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
         e.solicitacao_enviada_aco IS DISTINCT FROM true
         OR e.solicitacao_enviada_sefaz IS DISTINCT FROM true
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
                  'comissao',
                  'diretor_financeiro'
                ]::text[]
              )
         ) <> 6
       )
  ) THEN
    RAISE EXCEPTION
      'Toda Solicitação nova precisa passar por SES.UFI.ACO, seis assinaturas e SEFAZ.UCG.AEO antes da conclusão da Etapa 3.'
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


NOTIFY pgrst, 'reload schema';
