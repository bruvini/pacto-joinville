-- FASE 1 · verificação de permissões e objetos, SOMENTE LEITURA.
BEGIN;
DO $check$
DECLARE
  funcao text;
BEGIN
  IF to_regprocedure('public.ec_importar_itens_local(uuid,jsonb,jsonb,text)') IS NULL
     OR to_regprocedure('public.ec_validar_execucao_local(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RPC local ou validação fiscal não encontrada. Execute migration Fase 1.';
  END IF;
  IF has_function_privilege('anon','public.ec_importar_itens_local(uuid,jsonb,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Segurança: usuário anon não pode executar a pré-conciliação.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.ec_importar_itens_local(uuid,jsonb,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Usuário autenticado não consegue alcançar RPC (controle de perfil feito dentro dela).';
  END IF;
  IF has_function_privilege('authenticated','public.ec_importar_itens_v2(uuid,jsonb,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Segurança: cliente não pode executar o motor reservado ao service role.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_competencias WHERE ec_origem_execucao='navegador'
      AND ec_execucao_id IS NULL) THEN
    RAISE EXCEPTION 'Execução do navegador sem identificador.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.eletivas_itens'::regclass AND tgname='ec_validacao_invalidada'
      AND NOT tgisinternal AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Trigger de invalidação da declaração fiscal ausente.';
  END IF;
  RAISE NOTICE 'Fase 1: funções, privilégios e gatilho presentes.';
END;
$check$;
ROLLBACK;
