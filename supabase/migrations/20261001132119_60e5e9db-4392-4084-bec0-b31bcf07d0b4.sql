ALTER TABLE public.historico_logs ADD COLUMN IF NOT EXISTS piso_competencia_id uuid;

CREATE TABLE public.piso_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'aberta',
  processo_sei text, link_processo_sei text,
  investsus_carga_em date, investsus_confirmacao_em date,
  investsus_resumo jsonb,
  valor_apurado_investsus numeric(14,2),
  portaria_gm_numero text, portaria_gm_data_ato date, portaria_gm_data_publicacao date,
  portaria_gm_edicao text, portaria_gm_url_dou text,
  valor_homologado numeric(14,2), desconto_saldo numeric(14,2), acerto_contas numeric(14,2), valor_transferido numeric(14,2),
  justificativa_conciliacao text, conciliacao_excecao_por text, conciliacao_excecao_em timestamptz,
  total_publicado_municipal numeric(14,2),
  credito_fms_data date, credito_fms_valor numeric(14,2), credito_fms_link text,
  saldo_afc_anterior numeric(14,2), fonte_recurso_atual text, fonte_saldo_afc text, justificativa_credito text,
  observacao text,
  etapas_concluidas jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapas_reconferir int[] NOT NULL DEFAULT '{}',
  encerrada_em timestamptz, encerrada_por text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE CASCADE,
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id),
  data_envio date, data_retorno date,
  situacao text NOT NULL DEFAULT 'aguardando_envio',
  observacao text,
  sem_elegiveis boolean NOT NULL DEFAULT false,
  auditoria_resumo jsonb,
  valor_devido numeric(14,2), valor_recurso_atual numeric(14,2), valor_saldo_afc numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competencia_id, prestador_id)
);

CREATE TABLE public.piso_participante_cnes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
  cnes text NOT NULL,
  nome_estabelecimento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participante_id, cnes)
);

CREATE TABLE public.piso_obrigacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
  processo_sei text, link_processo_sei text,
  origem_recurso text NOT NULL DEFAULT 'atual',
  fonte text,
  saldo_disponivel numeric(14,2), valor_a_liquidar numeric(14,2),
  valor_pago numeric(14,2), data_pagamento date,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE CASCADE,
  participante_id uuid REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
  obrigacao_id uuid REFERENCES public.piso_obrigacoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  numero text, numero_sei text, link_sei text, data_documento date,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid, updated_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX piso_documentos_escopo_tipo ON public.piso_documentos
  (competencia_id, COALESCE(participante_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(obrigacao_id,'00000000-0000-0000-0000-000000000000'::uuid), tipo);

CREATE TABLE public.piso_documento_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.piso_documentos(id) ON DELETE CASCADE,
  slot text NOT NULL, servidor_nome text, cargo text,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  assinado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_encaminhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.piso_documentos(id) ON DELETE CASCADE,
  acao text NOT NULL DEFAULT 'encaminhado',
  destino text, motivo text,
  usuario_id uuid, usuario_nome text,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE CASCADE,
  participante_id uuid REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.piso_documentos(id) ON DELETE SET NULL,
  categoria text NOT NULL,
  nome_original text NOT NULL, tamanho bigint, mime text, sha256 text, storage_path text NOT NULL,
  enviado_por uuid, enviado_por_nome text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE CASCADE,
  participante_id uuid REFERENCES public.piso_participantes(id) ON DELETE CASCADE,
  arquivo_id uuid REFERENCES public.piso_arquivos(id) ON DELETE CASCADE,
  severidade text NOT NULL DEFAULT 'alerta',
  regra text NOT NULL, linha int, descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_feriados (
  data date PRIMARY KEY,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.piso_assinatura_matriz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento text NOT NULL,
  slot_key text NOT NULL, label text NOT NULL,
  cargos text[] NOT NULL DEFAULT '{}',
  manual boolean NOT NULL DEFAULT false,
  qualquer boolean NOT NULL DEFAULT false,
  opcional boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_documento, slot_key)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piso_competencias, public.piso_participantes, public.piso_participante_cnes,
  public.piso_obrigacoes, public.piso_documentos, public.piso_documento_assinaturas, public.piso_encaminhamentos,
  public.piso_arquivos, public.piso_ocorrencias, public.piso_feriados, public.piso_assinatura_matriz TO authenticated;
GRANT ALL ON public.piso_competencias, public.piso_participantes, public.piso_participante_cnes,
  public.piso_obrigacoes, public.piso_documentos, public.piso_documento_assinaturas, public.piso_encaminhamentos,
  public.piso_arquivos, public.piso_ocorrencias, public.piso_feriados, public.piso_assinatura_matriz TO service_role;

-- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['piso_competencias','piso_participantes','piso_participante_cnes','piso_obrigacoes','piso_documentos','piso_documento_assinaturas','piso_arquivos','piso_ocorrencias'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "piso read" ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))', t);
    EXECUTE format('CREATE POLICY "piso insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))', t);
    EXECUTE format('CREATE POLICY "piso update" ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))', t);
    EXECUTE format('CREATE POLICY "piso delete" ON public.%I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''admin'',''acp'',''aco'']::app_role[]))', t);
  END LOOP;
