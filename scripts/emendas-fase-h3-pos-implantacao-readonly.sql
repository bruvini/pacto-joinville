-- PACTO Joinville · H3 — Pós-implantação H1 e regressão financeira (somente leitura).
-- Executar DEPOIS de H1, em homologação e após implantação.
-- Contagens de cenários = 0 significam AINDA NÃO TESTADO, não "aprovado".
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

SELECT jsonb_build_object(
 'coletado_em',to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'instalacao',jsonb_build_object(
  'visao_legado',to_regclass('public.emenda_h_legado_conferencia') IS NOT NULL,
  'visao_invocadora',(
   SELECT 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
   FROM pg_class c WHERE c.oid='public.emenda_h_legado_conferencia'::regclass
  ),
  'conversao_automatica_desabilitada',(
   SELECT count(*)=0 FROM public.emenda_h_legado_conferencia
   WHERE coalesce(elegivel_conversao_automatica,false)
  ),
  'rls_tabelas_operacionais',(
   SELECT count(*)=0 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN('r','p')
    AND (c.relname='emendas' OR c.relname LIKE 'emenda_%')
    AND NOT c.relrowsecurity
  ),
  'gatilhos_f3',(
   SELECT count(*)=16 FROM pg_trigger
   WHERE NOT tgisinternal AND tgname LIKE 'guard_f_%'
  )
 ),
 'legado',jsonb_build_object(
  'fontes_identificadas',(SELECT count(*) FROM public.emenda_h_legado_conferencia),
  'sem_evidencia_suficiente',(
   SELECT count(*) FROM public.emenda_h_legado_conferencia
   WHERE situacao_evidencia='pendente_conferencia'),
  'com_referencia_sei',(
   SELECT count(*) FROM public.emenda_h_legado_conferencia
   WHERE situacao_evidencia='evidencia_documental_presente'),
  'liberacoes_preservadas',(SELECT count(*) FROM public.emenda_liberacoes),
  'pagamentos_preservados',(SELECT count(*) FROM public.emenda_blocos_pagamento),
  'documentos_fluxo_preservados',(SELECT count(*) FROM public.emenda_fluxo_documentos),
  'historico_preservado',(SELECT count(*) FROM public.emenda_historico)
 ),
 'integridade',jsonb_build_object(
  'ne_com_saldo_negativo',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE saldo_disponivel_anular<0 OR saldo_a_anular_fechamento<0),
  'ne_com_pagamento_excedente',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE saldo_de_pagamentos_pendentes<0),
  'ne_com_modelos_conflitantes',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE modelo_financeiro='conflito_entre_modelos'),
  'comp_sem_execucao_inconsistente',(
   SELECT count(*) FROM public.emenda_f_competencias_painel
   WHERE declarada_sem_execucao AND situacao_competencia<>'sem_execucao'),
  'subempenho_sem_solicitacao_valida',(
   SELECT count(*) FROM public.emenda_subempenhos s
   LEFT JOIN public.emenda_lancamentos l ON l.id=s.lancamento_id
   WHERE l.id IS NULL OR l.solicitacao_id IS DISTINCT FROM s.solicitacao_id),
  'subempenho_com_aviso_sem_conclusao',(
   SELECT count(*) FROM public.emenda_subempenhos s
   WHERE s.status='subempenhado' AND NOT EXISTS(
    SELECT 1 FROM public.emenda_subempenho_conclusoes c
    JOIN public.emenda_subempenho_documentos d ON d.id=c.documento_id
    WHERE d.subempenho_id=s.id AND d.tipo='aviso_subempenho')
  ),
  'pagamentos_superam_subempenhado',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel p
   WHERE p.valor_pago_liquido>p.valor_subempenhado),
  'programacoes_superam_subempenhado',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel p
   WHERE p.valor_programado>p.valor_subempenhado),
  'parcela_pago_liquido_negativo',(
   SELECT count(*) FROM public.emenda_pagamento_parcelas_painel p
   WHERE p.valor_pago_liquido<0),
  'ne_conciliada_com_pendencia',(
   SELECT count(*) FROM public.emenda_f_ne_painel p
   WHERE p.conciliada AND NOT p.pronta_conciliar)
 ),
 'cenarios_em_dados',jsonb_build_object(
  'ne_multicompetencia',(
   SELECT count(*) FROM (
    SELECT lancamento_id FROM public.emenda_lancamento_meses
    GROUP BY lancamento_id HAVING count(DISTINCT competencia_id)>1
   ) x
  ),
  'competencia_atendida_por_multiplas_nes',(
   SELECT count(*) FROM (
    SELECT emenda_id,competencia_id FROM public.emenda_ne_competencias
    WHERE status='ativa' GROUP BY emenda_id,competencia_id
    HAVING count(DISTINCT solicitacao_id)>1
   ) x
  ),
  'multiplos_subempenhos_na_mesma_competencia',(
   SELECT count(*) FROM (
    SELECT lancamento_id,competencia_id FROM public.emenda_subempenhos
    WHERE status<>'cancelado' GROUP BY lancamento_id,competencia_id HAVING count(*)>1
   ) x
  ),
  'pagamentos_parciais',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel
   WHERE status_subempenho='subempenhado' AND valor_pago_liquido>0 AND saldo_a_pagar>0
  ),
  'pagamentos_conciliados',(SELECT count(*) FROM public.emenda_pagamento_conciliacoes
   WHERE evento='conciliado'),
  'devolucoes_ou_estornos',(SELECT count(*) FROM public.emenda_pagamento_ajustes),
  'retificacoes_documentais',(SELECT count(*) FROM public.emenda_pagamento_retificacoes),
  'anulacoes',(SELECT count(*) FROM public.emenda_anulacoes),
  'competencias_sem_execucao',(SELECT count(*) FROM public.emenda_encerramentos_sem_execucao),
  'nes_conciliadas',(SELECT count(*) FROM public.emenda_conciliacoes_ne)
 ),
 'parecer','A integridade automatizada nao substitui testes de perfis, backup restaurado, concorrencia e revisao ACP.'
) AS auditoria_fase_h;

COMMIT;
