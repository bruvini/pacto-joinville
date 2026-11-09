-- PVH · Fase B — solicitação com valor pedido e meses abrangidos.
-- Pré-requisito: 20261109140000_pvh_ne_multicompetencia_fase_a.sql
-- Não modifica as regras de distribuição, subempenho nem de conclusão de etapas.
BEGIN;

-- Protege valores solicitados depois de encaminhamento à ACO/SEFAZ.
-- Permite apenas alterações de rascunhos, sem atingir NEs já emitidas.
CREATE OR REPLACE FUNCTION public.pvh_proteger_valor_solicitado()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF NEW.valor_solicitado IS DISTINCT FROM OLD.valor_solicitado
    AND (
      OLD.solicitacao_enviada_aco IS TRUE OR
      OLD.solicitacao_enviada_sefaz IS TRUE OR
      OLD.status = 'ativo'
    ) THEN
    RAISE EXCEPTION
      'Valor solicitado congelado após encaminhamento ou emissão da NE.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard$;

REVOKE EXECUTE ON FUNCTION public.pvh_proteger_valor_solicitado()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pvh_proteger_valor_solicitado
  ON public.pvh_empenhos;
CREATE TRIGGER trg_pvh_proteger_valor_solicitado
  BEFORE UPDATE OF valor_solicitado ON public.pvh_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_proteger_valor_solicitado();

-- Proteção adicional do marco ACO: novas solicitações explicitamente
-- configuradas devem ter pedido e meses válidos. Legado continua válido
-- sem valor solicitado presumido.
CREATE OR REPLACE FUNCTION public.pvh_validar_solicitacao_multicompetencia_aco()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF NEW.solicitacao_enviada_aco IS TRUE
     AND OLD.solicitacao_enviada_aco IS DISTINCT FROM TRUE
     AND (
       NEW.valor_solicitado IS NOT NULL OR EXISTS (
         SELECT 1 FROM public.pvh_empenho_competencias
         WHERE empenho_id = NEW.id AND origem_vinculo = 'confirmada'
       )
     )
     AND (
       NEW.valor_solicitado IS NULL OR NEW.valor_solicitado <= 0
       OR NOT EXISTS (
         SELECT 1 FROM public.pvh_empenho_competencias
         WHERE empenho_id = NEW.id AND origem_vinculo = 'confirmada'
       )
     )
  THEN
    RAISE EXCEPTION 'Informe valor solicitado e meses abrangidos antes de encaminhar à ACO.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public.pvh_validar_solicitacao_multicompetencia_aco()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pvh_validar_multicompetencia_aco ON public.pvh_empenhos;
CREATE TRIGGER trg_pvh_validar_multicompetencia_aco
  BEFORE UPDATE OF solicitacao_enviada_aco ON public.pvh_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_validar_solicitacao_multicompetencia_aco();

