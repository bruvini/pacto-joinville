-- Eletivas HMSJ — Fase 2: verificação SQL/RLS e centavos, somente leitura
BEGIN;
DO $verificar$
DECLARE x numeric;
BEGIN
 IF to_regprocedure('public.ec_resumo_financeiro(uuid)') IS NULL THEN
  RAISE EXCEPTION 'A migration da Fase 2 não foi aplicada.' USING ERRCODE='23514';
 END IF;
 IF has_function_privilege('anon','public.ec_resumo_financeiro(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Resumo não pode ser executado por anônimo.' USING ERRCODE='42501';
 END IF;
 IF NOT has_function_privilege('authenticated','public.ec_resumo_financeiro(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Resumo não está liberado aos usuários autenticados (sujeito à RLS).';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.eletivas_itens'::regclass) THEN
   RAISE EXCEPTION 'RLS de itens não está habilitada.' USING ERRCODE='42501';
 END IF;
 SELECT public.ec_valor_item('faec_prod','ok',NULL,100.00,100.00) INTO x;
 IF x<>100.00 THEN RAISE EXCEPTION 'Parcela conciliada não coincide: %',x; END IF;
 SELECT public.ec_valor_item('faec_compl','div',NULL,12.00,30.00) INTO x;
 IF x<>12.00 THEN RAISE EXCEPTION 'Parcela incontroversa a menor não coincide: %',x; END IF;
 SELECT public.ec_valor_item('faec_compl','div',NULL,50.00,30.00) INTO x;
 IF x<>30.00 THEN RAISE EXCEPTION 'Parcela incontroversa a maior não coincide: %',x; END IF;
 SELECT public.ec_valor_item('faec_compl','div','erro',50.00,30.00) INTO x;
 IF x<>0.00 THEN RAISE EXCEPTION 'Decisão fiscal de erro não bloqueou pagamento: %',x; END IF;
 SELECT public.ec_valor_item('faec_fxmac','ok','aceito',2000.00,2000.00) INTO x;
 IF x<>0.00 THEN RAISE EXCEPTION 'Controle FAEC faixa MAC foi contabilizado: %',x; END IF;
 SELECT public.ec_valor_item('sia_faec','info',NULL,100.00,0.00) INTO x;
 IF x<>100.00 THEN RAISE EXCEPTION 'Parcela publicada sem tabulação não coincide: %',x; END IF;
 RAISE NOTICE 'Fase 2: função do encerramento, controle, centavos e privilégios confirmados.';
END;
$verificar$;
ROLLBACK;
