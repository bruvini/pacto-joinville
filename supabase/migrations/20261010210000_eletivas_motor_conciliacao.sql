-- Encontro de Contas Eletivas: ingestão transacional de conciliação automatizada.
-- Depende da migration 20261010200000_eletivas_encontro_contas_fundacao.sql corrigida.
-- Exige execução pela Edge Function com service_role; cliente não pode atribuir
-- origem parser_validado nem fabricar decisões humanas.
BEGIN;

ALTER TABLE public.eletivas_itens
  ADD COLUMN IF NOT EXISTS detalhe jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.ec_importar_itens_processados(
  p_comp uuid,
  p_arquivos uuid[],
  p_itens jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v public.eletivas_competencias%ROWTYPE;
  v_item jsonb;
  v_categoria text;
  v_qtd int := 0;
  v_fontes text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Ingestão automatizada restrita ao servidor autorizado.'
      USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_itens)=0
     OR jsonb_array_length(p_itens)>10000 THEN
    RAISE EXCEPTION 'Lote de conciliação vazio ou excessivo.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
  IF NOT FOUND OR v.status='encerrada' THEN
    RAISE EXCEPTION 'Competência não encontrada ou já encerrada.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_itens
     WHERE competencia_id=p_comp AND (decisao IS NOT NULL OR conferido_por IS NOT NULL)) THEN
    RAISE EXCEPTION 'Auditoria humana iniciada. Não substitua itens sem revisão formal.'
      USING ERRCODE='23514';
  END IF;

  SELECT array_agg(DISTINCT categoria) INTO v_fontes
    FROM public.eletivas_arquivos
    WHERE competencia_id=p_comp AND id=ANY(p_arquivos);
  IF v_fontes IS NULL OR NOT v_fontes @> ARRAY['dbf_faec','dbf_mac','s_faec','s_mac']::text[] THEN
    RAISE EXCEPTION 'As quatro fontes obrigatórias devem estar vinculadas à competência.'
      USING ERRCODE='23514';
  END IF;

  -- Alteração atômica: todo lote validado ou nenhuma linha substituída.
  DELETE FROM public.eletivas_itens WHERE competencia_id=p_comp;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR COALESCE(v_item->>'chave','')=''
       OR COALESCE(v_item->>'descricao','')=''
       OR COALESCE(v_item->>'categoria','')=''
       OR COALESCE(v_item->>'situacao','')='' THEN
      RAISE EXCEPTION 'Item de conciliação incompleto.' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.eletivas_itens (
      competencia_id,chave,categoria,descricao,procedimento,aih,origem,
      valor_publicado,valor_esperado,situacao,detalhe
    ) VALUES (
      p_comp,v_item->>'chave',v_item->>'categoria',v_item->>'descricao',
      nullif(v_item->>'procedimento',''),nullif(v_item->>'aih',''),
      'parser_validado',(v_item->>'valor_publicado')::numeric,
      (v_item->>'valor_esperado')::numeric,v_item->>'situacao',
      COALESCE(v_item->'detalhe','{}'::jsonb)
    );
    v_qtd:=v_qtd+1;
  END LOOP;
  UPDATE public.eletivas_competencias
     SET status='auditoria' WHERE id=p_comp;
  INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
  VALUES(p_comp,'motor_conciliacao',
    jsonb_build_object('itens',v_qtd,'arquivos',COALESCE(array_length(p_arquivos,1),0),
      'categorias',to_jsonb(v_fontes),'origem','edge_function'),null);
  RETURN v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.ec_importar_itens_processados(uuid,uuid[],jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ec_importar_itens_processados(uuid,uuid[],jsonb)
  TO service_role;

COMMIT;
