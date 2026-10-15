-- Diagnóstico somente leitura da Fase 0. Execute APÓS a migration no SQL Editor.
-- Não cria competências nem toca em lançamentos; aborta se as proteções não existem.
BEGIN;
DO $checks$
DECLARE
 p text;
BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL THEN
   RAISE EXCEPTION 'Módulo não instalado';
 END IF;
 FOREACH p IN ARRAY ARRAY['ec_execucao_id','ec_fontes_snapshot','ec_motor_versao','ec_processado_em'] LOOP
   IF NOT EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='eletivas_competencias' AND column_name=p) THEN
     RAISE EXCEPTION 'Coluna ausente: %',p;
   END IF;
 END LOOP;
 IF to_regprocedure('public.ec_conferir_item(uuid)') IS NULL
   OR to_regprocedure('public.ec_importar_itens_v2(uuid,jsonb,jsonb,text)') IS NULL THEN
   RAISE EXCEPTION 'RPCs da Fase 0 ausentes.';
 END IF;
 IF has_function_privilege('authenticated','public.ec_importar_itens_v2(uuid,jsonb,jsonb,text)','EXECUTE') THEN
   RAISE EXCEPTION 'FALHA RLS: cliente autenticado consegue executar a ingestão do motor.';
 END IF;
 IF NOT has_function_privilege('authenticated','public.ec_conferir_item(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'RPC de conferência fiscal inacessível ao usuário autenticado.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.eletivas_competencias'::regclass
    AND tgname='ec_execucao_guard' AND tgenabled <> 'D') THEN
   RAISE EXCEPTION 'Trigger de proteção da execução desabilitada ou ausente.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.eletivas_competencias'::regclass
    AND tgname='ec_comp_audit' AND tgenabled <> 'D') THEN
   RAISE EXCEPTION 'Trigger de histórico da competência não encontrado.';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.eletivas_competencias'::regclass) THEN
   RAISE EXCEPTION 'RLS de competências está desligado.';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.eletivas_itens'::regclass) THEN
   RAISE EXCEPTION 'RLS de itens está desligado.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens i
    JOIN public.eletivas_competencias c ON c.id=i.competencia_id
   WHERE c.status<>'encerrada' AND i.conferido_em IS NOT NULL
     AND i.conferido_por IS NULL) THEN
   RAISE EXCEPTION 'Há itens não encerrados com carimbo inconsistente.';
 END IF;
 RAISE NOTICE 'Fase 0: contrato SQL e permissões básicas verificados com sucesso.';
END;
$checks$;
ROLLBACK;
