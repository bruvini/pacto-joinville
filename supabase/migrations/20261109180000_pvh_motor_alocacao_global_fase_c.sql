-- PVH Fase C: motor transacional e monotônico de cobertura por NE.
-- Pré-requisitos: Fases A e B. NÃO recalcula histórico nesta migration.
-- Saldo = valor emitido - SUM(alocações) - SUM(anulações efetivas).
-- A seleção dos meses é autorização de uso, NÃO reserva financeira.
BEGIN;

-- Política de abrangência: registros legados só valem nos meses efetivamente
-- utilizados ou na origem da solicitação, nunca em novos meses por inferência.
CREATE OR REPLACE FUNCTION public.pvh_ne_competencia_elegivel(
  p_empenho uuid, p_competencia text
) RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.pvh_empenho_competencias m
      JOIN public.pvh_empenhos e ON e.id = m.empenho_id
     WHERE m.empenho_id = p_empenho
       AND m.competencia = p_competencia
       AND (
         m.origem_vinculo = 'confirmada'
         OR m.origem_vinculo = 'historica_alocacao'
         OR (
           m.origem_vinculo = 'historica_origem_pendente'
           AND e.valor_solicitado IS NULL
           AND EXISTS (
             SELECT 1 FROM public.pvh_competencias c
             WHERE c.id = e.solicitacao_competencia_id
               AND c.competencia = p_competencia
           )
         )
       )
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_competencia_elegivel(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_ne_competencia_elegivel(uuid,text)
  TO authenticated, service_role;

-- Invariantes que valem também para RPCs antigas e CRUD direto:
-- serializa cada prestador antes de comprometer qualquer valor.
CREATE OR REPLACE FUNCTION public.pvh_ne_guard_alocacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_part public.pvh_participantes%ROWTYPE;
  v_comp text;
  v_usado numeric(16,2);
  v_anulado numeric(16,2);
  v_outros_part numeric(16,2);
  v_devido numeric(16,2);
  v_old_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_old_id := OLD.id; END IF;
  SELECT * INTO v_emp FROM public.pvh_empenhos WHERE id = NEW.empenho_id;
  SELECT * INTO v_part FROM public.pvh_participantes WHERE id = NEW.participante_id;
  IF v_emp.id IS NULL OR v_part.id IS NULL THEN
    RAISE EXCEPTION 'NE ou instituição de alocação inexistente.' USING ERRCODE='23503';
  END IF;

  -- Chave compartilhada pelo motor e todos os escritores de alocação.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pvh-ne-prestador:' || v_emp.prestador_id::text, 0)
  );
  SELECT * INTO v_emp FROM public.pvh_empenhos WHERE id = NEW.empenho_id FOR UPDATE;
  IF v_emp.prestador_id <> v_part.prestador_id OR v_emp.status <> 'ativo'
     OR NULLIF(btrim(v_emp.numero_ne),'') IS NULL THEN
    RAISE EXCEPTION 'NE inativa ou vinculada a instituição diferente.'
      USING ERRCODE='23514';
  END IF;

  SELECT competencia INTO v_comp FROM public.pvh_competencias
   WHERE id = v_part.competencia_id;
  IF NOT public.pvh_ne_competencia_elegivel(NEW.empenho_id, v_comp) THEN
    RAISE EXCEPTION 'Competência % não está abrangida pela NE. Confirme a solicitação antes de utilizá-la.',v_comp
      USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.valor_alocado IS DISTINCT FROM OLD.valor_alocado
     AND EXISTS (SELECT 1 FROM public.pvh_subempenhos WHERE alocacao_id = OLD.id) THEN
    RAISE EXCEPTION 'Alocação já vinculada a subempenho. Corrija por procedimento formal, sem redistribuição automática.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
     NEW.empenho_id IS DISTINCT FROM OLD.empenho_id
     OR NEW.participante_id IS DISTINCT FROM OLD.participante_id
  ) THEN
    RAISE EXCEPTION 'Não é permitido transferir uma alocação entre NE ou competência.'
      USING ERRCODE='23514';
  END IF;

  SELECT COALESCE(SUM(valor_alocado),0) INTO v_usado
    FROM public.pvh_empenho_alocacoes
   WHERE empenho_id = NEW.empenho_id
     AND (v_old_id IS NULL OR id <> v_old_id);
  SELECT COALESCE(SUM(valor_anulado),0) INTO v_anulado
    FROM public.pvh_empenho_anulacoes WHERE empenho_id = NEW.empenho_id;
  IF NEW.valor_alocado <= 0 OR
     v_usado + NEW.valor_alocado + v_anulado >
     COALESCE(v_emp.valor_total,0) + 0.009 THEN
    RAISE EXCEPTION 'Saldo global insuficiente na NE %: valor emitido já está comprometido ou anulado.',v_emp.numero_ne
      USING ERRCODE='23514';
  END IF;

  SELECT COALESCE(SUM(valor_alocado),0) INTO v_outros_part
    FROM public.pvh_empenho_alocacoes
   WHERE participante_id = NEW.participante_id
     AND (v_old_id IS NULL OR id <> v_old_id);
  v_devido := COALESCE(v_part.valor_municipal,v_part.valor_estadual);
  IF v_devido IS NULL OR v_devido <= 0
    OR v_outros_part + NEW.valor_alocado > v_devido + 0.009 THEN
    RAISE EXCEPTION 'Alocação excede a necessidade oficial desta instituição na competência.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_guard_alocacao()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pvh_ne_guard_alocacao
  ON public.pvh_empenho_alocacoes;
