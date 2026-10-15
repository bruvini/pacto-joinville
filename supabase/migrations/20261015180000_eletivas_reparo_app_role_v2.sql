-- EC-APPROLE-V2 · Encontro de Contas HMSJ
-- NOVA MIGRATION: substitui a tentativa 20261015170000 que falhou no SQL Editor.
-- NÃO execute novamente o arquivo anterior; execute APENAS este.
-- Corrige o tipo app_role[] não qualificado em quatro RPCs SECURITY DEFINER.
-- Nenhuma alteração de dados, status, RLS ou cálculos; não utiliza Edge Function.
BEGIN;

DO $ec_app_role_v2$
DECLARE
  assinatura text;
  funcao regprocedure;
  definicao text;
  corrigida text;
  eh_definer boolean;
  qt_corrigida integer := 0;
  qt_verificada integer := 0;
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'EC-APPROLE-V2: enum public.app_role não existe no banco.'
      USING ERRCODE='42704';
  END IF;
  IF to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL THEN
    RAISE EXCEPTION 'EC-APPROLE-V2: a função public.has_any_role(uuid,public.app_role[]) não existe.'
      USING ERRCODE='42883';
  END IF;

  FOREACH assinatura IN ARRAY ARRAY[
    'public.ec_importar_itens_local(uuid,jsonb,jsonb,text)',
    'public.ec_conferir_item(uuid)',
    'public.ec_validar_execucao_local(uuid)',
    'public.ec_encerrar(uuid)'
  ] LOOP
    funcao := to_regprocedure(assinatura);
    IF funcao IS NULL THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: função % ausente. Confirme as Fases 0 e 1.',
        assinatura USING ERRCODE='42883';
    END IF;

    SELECT p.prosecdef,pg_catalog.pg_get_functiondef(p.oid)
      INTO eh_definer,definicao
      FROM pg_catalog.pg_proc p
      WHERE p.oid=funcao::oid;

    -- Verifica apenas a propriedade de segurança real, sem comparar strings
    -- de pg_proc.proconfig (causa do erro na migration anterior).
    IF eh_definer IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: função % não é SECURITY DEFINER. Nenhuma mudança aplicada.',
        assinatura USING ERRCODE='23514';
    END IF;
    IF position('public.has_any_role(' IN definicao)=0 THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: função % não contém a autorização esperada.',
        assinatura USING ERRCODE='23514';
    END IF;

    corrigida := pg_catalog.regexp_replace(
      definicao,
      '::[[:space:]]*app_role[[:space:]]*\[\]',
      '::public.app_role[]',
      'g'
    );
    IF position('::public.app_role[]' IN corrigida)=0
       OR corrigida ~ '::[[:space:]]*app_role[[:space:]]*\[\]' THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: não foi possível corrigir o enum em %.',
        assinatura USING ERRCODE='23514';
    END IF;

    IF corrigida IS DISTINCT FROM definicao THEN
      EXECUTE corrigida;
      qt_corrigida := qt_corrigida+1;
    END IF;

    -- Mantém a proteção: o caminho de pesquisa continua VAZIO.
    -- Não depende da formatação de proconfig em nenhuma versão do Postgres.
    EXECUTE pg_catalog.format('ALTER FUNCTION %s SET search_path = %L',assinatura,'');

    SELECT p.prosecdef,pg_catalog.pg_get_functiondef(p.oid)
      INTO eh_definer,definicao
      FROM pg_catalog.pg_proc p
      WHERE p.oid=funcao::oid;
    IF eh_definer IS DISTINCT FROM true
       OR position('::public.app_role[]' IN definicao)=0
       OR definicao ~ '::[[:space:]]*app_role[[:space:]]*\[\]' THEN
      RAISE EXCEPTION 'EC-APPROLE-V2: verificação pós-ajuste falhou em %.',
        assinatura USING ERRCODE='23514';
    END IF;
    qt_verificada := qt_verificada+1;
  END LOOP;

  RAISE NOTICE 'EC-APPROLE-V2 OK: % RPCs verificadas, % definições corrigidas.',
    qt_verificada,qt_corrigida;
END;
$ec_app_role_v2$;

COMMIT;
