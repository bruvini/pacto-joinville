-- PVH · Fase E — anulação CONTÁBIL integral do saldo residual da NE.
-- DEPENDE das migrations A, B, C e D. Não executa anulações históricas.
-- Aplicar apenas em homologação primeiro, com backup restaurável verificado.
BEGIN;

-- A declaração do SEI não pode ser substituída por uma "anulação pendente".
-- Valor contabilmente anulado deve corresponder exatamente ao saldo ainda livre.
CREATE OR REPLACE FUNCTION public.pvh_registrar_anulacao_residual(
  p_empenho uuid,
  p_valor_contabil numeric,
  p_data_anulacao date,
  p_numero_sei text,
  p_link_sei text,
  p_motivo text,
  p_confirmar_sem_uso_futuro boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_prestador uuid;
  v_emp public.pvh_empenhos%ROWTYPE;
  v_alocado numeric(16,2);
  v_saldo numeric(16,2);
  v_anulacao uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Somente ACP ou administração podem registrar anulação contábil de NE.'
      USING ERRCODE='42501';
  END IF;
  IF p_confirmar_sem_uso_futuro IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Confirme expressamente que o saldo não será utilizado em outras competências.'
      USING ERRCODE='23514';
  END IF;
  IF p_valor_contabil IS NULL OR p_valor_contabil <= 0
     OR p_valor_contabil <> round(p_valor_contabil,2) THEN
    RAISE EXCEPTION 'Informe o valor exato em reais e centavos constante do ato contábil.'
      USING ERRCODE='23514';
  END IF;
  IF p_data_anulacao IS NULL OR p_data_anulacao > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do ato de anulação deve ser válida e não pode estar no futuro.'
      USING ERRCODE='23514';
  END IF;
  IF length(btrim(COALESCE(p_numero_sei,''))) = 0
     OR COALESCE(p_link_sei,'') !~* '^https://[^[:space:]]+$'
     OR length(btrim(COALESCE(p_motivo,''))) < 15 THEN
    RAISE EXCEPTION 'Informe número e link HTTPS do SEI e justificativa de pelo menos 15 caracteres.'
      USING ERRCODE='23514';
  END IF;

  SELECT prestador_id INTO v_prestador
  FROM public.pvh_empenhos WHERE id=p_empenho;
  IF v_prestador IS NULL THEN
    RAISE EXCEPTION 'NE não encontrada.' USING ERRCODE='23503';
  END IF;

  -- Mesma ordem do motor da Fase C: lock por prestador ANTES do lock da NE.
  -- A contagem e o INSERT são atômicos sob o lock transacional.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pvh-ne-prestador:' || v_prestador::text,0)
  );
  SELECT * INTO v_emp FROM public.pvh_empenhos
   WHERE id=p_empenho FOR UPDATE;
  IF NOT FOUND OR v_emp.prestador_id IS DISTINCT FROM v_prestador THEN
    RAISE EXCEPTION 'A NE mudou durante a conferência. Reabra o registro.'
      USING ERRCODE='40001';
  END IF;
  IF v_emp.status <> 'ativo'
     OR NULLIF(btrim(COALESCE(v_emp.numero_ne,'')),'') IS NULL
     OR COALESCE(v_emp.valor_total,0) <= 0 THEN
    RAISE EXCEPTION 'Somente NE efetivamente emitida e ativa admite anulação residual.'
      USING ERRCODE='23514';
  END IF;
  IF v_emp.data_emissao IS NOT NULL AND p_data_anulacao < v_emp.data_emissao THEN
    RAISE EXCEPTION 'A anulação não pode anteceder a emissão da NE.'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pvh_empenho_anulacoes WHERE empenho_id=p_empenho
  ) THEN
    RAISE EXCEPTION 'Anulação contábil já registrada para esta NE. Não há segunda baixa automática.'
      USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(SUM(valor_alocado),0) INTO v_alocado
  FROM public.pvh_empenho_alocacoes WHERE empenho_id=p_empenho;
  v_saldo := COALESCE(v_emp.valor_total,0)-v_alocado;
  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'Não existe saldo residual positivo a anular.'
      USING ERRCODE='23514';
  END IF;
  IF p_valor_contabil <> v_saldo THEN
    RAISE EXCEPTION 'Valor divergente: ato contábil (%) e saldo residual da NE (%). Reconcilie antes de registrar.',
      p_valor_contabil,v_saldo USING ERRCODE='23514';
  END IF;

  INSERT INTO public.pvh_empenho_anulacoes
    (empenho_id,valor_anulado,data_anulacao,numero_sei,link_sei,motivo,created_by)
  VALUES (
    p_empenho,v_saldo,p_data_anulacao,btrim(p_numero_sei),btrim(p_link_sei),
    btrim(p_motivo),auth.uid()
  ) RETURNING id INTO v_anulacao;

  RETURN jsonb_build_object(
    'anulacao_id',v_anulacao,'numero_ne',v_emp.numero_ne,
    'valor_emitido',v_emp.valor_total,'valor_preservado',v_alocado,
    'valor_anulado',v_saldo,'saldo_restante',0,
    'situacao','anulacao_contabil_registrada'
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pvh_registrar_anulacao_residual(
  uuid,numeric,date,text,text,text,boolean
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pvh_registrar_anulacao_residual(
  uuid,numeric,date,text,text,text,boolean
) TO authenticated,service_role;

-- Depois da baixa, a cadeia financeira é IMUTÁVEL. Mesmo liberar alocação
-- antiga não pode recriar saldo passível de reutilização.
CREATE OR REPLACE FUNCTION public.pvh_ne_guard_apos_anulacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $guard$
DECLARE
  v_empenho uuid;
  v_prestador uuid;
BEGIN
  IF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    v_empenho := OLD.empenho_id;
    SELECT prestador_id INTO v_prestador
      FROM public.pvh_empenhos WHERE id=v_empenho;
    -- DELETE não é protegido pelo trigger C: usa o mesmo advisory lock
    -- antes de excluir, evitando corrida com anulação simultânea.
    IF v_prestador IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('pvh-ne-prestador:' || v_prestador::text,0)
      );
    END IF;
  ELSE
    -- UPDATE da NE já possui lock de linha. Nunca adquirir advisory lock
    -- DEPOIS do lock de NE (ordem invertida geraria deadlock).
    v_empenho := OLD.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pvh_empenho_anulacoes WHERE empenho_id=v_empenho
  ) THEN
    RAISE EXCEPTION 'NE com anulação contabilizada: alocações, valor e identificação estão congelados. Corrija por processo formal.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_guard_apos_anulacao()
FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_pvh_ne_congelar_alocacoes_anuladas
ON public.pvh_empenho_alocacoes;
CREATE TRIGGER trg_pvh_ne_congelar_alocacoes_anuladas
BEFORE UPDATE OR DELETE ON public.pvh_empenho_alocacoes
FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_guard_apos_anulacao();

DROP TRIGGER IF EXISTS trg_pvh_ne_congelar_emissao_anulada
ON public.pvh_empenhos;
CREATE TRIGGER trg_pvh_ne_congelar_emissao_anulada
BEFORE UPDATE OF numero_ne,valor_total,status,prestador_id ON public.pvh_empenhos
FOR EACH ROW
WHEN (
  OLD.numero_ne IS DISTINCT FROM NEW.numero_ne OR
  OLD.valor_total IS DISTINCT FROM NEW.valor_total OR
  OLD.status IS DISTINCT FROM NEW.status OR
  OLD.prestador_id IS DISTINCT FROM NEW.prestador_id
)
EXECUTE FUNCTION public.pvh_ne_guard_apos_anulacao();

-- Mesmo o service_role não deve corrigir/apagar silenciosamente um ato
-- financeiro já gravado: retificação precisa de migração auditada específica.
CREATE OR REPLACE FUNCTION public.pvh_ne_guard_anulacao_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  RAISE EXCEPTION 'A anulação contábil é imutável. Realize retificação formal e auditada.'
    USING ERRCODE='23514';
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_guard_anulacao_imutavel()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_pvh_ne_anulacao_imutavel ON public.pvh_empenho_anulacoes;
CREATE TRIGGER trg_pvh_ne_anulacao_imutavel
BEFORE UPDATE OR DELETE ON public.pvh_empenho_anulacoes
FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_guard_anulacao_imutavel();

-- A NE pode servir a várias competências: registrar o mesmo fato contábil
-- na linha do tempo de CADA competência que a utilizou, sem duplicar valores.
CREATE OR REPLACE FUNCTION public.pvh_ne_auditar_anulacao_multicompetencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $audit$
DECLARE
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id=auth.uid();
  WITH competencias AS (
    SELECT e.solicitacao_competencia_id AS competencia_id
      FROM public.pvh_empenhos e
     WHERE e.id=NEW.empenho_id AND e.solicitacao_competencia_id IS NOT NULL
    UNION
    SELECT p.competencia_id
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id=a.participante_id
     WHERE a.empenho_id=NEW.empenho_id
  ), destinos AS (
    SELECT competencia_id FROM competencias
    UNION ALL
    SELECT NULL::uuid WHERE NOT EXISTS (SELECT 1 FROM competencias)
  )
  INSERT INTO public.historico_logs
    (pvh_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  SELECT
    competencia_id,auth.uid(),COALESCE(v_nome,'Sistema'),
    'PVH · insert: pvh_empenho_anulacoes',
    jsonb_build_object(
      'empenho_id',NEW.empenho_id,
      'antes',NULL,
      'depois',to_jsonb(NEW)
    )
  FROM destinos;
  RETURN NEW;
END;
$audit$;
REVOKE EXECUTE ON FUNCTION public.pvh_ne_auditar_anulacao_multicompetencia()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_pvh_ne_anulacoes_audit ON public.pvh_empenho_anulacoes;
CREATE TRIGGER trg_pvh_ne_anulacoes_audit
AFTER INSERT ON public.pvh_empenho_anulacoes
FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_auditar_anulacao_multicompetencia();

NOTIFY pgrst, 'reload schema';
COMMIT;
