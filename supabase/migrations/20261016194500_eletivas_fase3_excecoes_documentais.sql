-- Fase 3 complementar: exceções documentais do HTML/SES/FPO.
-- Executar APÓS 20261016193000. Não modifica registros existentes.
BEGIN;
DO $pre$ BEGIN
 IF to_regprocedure('public.ec_valor_item(text,text,text,numeric,numeric)') IS NULL
 OR to_regclass('public.eletivas_fpo_programacoes') IS NULL THEN
  RAISE EXCEPTION 'Aplique primeiro a migration principal da Fase 3 e as tabelas FPO.'
   USING ERRCODE='23514';
 END IF;
 -- Nenhum fechamento histórico poderá ter seu valor reavaliado sem análise.
 IF EXISTS (
  SELECT 1 FROM public.eletivas_itens i JOIN public.eletivas_competencias c
   ON c.id=i.competencia_id
  WHERE c.status='encerrada' AND (
    (i.categoria='faec_mult' AND i.situacao='pendente'
      AND ((i.detalhe->>'exige_programacao_fpo')='true' OR
        i.detalhe->>'publicacao_independente' IS DISTINCT FROM 'true'))
    OR (i.categoria='mac_mult' AND i.situacao='pendente'
      AND i.detalhe->>'base_independente_comprovada' IS DISTINCT FROM 'true')
  ) AND public.ec_valor_item(i.categoria,i.situacao,i.decisao,
    i.valor_publicado,i.valor_esperado)<>0
 ) THEN
  RAISE EXCEPTION 'Histórico encerrado com pendência documental e valor alterado: não aplicar sem revisão dos snapshots.'
   USING ERRCODE='23514';
 END IF;
END;$pre$;

