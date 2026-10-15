-- EC-APPROLE-V2 · Verificação pós-migration: somente leitura, sem dados sensíveis.
-- Rodar APÓS 20261015180000_eletivas_reparo_app_role_v2.sql.
BEGIN;
DO $verificar_v2$
DECLARE
  assinatura text;
  rotina regprocedure;
  definicao text;
  config text[];
  definer boolean;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.ec_importar_itens_local(uuid,jsonb,jsonb,text)',
    'public.ec_conferir_item(uuid)',
    'public.ec_validar_execucao_local(uuid)',
    'public.ec_encerrar(uuid)'
  ] LOOP
    rotina := to_regprocedure(assinatura);
    IF rotina IS NULL THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: função fiscal ausente: %',assinatura;
    END IF;
    SELECT pg_catalog.pg_get_functiondef(p.oid),p.proconfig,p.prosecdef
      INTO definicao,config,definer FROM pg_catalog.pg_proc p
      WHERE p.oid=rotina::oid;
    IF definer IS DISTINCT FROM true
       OR position('::public.app_role[]' IN definicao)=0
       OR definicao ~ '::[[:space:]]*app_role[[:space:]]*\[\]' THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: autorização ou SECURITY DEFINER inválido: %',
        assinatura;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(COALESCE(config,ARRAY[]::text[])) AS c(setting)
      WHERE split_part(c.setting,'=',1)='search_path'
        AND pg_catalog.btrim(substr(c.setting,pg_catalog.strpos(c.setting,'=')+1),chr(34)||chr(39)||' ')=''
    ) THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: search_path não está vazio em %; configuração %',
        assinatura,config;
    END IF;
    IF has_function_privilege('anon',assinatura,'EXECUTE') THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: permissão incorreta de anon em %',assinatura;
    END IF;
    IF NOT has_function_privilege('authenticated',assinatura,'EXECUTE') THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: permissão de authenticated ausente em %',assinatura;
    END IF;
  END LOOP;
  RAISE NOTICE 'EC-APPROLE-V2 OK: quatro RPCs com enum qualificado, SECURITY DEFINER e search_path vazio.';
END;
$verificar_v2$;
ROLLBACK;
