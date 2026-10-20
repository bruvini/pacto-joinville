-- Executar após a migration, no SQL Editor. Somente SELECT; não altera dados.
SELECT
  tgname AS gatilho_de_atesto_restante
FROM pg_trigger
WHERE tgrelid='public.lancamentos_pagamento'::regclass
  AND NOT tgisinternal AND
  tgname IN ('ec_integracao_valor_guard','ec_fontes_atesto_guard',
             'ec_fontes_atesto_insert_guard','zz_ec_atesto_origem_etapa6_guard');
-- Resultado esperado: nenhuma linha.

SELECT count(*) AS registros_origem_historica
FROM public.lancamentos_atesto_origem_historica;

SELECT
  count(*) FILTER (WHERE valor_atestado_automatico IS NOT NULL) AS antigos_automaticos_preservados,
  count(*) FILTER (WHERE ec_escolha_pendente IS TRUE) AS escolhas_historicas_pendentes,
  count(*) AS total_lancamentos
FROM public.lancamentos_pagamento;
-- Campos antigos podem continuar preenchidos: são históricos e não afetam o fluxo.

SELECT
  has_function_privilege('authenticated',
    'public.lancamentos_sincronizar_atesto_manual()', 'EXECUTE') AS sync_exposto_via_rpc;
-- Esperado: FALSE (função de trigger não deve ser chamada como RPC).

-- Bloqueio da função legada implantada com service_role:
SELECT
  CASE WHEN to_regclass('public.eletivas_competencias') IS NULL THEN FALSE
       ELSE has_table_privilege('service_role','public.eletivas_competencias','INSERT')
  END AS service_role_ainda_consegue_inserir;
-- Esperado: FALSE.