END $$;
-- Competência: só admin exclui
DROP POLICY "piso delete" ON public.piso_competencias;
CREATE POLICY "piso delete" ON public.piso_competencias FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Encaminhamentos: append-only
ALTER TABLE public.piso_encaminhamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "piso read" ON public.piso_encaminhamentos FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "piso insert" ON public.piso_encaminhamentos FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]) AND usuario_id = auth.uid());

-- Configurações: leitura por todos com papel; escrita só admin
ALTER TABLE public.piso_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piso_assinatura_matriz ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read" ON public.piso_feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write" ON public.piso_feriados FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "read" ON public.piso_assinatura_matriz FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write" ON public.piso_assinatura_matriz FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- updated_at
CREATE TRIGGER trg_piso_comp_upd BEFORE UPDATE ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_piso_part_upd BEFORE UPDATE ON public.piso_participantes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_piso_obr_upd BEFORE UPDATE ON public.piso_obrigacoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_piso_doc_upd BEFORE UPDATE ON public.piso_documentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Encerrar/reabrir: apenas admin ou ACP; competência encerrada só muda para reabrir
CREATE OR REPLACE FUNCTION public.piso_guarda_competencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]) THEN
      RAISE EXCEPTION 'Apenas Admin ou ACP podem encerrar/reabrir a competência.' USING ERRCODE='42501';
    END IF;
  ELSIF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada: reabra antes de alterar.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_piso_guarda BEFORE UPDATE ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.piso_guarda_competencia();

