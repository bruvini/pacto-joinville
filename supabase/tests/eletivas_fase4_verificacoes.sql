-- EC Fase 4 · verificação pós-migration, sem mudanças de dados.
-- Executar somente APÓS 20261015194500_eletivas_fase4_auditoria_correcoes.sql.
BEGIN;
DO $verifica$
DECLARE nome_tabela text;
BEGIN
 FOREACH nome_tabela IN ARRAY ARRAY[
  'eletivas_decisoes_revisoes','eletivas_correcoes'
 ] LOOP
   IF to_regclass('public.'||nome_tabela) IS NULL THEN
     RAISE EXCEPTION 'Fase 4: tabela não criada: %',nome_tabela;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
      WHERE oid=('public.'||nome_tabela)::regclass AND relrowsecurity) THEN
     RAISE EXCEPTION 'Fase 4: RLS desabilitada em %',nome_tabela;
   END IF;
   IF has_table_privilege('anon','public.'||nome_tabela,'SELECT')
      OR has_table_privilege('anon','public.'||nome_tabela,'INSERT')
      OR has_table_privilege('authenticated','public.'||nome_tabela,'INSERT')
      OR has_table_privilege('authenticated','public.'||nome_tabela,'UPDATE') THEN
     RAISE EXCEPTION 'Fase 4: grants de % permitem alteração direta.',nome_tabela;
   END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='eletivas_itens'
     AND column_name='decisao_versao') THEN
    RAISE EXCEPTION 'Fase 4: coluna de versão fiscal ausente.';
 END IF;
 IF to_regprocedure('public.ec_decidir_item(uuid,text,text,integer,text)') IS NULL
    OR to_regprocedure('public.ec_incluir_correcao(uuid,text,text[],numeric,text,text,text,text)') IS NULL
    OR to_regprocedure('public.ec_revisar_correcao(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Fase 4: funções fiscais ausentes.';
 END IF;
 IF has_function_privilege('anon',
    'public.ec_decidir_item(uuid,text,text,integer,text)','EXECUTE')
    OR has_function_privilege('anon',
    'public.ec_incluir_correcao(uuid,text,text[],numeric,text,text,text,text)','EXECUTE')
    OR has_function_privilege('anon',
    'public.ec_revisar_correcao(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Fase 4: RPC fiscal acessível a anon.';
 END IF;
 IF public.ec_valor_item('faec_prod','ok','erro',100,100)<>0
   OR public.ec_valor_item('mac_compl','div','analise',200,250)<>0
   OR public.ec_valor_item('faec_mult','pendente','aceito',100,100)<>0
   OR public.ec_valor_item('faec_fxmac','ok','aceito',2000,2000)<>0
   OR public.ec_valor_item('faec_prod','ok',NULL,100,100)<>100 THEN
   RAISE EXCEPTION 'Fase 4: regra de centavos, decisão ou controle divergente.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_correcoes
   WHERE status='aprovada'
   GROUP BY prestador_id,fingerprint HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Fase 4: a mesma correção foi aprovada mais de uma vez.';
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.eletivas_competencias comp
   WHERE (
     SELECT count(*) FROM public.eletivas_correcoes c
     WHERE c.competencia_id=comp.id AND c.origem_legada_indice IS NOT NULL
   ) IS DISTINCT FROM jsonb_array_length(comp.correcoes)
 ) THEN
   RAISE EXCEPTION 'Fase 4: alguma correção histórica não foi preservada na tabela.';
 END IF;
 RAISE NOTICE 'Fase 4: permissões, RLS, funções e não duplicação verificados.';
END;$verifica$;
SELECT c.competencia AS competencia,
  coalesce(jsonb_array_length(c.correcoes),0) AS registros_legados,
  count(x.id) FILTER (WHERE x.origem_legada_indice IS NOT NULL) AS registros_migrados,
  count(x.id) FILTER (WHERE x.status='duplicada') AS duplicatas_em_analise,
  round(coalesce(sum(x.valor) FILTER (WHERE x.status='aprovada'),0),2) AS correcoes_aprovadas
FROM public.eletivas_competencias c
LEFT JOIN public.eletivas_correcoes x ON x.competencia_id=c.id
GROUP BY c.id,c.competencia,c.correcoes
ORDER BY c.competencia;
ROLLBACK;
