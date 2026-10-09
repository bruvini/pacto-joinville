-- ATESTO DE PRODUÇÃO · ENCONTRO DE CONTAS DAS CIRURGIAS ELETIVAS (HMSJ)
-- Etapa de fundação institucional, sem lançar valores no convênio.
-- Base técnica: Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado(4).html.
BEGIN;

CREATE TABLE public.eletivas_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL CHECK (competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
  cnes text NOT NULL DEFAULT '2436469' CHECK (cnes ~ '^[0-9]{7}$'),
  lancamento_id uuid UNIQUE REFERENCES public.lancamentos_pagamento(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'preparacao'
    CHECK (status IN ('preparacao','auditoria','pendente_validacao','encerrada')),
  observacao text,
  documentos jsonb NOT NULL DEFAULT '{}'::jsonb,
  correcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  valor_fechado numeric(16,2),
  fechado_em timestamptz,
  fechado_por uuid REFERENCES auth.users(id),
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competencia, prestador_id),
  CONSTRAINT ec_valor_fechado_status CHECK (
    (status='encerrada' AND valor_fechado IS NOT NULL AND fechado_em IS NOT NULL)
    OR (status<>'encerrada' AND valor_fechado IS NULL AND fechado_em IS NULL)
  )
);

CREATE TABLE public.eletivas_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN (
    'dbf_faec','dbf_mac','dbf_sia','s_faec','s_faec_ms','s_faec_est',
    's_mac_faec','s_mac','s_mac_ms','s_mac_fed','sia_faec','sia_faec_p',
    'sia_mac','ec_delib','fpo_official','wb_aih','rtma','ra','outros'
  )),
  nome_original text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  tamanho bigint NOT NULL CHECK (tamanho > 0),
  enviado_por uuid REFERENCES auth.users(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competencia_id,categoria,sha256)
);

CREATE TABLE public.eletivas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
  chave text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN (
    'faec_prod','faec_compl','faec_mult','faec_fxmac',
    'mac_compl','mac_mult','mac_fxfaec','mac_prod','mac_fxfed',
    'sia_faec','sia_mac'
  )),
  descricao text NOT NULL,
  procedimento text,
  aih text,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','parser_validado')),
  valor_publicado numeric(16,2) NOT NULL DEFAULT 0 CHECK (valor_publicado >= 0),
  valor_esperado numeric(16,2) NOT NULL DEFAULT 0 CHECK (valor_esperado >= 0),
  situacao text NOT NULL DEFAULT 'pendente'
    CHECK (situacao IN ('ok','info','div','nc','fora','pendente')),
  decisao text CHECK (decisao IN ('aceito','oficio','erro','analise')),
  justificativa text,
  conferido_por uuid REFERENCES auth.users(id),
  conferido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competencia_id,chave),
  CONSTRAINT ec_decisao_justificada CHECK (
    decisao IS NULL OR (justificativa IS NOT NULL AND length(btrim(justificativa)) >= 10)
  )
);

CREATE TABLE public.eletivas_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor uuid REFERENCES auth.users(id),
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eletivas_arquivos_comp ON public.eletivas_arquivos(competencia_id,enviado_em);
CREATE INDEX idx_eletivas_itens_comp ON public.eletivas_itens(competencia_id,situacao);
CREATE INDEX idx_eletivas_eventos_comp ON public.eletivas_eventos(competencia_id,ocorrido_em DESC);