CREATE TRIGGER trg_pvh_ne_guard_alocacao
  BEFORE INSERT OR UPDATE OF valor_alocado,empenho_id,participante_id
  ON public.pvh_empenho_alocacoes FOR EACH ROW
  EXECUTE FUNCTION public.pvh_ne_guard_alocacao();

-- Valor nominal nunca pode ser reduzido abaixo do compromisso registrado,
-- inclusive por uma operação anterior ao novo motor.
CREATE OR REPLACE FUNCTION public.pvh_ne_guard_emissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_alocado numeric(16,2);
  v_anulado numeric(16,2);
BEGIN
  IF NEW.valor_total IS NOT DISTINCT FROM OLD.valor_total
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  -- UPDATE already holds the NE row lock. Do not acquire an advisory
  -- lock AFTER this row lock: it would invert order with the allocator.
  SELECT COALESCE(SUM(valor_alocado),0) INTO v_alocado
    FROM public.pvh_empenho_alocacoes WHERE empenho_id = OLD.id;
  SELECT COALESCE(SUM(valor_anulado),0) INTO v_anulado
    FROM public.pvh_empenho_anulacoes WHERE empenho_id = OLD.id;

  IF v_alocado + v_anulado > COALESCE(NEW.valor_total,0) + 0.009 THEN
    RAISE EXCEPTION 'Valor emitido não pode ficar abaixo do total comprometido e anulado.'
      USING ERRCODE='23514';
  END IF;
  IF v_alocado > 0 AND NEW.status IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'Não é possível inativar NE com utilização documentada. É necessário procedimento contábil formal.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_guard_emissao()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pvh_ne_guard_emissao ON public.pvh_empenhos;
CREATE TRIGGER trg_pvh_ne_guard_emissao
  BEFORE UPDATE OF valor_total,status ON public.pvh_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_guard_emissao();

