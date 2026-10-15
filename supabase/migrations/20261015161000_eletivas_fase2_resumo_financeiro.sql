-- Encontro de Contas Eletivas HMSJ: Fase 2, resumo financeiro rastreável.
-- Requer Fases 0/1. NÃO redefine ec_valor_item nem altera encerramentos.
-- Todos os valores monetários em numeric (centavos), sem somar controle FAEC faixa MAC.
BEGIN;
DO $preflight$
BEGIN
  IF to_regprocedure('public.ec_valor_item(text,text,text,numeric,numeric)') IS NULL
     OR to_regclass('public.eletivas_itens') IS NULL
     OR to_regclass('public.eletivas_competencias') IS NULL THEN
    RAISE EXCEPTION 'Aplique primeiro as migrations anteriores do módulo Eletivas.'
      USING ERRCODE='23514';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.ec_resumo_financeiro(p_comp uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $resumo$
WITH base AS (
  SELECT i.categoria, i.situacao, i.decisao, i.conferido_em,
    i.valor_publicado AS publicado,
    i.valor_esperado AS esperado,
    public.ec_valor_item(i.categoria,i.situacao,i.decisao,
      i.valor_publicado,i.valor_esperado) AS admitido,
    (i.categoria='faec_fxmac') AS controle
  FROM public.eletivas_itens i WHERE i.competencia_id=p_comp
),
por_categoria AS (
  SELECT categoria, count(*) AS itens,
    round(sum(publicado),2) AS publicado,
    round(sum(esperado),2) AS esperado,
    round(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),2) AS admitido
  FROM base GROUP BY categoria
),
total AS (
  SELECT count(*) AS itens,
    count(*) FILTER (WHERE conferido_em IS NULL) AS sem_conferencia,
    count(*) FILTER (WHERE situacao IN ('div','nc','fora','pendente')
      AND decisao IS NULL) AS sem_decisao,
    round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE publicado END),0),2) AS publicado,
    round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE esperado END),0),2) AS esperado,
    round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),0),2) AS admitido,
    round(coalesce(sum(CASE WHEN controle THEN publicado ELSE 0::numeric END),0),2) AS controles
  FROM base
),
correcoes AS (
  SELECT round(coalesce(sum(
    CASE WHEN jsonb_typeof(elem.value)='object'
         AND (elem.value->>'valor') ~ '^-?[0-9]+([.][0-9]{1,2})?$'
      THEN (elem.value->>'valor')::numeric
      ELSE 0::numeric END),0),2) AS valor
  FROM public.eletivas_competencias c
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.correcoes)='array' THEN c.correcoes
      ELSE '[]'::jsonb END) elem ON true
  WHERE c.id=p_comp
)
SELECT jsonb_build_object(
  'competencia_id',p_comp,
  'itens',total.itens,
  'sem_conferencia',total.sem_conferencia,
  'pendencias_sem_decisao',total.sem_decisao,
  'publicado',total.publicado,
  'esperado',total.esperado,
  'fiscalmente_admitido',total.admitido,
  'controle_faec_fxmac_nao_somado',total.controles,
  'correcoes',correcoes.valor,
  'total_com_correcoes',round(total.admitido+correcoes.valor,2),
  'categorias',coalesce(
     (SELECT jsonb_agg(jsonb_build_object(
       'categoria',categoria,'itens',itens,'publicado',publicado,
       'esperado',esperado,'fiscalmente_admitido',admitido
     ) ORDER BY categoria) FROM por_categoria),'[]'::jsonb)
)
FROM total CROSS JOIN correcoes;
$resumo$;

REVOKE ALL ON FUNCTION public.ec_resumo_financeiro(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_resumo_financeiro(uuid) TO authenticated;
COMMENT ON FUNCTION public.ec_resumo_financeiro(uuid) IS
 'Resumo de produção publicada, expectativa e parcela fiscalmente admitida; mesma função ec_valor_item usada no encerramento. Exclui faec_fxmac da soma, não substitui conferência humana.';
COMMIT;
