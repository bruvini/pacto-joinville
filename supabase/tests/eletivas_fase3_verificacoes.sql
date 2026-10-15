-- Fase 3 · Verificações somente leitura. Execute APÓS a migration 19:30.
BEGIN;
DO $checks$
DECLARE tabela text;
BEGIN
 FOREACH tabela IN ARRAY ARRAY[
  'eletivas_fpo_programacoes','eletivas_atos_especiais','eletivas_publicacoes_aih'
 ] LOOP
   IF to_regclass('public.'||tabela) IS NULL THEN
     RAISE EXCEPTION 'Fase 3: tabela pública % não encontrada',tabela;
   END IF;
   IF NOT (SELECT relrowsecurity FROM pg_class
     WHERE oid=('public.'||tabela)::regclass) THEN
     RAISE EXCEPTION 'Fase 3: RLS não habilitada em %',tabela;
   END IF;
   IF has_table_privilege('anon','public.'||tabela,'SELECT')
      OR has_table_privilege('anon','public.'||tabela,'INSERT') THEN
     RAISE EXCEPTION 'Fase 3: anon com acesso indevido a %',tabela;
   END IF;
 END LOOP;
 IF to_regprocedure('public.ec_valor_item(text,text,text,numeric,numeric)') IS NULL THEN
   RAISE EXCEPTION 'Fase 3: função financeira ausente';
 END IF;
 IF public.ec_valor_item('faec_mult','pendente','aceito',1599.39,1599.39)<>0 THEN
   RAISE EXCEPTION 'Fase 3: múltipla pendente não pode ser admitida!';
 END IF;
 IF public.ec_valor_item('mac_mult','pendente','analise',2000,2000)<>0 THEN
   RAISE EXCEPTION 'Fase 3: MAC pendente não pode ser admitido!';
 END IF;
 IF public.ec_valor_item('faec_fxmac','ok','aceito',2000,2000)<>0 THEN
   RAISE EXCEPTION 'Fase 3: controle FAEC faixa MAC não pode somar!';
 END IF;
 IF public.ec_valor_item('faec_prod','ok',NULL,130,130)<>130 THEN
   RAISE EXCEPTION 'Fase 3: valor conciliado simples foi alterado!';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgrelid='public.eletivas_competencias'::regclass
    AND tgname='ec_ato_final_guard' AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Fase 3: proteção de encerramento não encontrada';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgrelid='public.eletivas_itens'::regclass
    AND tgname='ec_pub_aih_comprovante_guard' AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Fase 3: proteção de publicação declarada ausente';
 END IF;
 RAISE NOTICE 'Fase 3: RLS, campos e travas financeiras confirmados.';
END;
$checks$;
ROLLBACK;
