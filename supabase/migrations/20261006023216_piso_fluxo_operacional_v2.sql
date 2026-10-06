-- Evolução aditiva do fluxo operacional do Piso da Enfermagem.
-- Mantém colunas legadas para compatibilidade e não remove dados.

ALTER TABLE public.piso_competencias
  ADD COLUMN IF NOT EXISTS investsus_ocorrencia text,
  ADD COLUMN IF NOT EXISTS investsus_auditoria jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS portaria_gm_secao text,
  ADD COLUMN IF NOT EXISTS portaria_gm_pagina text,
  ADD COLUMN IF NOT EXISTS desconto_identificacao text,
  ADD COLUMN IF NOT EXISTS acerto_identificacao text,
  ADD COLUMN IF NOT EXISTS credito_fms_referencia text,
  ADD COLUMN IF NOT EXISTS municipal_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS relatorio_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS conclusao_ocorrencia text;

ALTER TABLE public.piso_obrigacoes
  ADD COLUMN IF NOT EXISTS exercicio integer,
  ADD COLUMN IF NOT EXISTS cr_dotacao text,
  ADD COLUMN IF NOT EXISTS data_solicitacao_liquidacao date,
  ADD COLUMN IF NOT EXISTS data_movimento_liquidacao date,
  ADD COLUMN IF NOT EXISTS movimento_transmitido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_programacao date;

ALTER TABLE public.piso_ocorrencias
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'carga',
  ADD COLUMN IF NOT EXISTS cpf_mascarado text,
  ADD COLUMN IF NOT EXISTS cnes text,
  ADD COLUMN IF NOT EXISTS instituicao_nome text,
  ADD COLUMN IF NOT EXISTS dados jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_piso_ocorrencias_comp_categoria
  ON public.piso_ocorrencias (competencia_id, categoria, created_at DESC);

-- A situação canônica do participante é derivada dos fatos, nunca escolhida pelo usuário.
CREATE OR REPLACE FUNCTION public.piso_sincronizar_situacao_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.situacao := CASE
    WHEN NEW.data_envio IS NULL THEN 'aguardando_envio'
    WHEN NEW.data_retorno IS NULL THEN 'enviado'
    WHEN NEW.sem_elegiveis THEN 'sem_elegiveis'
    ELSE 'retornado'
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_sincronizar_situacao_participante() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_piso_part_situacao ON public.piso_participantes;
CREATE TRIGGER trg_piso_part_situacao
  BEFORE INSERT OR UPDATE OF data_envio, data_retorno, sem_elegiveis, situacao
  ON public.piso_participantes
  FOR EACH ROW EXECUTE FUNCTION public.piso_sincronizar_situacao_participante();

-- Normaliza registros preexistentes sem apagar qualquer dado operacional.
UPDATE public.piso_participantes
SET situacao = CASE
  WHEN data_envio IS NULL THEN 'aguardando_envio'
  WHEN data_retorno IS NULL THEN 'enviado'
  WHEN sem_elegiveis THEN 'sem_elegiveis'
  ELSE 'retornado'
END;

