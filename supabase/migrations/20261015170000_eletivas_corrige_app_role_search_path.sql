-- Encontro de Contas HMSJ: corrige resolucao do enum app_role nas RPCs SECURITY DEFINER.
-- Dependencias: Fase 0 (15/10 10:15) e Fase 1 (15/10 14:40) ja instaladas.
-- Corrige: type "app_role[]" does not exist ao gravar pre-conciliacao.
-- Nao altera tabelas, dados, RLS, perfil permitido, corpo de calculo ou historico.
-- Sempre restaura search_path vazio (independente da representacao em pg_proc).
BEGIN;

DO $corrigir_app_role$
DECLARE
  nome_funcao text;
  rotina regprocedure;
  definicao text;
  nova_definicao text;
  alteradas integer := 0;
  e_definer boolean;
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'Tipo public.app_role não existe neste banco. Verifique a base de dados selecionada.'
      USING ERRCODE='42704';
  END IF;
  IF to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL THEN
    RAISE EXCEPTION 'Função de autorização public.has_any_role(uuid,public.app_role[]) ausente.'
      USING ERRCODE='42883';
  END IF;

  FOREACH nome_funcao IN ARRAY ARRAY[
    'public.ec_importar_itens_local(uuid,jsonb,jsonb,text)',
    'public.ec_conferir_item(uuid)',
    'public.ec_validar_execucao_local(uuid)',
    'public.ec_encerrar(uuid)'
  ] LOOP
    rotina := to_regprocedure(nome_funcao);
    IF rotina IS NULL THEN
      RAISE EXCEPTION 'Rotina % não encontrada. Confira a aplicação das Fases 0 e 1.', nome_funcao
        USING ERRCODE='42883';
    END IF;
    -- pg_proc.proconfig pode serializar a configuração vazia como
    -- search_path=, search_path="" ou outra representação equivalente.
    -- A verificação anterior comparava literalmente com search_path= e
    -- recusava funções válidas. Preservamos SECURITY DEFINER e
    -- restabelecemos explicitamente o search_path vazio logo abaixo.
    SELECT p.prosecdef INTO e_definer
      FROM pg_catalog.pg_proc p WHERE p.oid=rotina::oid;
    IF e_definer IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RPC % não é SECURITY DEFINER. Correção interrompida.', nome_funcao
        USING ERRCODE='23514';
    END IF;

    definicao := pg_catalog.pg_get_functiondef(rotina::oid);
    IF position('::app_role[]' IN definicao)>0 THEN
      -- Mantém search_path vazio. Apenas qualifica o enum no schema public,
      -- sem substituir/afrouxar a função de permissão has_any_role.
      nova_definicao := replace(definicao,'::app_role[]','::public.app_role[]');
      EXECUTE nova_definicao;
      alteradas := alteradas+1;
    ELSIF position('::public.app_role[]' IN definicao)=0 THEN
      RAISE EXCEPTION 'Padrão de autorização não reconhecido em %: nenhuma alteração aplicada.', nome_funcao
        USING ERRCODE='23514';
    END IF;
    -- Cria a função com a mesma assinatura, permissões e corpo; em
    -- seguida aplica SEMPRE o caminho de pesquisa vazio. Isso não
    -- depende de como cada versão do PostgreSQL imprime proconfig.
    EXECUTE pg_catalog.format('ALTER FUNCTION %s SET search_path = %L',
      nome_funcao,'');

  END LOOP;

  RAISE NOTICE 'Eletivas: % funções reparadas. As outras já estavam qualificadas.', alteradas;
END;
$corrigir_app_role$;

COMMIT;
