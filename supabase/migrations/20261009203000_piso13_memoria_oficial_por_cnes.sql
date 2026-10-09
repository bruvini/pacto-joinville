-- PVH/Piso: manter a distribuição detalhada por CNES de uma fonte oficial.
-- Completa a memória da 13ª já processada no servidor, sem produzir
-- cálculos mensais automáticos nem reprocessar registros anteriores.
-- Mesmo controle de acesso da versão anterior (service_role).
BEGIN;

CREATE OR REPLACE FUNCTION public.piso_aplicar_memoria_13_cnes(
  p_competencia uuid,
  p_arquivo uuid,
  p_linhas jsonb,
  p_autor uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.piso_competencias%ROWTYPE;
  v_arquivo public.piso_arquivos%ROWTYPE;
  v_item jsonb;
  v_cnes text;
  v_valor numeric;
  v_destino uuid;
  v_quantidade integer;
  v_total numeric := 0;
  v_somas jsonb := '{}'::jsonb;
  v_por_cnes jsonb := '{}'::jsonb;
  v_cnes_vistos text[] := ARRAY[]::text[];
  v_part record;
  v_nome text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Processamento da 13ª é exclusivo da função de evidências.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_comp FROM public.piso_competencias WHERE id = p_competencia FOR UPDATE;
  IF NOT FOUND OR v_comp.tipo_parcela <> 'decimo_terceiro' THEN
    RAISE EXCEPTION 'Competência da 13ª parcela não encontrada.' USING ERRCODE='23514';
  END IF;
  IF v_comp.status = 'encerrada' OR
    EXISTS (SELECT 1 FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=p_competencia) THEN
    RAISE EXCEPTION 'Reabra formalmente e reconcilie as obrigações antes de reprocessar a memória.'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_arquivo FROM public.piso_arquivos
  WHERE id=p_arquivo AND competencia_id=p_competencia AND categoria='afc13_cnes';
  IF NOT FOUND OR COALESCE(v_arquivo.sha256,'') = '' THEN
    RAISE EXCEPTION 'Arquivo fonte da 13ª não localizado ou sem hash.' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_linhas) = 0
    OR jsonb_array_length(p_linhas) > 20000 THEN
    RAISE EXCEPTION 'Memória por CNES ausente ou fora do limite de 20.000 linhas.' USING ERRCODE='23514';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas)
  LOOP
    v_cnes := regexp_replace(COALESCE(v_item->>'cnes',''), '[^0-9]', '', 'g');
    IF v_cnes !~ '^[0-9]{7}$' OR v_cnes = ANY(v_cnes_vistos) THEN
      RAISE EXCEPTION 'CNES inválido ou duplicado na memória da 13ª.' USING ERRCODE='23514';
    END IF;
    v_cnes_vistos := array_append(v_cnes_vistos, v_cnes);
    IF COALESCE(v_item->>'valor','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Valor inválido na memória da 13ª para CNES %.', v_cnes USING ERRCODE='23514';
    END IF;
    v_valor := (v_item->>'valor')::numeric;
    v_por_cnes := jsonb_set(v_por_cnes, ARRAY[v_cnes], to_jsonb(v_valor), true);
    SELECT count(DISTINCT p.id), (array_agg(DISTINCT p.id))[1] INTO v_quantidade, v_destino
      FROM public.piso_participantes p
      JOIN public.prestador_cnes cn ON cn.prestador_id=p.prestador_id
      WHERE p.competencia_id=p_competencia
        AND regexp_replace(cn.cnes::text, '[^0-9]', '', 'g')=v_cnes;
    IF v_quantidade <> 1 THEN
      RAISE EXCEPTION 'CNES % não corresponde unicamente a instituição participante.', v_cnes
        USING ERRCODE='23514';
    END IF;
    v_somas := jsonb_set(v_somas, ARRAY[v_destino::text],
      to_jsonb(COALESCE((v_somas->>v_destino::text)::numeric,0)+v_valor), true);
    v_total := v_total + v_valor;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    IF NOT COALESCE(v_part.sem_elegiveis,false) AND NOT (v_somas ? v_part.id::text) THEN
      RAISE EXCEPTION 'Instituição % não consta da memória por CNES da 13ª.', v_part.id
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    UPDATE public.piso_participantes
       SET valor_devido = COALESCE((v_somas->>v_part.id::text)::numeric,0)
     WHERE id=v_part.id;
  END LOOP;
  UPDATE public.piso_competencias SET
    investsus_resumo=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'sha256',v_arquivo.sha256,'total_complemento',v_total,
      'por_cnes',v_por_cnes,
      'linhas',jsonb_array_length(p_linhas)),
    investsus_auditoria=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'versao_regras',5,
      'interna',jsonb_build_object('erros',0,'alertas',0),
      'conciliacao',jsonb_build_object('criticas',0,'alertas',0)),
    valor_apurado_investsus=v_total,
    total_publicado_municipal=v_total
  WHERE id=p_competencia;
  SELECT nome INTO v_nome FROM public.profiles WHERE id=p_autor;
  INSERT INTO public.historico_logs
    (piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES (p_competencia,p_autor,v_nome,'Piso · memória oficial da 13ª conciliada por CNES',
    jsonb_build_object('arquivo_id',p_arquivo,'sha256',v_arquivo.sha256,
      'total',v_total,'quantidade_cnes',array_length(v_cnes_vistos,1),
      'exercicio',v_comp.exercicio_referencia));
  RETURN v_total;
END;
$$;

COMMIT;