-- Reconferência: marca etapas concluídas posteriores
CREATE OR REPLACE FUNCTION public.piso_marcar_reconferencia(p_comp uuid, p_etapa int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE novas int[];
BEGIN
  SELECT COALESCE(array_agg(k::int), '{}') INTO novas
    FROM public.piso_competencias c, jsonb_object_keys(c.etapas_concluidas) k
    WHERE c.id = p_comp AND k::int > p_etapa;
  IF array_length(novas,1) > 0 THEN
    UPDATE public.piso_competencias
      SET etapas_reconferir = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(etapas_reconferir || novas) x)
      WHERE id = p_comp AND status <> 'encerrada';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.piso_etapa_doc(p_tipo text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_tipo IN ('minuta','memorando','portaria_municipal') THEN 3
    WHEN p_tipo IN ('credito_fms') THEN 4
    WHEN p_tipo IN ('solicitacao_ne','nota_empenho') THEN 5
    WHEN p_tipo IN ('solicitacao_liquidacao','aviso_liquidacao') THEN 6
    WHEN p_tipo IN ('aviso_subempenho','programacao_pagamento','comprovante_pagamento') THEN 7
    ELSE 2 END
$$;

-- Auditoria genérica do Piso (sem CPF; apenas diffs de colunas)
CREATE OR REPLACE FUNCTION public.piso_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); uname text; comp uuid; etapa int := NULL;
  old_j jsonb; new_j jsonb; k text; diffs jsonb := '{}'::jsonb;
  ign text[] := ARRAY['updated_at','created_at','etapas_reconferir','investsus_resumo','auditoria_resumo'];
  rotulo text := TG_TABLE_NAME;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  IF TG_TABLE_NAME = 'piso_competencias' THEN comp := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME IN ('piso_participantes','piso_documentos','piso_arquivos') THEN comp := COALESCE(NEW.competencia_id, OLD.competencia_id);
  ELSIF TG_TABLE_NAME = 'piso_participante_cnes' THEN SELECT competencia_id INTO comp FROM public.piso_participantes WHERE id = COALESCE(NEW.participante_id, OLD.participante_id);
  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN SELECT competencia_id INTO comp FROM public.piso_participantes WHERE id = COALESCE(NEW.participante_id, OLD.participante_id);
  ELSIF TG_TABLE_NAME IN ('piso_documento_assinaturas','piso_encaminhamentos') THEN SELECT competencia_id INTO comp FROM public.piso_documentos WHERE id = COALESCE(NEW.documento_id, OLD.documento_id);
  END IF;
  IF comp IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    old_j := to_jsonb(OLD);
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (comp, uid, uname, 'Piso · removido: ' || rotulo, jsonb_build_object('id', old_j->'id', 'tipo', old_j->'tipo', 'slot', old_j->'slot'));
  ELSIF TG_OP = 'INSERT' THEN
    new_j := to_jsonb(NEW);
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (comp, uid, uname, 'Piso · criado: ' || rotulo,
        jsonb_strip_nulls(jsonb_build_object('tipo', new_j->'tipo', 'slot', new_j->'slot', 'servidor', new_j->'servidor_nome', 'acao', new_j->'acao', 'destino', new_j->'destino', 'arquivo', new_j->'nome_original', 'sha256', new_j->'sha256')));
  ELSE
    old_j := to_jsonb(OLD); new_j := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k = ANY(ign) THEN CONTINUE; END IF;
      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(k, jsonb_build_object('de', old_j->k, 'para', new_j->k));
      END IF;
    END LOOP;
    IF diffs = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO public.historico_logs(piso_competencia_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (comp, uid, uname, 'Piso · atualizado: ' || rotulo, diffs);
  END IF;

  -- Reconferência (exceto mudanças só de controle de etapas)
  IF TG_TABLE_NAME = 'piso_competencias' THEN
    IF TG_OP = 'UPDATE' THEN
      IF diffs ?| ARRAY['investsus_carga_em','investsus_confirmacao_em'] THEN etapa := 1;
      ELSIF diffs ?| ARRAY['valor_apurado_investsus','valor_homologado','desconto_saldo','acerto_contas','valor_transferido','portaria_gm_numero'] THEN etapa := 2;
      ELSIF diffs ? 'total_publicado_municipal' THEN etapa := 3;
      ELSIF diffs ?| ARRAY['credito_fms_valor','saldo_afc_anterior'] THEN etapa := 4;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('piso_participantes','piso_participante_cnes') THEN etapa := CASE WHEN diffs ?| ARRAY['valor_recurso_atual','valor_saldo_afc'] THEN 4 ELSE 1 END;
  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN etapa := CASE WHEN diffs ?| ARRAY['valor_pago','data_pagamento'] THEN 7 ELSE 5 END;
  ELSIF TG_TABLE_NAME = 'piso_documentos' THEN etapa := public.piso_etapa_doc(COALESCE(NEW.tipo, OLD.tipo));
  END IF;
  IF etapa IS NOT NULL THEN PERFORM public.piso_marcar_reconferencia(comp, etapa); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['piso_competencias','piso_participantes','piso_participante_cnes','piso_obrigacoes','piso_documentos','piso_documento_assinaturas','piso_encaminhamentos','piso_arquivos'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.piso_audit()', t, t);
  END LOOP;
END $$;

-- Matriz inicial (regras indicadas na especificação)
INSERT INTO public.piso_assinatura_matriz (tipo_documento, slot_key, label, cargos, manual, qualquer, ordem) VALUES
 ('minuta','gerente','Gerente / Coordenador ACP', ARRAY['Gerente','Coordenador ACP','Coordenador'], false, true, 1),
 ('minuta','diretor','Diretor de Serviços Complementares', ARRAY['Diretor de Serviços Complementares'], false, false, 2),
 ('memorando','fiscal','Fiscal', ARRAY['Fiscal'], false, false, 1),
 ('memorando','gerente','Gerente / Coordenador ACP', ARRAY['Gerente','Coordenador ACP','Coordenador'], false, true, 2),
 ('solicitacao_liquidacao','fiscal','Fiscal', ARRAY['Fiscal'], false, false, 1),
 ('solicitacao_liquidacao','comissao','Membro da Comissão de Gestão e Controle de Despesa', ARRAY[]::text[], true, false, 2),
 ('aviso_liquidacao','fiscal','Fiscal', ARRAY['Fiscal'], false, false, 1),
 ('aviso_liquidacao','comissao','Membro da Comissão de Gestão e Controle de Despesa', ARRAY[]::text[], true, false, 2);