-- SOMENTE LEITURA: executar após migration de arquivamento, no SQL Editor.
BEGIN READ ONLY;
SELECT 'campos de arquivamento' AS teste,
 COUNT(*)=3 AS ok
FROM information_schema.columns
WHERE table_schema='public' AND table_name='eletivas_competencias'
 AND column_name IN('arquivada_em','arquivada_por','arquivada_motivo');
SELECT proname,
 has_function_privilege('authenticated',oid,'EXECUTE') AS permite_authenticated,
 has_function_privilege('anon',oid,'EXECUTE') AS permite_anon
FROM pg_proc
WHERE pronamespace='public'::regnamespace
 AND proname IN('ec_arquivar_competencia','ec_restaurar_competencia')
ORDER BY proname;
SELECT tgrelid::regclass AS tabela, tgname,
 NOT tgisinternal AS habilitado
FROM pg_trigger
WHERE tgname IN('ec_comp_arquivada_guard','ec_arquivado_block')
ORDER BY tgrelid::regclass::text, tgname;
SELECT status,(arquivada_em IS NOT NULL) AS arquivada,count(*) AS competencias
FROM public.eletivas_competencias GROUP BY status,(arquivada_em IS NOT NULL)
ORDER BY arquivada,status;
COMMIT;
