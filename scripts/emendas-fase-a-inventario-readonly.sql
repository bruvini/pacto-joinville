-- PACTO / EMENDAS / FASE A
-- Inventario reproduzivel: SOMENTE LEITURA. NAO executa alteracoes.
-- Registrar saidas em ambiente institucional seguro, sem divulgar UUIDs nem documentos.
BEGIN TRANSACTION READ ONLY;

-- 1. Inventario fisico: tabelas e contagens exatas.
SELECT t.tabela, t.registros FROM (
  SELECT 'emendas' AS tabela, count(*) registros FROM public.emendas
  UNION ALL SELECT 'emenda_lancamentos',count(*) FROM public.emenda_lancamentos
  UNION ALL SELECT 'emenda_lancamento_meses',count(*) FROM public.emenda_lancamento_meses
  UNION ALL SELECT 'emenda_competencias',count(*) FROM public.emenda_competencias
  UNION ALL SELECT 'emenda_competencias_filhas',count(*) FROM public.emenda_competencias_filhas
  UNION ALL SELECT 'emenda_solicitacoes',count(*) FROM public.emenda_solicitacoes
  UNION ALL SELECT 'emenda_etapas_documentais',count(*) FROM public.emenda_etapas_documentais
  UNION ALL SELECT 'emenda_assinaturas_conferidas',count(*) FROM public.emenda_assinaturas_conferidas
  UNION ALL SELECT 'emenda_pareceres_financeiros',count(*) FROM public.emenda_pareceres_financeiros
  UNION ALL SELECT 'emenda_envios_sefaz',count(*) FROM public.emenda_envios_sefaz
  UNION ALL SELECT 'emenda_fluxo_documentos',count(*) FROM public.emenda_fluxo_documentos
  UNION ALL SELECT 'emenda_fluxo_assinaturas',count(*) FROM public.emenda_fluxo_assinaturas
  UNION ALL SELECT 'emenda_comprovantes',count(*) FROM public.emenda_comprovantes
  UNION ALL SELECT 'emenda_liberacoes',count(*) FROM public.emenda_liberacoes
  UNION ALL SELECT 'emenda_blocos_pagamento',count(*) FROM public.emenda_blocos_pagamento
  UNION ALL SELECT 'emenda_anulacoes',count(*) FROM public.emenda_anulacoes
  UNION ALL SELECT 'emenda_conciliacoes_ne',count(*) FROM public.emenda_conciliacoes_ne
  UNION ALL SELECT 'emenda_encerramentos_sem_execucao',count(*) FROM public.emenda_encerramentos_sem_execucao
  UNION ALL SELECT 'emenda_documentos',count(*) FROM public.emenda_documentos
  UNION ALL SELECT 'emenda_fontes',count(*) FROM public.emenda_fontes
  UNION ALL SELECT 'emenda_ajustes_valor',count(*) FROM public.emenda_ajustes_valor
  UNION ALL SELECT 'emenda_historico',count(*) FROM public.emenda_historico
) t ORDER BY t.tabela;

-- 2. Financeiro por emenda; nao expor documentos, credenciais ou identificadores internos.
SELECT e.numero,e.situacao,e.valor_autorizado_inicial,e.valor_rendimento,
 (SELECT count(*) FROM public.emenda_lancamentos l WHERE l.emenda_id=e.id) lancamentos,
 (SELECT count(*) FROM public.emenda_competencias c WHERE c.emenda_id=e.id) competencias,
 (SELECT count(*) FROM public.emenda_solicitacoes s WHERE s.emenda_id=e.id AND s.numero_ne IS NOT NULL) nes,
 (SELECT coalesce(sum(s.valor_ne),0) FROM public.emenda_solicitacoes s WHERE s.emenda_id=e.id AND s.numero_ne IS NOT NULL) total_ne,
 (SELECT count(*) FROM public.emenda_liberacoes x WHERE x.emenda_id=e.id) liberacoes,
 (SELECT coalesce(sum(x.valor),0) FROM public.emenda_liberacoes x WHERE x.emenda_id=e.id) total_liberado,
 (SELECT count(*) FROM public.emenda_blocos_pagamento x WHERE x.emenda_id=e.id) pagamentos,
 (SELECT coalesce(sum(x.valor),0) FROM public.emenda_blocos_pagamento x WHERE x.emenda_id=e.id) total_pago,
 (SELECT count(*) FROM public.emenda_anulacoes x WHERE x.emenda_id=e.id) anulacoes,
 (SELECT coalesce(sum(x.valor),0) FROM public.emenda_anulacoes x WHERE x.emenda_id=e.id) total_anulado
