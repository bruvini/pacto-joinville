-- Fase 6: verificação SOMENTE LEITURA. Execute após a migration 20261015195500.
-- BEGIN/ROLLBACK: não cria nem modifica valores.
BEGIN;
DO $v$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['eletivas_fechamentos','eletivas_integracoes'] LOOP
   IF to_regclass('public.'||tbl) IS NULL THEN
    RAISE EXCEPTION 'Fase 6: tabela % ausente.',tbl;
   END IF;
   IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
     WHERE oid=('public.'||tbl)::regclass) THEN
     RAISE EXCEPTION 'Fase 6: RLS desabilitada em %.',tbl;
   END IF;
   IF has_table_privilege('anon','public.'||tbl,'SELECT')
     OR has_table_privilege('anon','public.'||tbl,'UPDATE')
     OR has_table_privilege('authenticated','public.'||tbl,'INSERT')
     OR has_table_privilege('authenticated','public.'||tbl,'UPDATE')
     OR has_table_privilege('authenticated','public.'||tbl,'DELETE') THEN
     RAISE EXCEPTION 'Fase 6: escrita fiscal indevida na tabela %.',tbl;
   END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.ec_encerrar(uuid)','EXECUTE')
   OR has_function_privilege('anon',
      'public.ec_encerrar_seguro(uuid,uuid,text,text,boolean)','EXECUTE')
   OR has_function_privilege('anon',
      'public.ec_aplicar_integracao(uuid,numeric,boolean)','EXECUTE')
   OR has_function_privilege('anon',
      'public.ec_reabrir_controlado(uuid,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Fase 6: execução privilegiada exposta indevidamente.';
 END IF;
 IF to_regprocedure('public.ec_checklist_fechamento(uuid)') IS NULL
   OR to_regprocedure('public.ec_vincular_lancamento(uuid,uuid,uuid,text)') IS NULL
   OR to_regprocedure('public.ec_encerrar_seguro(uuid,uuid,text,text,boolean)') IS NULL
   OR to_regprocedure('public.ec_propor_integracao(uuid,uuid,numeric,text,text,boolean)') IS NULL
   OR to_regprocedure('public.ec_aplicar_integracao(uuid,numeric,boolean)') IS NULL
   OR to_regprocedure('public.ec_cancelar_proposta(uuid,text)') IS NULL
   OR to_regprocedure('public.ec_reabrir_controlado(uuid,text,text)') IS NULL THEN
   RAISE EXCEPTION 'Fase 6: RPCs incompletas.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgrelid='public.eletivas_competencias'::regclass
   AND tgname='ec_snapshot_final' AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Fase 6: snapshot sem trigger de fechamento.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgrelid='public.lancamentos_pagamento'::regclass
   AND tgname='ec_integracao_valor_guard' AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Fase 6: Etapa 6 sem proteção contra sobrescrita.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes WHERE status IN('proposta','aplicada')
   GROUP BY competencia_id HAVING count(*)>1) OR
   EXISTS(SELECT 1 FROM public.eletivas_integracoes WHERE status IN('proposta','aplicada')
   GROUP BY lancamento_id HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Fase 6: integração duplicada ativa.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes e
  JOIN public.eletivas_competencias c ON c.id=e.competencia_id
  JOIN public.eletivas_fechamentos f ON f.id=e.fechamento_id
  WHERE e.status='aplicada' AND
   (c.lancamento_id IS DISTINCT FROM e.lancamento_id
     OR e.valor_novo IS DISTINCT FROM f.valor_fechado)) THEN
   RAISE EXCEPTION 'Fase 6: aplicação divergente de snapshot.';
 END IF;
 RAISE NOTICE 'Fase 6: RLS, grants, RPCs, snapshot e antiduplo-atesto OK.';
END;$v$;

SELECT 'fechamentos' AS tipo,count(*) AS registros
 FROM public.eletivas_fechamentos
UNION ALL
SELECT 'propostas',count(*) FROM public.eletivas_integracoes
UNION ALL
SELECT 'integracoes_aplicadas',count(*) FROM public.eletivas_integracoes
 WHERE status='aplicada';
ROLLBACK;
