-- Corrige o trigger genérico do Piso para não acessar campos inexistentes em NEW/OLD.
CREATE OR REPLACE FUNCTION public.piso_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  etapa int := NULL;
  old_j jsonb;
  new_j jsonb;
  base_j jsonb;
  k text;
  diffs jsonb := '{}'::jsonb;
  rotulo text := TG_TABLE_NAME;
  part uuid;
  prest uuid;
  inst text;
  doc_id uuid;
  obrigacao_id uuid;
  categoria_arquivo text;
  tipo_documento text;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  old_j := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_j := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;

  IF TG_TABLE_NAME = 'piso_competencias' THEN
    comp := COALESCE(NULLIF(new_j->>'id','')::uuid, NULLIF(old_j->>'id','')::uuid);
  ELSIF TG_TABLE_NAME = 'piso_participantes' THEN
    comp := COALESCE(NULLIF(new_j->>'competencia_id','')::uuid, NULLIF(old_j->>'competencia_id','')::uuid);
    part := COALESCE(NULLIF(new_j->>'id','')::uuid, NULLIF(old_j->>'id','')::uuid);
    prest := COALESCE(NULLIF(new_j->>'prestador_id','')::uuid, NULLIF(old_j->>'prestador_id','')::uuid);
  ELSIF TG_TABLE_NAME IN ('piso_arquivos','piso_documentos') THEN
    comp := COALESCE(NULLIF(new_j->>'competencia_id','')::uuid, NULLIF(old_j->>'competencia_id','')::uuid);
    part := COALESCE(NULLIF(new_j->>'participante_id','')::uuid, NULLIF(old_j->>'participante_id','')::uuid);
    IF part IS NULL AND TG_TABLE_NAME = 'piso_documentos' THEN
      obrigacao_id := COALESCE(NULLIF(new_j->>'obrigacao_id','')::uuid, NULLIF(old_j->>'obrigacao_id','')::uuid);
      IF obrigacao_id IS NOT NULL THEN
        SELECT participante_id INTO part FROM public.piso_obrigacoes WHERE id = obrigacao_id;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('piso_participante_cnes','piso_obrigacoes') THEN
    part := COALESCE(NULLIF(new_j->>'participante_id','')::uuid, NULLIF(old_j->>'participante_id','')::uuid);
    IF part IS NOT NULL THEN
      SELECT competencia_id, prestador_id INTO comp, prest FROM public.piso_participantes WHERE id = part;
    END IF;
  ELSIF TG_TABLE_NAME IN ('piso_documento_assinaturas','piso_encaminhamentos') THEN
    doc_id := COALESCE(NULLIF(new_j->>'documento_id','')::uuid, NULLIF(old_j->>'documento_id','')::uuid);
    IF doc_id IS NOT NULL THEN
      SELECT d.competencia_id, COALESCE(d.participante_id, o.participante_id)
        INTO comp, part
        FROM public.piso_documentos d
        LEFT JOIN public.piso_obrigacoes o ON o.id = d.obrigacao_id
        WHERE d.id = doc_id;
    END IF;
  END IF;

  IF part IS NOT NULL AND prest IS NULL THEN
    SELECT prestador_id INTO prest FROM public.piso_participantes WHERE id = part;
  END IF;
  IF prest IS NOT NULL THEN
    SELECT nome_instituicao INTO inst FROM public.prestadores WHERE id = prest;
  END IF;
  IF comp IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  base_j := jsonb_strip_nulls(jsonb_build_object(
    'participante_id', part,
    'prestador_id', prest,
    'instituicao_nome', inst
  ));

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (
      comp, uid, uname, 'Piso · removido: ' || rotulo,
      base_j || jsonb_strip_nulls(jsonb_build_object(
        'tipo', old_j->'tipo', 'slot', old_j->'slot', 'arquivo', old_j->'nome_original'
      ))
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (
      comp, uid, uname, 'Piso · criado: ' || rotulo,
      base_j || jsonb_strip_nulls(jsonb_build_object(
        'competencia', new_j->'competencia', 'tipo', new_j->'tipo', 'slot', new_j->'slot',
        'servidor', new_j->'servidor_nome', 'acao', new_j->'acao', 'destino', new_j->'destino',
        'arquivo', new_j->'nome_original', 'sha256', new_j->'sha256',
        'categoria', new_j->'categoria', 'valor_a_liquidar', new_j->'valor_a_liquidar'
      ))
    );
  ELSE
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k = ANY(ARRAY['updated_at','created_at','etapas_reconferir','investsus_resumo','investsus_auditoria','auditoria_resumo']) THEN
        CONTINUE;
      END IF;
      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(k, jsonb_build_object('de', old_j->k, 'para', new_j->k));
      END IF;
    END LOOP;

    IF TG_TABLE_NAME = 'piso_participantes'
      AND (new_j->'auditoria_resumo') IS DISTINCT FROM (old_j->'auditoria_resumo') THEN
      diffs := diffs || jsonb_build_object(
        'auditoria_planilha',
        jsonb_build_object(
          'linhas', new_j->'auditoria_resumo'->'linhas',
          'ocorrencias', new_j->'auditoria_resumo'->'ocorrencias'
        )
      );
    END IF;

    IF TG_TABLE_NAME = 'piso_competencias'
      AND (new_j->'investsus_auditoria') IS DISTINCT FROM (old_j->'investsus_auditoria') THEN
      diffs := diffs || jsonb_build_object(
        'conciliacao_auditoria',
        jsonb_build_object(
          'criticas', new_j->'investsus_auditoria'->'conciliacao'->'criticas',
          'alertas', new_j->'investsus_auditoria'->'conciliacao'->'alertas'
        )
      );
    END IF;

    IF diffs = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (comp, uid, uname, 'Piso · atualizado: ' || rotulo, base_j || diffs);
  END IF;

  IF TG_TABLE_NAME = 'piso_competencias' AND TG_OP = 'UPDATE' THEN
    IF diffs ?| ARRAY['investsus_carga_em','investsus_confirmacao_em','investsus_ocorrencia'] THEN etapa := 1;
    ELSIF diffs ?| ARRAY['valor_apurado_investsus','valor_homologado','desconto_saldo','acerto_contas','valor_transferido','portaria_gm_numero','portaria_gm_url_dou'] THEN etapa := 2;
    ELSIF diffs ?| ARRAY['total_publicado_municipal','municipal_config'] THEN etapa := 3;
    ELSIF diffs ?| ARRAY['credito_fms_valor','credito_fms_data','credito_fms_referencia'] THEN etapa := 4;
    END IF;
  ELSIF TG_TABLE_NAME = 'piso_arquivos' THEN
    categoria_arquivo := COALESCE(new_j->>'categoria', old_j->>'categoria');
    etapa := CASE WHEN categoria_arquivo IN ('investsus','portaria_gm') THEN 2 ELSE 1 END;
  ELSIF TG_TABLE_NAME IN ('piso_participantes','piso_participante_cnes') THEN
    etapa := 1;
  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN
    etapa := CASE
      WHEN diffs ?| ARRAY['valor_pago','data_pagamento','data_programacao'] THEN 7
      WHEN diffs ?| ARRAY['data_solicitacao_liquidacao','data_movimento_liquidacao','movimento_transmitido'] THEN 6
      ELSE 5
    END;
  ELSIF TG_TABLE_NAME = 'piso_documentos' THEN
    tipo_documento := COALESCE(new_j->>'tipo', old_j->>'tipo');
    etapa := public.piso_etapa_doc(tipo_documento);
  END IF;

  IF etapa IS NOT NULL THEN PERFORM public.piso_marcar_reconferencia(comp, etapa); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_audit() FROM PUBLIC, anon, authenticated;