CREATE OR REPLACE FUNCTION public.ec_guardar_mutacoes()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_comp uuid;
BEGIN
  v_comp := CASE WHEN TG_OP='DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
  IF EXISTS(SELECT 1 FROM public.eletivas_competencias c
            WHERE c.id=v_comp AND c.status='encerrada') THEN
    RAISE EXCEPTION 'Encontro encerrado. Solicite reabertura formal antes de alterar.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='eletivas_itens' THEN
    IF TG_OP='INSERT' AND NEW.origem='parser_validado'
       AND auth.role() IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres','supabase_admin') THEN
      RAISE EXCEPTION 'A origem processada exige execução autorizada no servidor.'
        USING ERRCODE='42501';
    END IF;
    IF TG_OP='UPDATE' AND auth.role() IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres','supabase_admin') THEN
      IF (OLD.origem='parser_validado' OR NEW.origem='parser_validado')
         AND (NEW.origem IS DISTINCT FROM OLD.origem
           OR NEW.chave IS DISTINCT FROM OLD.chave
           OR NEW.categoria IS DISTINCT FROM OLD.categoria
           OR NEW.descricao IS DISTINCT FROM OLD.descricao
           OR NEW.procedimento IS DISTINCT FROM OLD.procedimento
           OR NEW.aih IS DISTINCT FROM OLD.aih
           OR NEW.valor_publicado IS DISTINCT FROM OLD.valor_publicado
           OR NEW.valor_esperado IS DISTINCT FROM OLD.valor_esperado
           OR NEW.situacao IS DISTINCT FROM OLD.situacao) THEN
        RAISE EXCEPTION 'Origem e valores processados são imutáveis. Registre apenas decisão e justificativa.'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='eletivas_arquivos' AND TG_OP='INSERT' AND NOT EXISTS(
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='eletivas-arquivos' AND o.name=NEW.storage_path
  ) THEN
    RAISE EXCEPTION 'O arquivo ainda não consta do armazenamento privado.'
      USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='eletivas_itens' THEN
    NEW.conferido_por := auth.uid();
    NEW.conferido_em := now();
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ec_arquivos_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.eletivas_arquivos FOR EACH ROW EXECUTE FUNCTION public.ec_guardar_mutacoes();
CREATE TRIGGER ec_itens_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.eletivas_itens FOR EACH ROW EXECUTE FUNCTION public.ec_guardar_mutacoes();

CREATE OR REPLACE FUNCTION public.ec_competencia_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- Este vínculo pertence à competência, não às tabelas filhas.
  -- Nunca referencie NEW.lancamento_id em eletivas_itens/eletivas_arquivos.
  IF NEW.lancamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lancamentos_pagamento l
    JOIN public.convenios cv ON cv.id=l.convenio_id
    WHERE l.id=NEW.lancamento_id
      AND l.competencia=NEW.competencia
      AND cv.prestador_id=NEW.prestador_id
      AND cv.objeto ILIKE '%eletiv%'
  ) THEN
    RAISE EXCEPTION 'Vínculo inválido: competência e convênio de cirurgias eletivas devem coincidir.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status='encerrada' OR NEW.valor_fechado IS NOT NULL OR NEW.fechado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Novo encontro deve iniciar sem encerramento ou valor atestado.'
        USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.criado_por IS DISTINCT FROM OLD.criado_por OR
       NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
      RAISE EXCEPTION 'A autoria e a data de criação são imutáveis.' USING ERRCODE='23514';
    END IF;
    IF OLD.status='encerrada' AND (
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.fechado_em IS DISTINCT FROM OLD.fechado_em OR
      NEW.fechado_por IS DISTINCT FROM OLD.fechado_por OR
      NEW.cnes IS DISTINCT FROM OLD.cnes OR
      NEW.competencia IS DISTINCT FROM OLD.competencia
      OR NEW.prestador_id IS DISTINCT FROM OLD.prestador_id
      OR NEW.documentos IS DISTINCT FROM OLD.documentos
      OR NEW.correcoes IS DISTINCT FROM OLD.correcoes
      OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
      OR NEW.valor_fechado IS DISTINCT FROM OLD.valor_fechado
    ) THEN
      RAISE EXCEPTION 'Encontro encerrado: dados imutáveis.' USING ERRCODE='23514';
    END IF;
    IF NEW.status='encerrada' AND OLD.status<>'encerrada'
      AND current_user NOT IN ('postgres','supabase_admin')
      AND coalesce(auth.role(),'') <> 'service_role' THEN
      RAISE EXCEPTION 'Encerramento somente por procedimento de validação.'
        USING ERRCODE='42501';
    END IF;
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ec_comp_guard BEFORE INSERT OR UPDATE ON public.eletivas_competencias
  FOR EACH ROW EXECUTE FUNCTION public.ec_competencia_guard();

