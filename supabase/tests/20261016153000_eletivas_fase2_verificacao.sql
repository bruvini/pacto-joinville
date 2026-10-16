-- Fase 2 · diagnóstico SOMENTE LEITURA. Não altera produção, atestos ou arquivos.
BEGIN READ ONLY;
SELECT 'Categoria consolidado habilitada' AS verificacao,
 CASE WHEN EXISTS (
  SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='eletivas_arquivos'
   AND c.conname='eletivas_arquivos_categoria_check'
   AND pg_get_constraintdef(c.oid) LIKE '%ec_consolidado%'
 ) THEN 'OK' ELSE 'PENDENTE - executar migration Fase 2' END AS resultado;
SELECT 'Bucket Eletivas' AS verificacao,id,public,file_size_limit
 FROM storage.buckets WHERE id='eletivas-arquivos';
SELECT 'RLS fontes' AS verificacao, relrowsecurity AS habilitado
 FROM pg_class WHERE oid='public.eletivas_arquivos'::regclass;
SELECT policyname,cmd,roles FROM pg_policies
 WHERE schemaname='public' AND tablename='eletivas_arquivos'
 ORDER BY cmd,policyname;
SELECT c.competencia,count(a.id) AS fontes,
 count(a.id) FILTER (WHERE a.categoria='ec_consolidado') AS consolidados,
 count(a.id) FILTER (WHERE a.sha256 !~ '^[0-9a-f]{64}$') AS hashes_invalidos
 FROM public.eletivas_competencias c
 LEFT JOIN public.eletivas_arquivos a ON a.competencia_id=c.id
 GROUP BY c.id,c.competencia ORDER BY c.competencia DESC LIMIT 15;
COMMIT;
