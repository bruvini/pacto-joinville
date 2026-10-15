-- ENCONTRO DE CONTAS HMSJ · Diagnóstico pós-correção do enum app_role.
-- Executar DEPOIS da migration 20261015170000. Apenas leitura de catálogos.
-- Não cria, altera nem apaga competências, itens, arquivos ou usuários.
BEGIN;
DO $verificar$
DECLARE
  f text;
  fn regprocedure;
  definicao text;
  configuracao text[];
  definidor boolean;
BEGIN
  IF to_regtype('public.app_role') IS NULL
     OR to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL THEN
    RAISE EXCEPTION 'O tipo e a função de autorização pública precisam existir.';
  END IF;

  FOREACH f IN ARRAY ARRAY[
    'public.ec_importar_itens_local(uuid,jsonb,jsonb,text)',
    'public.ec_conferir_item(uuid)',
    'public.ec_validar_execucao_local(uuid)',
    'public.ec_encerrar(uuid)'
  ] LOOP
    fn := to_regprocedure(f);
    IF fn IS NULL THEN RAISE EXCEPTION 'RPC fiscal ausente: %',f; END IF;
    SELECT pg_catalog.pg_get_functiondef(p.oid),p.proconfig,p.prosecdef
      INTO definicao,configuracao,definidor FROM pg_catalog.pg_proc p
      WHERE p.oid=fn::oid;
    IF position('::app_role[]' IN definicao)>0
       OR position('::public.app_role[]' IN definicao)=0 THEN
      RAISE EXCEPTION 'Enum app_role ainda sem schema explícito em %.',f;
    END IF;
    IF definidor IS DISTINCT FROM true OR NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(configuracao,ARRAY[]::text[])) AS parametro(valor)
      WHERE left(parametro.valor,12)='search_path='
        AND translate(substr(parametro.valor,13),
          chr(34)||chr(39)||chr(32),'') = ''
    ) THEN
      RAISE EXCEPTION 'Função % sem SECURITY DEFINER ou search_path vazio. Configuração: %',
        f,configuracao;
    END IF;
  END LOOP;

  IF has_function_privilege('anon','public.ec_importar_itens_local(uuid,jsonb,jsonb,text)','EXECUTE')
     OR has_function_privilege('anon','public.ec_conferir_item(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.ec_validar_execucao_local(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.ec_encerrar(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Permissão EXECUTE incorreta para anon.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.ec_importar_itens_local(uuid,jsonb,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.ec_conferir_item(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.ec_validar_execucao_local(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.ec_encerrar(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Usuários autenticados perderam acesso às RPCs; o controle de perfil continua dentro delas.';
  END IF;
  RAISE NOTICE 'Eletivas OK: 4 RPCs com ::public.app_role[], search_path vazio, SECURITY DEFINER e privilégios preservados.';
END;
$verificar$;
ROLLBACK;
