-- PACTO Joinville · Fase H0 · Fotografia antes de homologar/migrar.
-- Executar no banco alvo e na cópia de homologação, guardar os dois JSON.
-- NÃO chama RPCs e NÃO modifica dados.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

SELECT jsonb_build_object(
 'capturado_em',to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'tabelas',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'lancamentos',(SELECT count(*) FROM public.emenda_lancamentos),
  'solicitacoes_ne',(SELECT count(*) FROM public.emenda_solicitacoes),
  'competencias',(SELECT count(*) FROM public.emenda_competencias),
  'meses',(SELECT count(*) FROM public.emenda_lancamento_meses),
  'distribuicoes',(SELECT count(*) FROM public.emenda_ne_competencias),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'documentos_subempenho',(SELECT count(*) FROM public.emenda_subempenho_documentos),
  'parcelas',(SELECT count(*) FROM public.emenda_pagamento_parcelas),
  'programacoes',(SELECT count(*) FROM public.emenda_pagamento_programacoes),
  'pagamentos_comprovados',(SELECT count(*) FROM public.emenda_pagamento_comprovantes),
  'ajustes_pagamentos',(SELECT count(*) FROM public.emenda_pagamento_ajustes),
  'conciliacoes_parcelas',(SELECT count(*) FROM public.emenda_pagamento_conciliacoes),
  'anulacoes',(SELECT count(*) FROM public.emenda_anulacoes),
  'conciliacoes_ne',(SELECT count(*) FROM public.emenda_conciliacoes_ne),
  'liberacoes_legadas',(SELECT count(*) FROM public.emenda_liberacoes),
  'pagamentos_legados',(SELECT count(*) FROM public.emenda_blocos_pagamento),
  'comprovantes_legados',(SELECT count(*) FROM public.emenda_comprovantes),
  'fluxo_documentos_legado',(SELECT count(*) FROM public.emenda_fluxo_documentos),
  'historico',(SELECT count(*) FROM public.emenda_historico)
 ),
 'financeiro',jsonb_build_object(
  'valor_total_ne_emitida',(SELECT coalesce(sum(valor_ne_emitida),0) FROM public.emenda_f_ne_painel),
  'valor_total_ne_liquida',(SELECT coalesce(sum(ne_liquida),0) FROM public.emenda_f_ne_painel),
  'valor_anulado',(SELECT coalesce(sum(total_anulado),0) FROM public.emenda_f_ne_painel),
  'distribuido',(SELECT coalesce(sum(distribuido_competencias),0) FROM public.emenda_f_ne_painel),
  'compromissos_novos',(SELECT coalesce(sum(compromissos_novos),0) FROM public.emenda_f_ne_painel),
  'liberacoes_legadas',(SELECT coalesce(sum(liberacoes_legadas),0) FROM public.emenda_f_ne_painel),
  'pago_liquido_novo',(SELECT coalesce(sum(pago_liquido_novo),0) FROM public.emenda_f_ne_painel),
  'pago_legado',(SELECT coalesce(sum(pago_legado),0) FROM public.emenda_f_ne_painel),
  'livre_para_anulacao',(SELECT coalesce(sum(greatest(saldo_disponivel_anular,0)),0)
    FROM public.emenda_f_ne_painel WHERE NOT conciliada)
 ),
 'legado',jsonb_build_object(
  'documentos_lib_sem_liberacao',(
   SELECT count(*) FROM public.emenda_fluxo_documentos d
   WHERE d.contexto LIKE 'lib:%' AND d.liberacao_id IS NULL
  ),
  'pagamentos_sem_liberacao_valida',(
   SELECT count(*) FROM public.emenda_blocos_pagamento p
   LEFT JOIN public.emenda_liberacoes l ON l.id=p.liberacao_id
   WHERE l.id IS NULL
  ),
  'pagamentos_sem_documento_sei',(
   SELECT count(*) FROM public.emenda_blocos_pagamento p
   WHERE nullif(btrim(p.numero_sei),'') IS NULL
    OR p.link_sei !~* '^https://[^[:space:]]+$'
  ),
  'liberacoes_sem_documento_sei',(
   SELECT count(*) FROM public.emenda_liberacoes l
   WHERE nullif(btrim(l.numero_sei),'') IS NULL
    OR l.link_sei !~* '^https://[^[:space:]]+$'
  ),
  'historico_exclusoes',(
   SELECT count(*) FROM public.emenda_historico
   WHERE acao='DELETE'
  )
 ),
 'integridade',jsonb_build_object(
  'nes_saldo_anulavel_negativo',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_disponivel_anular<0),
  'nes_pagamento_excede_compromissos',(
   SELECT count(*) FROM public.emenda_f_ne_painel WHERE saldo_de_pagamentos_pendentes<0),
  'subempenho_sem_ne_vinculada',(
   SELECT count(*) FROM public.emenda_subempenhos s LEFT JOIN public.emenda_lancamentos l
    ON l.id=s.lancamento_id AND l.solicitacao_id=s.solicitacao_id
   WHERE l.id IS NULL
  ),
  'modelos_legado_novo_conflitantes',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE modelo_financeiro='conflito_entre_modelos'),
  'competencias_encerradas_inconsistentes',(
   SELECT count(*) FROM public.emenda_f_competencias_painel
   WHERE declarada_sem_execucao AND situacao_competencia<>'sem_execucao'),
  'nes_conciliadas_pendentes',(
   SELECT count(*) FROM public.emenda_f_ne_painel
   WHERE conciliada AND NOT pronta_conciliar)
 ),
 'assinatura_financeira',jsonb_build_object(
  'ne_emitidas',(SELECT count(*) FROM public.emenda_solicitacoes WHERE numero_ne IS NOT NULL),
  'ne_conciliadas',(SELECT count(*) FROM public.emenda_conciliacoes_ne),
  'eventos_auditoria',(SELECT count(*) FROM public.emenda_historico),
  'hash_auditoria',(SELECT md5(coalesce(string_agg(
   id::text||':'||tabela||':'||acao||':'||coalesce(ocorrido_em::text,''),
   '|' ORDER BY id),'SEM_EVENTOS')) FROM public.emenda_historico),
  'hash_livros_financeiros',(
   SELECT md5(coalesce(string_agg(
    lancamento_id::text||':'||coalesce(valor_ne_emitida,0)::text||':'||
    coalesce(total_anulado,0)::text||':'||coalesce(compromissos_novos,0)::text||':'||
    coalesce(pago_liquido_novo,0)::text,
    '|' ORDER BY lancamento_id),'SEM_NES'))
   FROM public.emenda_f_ne_painel
  )
 )
) AS auditoria_h0;

COMMIT;