-- Histórico auditável produzido pelo servidor; não armazena paciente/CPF.
CREATE OR REPLACE FUNCTION public.ec_registrar_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_comp uuid; v_dados jsonb;
BEGIN
  v_comp := CASE
    WHEN TG_TABLE_NAME='eletivas_competencias'
      THEN CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END
    ELSE CASE WHEN TG_OP='DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END
  END;
  v_dados := jsonb_build_object('operacao',TG_OP,'tabela',TG_TABLE_NAME);
  IF TG_TABLE_NAME='eletivas_itens' THEN
    v_dados := v_dados || jsonb_build_object(
      'chave',CASE WHEN TG_OP='DELETE' THEN OLD.chave ELSE NEW.chave END,
      'decisao_anterior',CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.decisao END,
      'situacao_anterior',CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.situacao END,
      'valor_anterior',CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.valor_publicado END,
      'decisao_nova',CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.decisao END,
      'valor_novo',CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.valor_publicado END
    );
  ELSIF TG_TABLE_NAME='eletivas_competencias' THEN
    v_dados := v_dados || jsonb_build_object(
      'status_anterior',CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,
      'status_novo',CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.status END,
      'correcoes_anteriores',CASE WHEN TG_OP='INSERT' THEN 0 ELSE jsonb_array_length(OLD.correcoes) END,
      'correcoes_atuais',CASE WHEN TG_OP='DELETE' THEN NULL ELSE jsonb_array_length(NEW.correcoes) END
    );
  ELSE
    v_dados := v_dados || jsonb_build_object('categoria', CASE WHEN TG_OP='DELETE' THEN OLD.categoria ELSE NEW.categoria END);
  END IF;
  INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
  VALUES(v_comp, TG_TABLE_NAME||'_'||lower(TG_OP),v_dados,auth.uid());
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
-- Eventos filhos devem preservar trilha; impedir exclusão da competência quando houver evidências.
CREATE TRIGGER ec_comp_audit AFTER INSERT OR UPDATE ON public.eletivas_competencias
  FOR EACH ROW EXECUTE FUNCTION public.ec_registrar_evento();
CREATE TRIGGER ec_arquivos_audit AFTER INSERT OR UPDATE OR DELETE ON public.eletivas_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.ec_registrar_evento();
CREATE TRIGGER ec_itens_audit AFTER INSERT OR UPDATE OR DELETE ON public.eletivas_itens
  FOR EACH ROW EXECUTE FUNCTION public.ec_registrar_evento();

