-- Fases 7 e 8 · VERIFICAÇÃO SOMENTE LEITURA.
-- Rode após a migration, na base do Lovable. NUNCA presume aprovação de perfis.
BEGIN READ ONLY;
SELECT 'Estruturas de homologação' AS teste,count(*) AS encontradas,
 3 AS esperadas,(count(*)=3) AS ok
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN
 ('eletivas_fase8_validacoes','eletivas_fase8_eventos',
 'eletivas_fase8_autorizacoes');

SELECT cl.relname AS tabela,cl.relrowsecurity AS rls_habilitada,
 has_table_privilege('authenticated',cl.oid,'SELECT') AS leitura_autenticada,
 has_table_privilege('authenticated',cl.oid,'INSERT') AS escrita_direta_autenticada,
 has_table_privilege('anon',cl.oid,'SELECT') AS leitura_anon
FROM pg_class cl
JOIN pg_namespace ns ON ns.oid=cl.relnamespace
WHERE ns.nspname='public' AND cl.relname IN
 ('eletivas_fase8_validacoes','eletivas_fase8_eventos',
 'eletivas_fase8_autorizacoes')
ORDER BY cl.relname;

SELECT p.proname,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS permitida_autenticado,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_tem_acesso
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname IN
 ('ec_fase8_registrar','ec_fase8_prontidao','ec_fase8_autorizar',
 'ec_fase8_revogar')
ORDER BY p.proname;

SELECT v.prestador_id,p.nome_instituicao,
 v.perfil,c.competencia,v.documento_sei,v.validado_em,
 c.ec_execucao_id IS NOT DISTINCT FROM v.execucao_id AS execucao_atual,
 v.divergencias_financeiras=0 AS sem_divergencias_financeiras,
 v.divergencias_funcionais=0 AS sem_divergencias_funcionais,
 public.ec_fase8_verificacoes_ok(v.verificacoes) AS dez_testes_declarados,
 (c.arquivada_em IS NULL) AS competencia_ativa
FROM public.eletivas_fase8_validacoes v
JOIN public.eletivas_competencias c ON c.id=v.competencia_id
JOIN public.prestadores p ON p.id=v.prestador_id
WHERE c.competencia IN('04/2026','07/2026')
 OR (substring(c.competencia from 4 for 4)::int*100+
     substring(c.competencia from 1 for 2)::int)>=202608
ORDER BY p.nome_instituicao,v.perfil;

SELECT p.nome_instituicao,
 count(DISTINCT v.perfil) FILTER (
  WHERE c.ec_execucao_id=v.execucao_id
  AND c.arquivada_em IS NULL
  AND v.divergencias_financeiras=0
  AND v.divergencias_funcionais=0
  AND v.validacao_fiscal_declarada
  AND public.ec_fase8_verificacoes_ok(v.verificacoes)
 ) AS perfis_validos_de_3,
 coalesce(bool_or(a.revogado_em IS NULL),false) AS existe_autorizacao_ativa
FROM public.prestadores p
LEFT JOIN public.eletivas_fase8_validacoes v ON v.prestador_id=p.id
LEFT JOIN public.eletivas_competencias c ON c.id=v.competencia_id
LEFT JOIN public.eletivas_fase8_autorizacoes a ON a.prestador_id=p.id
WHERE EXISTS(SELECT 1 FROM public.eletivas_competencias e
 WHERE e.prestador_id=p.id AND e.competencia IN('04/2026','07/2026','08/2026'))
GROUP BY p.id,p.nome_instituicao ORDER BY p.nome_instituicao;

SELECT e.prestador_id,e.acao,e.ocorrido_em,
 e.dados->>'perfil' AS perfil,e.dados->>'documento_sei' AS documento_referencia
FROM public.eletivas_fase8_eventos e
ORDER BY e.ocorrido_em DESC LIMIT 30;
COMMIT;