-- Só adiciona cobertura faltante; nunca redistribui/remova alocação antiga.
-- Um lock transacional por prestador cobre todas as competências, inclusive
-- consultas concorrentes provenientes de dois computadores.
CREATE OR REPLACE FUNCTION public.pvh_sincronizar_cobertura_competencia(
  p_comp uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_part public.pvh_participantes%ROWTYPE;
  v_emp record;
  v_necessario numeric(16,2);
  v_atual numeric(16,2);
  v_falta numeric(16,2);
  v_total_ne numeric(16,2);
  v_anulado numeric(16,2);
  v_saldo numeric(16,2);
  v_valor numeric(16,2);
  v_inserido numeric(16,2) := 0;
  v_faltante numeric(16,2) := 0;
  v_preparados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para sincronizar cobertura do PVH.'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_comp FROM public.pvh_competencias WHERE id=p_comp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE='23503';
  END IF;
  IF v_comp.status = 'encerrada' THEN
    RETURN jsonb_build_object('situacao','encerrada','alocado',0,'faltante',0);
  END IF;
  IF COALESCE((v_comp.etapas_concluidas ->> '1')::boolean,false) IS DISTINCT FROM true
     OR 1 = ANY(COALESCE(v_comp.etapas_reconferir,'{}'::integer[]))
     OR NULLIF(btrim(v_comp.portaria_municipal_numero),'') IS NULL
     OR v_comp.portaria_municipal_data IS NULL THEN
    RETURN jsonb_build_object(
      'situacao','aguardando_validacao_oficial','alocado',0,'faltante',0
    );
  END IF;

  FOR v_part IN
    SELECT * FROM public.pvh_participantes
    WHERE competencia_id = p_comp
    ORDER BY prestador_id,id
  LOOP
    -- Adquire sempre antes de bloquear linhas financeiras e antes de
    -- verificar somatórios globais. O trigger usa a MESMA chave.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('pvh-ne-prestador:' || v_part.prestador_id::text,0)
    );
    SELECT * INTO v_part FROM public.pvh_participantes
      WHERE id=v_part.id FOR UPDATE;

    v_necessario := COALESCE(v_part.valor_municipal,v_part.valor_estadual);
    IF v_necessario IS NULL OR v_necessario <= 0 THEN
      CONTINUE;
    END IF;
    SELECT COALESCE(SUM(valor_alocado),0) INTO v_atual
      FROM public.pvh_empenho_alocacoes WHERE participante_id=v_part.id;
    v_falta := GREATEST(v_necessario-v_atual,0);
    IF v_falta <= 0.009 THEN CONTINUE; END IF;

    -- NEs efetivamente emitidas, autorizadas para ESTE mês. Mais antiga
    -- primeiro; se faltar, a próxima complementa sem deslocar as anteriores.
    FOR v_emp IN
      SELECT e.id,e.valor_total
      FROM public.pvh_empenhos e
      WHERE e.prestador_id = v_part.prestador_id
        AND e.ano = split_part(v_comp.competencia,'/',2)::integer
        AND e.status='ativo'
        AND NULLIF(btrim(e.numero_ne),'') IS NOT NULL
        AND COALESCE(e.valor_total,0)>0
        AND public.pvh_ne_competencia_elegivel(e.id,v_comp.competencia)
        AND (
          e.solicitacao_competencia_id IS NULL
          OR e.valor_solicitado IS NULL -- legado preservado
          OR (
            e.solicitacao_enviada_aco IS TRUE
            AND e.solicitacao_enviada_sefaz IS TRUE
            AND public.pvh_assinaturas_obrigatorias_empenho_ok(e.id)
          )
        )
      ORDER BY COALESCE(e.data_emissao,e.solicitacao_data,e.created_at::date),
               e.created_at,e.id
    LOOP
      SELECT COALESCE(SUM(valor_alocado),0) INTO v_total_ne
        FROM public.pvh_empenho_alocacoes WHERE empenho_id=v_emp.id;
      SELECT COALESCE(SUM(valor_anulado),0) INTO v_anulado
        FROM public.pvh_empenho_anulacoes WHERE empenho_id=v_emp.id;
      v_saldo := GREATEST(v_emp.valor_total-v_total_ne-v_anulado,0);
      v_valor := LEAST(v_falta,v_saldo);
      IF v_valor > 0.009 THEN
        INSERT INTO public.pvh_empenho_alocacoes (
          empenho_id, participante_id,valor_alocado,observacao,created_by
        ) VALUES (
          v_emp.id,v_part.id,v_valor,
          'Alocação automática Fase C; ordenação cronológica da NE e saldo global disponível.',
          auth.uid()
        );
        v_falta := GREATEST(v_falta-v_valor,0);
        v_inserido := v_inserido+v_valor;
        v_preparados := v_preparados+1;
      END IF;
      EXIT WHEN v_falta <= 0.009;
    END LOOP;
    v_faltante := v_faltante + v_falta;
  END LOOP;
  RETURN jsonb_build_object(
    'situacao',CASE WHEN v_faltante > 0.009 THEN 'cobertura_parcial'
      ELSE 'sincronizada' END,
    'alocado',v_inserido,'faltante',v_faltante,'novas_alocacoes',v_preparados
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pvh_sincronizar_cobertura_competencia(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pvh_sincronizar_cobertura_competencia(uuid)
 TO authenticated,service_role;

-- Compatibilidade: função antiga agora só adiciona cobertura, não
-- favorece NEs mais recentes nem mexe em documentos em andamento.
CREATE OR REPLACE FUNCTION public.pvh_rebalancear_alocacoes_origem(
  p_participante uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_comp uuid;
BEGIN
  SELECT competencia_id INTO v_comp
    FROM public.pvh_participantes WHERE id=p_participante;
  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'Participante não encontrado.' USING ERRCODE='23503';
  END IF;
  PERFORM public.pvh_sincronizar_cobertura_competencia(v_comp);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.pvh_rebalancear_alocacoes_origem(uuid)
 FROM PUBLIC,anon,authenticated;

-- A operação manual antiga respeita o mês autorizado e a ordem global
-- do motor: ela não permite escolher outra NE para furar a fila.
CREATE OR REPLACE FUNCTION public.pvh_alocar_saldo_empenho(
  p_empenho uuid,p_participante uuid
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_comp uuid; v_mes text; v_valor numeric(16,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alocar NE.' USING ERRCODE='42501';
  END IF;
  SELECT p.competencia_id,c.competencia INTO v_comp,v_mes
   FROM public.pvh_participantes p
   JOIN public.pvh_competencias c ON c.id=p.competencia_id
   JOIN public.pvh_empenhos e ON e.prestador_id=p.prestador_id
   WHERE p.id=p_participante AND e.id=p_empenho;
  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'NE incompatível com a instituição.' USING ERRCODE='23514';
  END IF;
  IF NOT public.pvh_ne_competencia_elegivel(p_empenho,v_mes) THEN
    RAISE EXCEPTION 'Essa NE não abrange a competência solicitada.'
      USING ERRCODE='23514';
  END IF;
  PERFORM public.pvh_sincronizar_cobertura_competencia(v_comp);
  SELECT COALESCE(SUM(valor_alocado),0) INTO v_valor
   FROM public.pvh_empenho_alocacoes
   WHERE empenho_id=p_empenho AND participante_id=p_participante;
  RETURN v_valor;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pvh_alocar_saldo_empenho(uuid,uuid)
 TO authenticated,service_role;

-- NÃO rodar backfill no BEGIN/COMMIT desta migration: execução requer
-- valores oficiais, confirmação municipal e usuário autorizado.
COMMIT;
