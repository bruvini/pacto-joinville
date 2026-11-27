-- PACTO · Emendas · Fase F · pós-implantação somente leitura.
-- Executar APÓS F1, F2 e F3. Produz UMA linha JSON.
BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
 'coletado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'instalacao',jsonb_build_object(
  'painel_competencias',to_regclass('public.emenda_f_competencias_painel') IS NOT NULL,
  'painel_ne',to_regclass('public.emenda_f_ne_painel') IS NOT NULL,
  'painel_emenda',to_regclass('public.emenda_f_emenda_painel') IS NOT NULL,
  'tres_views_invocadoras',(
   SELECT count(*)=3 FROM pg_class c
   WHERE c.oid IN ('public.emenda_f_competencias_painel'::regclass,
    'public.emenda_f_ne_painel'::regclass,'public.emenda_f_emenda_painel'::regclass)
   AND 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
  ),
  'snapshot_total_comprometido',EXISTS(
   SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='emenda_conciliacoes_ne' AND column_name='total_comprometido'
  ),
  'snapshot_total_pago_liquido',EXISTS(
   SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='emenda_conciliacoes_ne' AND column_name='total_pago_liquido'
  ),
  'rpc_anular',to_regprocedure('public.emenda_anular_residual(uuid,numeric,text,text,text)') IS NOT NULL,
  'rpc_sem_execucao',to_regprocedure('public.emenda_encerrar_competencia_sem_execucao(uuid,uuid,text,text,text)') IS NOT NULL,
  'rpc_conciliar_ne',to_regprocedure('public.emenda_conciliar_encerrar_ne(uuid,text,text)') IS NOT NULL,
  'rpc_enviar_anulacao',to_regprocedure('public.emenda_fluxo_enviar(uuid)') IS NOT NULL,
  'rpc_avisar_anulacao',to_regprocedure('public.emenda_fluxo_finalizar_anulacao(uuid)') IS NOT NULL,
  'triggers_fase_f',(
   SELECT count(DISTINCT tgname) FROM pg_trigger WHERE NOT tgisinternal
   AND tgname IN (
    'guard_f_distribuicao_fechamento','guard_f_anulacoes_fechamento',
    'guard_f_liberacoes_fechamento','guard_f_pag_legado_fechamento',
    'guard_f_sem_execucao_fechamento','guard_f_subempenho_fechamento',
    'guard_f_pag_parcelas_fechamento','guard_f_pag_prog_fechamento',
    'guard_f_pag_comp_fechamento','guard_f_pag_ajuste_fechamento',
    'guard_f_pag_ret_fechamento','guard_f_pag_conc_fechamento',
    'guard_f_anulacao_imutavel','guard_f_sem_exec_imutavel',
    'guard_f_conc_immut','guard_f_conciliacao_validar'
   )
  )
 ),
 'registro',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'nes_emitidas',(SELECT count(*) FROM public.emenda_solicitacoes WHERE numero_ne IS NOT NULL),
  'nes_conciliadas',(SELECT count(*) FROM public.emenda_conciliacoes_ne),
  'competencias_sem_execucao',(SELECT count(*) FROM public.emenda_encerramentos_sem_execucao),
  'anulacoes',(SELECT count(*) FROM public.emenda_anulacoes),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'pagamentos_novos',(SELECT count(*) FROM public.emenda_pagamento_comprovantes),
  'pagamentos_legados',(SELECT count(*) FROM public.emenda_blocos_pagamento)
 ),
 'integridade',jsonb_build_object(
  'ne_com_saldo_anulavel_negativo',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_disponivel_anular<0
  ),
  'ne_com_saldo_a_anular_negativo',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_a_anular_fechamento<0
  ),
  'ne_com_pagamento_superior_compromissos',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_de_pagamentos_pendentes<0
  ),
  'competencias_sem_execucao_inconsistentes',(
   SELECT count(*) FROM public.emenda_f_competencias_painel
   WHERE declarada_sem_execucao AND situacao_competencia<>'sem_execucao'
  ),
  'nes_conciliadas_com_pendencias',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE conciliada AND NOT pronta_conciliar
  ),
  'nes_encerradas_sem_conciliacao',(
   SELECT count(*) FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id
   WHERE s.status='encerrada'
    AND NOT EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne c WHERE c.lancamento_id=l.id)
  ),
  'modelos_financeiros_conflitantes',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE modelo_financeiro='conflito_entre_modelos'
  ),
  'snapshot_compromissos_divergentes',(
   SELECT count(*) FROM public.emenda_conciliacoes_ne c
   JOIN public.emenda_f_ne_painel f ON f.lancamento_id=c.lancamento_id
   WHERE c.total_comprometido IS NOT NULL AND
    c.total_comprometido<>CASE WHEN f.liberacoes_legadas>0 THEN f.liberacoes_legadas
      ELSE f.compromissos_novos END
  ),
  'snapshot_pago_liquido_divergente',(
   SELECT count(*) FROM public.emenda_conciliacoes_ne c
   JOIN public.emenda_f_ne_painel f ON f.lancamento_id=c.lancamento_id
   WHERE c.total_pago_liquido IS NOT NULL AND
    c.total_pago_liquido<>CASE WHEN f.liberacoes_legadas>0 THEN f.pago_legado
      ELSE f.pago_liquido_novo END
  )
 ),
 'operacao',jsonb_build_object(
  'nes_aptas_conciliacao',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE pronta_conciliar AND NOT conciliada
  ),
  'nes_com_residual_para_anular',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_a_anular_fechamento>0
  ),
  'nes_com_distribuicao_a_rever',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE saldo_a_anular_fechamento>saldo_disponivel_anular
  ),
  'nes_com_pagamentos_parciais',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_de_pagamentos_pendentes>0
  ),
  'competencias_operacionais_pendentes',(
   SELECT count(*) FROM public.emenda_f_competencias_painel WHERE situacao_competencia='pendente'
  ),
  'emendas_totalmente_conciliadas',(
   SELECT count(*) FROM public.emenda_f_emenda_painel WHERE totalmente_conciliada
  ),
  'emendas_com_nes_pendentes',(
   SELECT count(*) FROM public.emenda_f_emenda_painel WHERE nes_pendentes>0
  )
 )
) AS auditoria_fase_f;

COMMIT;
