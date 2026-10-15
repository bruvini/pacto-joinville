-- Encontro de Contas HMSJ: corrige resolucao do enum app_role nas RPCs SECURITY DEFINER.
-- Dependencias: Fase 0 (15/10 10:15) e Fase 1 (15/10 14:40) ja instaladas.
-- Corrige: type "app_role[]" does not exist ao gravar pre-conciliacao.
-- Nao altera tabelas, dados, RLS, perfil permitido, corpo de calculo ou historico.
BEGIN;

DO $corrigir_app_role$
DECLARE
  nome_funcao text;
  rotina regprocedure;
  definicao text;
  nova_definicao text;
  alteradas integer := 0;
  caminho text[];
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
    SELECT p.prosecdef,p.proconfig
      INTO e_definer,caminho
      FROM pg_catalog.pg_proc p
      WHERE p.oid=rotina::oid;
    IF NOT e_definer OR NOT ('search_path=' = ANY(COALESCE(caminho,ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'Configuração de segurança inesperada em %; correção interrompida.', nome_funcao
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
  END LOOP;

  RAISE NOTICE 'Eletivas: % funções reparadas. As outras já estavam qualificadas.', alteradas;
END;
$corrigir_app_role$;

COMMIT;
