-- Complemento Fase 6: execute depois de 20261015201000.
-- Somente leitura; não cria competências, não altera atestos.
BEGIN;
DO $validar$
DECLARE nome text;
BEGIN
 FOREACH nome IN ARRAY ARRAY['eletivas_exclusoes','eletivas_atesto_escolhas'] LOOP
  IF to_regclass('public.'||nome) IS NULL THEN
   RAISE EXCEPTION 'Tabela fiscal ausente: %',nome;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid=('public.'||nome)::regclass) THEN
   RAISE EXCEPTION 'RLS desabilitada: %',nome;
  END IF;
  IF has_table_privilege('authenticated','public.'||nome,'INSERT')
     OR has_table_privilege('authenticated','public.'||nome,'UPDATE')
     OR has_table_privilege('authenticated','public.'||nome,'DELETE') THEN
   RAISE EXCEPTION 'Tabela fiscal permite escrita direta: %',nome;
  END IF;
 END LOOP;
 FOREACH nome IN ARRAY ARRAY['valor_atestado_manual','valor_atestado_automatico',
   'origem_valor_atestado','ec_escolha_pendente'] LOOP
   IF NOT EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lancamentos_pagamento'
       AND column_name=nome) THEN
     RAISE EXCEPTION 'Etapa 6: coluna % ausente.',nome;
   END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public.eletivas_competencias','INSERT')
   OR has_table_privilege('authenticated','public.eletivas_competencias','DELETE') THEN
   RAISE EXCEPTION 'Encontro pode ser criado/excluído diretamente.';
 END IF;
 IF has_function_privilege('anon',
   'public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)','EXECUTE')
   OR has_function_privilege('anon',
   'public.ec_atesto_escolher_fonte(uuid,text,numeric,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC fiscal acessível para anônimos.';
 END IF;
 IF to_regprocedure('public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.ec_listar_lancamentos_disponiveis()') IS NULL
 OR to_regprocedure('public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text)') IS NULL
 OR to_regprocedure('public.ec_excluir_competencia(uuid,text)') IS NULL
 OR to_regprocedure('public.ec_atesto_escolher_fonte(uuid,text,numeric,text,text)') IS NULL THEN
   RAISE EXCEPTION 'RPC de vínculo, edição, exclusão ou escolha ausente.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.lancamentos_pagamento l
   WHERE l.ec_escolha_pendente AND l.valor_atestado_automatico IS NULL) THEN
   RAISE EXCEPTION 'Lançamento pede escolha sem valor automático.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.lancamentos_pagamento l
   WHERE NOT l.ec_escolha_pendente AND
    ((l.origem_valor_atestado='manual'
       AND l.valor_atestado IS DISTINCT FROM l.valor_atestado_manual)
     OR (l.origem_valor_atestado='automatico'
       AND l.valor_atestado IS DISTINCT FROM l.valor_atestado_automatico))) THEN
   RAISE EXCEPTION 'Valor efetivo não coincide com origem selecionada.';
 END IF;
 RAISE NOTICE 'Eletivas/Etapa 6: colunas, RLS, RPCs e fontes conferidas.';
END;$validar$;
SELECT origem_valor_atestado,ec_escolha_pendente,count(*) AS lancamentos
 FROM public.lancamentos_pagamento
 GROUP BY origem_valor_atestado,ec_escolha_pendente
 ORDER BY origem_valor_atestado,ec_escolha_pendente;
ROLLBACK;
