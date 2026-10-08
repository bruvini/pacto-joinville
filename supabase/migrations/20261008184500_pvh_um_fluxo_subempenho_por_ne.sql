-- PVH — uma cadeia de Subempenho/Liquidação por Nota de Empenho utilizada
--
-- Corrige a semântica da Etapa 4:
--   • cada NE usada na competência possui uma única alocação;
--   • cada alocação possui uma única cadeia de Subempenho/Liquidação;
--   • ao cadastrar uma NE complementar na própria competência, a cobertura é
--     redistribuída entre as NEs da competência, em vez de deixar toda a
--     cobertura concentrada na primeira NE;
--   • NEs reaproveitadas de competências anteriores preservam sua alocação;
--   • fluxos complementares legados são realocados para a NE correspondente
--     quando o valor coincide com a nova alocação.
--
-- Exemplo 09/2026:
-- HMSJ: 4086/2026 = 1.416.115,56 + 6016/2026 = 359.386,53
-- Bethesda: 4083/2026 = 640.000,00 + 6015/2026 = 600.000,00

-- ============================================================================
-- 1. Redistribui a cobertura entre as NEs originadas na própria competência
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_rebalancear_alocacoes_origem(
  p_participante uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part public.pvh_participantes%ROWTYPE;
  v_devido numeric(16,2);
  v_fixo numeric(16,2);
  v_restante numeric(16,2);
  v_outros numeric(16,2);
  v_disponivel numeric(16,2);
  v_desejado numeric(16,2);
  v_alocacao uuid;
  v_emp record;
BEGIN
  SELECT *
    INTO v_part
    FROM public.pvh_participantes
   WHERE id = p_participante
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante PVH não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  v_devido := COALESCE(v_part.valor_municipal, v_part.valor_estadual, 0);

  -- NEs reaproveitadas de outra competência são intencionais e permanecem fixas.
  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_fixo
    FROM public.pvh_empenho_alocacoes a
    JOIN public.pvh_empenhos e ON e.id = a.empenho_id
   WHERE a.participante_id = p_participante
     AND e.solicitacao_competencia_id IS DISTINCT FROM v_part.competencia_id;

  v_restante := GREATEST(v_devido - v_fixo, 0);

  -- Dentro da própria competência, a NE mais nova/complementar recebe primeiro
  -- o valor que consegue cobrir. As NEs anteriores absorvem o restante.
  FOR v_emp IN
    SELECT e.id, e.valor_total, e.created_at
      FROM public.pvh_empenhos e
     WHERE e.prestador_id = v_part.prestador_id
       AND e.solicitacao_competencia_id = v_part.competencia_id
       AND e.status = 'ativo'
       AND NULLIF(btrim(e.numero_ne), '') IS NOT NULL
       AND COALESCE(e.valor_total, 0) > 0
     ORDER BY e.created_at DESC, e.id DESC
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_outros
      FROM public.pvh_empenho_alocacoes a
     WHERE a.empenho_id = v_emp.id
       AND a.participante_id <> p_participante;

    v_disponivel := GREATEST(COALESCE(v_emp.valor_total, 0) - v_outros, 0);
    v_desejado := LEAST(v_restante, v_disponivel);

    SELECT a.id
      INTO v_alocacao
      FROM public.pvh_empenho_alocacoes a
     WHERE a.empenho_id = v_emp.id
       AND a.participante_id = p_participante
     LIMIT 1;

    IF v_desejado > 0.009 THEN
      IF v_alocacao IS NULL THEN
        INSERT INTO public.pvh_empenho_alocacoes (
          empenho_id,
          participante_id,
          valor_alocado,
          observacao,
          created_by
        )
        VALUES (
          v_emp.id,
          p_participante,
          v_desejado,
          'Cobertura redistribuída automaticamente entre as NEs da competência.',
          auth.uid()
        );
      ELSE
        UPDATE public.pvh_empenho_alocacoes
           SET valor_alocado = v_desejado,
               observacao = 'Cobertura redistribuída automaticamente entre as NEs da competência.'
         WHERE id = v_alocacao
           AND abs(valor_alocado - v_desejado) >= 0.01;
      END IF;

      v_restante := GREATEST(v_restante - v_desejado, 0);
    ELSIF v_alocacao IS NOT NULL THEN
      -- Se a NE deixou de participar da cobertura e a Etapa 4 ainda não começou,
      -- o vínculo pode sair. Caso já exista cadeia documental, preservamos o
      -- registro e deixamos a revisão explícita para não apagar evidência.
      IF NOT EXISTS (
        SELECT 1
          FROM public.pvh_subempenhos s
         WHERE s.alocacao_id = v_alocacao
      ) THEN
        DELETE FROM public.pvh_empenho_alocacoes
         WHERE id = v_alocacao;
      END IF;
    END IF;

    v_alocacao := NULL;
  END LOOP;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_rebalancear_alocacoes_origem(uuid)
  FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 2. Ao registrar uma NE da própria competência, redistribui a cobertura
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
  v_total_alocado_outros numeric(16,2);
  v_alocacao_atual numeric(16,2);
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar Nota de Empenho do PVH.'
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
    RAISE EXCEPTION 'A Nota de Empenho pertence a outra instituição.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL
     AND v_emp.solicitacao_competencia_id <> v_part.competencia_id THEN
    RAISE EXCEPTION 'Este fluxo de Solicitação foi aberto em outra competência.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_numero_ne), '') IS NULL
     OR p_numero_ne !~ '^[0-9]{1,8}/[0-9]{4}$' THEN
    RAISE EXCEPTION
      'Número da NE inválido. Use o formato XXXX/% e o exercício da competência.',
      v_emp.ano
      USING ERRCODE = '23514';
  END IF;

  IF split_part(p_numero_ne, '/', 2)::integer <> v_emp.ano THEN
    RAISE EXCEPTION 'O exercício da Nota de Empenho deve ser %.',
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
    RAISE EXCEPTION 'Informe Nº SEI e Link SEI válidos da Nota de Empenho.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL THEN
    IF v_emp.solicitacao_enviada_aco IS DISTINCT FROM true
       OR v_emp.solicitacao_enviada_sefaz IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'A Solicitação precisa passar por SES.UFI.ACO e SEFAZ.UCG.AEO antes do registro da NE.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT public.pvh_assinaturas_obrigatorias_empenho_ok(p_empenho) THEN
      RAISE EXCEPTION
        'A Solicitação de NE exige as três assinaturas obrigatórias antes do registro da Nota de Empenho.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_total_alocado_outros
    FROM public.pvh_empenho_alocacoes a
   WHERE a.empenho_id = p_empenho
     AND a.participante_id <> p_participante;

  IF v_total_alocado_outros > p_valor_total + 0.009 THEN
    RAISE EXCEPTION
      'O novo valor total da NE é menor que o valor já comprometido em outras competências.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_empenhos
     SET numero_ne = btrim(p_numero_ne),
         valor_total = p_valor_total,
         nota_empenho_sei_numero = btrim(p_numero_sei),
         nota_empenho_sei_link = btrim(p_link_sei),
         status = 'ativo'
   WHERE id = p_empenho;

  IF v_emp.solicitacao_competencia_id = v_part.competencia_id THEN
    PERFORM public.pvh_rebalancear_alocacoes_origem(p_participante);
  END IF;

  SELECT a.valor_alocado
    INTO v_alocacao_atual
    FROM public.pvh_empenho_alocacoes a
   WHERE a.empenho_id = p_empenho
     AND a.participante_id = p_participante
   LIMIT 1;

  RETURN COALESCE(v_alocacao_atual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_registrar_nota_empenho(
  uuid, uuid, text, numeric, text, text
) TO authenticated, service_role;


-- ============================================================================
-- 3. Reutilizar NE histórica também redistribui as NEs originadas no mês
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
    RAISE EXCEPTION 'Sem permissão para vincular saldo de Nota de Empenho.'
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

    IF NOT public.pvh_assinaturas_obrigatorias_empenho_ok(p_empenho) THEN
      RAISE EXCEPTION
        'A Solicitação desta NE não possui as três assinaturas obrigatórias ativas.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT a.valor_alocado
    INTO v_existente
    FROM public.pvh_empenho_alocacoes a
   WHERE a.empenho_id = p_empenho
     AND a.participante_id = p_participante
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_total_alocado
    FROM public.pvh_empenho_alocacoes a
   WHERE a.empenho_id = p_empenho;

  SELECT COALESCE(SUM(a.valor_alocado), 0)
    INTO v_cobertura_atual
    FROM public.pvh_empenho_alocacoes a
   WHERE a.participante_id = p_participante;

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

  PERFORM public.pvh_rebalancear_alocacoes_origem(p_participante);

  RETURN v_valor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid, uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 4. Fluxo da Etapa 4: exatamente uma cadeia por alocação/NE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_sincronizar_valor_subempenho_alocacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.valor_alocado IS DISTINCT FROM OLD.valor_alocado
     AND (
       SELECT count(*)
         FROM public.pvh_subempenhos s
        WHERE s.alocacao_id = NEW.id
     ) = 1
  THEN
    UPDATE public.pvh_subempenhos
       SET valor = NEW.valor_alocado
     WHERE alocacao_id = NEW.id
       AND abs(valor - NEW.valor_alocado) >= 0.01;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.pvh_sincronizar_valor_subempenho_alocacao()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_sincronizar_valor_subempenho_alocacao
  ON public.pvh_empenho_alocacoes;

CREATE TRIGGER trg_pvh_sincronizar_valor_subempenho_alocacao
  AFTER UPDATE OF valor_alocado
  ON public.pvh_empenho_alocacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_sincronizar_valor_subempenho_alocacao();


CREATE OR REPLACE FUNCTION public.pvh_preparar_etapa4(
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part record;
  v_aloc record;
  v_candidato uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_any_role(
       auth.uid(),
       ARRAY['admin','acp','aco']::public.app_role[]
     ) THEN
    RAISE EXCEPTION 'Sem permissão para preparar a Etapa 4 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pvh_competencias WHERE id = p_comp
  ) THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  FOR v_part IN
    SELECT p.id
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
  LOOP
    PERFORM public.pvh_rebalancear_alocacoes_origem(v_part.id);

    -- Reaproveita fluxo complementar legado quando o valor coincide exatamente
    -- com a alocação da NE que antes não aparecia na Etapa 4.
    FOR v_aloc IN
      SELECT a.id, a.valor_alocado
        FROM public.pvh_empenho_alocacoes a
       WHERE a.participante_id = v_part.id
         AND NOT EXISTS (
           SELECT 1
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
         )
       ORDER BY a.created_at
    LOOP
      SELECT s.id
        INTO v_candidato
        FROM public.pvh_subempenhos s
        JOIN public.pvh_empenho_alocacoes origem
          ON origem.id = s.alocacao_id
       WHERE origem.participante_id = v_part.id
         AND origem.id <> v_aloc.id
         AND (
           SELECT count(*)
             FROM public.pvh_subempenhos sx
            WHERE sx.alocacao_id = origem.id
         ) > 1
         AND abs(s.valor - v_aloc.valor_alocado) < 0.01
       ORDER BY s.created_at DESC
       LIMIT 1;

      IF v_candidato IS NOT NULL THEN
        UPDATE public.pvh_subempenhos
           SET alocacao_id = v_aloc.id
         WHERE id = v_candidato;
      END IF;

      v_candidato := NULL;
    END LOOP;

    -- Onde ainda não havia cadeia, cria o único fluxo da NE já com o valor
    -- coberto naquela competência.
    INSERT INTO public.pvh_subempenhos (
      alocacao_id,
      valor,
      created_by
    )
    SELECT
      a.id,
      a.valor_alocado,
      auth.uid()
    FROM public.pvh_empenho_alocacoes a
    WHERE a.participante_id = v_part.id
      AND NOT EXISTS (
        SELECT 1
          FROM public.pvh_subempenhos s
         WHERE s.alocacao_id = a.id
      );
  END LOOP;

  -- Se algum caso legado ainda tiver mais de um fluxo na mesma NE, não
  -- apagamos documento histórico silenciosamente. A conclusão ficará bloqueada
  -- até revisão manual.
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_preparar_etapa4(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_preparar_etapa4(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 5. Corrige os registros existentes e protege novos casos
-- ============================================================================

DO $$
DECLARE
  v_comp record;
BEGIN
  FOR v_comp IN
    SELECT DISTINCT c.id
      FROM public.pvh_competencias c
      JOIN public.pvh_participantes p ON p.competencia_id = c.id
      JOIN public.pvh_empenhos e
        ON e.prestador_id = p.prestador_id
       AND e.solicitacao_competencia_id = c.id
     WHERE e.status = 'ativo'
  LOOP
    -- Executamos a mesma preparação com privilégio da migration.
    PERFORM public.pvh_preparar_etapa4(v_comp.id);
  END LOOP;
END $$;

-- A migration acima tende a resolver os fluxos complementares legados.
-- Só cria a proteção 1:1 se não restar nenhum caso histórico ambíguo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT s.alocacao_id
      FROM public.pvh_subempenhos s
     GROUP BY s.alocacao_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pvh_subempenhos_alocacao
      ON public.pvh_subempenhos (alocacao_id);
  END IF;
END $$;


-- ============================================================================
-- 6. Etapa 4 passa a exigir exatamente uma cadeia completa por NE/alocação
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
       IS DISTINCT FROM true
     OR COALESCE((v_comp.etapas_concluidas ->> '3')::boolean, false)
       IS DISTINCT FROM true
     OR 2 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[]))
     OR 3 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[]))
  THEN
    RAISE EXCEPTION
      'Conclua e reconfira as Etapas 2 e 3 antes de concluir o Subempenho.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp.recurso_fms_data IS NULL
     OR COALESCE(v_comp.recurso_fms_valor, 0) <= 0
     OR NULLIF(btrim(v_comp.recurso_fms_referencia), '') IS NULL
     OR NULLIF(btrim(v_comp.recurso_fms_link), '') IS NULL
     OR (
       v_comp.recurso_fms_link !~* '^https?://'
       AND v_comp.recurso_fms_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
     )
     OR abs(
       COALESCE(v_comp.recurso_fms_valor, 0)
       - COALESCE(
           (
             SELECT SUM(p.valor_estadual)
               FROM public.pvh_participantes p
              WHERE p.competencia_id = p_comp
           ),
           0
         )
     ) >= 0.01
  THEN
    RAISE EXCEPTION
      'O recebimento no FMS precisa estar completo antes da Etapa 4.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui Notas de Empenho vinculadas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
       AND (
         (SELECT count(*) FROM public.pvh_subempenhos s WHERE s.alocacao_id = a.id) <> 1
         OR EXISTS (
           SELECT 1
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
              AND (
                abs(s.valor - a.valor_alocado) >= 0.01
                OR NULLIF(btrim(s.solicitacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.solicitacao_sei_link), '') IS NULL
                OR (
                  s.solicitacao_sei_link !~* '^https?://'
                  AND s.solicitacao_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
                OR NULLIF(btrim(s.movimento_liquidacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_liquidacao_sei_link), '') IS NULL
                OR (
                  s.movimento_liquidacao_sei_link !~* '^https?://'
                  AND s.movimento_liquidacao_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
                OR s.movimento_liquidacao_encaminhado_sefaz IS DISTINCT FROM true
                OR NULLIF(btrim(s.movimento_subempenho_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_subempenho_sei_link), '') IS NULL
                OR (
                  s.movimento_subempenho_sei_link !~* '^https?://'
                  AND s.movimento_subempenho_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
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
      'Cada Nota de Empenho precisa possuir exatamente uma cadeia de Subempenho/Liquidação completa.'
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

NOTIFY pgrst, 'reload schema';