FROM public.emendas e ORDER BY e.numero;

-- 3. Integridade referencial e economica: resultado esperado = 0 por coluna.
SELECT
 (SELECT count(*) FROM public.emenda_lancamentos l WHERE l.solicitacao_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.emenda_solicitacoes s WHERE s.id=l.solicitacao_id)) lancamentos_orfaos,
 (SELECT count(*) FROM public.emenda_lancamentos l JOIN public.emenda_solicitacoes s
  ON s.id=l.solicitacao_id WHERE l.emenda_id<>s.emenda_id) solicitacoes_emendas_divergentes,
 (SELECT count(*) FROM public.emenda_lancamento_meses m JOIN public.emenda_lancamentos l
  ON l.id=m.lancamento_id WHERE m.emenda_id<>l.emenda_id) meses_emendas_divergentes,
 (SELECT count(*) FROM public.emenda_lancamento_meses m LEFT JOIN public.emenda_competencias c
  ON c.id=m.competencia_id WHERE c.id IS NULL OR c.emenda_id<>m.emenda_id) meses_competencias_invalidas,
 (SELECT count(*) FROM public.emenda_competencias_filhas f JOIN public.emenda_solicitacoes s
  ON s.id=f.solicitacao_id WHERE f.emenda_id<>s.emenda_id) filhas_emenda_divergente,
 (SELECT count(*) FROM public.emenda_fluxo_documentos d JOIN public.emenda_lancamentos l
  ON l.id=d.lancamento_id WHERE d.emenda_id<>l.emenda_id) fluxo_emenda_divergente,
 (SELECT count(*) FROM public.emenda_fluxo_documentos d WHERE d.contexto LIKE 'lib:%'
  AND NOT EXISTS (SELECT 1 FROM public.emenda_lancamento_meses m
   WHERE m.lancamento_id=d.lancamento_id AND m.competencia_id=d.competencia_id)) fluxo_competencia_sem_mes,
 (SELECT count(*) FROM public.emenda_liberacoes x WHERE NOT EXISTS
  (SELECT 1 FROM public.emenda_lancamento_meses m
   WHERE m.lancamento_id=x.lancamento_id AND m.competencia_id=x.competencia_id)) liberacoes_orfas,
 (SELECT count(*) FROM public.emenda_blocos_pagamento p LEFT JOIN public.emenda_liberacoes l
  ON l.id=p.liberacao_id WHERE l.id IS NULL OR l.lancamento_id<>p.lancamento_id) pagamentos_sem_liberacao,
 (SELECT count(*) FROM public.emenda_solicitacoes s WHERE s.numero_ne IS NOT NULL AND
  (s.valor_ne IS NULL OR s.valor_ne<=0)) nes_inconsistentes;

-- 4. Auditoria: evitar interpretar DELETE de trigger + snapshot como dois lancamentos diferentes.
SELECT tabela,acao,count(*) eventos,count(DISTINCT registro_id) registros_distintos
FROM public.emenda_historico
GROUP BY tabela,acao ORDER BY tabela,acao;
SELECT count(*) AS exclusoes_lancamento,
 count(DISTINCT registro_id) AS lancamentos_distintos_excluidos,
 count(*) FILTER (WHERE anterior ? 'registros_operacionais') AS snapshots_ampliados,
 count(*) FILTER (WHERE anterior->'lancamento'->>'status'='emitido') AS snapshots_status_emitido
FROM public.emenda_historico
WHERE tabela='emenda_lancamentos' AND acao='DELETE';

-- 5. Integridade da protecao DB: verificar versao instalada e permissao.
SELECT p.proname,p.prosecdef AS security_definer,
 md5(pg_get_functiondef(p.oid)) AS hash_definicao,
 (position('Exclusão definitiva restrita a rascunho' in pg_get_functiondef(p.oid))>0)
  AS guard_fase_a_instalado
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='emenda_excluir_lancamento';

SELECT c.relname AS tabela,c.relrowsecurity AS rls_ativa
FROM pg_class c WHERE c.relnamespace='public'::regnamespace
 AND c.relname LIKE 'emenda%' AND c.relkind='r' ORDER BY c.relname;

COMMIT;
