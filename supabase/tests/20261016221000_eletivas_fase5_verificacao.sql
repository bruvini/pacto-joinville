-- Fase 5 · Verificação SOMENTE LEITURA após aplicar a migration.
-- Não cria, altera nem exclui comunicados, correções ou encontros.
BEGIN READ ONLY;
SELECT 'Tabelas operacionais' AS verificacao,
 count(*) AS encontradas, 5 AS esperadas,
 count(*)=5 AS ok
FROM information_schema.tables
WHERE table_schema='public'
 AND table_name IN('eletivas_fpo_fluxos','eletivas_fpo_fluxos_eventos',
  'eletivas_fpo_vinculos','eletivas_comunicacoes','eletivas_comunicacoes_eventos');

SELECT t.relname AS tabela,t.relrowsecurity AS rls_ativa,
 has_table_privilege('authenticated',t.oid,'SELECT') AS leitura_auth,
 has_table_privilege('authenticated',t.oid,'INSERT') AS escrita_direta_auth,
 has_table_privilege('anon',t.oid,'SELECT') AS leitura_anon
FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN(
 'eletivas_fpo_fluxos','eletivas_fpo_fluxos_eventos',
 'eletivas_fpo_vinculos','eletivas_comunicacoes','eletivas_comunicacoes_eventos')
ORDER BY t.relname;

SELECT p.proname,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS permitido_autenticado,
 has_function_privilege('anon',p.oid,'EXECUTE') AS proibido_anon
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN(
 'ec_fpo_iniciar','ec_fpo_mudar_etapa','ec_fpo_vincular_correcao',
 'ec_com_rotear','ec_com_marcar_envio','ec_com_reabrir')
ORDER BY p.proname;

SELECT c.competencia,
 count(DISTINCT f.id) AS fluxos_fpo,
 count(DISTINCT m.id) FILTER (WHERE m.situacao='fila') AS comunicacoes_pendentes,
 count(DISTINCT m.id) FILTER (WHERE m.situacao='enviada') AS envios_confirmados,
 count(DISTINCT m.id) FILTER (WHERE m.situacao='interno') AS acompanhamentos_internos
FROM public.eletivas_competencias c
LEFT JOIN public.eletivas_fpo_fluxos f ON f.competencia_id=c.id
LEFT JOIN public.eletivas_comunicacoes m ON m.competencia_id=c.id
WHERE c.competencia IN('07/2026','08/2026')
GROUP BY c.id,c.competencia ORDER BY c.competencia;

SELECT 'Correções aprovadas da origem sem vínculo' AS diagnostico,
 count(*) AS quantidade
FROM public.eletivas_correcoes c
JOIN public.eletivas_competencias e ON e.prestador_id=c.prestador_id
 AND e.competencia=c.competencia_origem
LEFT JOIN public.eletivas_fpo_vinculos v ON v.correcao_id=c.id
WHERE c.status='aprovada' AND v.id IS NULL
 AND e.competencia='07/2026';
COMMIT;