-- Cálculo de atesto usa a regra HTML, MAS sem admitir em pendência
-- de múltiplas FAEC sem publicação independente/FPO ou MAC sem prova.
CREATE OR REPLACE FUNCTION public.ec_valor_item_documentado(
 p_categoria text,p_situacao text,p_decisao text,
 p_publicado numeric,p_esperado numeric,p_detalhe jsonb
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $admitir$
 SELECT CASE
  WHEN p_categoria='faec_mult' AND p_situacao='pendente'
   AND ((coalesce(p_detalhe,'{}'::jsonb)->>'exige_programacao_fpo')='true'
     OR (coalesce(p_detalhe,'{}'::jsonb)->>'publicacao_independente') IS DISTINCT FROM 'true')
   THEN 0::numeric
  WHEN p_categoria='mac_mult' AND p_situacao='pendente'
   AND (coalesce(p_detalhe,'{}'::jsonb)->>'base_independente_comprovada') IS DISTINCT FROM 'true'
   THEN 0::numeric
  ELSE public.ec_valor_item(p_categoria,p_situacao,p_decisao,p_publicado,p_esperado)
 END;
$admitir$;

-- Resumo fiscal e fechamento consomem a MESMA regra detalhada.
CREATE OR REPLACE FUNCTION public.ec_resumo_financeiro(p_comp uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $resumo$
WITH base AS(
 SELECT i.categoria,i.situacao,i.decisao,i.conferido_em,i.procedimento,
    i.valor_publicado publicado,i.valor_esperado esperado,
    public.ec_valor_item_documentado(i.categoria,i.situacao,i.decisao,
      i.valor_publicado,i.valor_esperado,i.detalhe) admitido,
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

CREATE OR REPLACE FUNCTION public.ec_encerrar(p_comp uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v public.eletivas_competencias%ROWTYPE;
  v_total numeric := 0;
  v_ajustes numeric := 0;
  v_doc jsonb;
  v_corr jsonb;
  v_fiscais text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(),ARRAY['admin','acp']::public.app_role[]) THEN
    RAISE EXCEPTION 'Perfil não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
  IF NOT FOUND OR v.status='encerrada' THEN
    RAISE EXCEPTION 'Competência inexistente ou já encerrada.' USING ERRCODE='23514';
  END IF;
  IF v.ec_origem_execucao='navegador' AND (v.ec_validado_por IS NULL OR v.ec_validado_em IS NULL) THEN
    RAISE EXCEPTION 'Execução local requer validação fiscal expressa antes de encerrar.'
      USING ERRCODE='23514';
  END IF;
  IF v.ec_execucao_id IS NULL OR v.ec_fontes_snapshot IS NULL OR v.ec_motor_versao IS NULL THEN
    RAISE EXCEPTION 'É necessária execução validada do motor com manifesto das evidências antes do encerramento.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.eletivas_eventos ev
    WHERE ev.competencia_id=p_comp AND ev.tipo IN ('motor_execucao_v2','motor_execucao_local')
      AND ev.dados->>'execucao_id'=v.ec_execucao_id::text
  ) THEN
    RAISE EXCEPTION 'Não existe trilha de execução emitida pelo motor autorizado.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.eletivas_itens i
    WHERE i.competencia_id=p_comp AND i.origem='parser_validado'
      AND (i.ec_execucao_id IS DISTINCT FROM v.ec_execucao_id)
  ) THEN
    RAISE EXCEPTION 'Itens processados não correspondem à execução atual.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v.ec_fontes_snapshot) f
      LEFT JOIN public.eletivas_arquivos a ON a.id=(f->>'id')::uuid
     WHERE a.id IS NULL OR a.competencia_id IS DISTINCT FROM p_comp
       OR a.sha256 IS DISTINCT FROM f->>'sha256'
       OR a.categoria IS DISTINCT FROM f->>'categoria'
  ) THEN
    RAISE EXCEPTION 'Manifesto de arquivos da execução não coincide com as evidências atuais.' USING ERRCODE='23514';
  END IF;
  -- A presença de s_mac_ms é mandatória para competências >= 07/2026.
  IF (split_part(v.competencia,'/',2)::integer * 100
      + split_part(v.competencia,'/',1)::integer) >= 202607
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v.ec_fontes_snapshot) f
       WHERE f->>'categoria'='s_mac_ms'
     ) THEN
    RAISE EXCEPTION 'MAC múltiplas/sequenciais é obrigatório desde 07/2026.'
      USING ERRCODE='23514';
  END IF;

  IF (SELECT count(DISTINCT categoria)
      FROM public.eletivas_arquivos
      WHERE competencia_id=p_comp
        AND categoria IN ('dbf_faec','dbf_mac','s_faec','s_mac')) <> 4 THEN
    RAISE EXCEPTION 'Importe as quatro fontes obrigatórias: DBF FAEC/MAC e SES FAEC/MAC.'
      USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp
    ) OR EXISTS (
      SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp
      AND (conferido_por IS NULL
        OR (situacao IN ('pendente','div','nc','fora') AND decisao IS NULL))
    ) THEN
    RAISE EXCEPTION 'É necessário conferir os itens e tratar cada pendência.'
      USING ERRCODE='23514';
  END IF;

  v_doc := v.documentos;
  IF COALESCE(v_doc->>'rtma_numero','')=''
     OR COALESCE(v_doc->>'analise_numero','')=''
     OR COALESCE(v_doc->>'rtma_link','') !~ '^https?://'
     OR COALESCE(v_doc->>'analise_link','') !~ '^https?://' THEN
    RAISE EXCEPTION 'Registre os números e links SEI do Relatório Técnico e da Análise.'
      USING ERRCODE='23514';
  END IF;

  IF jsonb_typeof(v_doc->'fiscais_rtma') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_doc->'fiscais_rtma')<2
     OR jsonb_typeof(v_doc->'fiscais_analise') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_doc->'fiscais_analise')<1 THEN
    RAISE EXCEPTION 'Confirme dois fiscais no Relatório Técnico e um na Análise.'
      USING ERRCODE='23514';
  END IF;
  IF (
    SELECT count(DISTINCT trim(value))
    FROM jsonb_array_elements_text(v_doc->'fiscais_rtma')
  ) < 2 THEN
    RAISE EXCEPTION 'Os dois fiscais do Relatório Técnico devem ser distintos.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.eletivas_correcoes c
      WHERE c.competencia_id=p_comp AND c.status IN('em_analise','duplicada')) THEN
    RAISE EXCEPTION 'Correções pendentes ou duplicadas devem ser revisadas antes de encerrar.'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_itens i
     WHERE i.competencia_id=p_comp AND i.decisao='analise') THEN
    RAISE EXCEPTION 'Existem itens com decisão em análise ainda aberta.' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(valor),0) INTO v_ajustes
    FROM public.eletivas_correcoes
    WHERE competencia_id=p_comp AND status='aprovada';

  SELECT COALESCE(
    sum(public.ec_valor_item_documentado(categoria,situacao,decisao,
      valor_publicado,valor_esperado,detalhe)),0
  ) INTO v_total
  FROM public.eletivas_itens WHERE competencia_id=p_comp;
  v_total := round(v_total+v_ajustes,2);
  IF v_total<0 THEN
    RAISE EXCEPTION 'Valor líquido negativo: confira correções.'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.eletivas_competencias SET
    valor_fechado=v_total,status='encerrada',fechado_em=now(),fechado_por=auth.uid()
    WHERE id=p_comp;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.ec_resumo(p_comp uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $resumo_curto$
 SELECT jsonb_build_object(
  'valor_conciliado',coalesce(sum(public.ec_valor_item_documentado(
   categoria,situacao,decisao,valor_publicado,valor_esperado,detalhe)),0),
  'itens',count(*),
  'pendencias',count(*) FILTER(WHERE situacao IN('div','nc','fora','pendente')
    AND decisao IS NULL)
 ) FROM public.eletivas_itens WHERE competencia_id=p_comp;
$resumo_curto$;

REVOKE ALL ON FUNCTION public.ec_valor_item_documentado(
 text,text,text,numeric,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_valor_item_documentado(
 text,text,text,numeric,numeric,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.ec_resumo_financeiro(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_resumo_financeiro(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_encerrar(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ec_resumo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_resumo(uuid) TO authenticated;
COMMIT;
