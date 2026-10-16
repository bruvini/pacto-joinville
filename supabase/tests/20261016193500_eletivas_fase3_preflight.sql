-- Fase 3: inspeção SOMENTE LEITURA antes/depois da migration financeira.
-- 1) Se houver competência encerrada com delta, NÃO aplique a migration sem
--    tratar os snapshots históricos com fiscalização.
BEGIN READ ONLY;
WITH linhas AS (
 SELECT c.id,c.competencia,c.status,i.chave,i.categoria,
  public.ec_valor_item(i.categoria,i.situacao,i.decisao,
    i.valor_publicado,i.valor_esperado) AS valor_anterior,
  CASE
   WHEN i.categoria='faec_fxmac' THEN 0::numeric
   WHEN i.situacao IN('ok','info') THEN i.valor_publicado
   WHEN i.decisao='aceito' THEN i.valor_publicado
   WHEN i.decisao='erro' THEN 0::numeric
   WHEN i.valor_publicado<=0.02 THEN 0::numeric
   WHEN i.valor_esperado>0.02 THEN LEAST(i.valor_publicado,i.valor_esperado)
   ELSE i.valor_publicado END AS valor_referencia
 FROM public.eletivas_competencias c
 JOIN public.eletivas_itens i ON i.competencia_id=c.id
)
SELECT competencia,status,
 count(*) FILTER(WHERE valor_anterior IS DISTINCT FROM valor_referencia) AS itens_divergentes,
 round(sum(valor_anterior),2) AS admitido_funcao_atual,
 round(sum(valor_referencia),2) AS admitido_html_2422,
 round(sum(valor_referencia-valor_anterior),2) AS diferenca,
 CASE WHEN status='encerrada' AND bool_or(valor_anterior IS DISTINCT FROM valor_referencia)
  THEN 'BLOQUEIO: fechamento histórico; não aplique Fase 3 sem revisão'
  WHEN bool_or(valor_anterior IS DISTINCT FROM valor_referencia)
  THEN 'REVISAR decisões, validação fiscal e simulação do atesto'
  ELSE 'SEM DIFERENÇAS NA REGRA POR ITEM' END AS orientacao
FROM linhas GROUP BY competencia,status
ORDER BY competencia,status;

-- Fonte de correções homologadas: apenas normalizadas e aprovadas.
SELECT competencia_id,status,count(*) AS linhas,round(sum(valor),2) AS total
FROM public.eletivas_correcoes GROUP BY competencia_id,status
ORDER BY competencia_id,status;

-- Testa permissão efetiva de execução e definição atual da função.
SELECT p.proname,
 pg_get_functiondef(p.oid) ILIKE '%p_publicado<=0.02%' AS regra_tol_html_instalada,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS autenticado_pode_consultar
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
 AND p.proname='ec_valor_item'
ORDER BY p.proname;
COMMIT;