-- Auditoria contextual: acrescenta snapshot amigável da instituição e mantém os diffs técnicos.
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
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  old_j := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_j := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;

  IF TG_TABLE_NAME = 'piso_competencias' THEN
    comp := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'piso_participantes' THEN
    comp := COALESCE(NEW.competencia_id, OLD.competencia_id);
    part := COALESCE(NEW.id, OLD.id);
    prest := COALESCE(NEW.prestador_id, OLD.prestador_id);
  ELSIF TG_TABLE_NAME IN ('piso_arquivos','piso_documentos') THEN
    comp := COALESCE(NEW.competencia_id, OLD.competencia_id);
    part := COALESCE(NEW.participante_id, OLD.participante_id);
    IF part IS NULL AND TG_TABLE_NAME = 'piso_documentos' THEN
      SELECT participante_id INTO part FROM public.piso_obrigacoes WHERE id = COALESCE(NEW.obrigacao_id, OLD.obrigacao_id);
    END IF;
  ELSIF TG_TABLE_NAME IN ('piso_participante_cnes','piso_obrigacoes') THEN
    part := COALESCE(NEW.participante_id, OLD.participante_id);
    SELECT competencia_id, prestador_id INTO comp, prest FROM public.piso_participantes WHERE id = part;
  ELSIF TG_TABLE_NAME IN ('piso_documento_assinaturas','piso_encaminhamentos') THEN
    SELECT d.competencia_id, COALESCE(d.participante_id, o.participante_id)
      INTO comp, part
      FROM public.piso_documentos d
      LEFT JOIN public.piso_obrigacoes o ON o.id = d.obrigacao_id
      WHERE d.id = COALESCE(NEW.documento_id, OLD.documento_id);
  END IF;
  IF part IS NOT NULL AND prest IS NULL THEN
    SELECT prestador_id INTO prest FROM public.piso_participantes WHERE id = part;
  END IF;
  IF prest IS NOT NULL THEN
    SELECT nome_instituicao INTO inst FROM public.prestadores WHERE id = prest;
  END IF;
  IF comp IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  base_j := jsonb_strip_nulls(jsonb_build_object(
    'participante_id', part,
    'prestador_id', prest,
    'instituicao_nome', inst
  ));

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (
      comp, uid, uname, 'Piso · removido: ' || rotulo,
      base_j || jsonb_strip_nulls(jsonb_build_object('tipo', old_j->'tipo', 'slot', old_j->'slot', 'arquivo', old_j->'nome_original'))
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
      IF k = ANY(ARRAY['updated_at','created_at','etapas_reconferir','investsus_resumo','investsus_auditoria','auditoria_resumo']) THEN CONTINUE; END IF;
      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(k, jsonb_build_object('de', old_j->k, 'para', new_j->k));
      END IF;
    END LOOP;
    IF TG_TABLE_NAME = 'piso_participantes' AND (new_j->'auditoria_resumo') IS DISTINCT FROM (old_j->'auditoria_resumo') THEN
      diffs := diffs || jsonb_build_object('auditoria_planilha', jsonb_build_object(
        'linhas', new_j->'auditoria_resumo'->'linhas',
        'ocorrencias', new_j->'auditoria_resumo'->'ocorrencias'
      ));
    END IF;
    IF TG_TABLE_NAME = 'piso_competencias' AND (new_j->'investsus_auditoria') IS DISTINCT FROM (old_j->'investsus_auditoria') THEN
      diffs := diffs || jsonb_build_object('conciliacao_auditoria', jsonb_build_object(
        'criticas', new_j->'investsus_auditoria'->'conciliacao'->'criticas',
        'alertas', new_j->'investsus_auditoria'->'conciliacao'->'alertas'
      ));
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
  ELSIF TG_TABLE_NAME IN ('piso_participantes','piso_participante_cnes','piso_arquivos') THEN
    etapa := CASE WHEN TG_TABLE_NAME = 'piso_arquivos' AND COALESCE(NEW.categoria, OLD.categoria) IN ('investsus','portaria_gm') THEN 2 ELSE 1 END;
  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN
    etapa := CASE
      WHEN diffs ?| ARRAY['valor_pago','data_pagamento','data_programacao'] THEN 7
      WHEN diffs ?| ARRAY['data_solicitacao_liquidacao','data_movimento_liquidacao','movimento_transmitido'] THEN 6
      ELSE 5 END;
  ELSIF TG_TABLE_NAME = 'piso_documentos' THEN
    etapa := public.piso_etapa_doc(COALESCE(NEW.tipo, OLD.tipo));
  END IF;
  IF etapa IS NOT NULL THEN PERFORM public.piso_marcar_reconferencia(comp, etapa); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_audit() FROM PUBLIC, anon, authenticated;
