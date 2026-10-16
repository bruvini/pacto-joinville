-- Fase 3 — equivalência HTML v2.42.2 dos valores do atesto.
-- A migração NÃO atualiza registros, fontes, lançamentos, decisões ou atestos.
-- Antes de aplicá-la ao banco real, execute o SQL de diagnóstico somente leitura.
BEGIN;
DO $pre$
BEGIN
 IF to_regprocedure('public.ec_resumo_financeiro(uuid)') IS NULL
 OR to_regprocedure('public.ec_valor_item(text,text,text,numeric,numeric)') IS NULL
 OR to_regclass('public.eletivas_correcoes') IS NULL THEN
  RAISE EXCEPTION 'Faltam migrations de Eletivas; aplique Fases 0-2 e auditoria primeiro.'
   USING ERRCODE='23514';
 END IF;
 -- A alteração do motor NUNCA recalcula silenciosamente um fechamento anterior.
 IF EXISTS (
  SELECT 1 FROM public.eletivas_itens i
  JOIN public.eletivas_competencias c ON c.id=i.competencia_id
  WHERE c.status='encerrada' AND
   public.ec_valor_item(i.categoria,i.situacao,i.decisao,
     i.valor_publicado,i.valor_esperado) IS DISTINCT FROM
   (CASE
     WHEN i.categoria='faec_fxmac' THEN 0::numeric
     WHEN i.situacao IN('ok','info') THEN i.valor_publicado
     WHEN i.decisao='aceito' THEN i.valor_publicado
     WHEN i.decisao='erro' THEN 0::numeric
     WHEN i.valor_publicado<=0.02 THEN 0::numeric
     WHEN i.valor_esperado>0.02 THEN LEAST(i.valor_publicado,i.valor_esperado)
     ELSE i.valor_publicado END)
 ) THEN
  RAISE EXCEPTION 'Fechamento histórico teria resultado financeiro alterado: revise o diagnóstico Fase 3 antes de aplicar.'
   USING ERRCODE='23514';
 END IF;
END;
$pre$;

-- 1. Precedência exata: status ok/info, aceite, erro, tolerância e mínimo.
-- Análise/ofício/pendência conservam a parcela incontroversa, não zeram.
CREATE OR REPLACE FUNCTION public.ec_valor_item(
 p_categoria text,p_situacao text,p_decisao text,
 p_publicado numeric,p_esperado numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $valor$
 SELECT CASE
  WHEN p_categoria='faec_fxmac' THEN 0::numeric
  WHEN p_situacao IN('ok','info') THEN p_publicado
  WHEN p_decisao='aceito' THEN p_publicado
  WHEN p_decisao='erro' THEN 0::numeric
  WHEN p_publicado<=0.02 THEN 0::numeric
  WHEN p_esperado>0.02 THEN LEAST(p_publicado,p_esperado)
  ELSE p_publicado
 END;
$valor$;

-- 2. Mesma função em resumo/encerramento, 11 categorias sem duplicação.
CREATE OR REPLACE FUNCTION public.ec_resumo_financeiro(p_comp uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $resumo$
WITH base AS(
 SELECT i.categoria,i.situacao,i.decisao,i.conferido_em,i.procedimento,
    i.valor_publicado publicado,i.valor_esperado esperado,
    public.ec_valor_item(i.categoria,i.situacao,i.decisao,
      i.valor_publicado,i.valor_esperado) admitido,
    (i.categoria='faec_fxmac') controle
 FROM public.eletivas_itens i WHERE i.competencia_id=p_comp
), por_categoria AS (
 SELECT categoria,count(*) itens,
   round(sum(publicado),2) publicado,round(sum(esperado),2) esperado,
   round(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),2) admitido
 FROM base GROUP BY categoria
), totais AS (
 SELECT count(*) itens,
  count(*) FILTER(WHERE conferido_em IS NULL) sem_conferencia,
  count(*) FILTER(WHERE situacao IN('div','nc','fora','pendente')
    AND decisao IS NULL) pendencias_sem_decisao,
  count(*) FILTER(WHERE decisao='analise') em_analise,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE publicado END),0),2) publicado,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE esperado END),0),2) esperado,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),0),2) admitido,
  round(coalesce(sum(CASE WHEN controle THEN publicado ELSE 0::numeric END),0),2) controles,
  round(coalesce(sum(CASE WHEN NOT controle AND situacao='pendente'
    THEN esperado ELSE 0::numeric END),0),2) pendente_valor,
  round(coalesce(sum(CASE WHEN NOT controle AND (
    decisao='oficio' OR (situacao IN('div','nc') AND decisao IS NULL))
    THEN greatest(esperado-publicado,0) ELSE 0::numeric END),0),2) em_discussao,
  round(coalesce(sum(CASE WHEN NOT controle
    AND situacao NOT IN('ok','info') AND decisao='oficio'
    AND COALESCE(left(regexp_replace(procedimento,'[^0-9]','','g'),9),'')
      NOT IN ('041501001','041502003','041502004','041502005',
              '041502006','041502007')
    THEN greatest(esperado-publicado,0) ELSE 0::numeric END),0),2) oficio,
  round(coalesce(sum(CASE WHEN NOT controle AND situacao NOT IN('ok','info')
    AND COALESCE(left(regexp_replace(procedimento,'[^0-9]','','g'),9),'')
      NOT IN ('041501001','041502003','041502004','041502005',
              '041502006','041502007')
    THEN greatest(esperado-publicado,0) ELSE 0::numeric END),0),2) esperado_nao_pago
 FROM base
), correcoes AS (
 SELECT round(coalesce(sum(valor) FILTER(WHERE status='aprovada'),0),2) valor,
  count(*) FILTER(WHERE status IN('em_analise','duplicada')) pendentes
 FROM public.eletivas_correcoes WHERE competencia_id=p_comp
)
SELECT jsonb_build_object(
 'competencia_id',p_comp,
 'itens',totais.itens,'sem_conferencia',totais.sem_conferencia,
 'pendencias_sem_decisao',totais.pendencias_sem_decisao,
 'em_analise',totais.em_analise,
 'publicado',totais.publicado,'esperado',totais.esperado,
 'fiscalmente_admitido',totais.admitido,
 'controle_faec_fxmac_nao_somado',totais.controles,
 'pendente_valor',totais.pendente_valor,'em_discussao',totais.em_discussao,
 'oficio',totais.oficio,'esperado_nao_pago',totais.esperado_nao_pago,
 'correcoes',correcoes.valor,'correcoes_pendentes',correcoes.pendentes,
 'total_com_correcoes',round(totais.admitido+correcoes.valor,2),
 'categorias',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'categoria',categoria,'itens',itens,'publicado',publicado,
    'esperado',esperado,'fiscalmente_admitido',admitido)
    ORDER BY categoria) FROM por_categoria),'[]'::jsonb)
)
FROM totais CROSS JOIN correcoes;
$resumo$;
REVOKE ALL ON FUNCTION public.ec_valor_item(text,text,text,numeric,numeric)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_valor_item(text,text,text,numeric,numeric)
 TO authenticated;
REVOKE ALL ON FUNCTION public.ec_resumo_financeiro(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_resumo_financeiro(uuid) TO authenticated;
COMMENT ON FUNCTION public.ec_valor_item(text,text,text,numeric,numeric) IS
 'HTML 2.42.2 countedPayValue: status ok/info > aceite > erro > tolerância R$ 0,02 > min(publicado,esperado); faec_fxmac controle excluído.';
COMMIT;
