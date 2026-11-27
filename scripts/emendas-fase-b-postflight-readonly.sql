-- Emendas Fase B · Postflight somente leitura.
-- Reexecutar depois das migrations B1-B3 em HOMOLOGACAO e, somente apos
-- implantacao autorizada, em producao. Valores iguais a zero nos desvios.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS momento_consulta,
 to_regclass('public.emenda_subempenhos') IS NOT NULL AS subempenhos_existe,
 to_regclass('public.emenda_subempenho_documentos') IS NOT NULL AS documentos_existem,
 to_regclass('public.emenda_subempenho_resumo') IS NOT NULL AS visao_existe;

SELECT c.relname AS tabela,c.relrowsecurity AS rls_ativa
FROM pg_class c WHERE c.oid IN (
 'public.emenda_subempenhos'::regclass,
 'public.emenda_subempenho_documentos'::regclass
) ORDER BY c.relname;

SELECT
 (SELECT count(*) FROM public.emenda_subempenhos) total_subempenhos,
 (SELECT count(*) FROM public.emenda_subempenho_documentos) documentos_subempenho,
 (SELECT count(*) FROM public.emenda_blocos_pagamento WHERE subempenho_id IS NULL) pagamentos_legados_sem_vinculo,
 (SELECT count(*) FROM public.emenda_blocos_pagamento WHERE subempenho_id IS NOT NULL) pagamentos_vinculados,
 (SELECT count(*) FROM public.emenda_liberacoes) liberacoes_legadas,
 (SELECT count(*) FROM public.emenda_historico) eventos_auditoria;

-- CONFLITO = 0; no modelo B dois livros não podem coexistir na mesma NE.
SELECT count(*) AS nes_com_conflito_entre_modelos
FROM public.emenda_subempenho_resumo WHERE modelo_financeiro='conflito_entre_modelos';

-- Saldo negativo = 0; saldo nao conhecido aparece NULL, nao zero artificial.
SELECT count(*) AS nes_com_saldo_negativo
FROM public.emenda_subempenho_resumo WHERE saldo_ne_a_comprometer < 0;

-- Uma competência, lançamento e NE devem apontar à mesma emenda.
SELECT count(*) AS subempenhos_inconsistentes
FROM public.emenda_subempenhos x
LEFT JOIN public.emenda_lancamentos l ON l.id=x.lancamento_id
LEFT JOIN public.emenda_solicitacoes s ON s.id=x.solicitacao_id
LEFT JOIN public.emenda_lancamento_meses m
 ON m.lancamento_id=x.lancamento_id AND m.competencia_id=x.competencia_id
WHERE l.id IS NULL OR s.id IS NULL OR m.id IS NULL
 OR x.emenda_id<>l.emenda_id OR x.emenda_id<>s.emenda_id
 OR l.solicitacao_id IS DISTINCT FROM s.id;

-- Os valores da solicitação e do aviso são independentes; divergência é informativa.
SELECT x.status,
 count(*) AS quantidade,
 coalesce(sum(x.valor_solicitado),0)::numeric(16,2) AS soma_solicitada,
 coalesce(sum(x.valor_subempenhado),0)::numeric(16,2) AS soma_confirmada
FROM public.emenda_subempenhos x GROUP BY x.status ORDER BY x.status;

-- Somente documento de Aviso de Movimento pode registrar valor efetivo.
SELECT count(*) AS documentos_sem_coerencia
FROM public.emenda_subempenho_documentos d
LEFT JOIN public.emenda_subempenhos s ON s.id=d.subempenho_id
WHERE s.id IS NULL OR s.emenda_id<>d.emenda_id
 OR (d.tipo='aviso_subempenho' AND (d.valor_documentado IS NULL OR d.valor_documentado<=0))
 OR (d.tipo<>'aviso_subempenho' AND d.valor_documentado IS NOT NULL);

SELECT proname, pg_get_function_identity_arguments(p.oid) AS assinatura,
 p.prosecdef AS security_definer
FROM pg_proc p
WHERE p.oid IN (
 'public.emenda_subempenho_criar(uuid,uuid,numeric,uuid)'::regprocedure,
 'public.emenda_subempenho_documentar(uuid,text,text,text,date,numeric)'::regprocedure,
 'public.emenda_subempenho_cancelar_rascunho(uuid,text)'::regprocedure
) ORDER BY proname;

-- Antes de implantar o frontend de fases D/E, exigir que as colunas legadas
-- e novas estejam presentes e sem backfill artificial.
SELECT column_name,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='emenda_blocos_pagamento'
AND column_name IN ('liberacao_id','subempenho_id','programacao_numero_sei',
 'programacao_link_sei','data_programacao','valor_programado')
ORDER BY ordinal_position;

COMMIT;