-- A gravação é atômica: dados da solicitação + valor pedido + todos os meses.
-- SECURITY DEFINER é necessário porque tabelas de abrangência são somente
-- leitura no client. Identidade e associação com instituição são revalidadas.
CREATE OR REPLACE FUNCTION public.pvh_salvar_solicitacao_multicompetencia(
  p_empenho uuid,
  p_participante uuid,
  p_competencia uuid,
  p_processo_anual uuid,
  p_numero_sei text,
  p_link_sei text,
  p_data date,
  p_cr text,
  p_fonte text,
  p_valor_solicitado numeric,
  p_meses text[]
)
RETURNS public.pvh_empenhos
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_part public.pvh_participantes%ROWTYPE;
  v_comp public.pvh_competencias%ROWTYPE;
  v_emp public.pvh_empenhos%ROWTYPE;
  v_ano integer;
  v_mes_origem text;
  v_meses text[];
  v_meses_atuais text[];
  v_solicitado numeric(16,2);
  v_bloqueado boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para salvar solicitação de NE.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_part FROM public.pvh_participantes
  WHERE id = p_participante;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_part.competencia_id IS DISTINCT FROM p_competencia THEN
    RAISE EXCEPTION 'Instituição não pertence à competência selecionada.'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_comp FROM public.pvh_competencias
  WHERE id = p_competencia;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '23503';
  END IF;
  IF v_comp.competencia !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' THEN
    RAISE EXCEPTION 'Competência de origem inválida.' USING ERRCODE = '23514';
  END IF;
  v_ano := split_part(v_comp.competencia,'/',2)::integer;
  v_mes_origem := v_comp.competencia;

  IF p_processo_anual IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pvh_processos_anuais
    WHERE id = p_processo_anual AND prestador_id = v_part.prestador_id
      AND ano = v_ano AND tipo = 'empenho'
  ) THEN
    RAISE EXCEPTION 'Processo anual incompatível com a instituição ou exercício.'
      USING ERRCODE = '23514';
  END IF;

  IF p_valor_solicitado IS NOT NULL AND (
    p_valor_solicitado <= 0 OR p_valor_solicitado > 99999999999999.99
    OR round(p_valor_solicitado,2) <> p_valor_solicitado
  ) THEN
    RAISE EXCEPTION 'Valor solicitado deve ser positivo e ter no máximo duas casas decimais.'
      USING ERRCODE = '23514';
  END IF;
  v_solicitado := p_valor_solicitado;

  SELECT COALESCE(array_agg(m ORDER BY m), '{}'::text[])
    INTO v_meses
  FROM (SELECT DISTINCT btrim(x) AS m FROM unnest(COALESCE(p_meses, '{}'::text[])) x) k;
  IF cardinality(v_meses) = 0 OR cardinality(v_meses) > 12 OR
     NOT (v_mes_origem = ANY(v_meses)) OR EXISTS (
       SELECT 1 FROM unnest(v_meses) x
       WHERE x !~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
          OR split_part(x,'/',2)::integer <> v_ano
     )
  THEN
    RAISE EXCEPTION 'Selecione de 1 a 12 meses do exercício, incluindo a competência de origem.'
      USING ERRCODE = '23514';
  END IF;

  IF p_empenho IS NOT NULL THEN
    SELECT * INTO v_emp FROM public.pvh_empenhos
    WHERE id = p_empenho FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '23503';
    END IF;
    IF v_emp.prestador_id IS DISTINCT FROM v_part.prestador_id OR
       v_emp.solicitacao_competencia_id IS DISTINCT FROM p_competencia THEN
      RAISE EXCEPTION 'Solicitação vinculada a outra instituição ou competência.'
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(array_agg(competencia ORDER BY competencia), '{}'::text[])
      INTO v_meses_atuais FROM public.pvh_empenho_competencias
      WHERE empenho_id = p_empenho;

    v_bloqueado := (
      v_emp.solicitacao_enviada_aco IS TRUE OR
      v_emp.solicitacao_enviada_sefaz IS TRUE OR
      v_emp.status = 'ativo'
    );
    IF v_bloqueado AND (
      v_solicitado IS DISTINCT FROM v_emp.valor_solicitado
      OR v_meses IS DISTINCT FROM v_meses_atuais
    ) THEN
      RAISE EXCEPTION 'Valor solicitado e meses abrangidos não podem ser alterados após encaminhamento ou emissão da NE.'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.pvh_empenhos
       SET solicitacao_sei_numero = NULLIF(btrim(p_numero_sei),''),
           solicitacao_sei_link = NULLIF(btrim(p_link_sei),''),
           solicitacao_data = p_data,
           cr_dotacao = NULLIF(btrim(p_cr),''),
           fonte_recurso = NULLIF(btrim(p_fonte),''),
           processo_anual_id = COALESCE(p_processo_anual, v_emp.processo_anual_id),
           valor_solicitado = v_solicitado
     WHERE id = p_empenho RETURNING * INTO v_emp;
  ELSE
    INSERT INTO public.pvh_empenhos (
      prestador_id, ano, solicitacao_competencia_id, processo_anual_id,
      solicitacao_sei_numero, solicitacao_sei_link, solicitacao_data,
      cr_dotacao, fonte_recurso, valor_solicitado, status, created_by
    ) VALUES (
      v_part.prestador_id, v_ano, p_competencia, p_processo_anual,
      NULLIF(btrim(p_numero_sei),''), NULLIF(btrim(p_link_sei),''),
      p_data, NULLIF(btrim(p_cr),''), NULLIF(btrim(p_fonte),''),
      v_solicitado, 'solicitada', auth.uid()
    ) RETURNING * INTO v_emp;
  END IF;

  IF NOT COALESCE(v_bloqueado, false) THEN
    -- Não remover mês com uso histórico ou alocação financeira já existente.
    -- Editar o planejamento nunca retroage a uma cobertura emitida.
    IF EXISTS (
      SELECT 1 FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
      JOIN public.pvh_competencias c ON c.id = p.competencia_id
      WHERE a.empenho_id = v_emp.id
        AND c.competencia <> ALL(v_meses)
    ) THEN
      RAISE EXCEPTION 'Há utilização financeira registrada em mês removido da abrangência.'
        USING ERRCODE = '23514';
    END IF;
    -- Nunca apagar meses legados durante uma edição da nova solicitação.
    DELETE FROM public.pvh_empenho_competencias
    WHERE empenho_id = v_emp.id
      AND origem_vinculo = 'confirmada'
      AND competencia <> ALL(v_meses);
    INSERT INTO public.pvh_empenho_competencias
      (empenho_id, competencia, origem_vinculo, observacao, created_by)
    SELECT v_emp.id, x, 'confirmada', 'Meses selecionados na solicitação de NE.', auth.uid()
    FROM unnest(v_meses) x
    ON CONFLICT (empenho_id, competencia) DO UPDATE
      SET origem_vinculo = 'confirmada',
          observacao = 'Meses selecionados na solicitação de NE.';
  END IF;
  RETURN v_emp;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.pvh_salvar_solicitacao_multicompetencia(
  uuid,uuid,uuid,uuid,text,text,date,text,text,numeric,text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_salvar_solicitacao_multicompetencia(
  uuid,uuid,uuid,uuid,text,text,date,text,text,numeric,text[]
) TO authenticated, service_role;

COMMIT;