CREATE OR REPLACE FUNCTION public.ec_valor_item(
  p_categoria text,p_situacao text,p_decisao text,p_publicado numeric,p_esperado numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_categoria='faec_fxmac' THEN 0::numeric
    WHEN p_situacao IN ('ok','info') OR p_decisao='aceito' THEN p_publicado
    WHEN p_decisao='erro' THEN 0::numeric
    WHEN p_publicado=0 THEN 0::numeric
    WHEN p_esperado>0 THEN least(p_publicado,p_esperado)
    ELSE p_publicado
  END;
$$;

CREATE OR REPLACE FUNCTION public.ec_resumo(p_comp uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'valor_conciliado',COALESCE(SUM(public.ec_valor_item(categoria,situacao,decisao,valor_publicado,valor_esperado)),0),
    'itens',count(*),
    'pendencias',count(*) FILTER (WHERE situacao IN ('div','nc','fora','pendente') AND decisao IS NULL)
  ) FROM public.eletivas_itens WHERE competencia_id=p_comp;
$$;

-- Encerramento valida documentação e decisões. Não publica o valor no convênio.
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
    auth.uid(),ARRAY['admin','acp']::app_role[]) THEN
    RAISE EXCEPTION 'Perfil não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
  IF NOT FOUND OR v.status='encerrada' THEN
    RAISE EXCEPTION 'Competência inexistente ou já encerrada.' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(DISTINCT categoria) FROM public.eletivas_arquivos
      WHERE competencia_id=p_comp AND categoria IN('dbf_faec','dbf_mac','s_faec','s_mac'))<>4 THEN
    RAISE EXCEPTION 'Importe as quatro fontes obrigatórias: DBF FAEC/MAC e SES FAEC/MAC.'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp)
     OR EXISTS(SELECT 1 FROM public.eletivas_itens
       WHERE competencia_id=p_comp AND
         (conferido_por IS NULL OR
          (situacao IN('pendente','div','nc','fora') AND decisao IS NULL))) THEN
    RAISE EXCEPTION 'É necessário conferir os itens e tratar cada pendência.'
      USING ERRCODE='23514';
  END IF;
  v_doc:=v.documentos;
  IF COALESCE(v_doc->>'rtma_numero','')='' OR
     COALESCE(v_doc->>'analise_numero','')='' OR
     COALESCE(v_doc->>'rtma_link','') !~ '^https?://' OR
     COALESCE(v_doc->>'analise_link','') !~ '^https?://' THEN
    RAISE EXCEPTION 'Registre os números e links SEI do Relatório Técnico e da Análise.'
      USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(v_doc->'fiscais_rtma') IS DISTINCT FROM 'array' OR
     jsonb_array_length(v_doc->'fiscais_rtma')<2 OR
     jsonb_typeof(v_doc->'fiscais_analise') IS DISTINCT FROM 'array' OR
     jsonb_array_length(v_doc->'fiscais_analise')<1 THEN
    RAISE EXCEPTION 'Confirme dois fiscais no Relatório Técnico e um na Análise.'
      USING ERRCODE='23514';
  END IF;
  IF (SELECT count(DISTINCT trim(value)) FROM jsonb_array_elements_text(v_doc->'fiscais_rtma')) < 2 THEN
    RAISE EXCEPTION 'Os dois fiscais do Relatório Técnico devem ser distintos.'
      USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(v.correcoes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Memória de correções inválida.' USING ERRCODE='23514';
  END IF;
  FOR v_corr IN SELECT value FROM jsonb_array_elements(v.correcoes) LOOP
    IF (v_corr->>'valor') IS NULL OR
       (v_corr->>'valor') !~ '^-?[0-9]+([.][0-9]{1,2})?$' OR
       COALESCE(v_corr->>'documento_sei','')='' OR
       COALESCE(v_corr->>'competencia_origem','') !~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
 THEN
      RAISE EXCEPTION 'Correções exigem competência de origem, valor e documento SEI.'
        USING ERRCODE='23514';
    END IF;
    v_ajustes:=v_ajustes+(v_corr->>'valor')::numeric;
  END LOOP;
  SELECT COALESCE(sum(public.ec_valor_item(categoria,situacao,decisao,valor_publicado,valor_esperado)),0)
    INTO v_total FROM public.eletivas_itens WHERE competencia_id=p_comp;
  v_total:=round(v_total+v_ajustes,2);
  IF v_total<0 THEN
    RAISE EXCEPTION 'Valor líquido negativo: confira correções.' USING ERRCODE='23514';
  END IF;
  UPDATE public.eletivas_competencias SET
    valor_fechado=v_total,status='encerrada',fechado_em=now(),fechado_por=auth.uid()
    WHERE id=p_comp;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_encerrar(uuid) TO authenticated;

ALTER TABLE public.eletivas_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eletivas_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eletivas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eletivas_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ec comp read" ON public.eletivas_competencias FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "ec comp insert" ON public.eletivas_competencias FOR INSERT TO authenticated
  WITH CHECK (criado_por=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
CREATE POLICY "ec comp update" ON public.eletivas_competencias FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
-- Competências não são excluíveis: preserva a trilha histórica e os vínculos.
CREATE POLICY "ec fontes read" ON public.eletivas_arquivos FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "ec fontes insert" ON public.eletivas_arquivos FOR INSERT TO authenticated
  WITH CHECK (enviado_por=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
CREATE POLICY "ec itens read" ON public.eletivas_itens FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "ec itens insert" ON public.eletivas_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
CREATE POLICY "ec itens update" ON public.eletivas_itens FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
CREATE POLICY "ec eventos read" ON public.eletivas_eventos FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));
REVOKE INSERT,UPDATE,DELETE ON public.eletivas_eventos FROM anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit)
 VALUES ('eletivas-arquivos','eletivas-arquivos',false,52428800)
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=52428800;
CREATE POLICY "ec storage read" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='eletivas-arquivos'
   AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "ec storage insert" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='eletivas-arquivos'
   AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::app_role[]));
CREATE POLICY "ec storage delete" ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='eletivas-arquivos' AND public.has_role(auth.uid(),'admin'));

COMMIT;
