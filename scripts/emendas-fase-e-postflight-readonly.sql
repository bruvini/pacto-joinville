-- PACTO · Emendas · Fase E · pós-flight SOMENTE LEITURA.
-- Requer E1, E2, E3 já aplicadas. Emite apenas uma linha JSON.
-- Não cria registros, não modifica saldos, não executa transferências.
BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
 'coletado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'instalacao',jsonb_build_object(
  'parcelas',to_regclass('public.emenda_pagamento_parcelas') IS NOT NULL,
  'programacoes',to_regclass('public.emenda_pagamento_programacoes') IS NOT NULL,
  'comprovantes',to_regclass('public.emenda_pagamento_comprovantes') IS NOT NULL,
  'ajustes',to_regclass('public.emenda_pagamento_ajustes') IS NOT NULL,
  'retificacoes',to_regclass('public.emenda_pagamento_retificacoes') IS NOT NULL,
  'conciliacoes',to_regclass('public.emenda_pagamento_conciliacoes') IS NOT NULL,
  'painel_parcelas',to_regclass('public.emenda_pagamento_parcelas_painel') IS NOT NULL,
  'painel_subempenhos',to_regclass('public.emenda_pagamento_subempenhos_painel') IS NOT NULL,
  'rpc_parcela',to_regprocedure('public.emenda_pag_parcela_criar(uuid,uuid)') IS NOT NULL,
  'rpc_programar',to_regprocedure('public.emenda_pag_programar(uuid,numeric,date,text,text,date,text,uuid)') IS NOT NULL,
  'rpc_comprovar',to_regprocedure('public.emenda_pag_comprovar(uuid,numeric,date,text,text,date,uuid)') IS NOT NULL,
  'rpc_ajustar',to_regprocedure('public.emenda_pag_ajustar(uuid,text,numeric,date,text,text,date,text,uuid)') IS NOT NULL,
  'rpc_retificar',to_regprocedure('public.emenda_pag_retificar(uuid,uuid,uuid,text,text,date,text,uuid)') IS NOT NULL,
  'rpc_conciliar',to_regprocedure('public.emenda_pag_conciliar(uuid,text,text,text,date,text,uuid)') IS NOT NULL,
  'rls_seis_tabelas',(
   SELECT count(*)=6 FROM pg_class c WHERE c.relnamespace='public'::regnamespace
    AND c.relname IN('emenda_pagamento_parcelas','emenda_pagamento_programacoes',
      'emenda_pagamento_comprovantes','emenda_pagamento_ajustes',
      'emenda_pagamento_retificacoes','emenda_pagamento_conciliacoes')
    AND c.relrowsecurity
  ),
  'views_security_invoker',(
   SELECT count(*)=2 FROM pg_class c
   WHERE c.oid IN('public.emenda_pagamento_parcelas_painel'::regclass,
                  'public.emenda_pagamento_subempenhos_painel'::regclass)
    AND 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
  ),
  'triggers_imutabilidade',(
   SELECT count(DISTINCT tgname) FROM pg_trigger WHERE NOT tgisinternal
   AND tgname IN('guard_emenda_pag_parc_immut','guard_emenda_pag_prog_immut',
     'guard_emenda_pag_comp_immut','guard_emenda_pag_ajuste_immut',
     'guard_emenda_pag_ret_immut','guard_emenda_pag_conc_immut')
  ),
  'legado_liberacao_obrigatoria',(
   SELECT is_nullable='NO' FROM information_schema.columns
   WHERE table_schema='public' AND table_name='emenda_blocos_pagamento'
    AND column_name='liberacao_id'
  )
 ),
 'registro',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'nes',(SELECT count(*) FROM public.emenda_solicitacoes WHERE numero_ne IS NOT NULL),
  'subempenhos_confirmados',(SELECT count(*) FROM public.emenda_subempenhos WHERE status='subempenhado'),
  'parcelas',(SELECT count(*) FROM public.emenda_pagamento_parcelas),
  'programacoes',(SELECT count(*) FROM public.emenda_pagamento_programacoes),
  'comprovantes',(SELECT count(*) FROM public.emenda_pagamento_comprovantes),
  'devolucoes',(SELECT count(*) FROM public.emenda_pagamento_ajustes WHERE tipo='devolucao'),
  'estornos',(SELECT count(*) FROM public.emenda_pagamento_ajustes WHERE tipo='estorno'),
  'retificacoes',(SELECT count(*) FROM public.emenda_pagamento_retificacoes),
  'conciliacoes',(SELECT count(*) FROM public.emenda_pagamento_conciliacoes WHERE evento='conciliado'),
  'reaberturas',(SELECT count(*) FROM public.emenda_pagamento_conciliacoes WHERE evento='reaberto'),
  'pagamentos_legados',(SELECT count(*) FROM public.emenda_blocos_pagamento)
 ),
 'integridade',jsonb_build_object(
  'subempenhos_com_pagamento_acima_valor',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE saldo_a_pagar<0
  ),
  'subempenhos_com_programacao_acima_valor',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE saldo_a_programar<0
  ),
  'parcelas_com_pago_liquido_negativo',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas_painel
   WHERE valor_pago_liquido<0
  ),
  'parcelas_com_pago_acima_programacao',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas_painel
   WHERE saldo_programacao_pendente<0
  ),
  'comprovante_sem_programacao',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas_painel
   WHERE comprovante_id IS NOT NULL AND programacao_id IS NULL
  ),
  'conciliados_com_saldo_pendente',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE conciliado AND (
     saldo_a_pagar<>0 OR saldo_a_programar<>0
   )
  ),
  'ajustes_superiores_ao_comprovante',(
   SELECT count(*) FROM public.emenda_pagamento_comprovantes c
   LEFT JOIN LATERAL (
    SELECT coalesce(sum(a.valor),0) AS total
    FROM public.emenda_pagamento_ajustes a WHERE a.comprovante_id=c.id
   ) x ON true WHERE x.total>c.valor_pago
  ),
  'documentos_com_relacao_inconsistente',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas p
   JOIN public.emenda_subempenhos s ON s.id=p.subempenho_id
   WHERE p.emenda_id<>s.emenda_id
  ),
  'conflitos_com_legado',(
   SELECT count(*) FROM public.emenda_ne_painel WHERE modelo_financeiro='conflito_entre_modelos'
  )
 ),
 'operacao',jsonb_build_object(
  'subempenhos_saldo_zerado_sem_conciliacao',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE situacao_pagamento='saldo_zerado_aguardando_conciliacao'
  ),
  'subempenhos_parcialmente_pagos',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE situacao_pagamento='pagamento_parcial'
  ),
  'parcelas_so_programadas',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas_painel
   WHERE situacao_parcela='programada_aguardando_pagamento'
  ),
  'subempenhos_com_multiplas_parcelas',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel WHERE quantidade_parcelas>1
  )
 )
) AS auditoria_fase_e;
COMMIT;
