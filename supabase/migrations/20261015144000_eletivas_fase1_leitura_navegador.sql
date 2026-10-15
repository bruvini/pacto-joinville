-- ELETIVAS HMSJ / FASE 1: conciliação no navegador com controle fiscal.
-- Depende de 20261015101500 (Fase 0) devidamente aplicada.
-- Não habilita qualquer service role no frontend nem atesta automaticamente.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.ec_conferir_item(uuid)') IS NULL OR
    to_regprocedure('public.ec_importar_itens_v2(uuid,jsonb,jsonb,text)') IS NULL THEN
   RAISE EXCEPTION 'Execute primeiro a migration Fase 0 de 15/10/2026.' USING ERRCODE='23514';
 END IF;
END;
$preflight$;

ALTER TABLE public.eletivas_competencias
 ADD COLUMN IF NOT EXISTS ec_origem_execucao text,
 ADD COLUMN IF NOT EXISTS ec_validado_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS ec_validado_em timestamptz;
ALTER TABLE public.eletivas_competencias
 DROP CONSTRAINT IF EXISTS eletivas_competencias_ec_origem_execucao_check;
ALTER TABLE public.eletivas_competencias ADD CONSTRAINT eletivas_competencias_ec_origem_execucao_check
 CHECK (ec_origem_execucao IS NULL OR ec_origem_execucao IN ('navegador','servidor'));
ALTER TABLE public.eletivas_itens DROP CONSTRAINT IF EXISTS eletivas_itens_origem_check;
ALTER TABLE public.eletivas_itens ADD CONSTRAINT eletivas_itens_origem_check
 CHECK (origem IN ('manual','parser_validado','parser_local'));

-- Registros processados localmente são imutáveis; a conferência continua exclusiva do fiscal.
CREATE OR REPLACE FUNCTION public.ec_guardar_mutacoes()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
DECLARE v_comp uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_comp:=OLD.competencia_id; ELSE v_comp:=NEW.competencia_id; END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_competencias c
    WHERE c.id=v_comp AND c.status='encerrada') THEN
    RAISE EXCEPTION 'Encontro encerrado. Solicite reabertura formal antes de alterar.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='eletivas_itens' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.origem IN ('parser_validado','parser_local') AND auth.role() IS DISTINCT FROM 'service_role'
        AND current_user NOT IN ('postgres','supabase_admin') THEN
        RAISE EXCEPTION 'Origem processada exige servidor.' USING ERRCODE='42501';
      END IF;
      NEW.conferido_em:=NULL;
      NEW.conferido_por:=NULL;
      IF NEW.origem='manual' AND NEW.ec_execucao_id IS NOT NULL THEN
        RAISE EXCEPTION 'Item manual não pode usar identificador de execução automática.' USING ERRCODE='23514';
      END IF;
    ELSE
      IF (NEW.conferido_em IS DISTINCT FROM OLD.conferido_em
        OR NEW.conferido_por IS DISTINCT FROM OLD.conferido_por)
        AND current_setting('app.ec_confirmacao_fiscal',true) IS DISTINCT FROM 'permitida' THEN
        RAISE EXCEPTION 'Conferência só pode ser registrada pela função fiscal.' USING ERRCODE='42501';
      END IF;
      IF (OLD.origem IN ('parser_validado','parser_local') OR NEW.origem IN ('parser_validado','parser_local'))
        AND (NEW.origem IS DISTINCT FROM OLD.origem
          OR NEW.chave IS DISTINCT FROM OLD.chave
          OR NEW.categoria IS DISTINCT FROM OLD.categoria
          OR NEW.descricao IS DISTINCT FROM OLD.descricao
          OR NEW.procedimento IS DISTINCT FROM OLD.procedimento
          OR NEW.aih IS DISTINCT FROM OLD.aih
          OR NEW.valor_publicado IS DISTINCT FROM OLD.valor_publicado
          OR NEW.valor_esperado IS DISTINCT FROM OLD.valor_esperado
          OR NEW.situacao IS DISTINCT FROM OLD.situacao
          OR NEW.detalhe IS DISTINCT FROM OLD.detalhe
          OR NEW.ec_execucao_id IS DISTINCT FROM OLD.ec_execucao_id) THEN
        RAISE EXCEPTION 'Itens processados são imutáveis. Registre somente conferência ou decisão.' USING ERRCODE='42501';
      END IF;
    END IF;
    NEW.atualizado_em:=now();
  ELSIF TG_TABLE_NAME='eletivas_arquivos' AND TG_OP='INSERT' AND NOT EXISTS(
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='eletivas-arquivos' AND o.name=NEW.storage_path
  ) THEN
    RAISE EXCEPTION 'Arquivo não consta do armazenamento privado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;



-- Tanto a identidade do motor quanto a validação fiscal são campos protegidos;
-- o único contexto adicional autorizado é uma função SECURITY DEFINER com GUC transacional.
CREATE OR REPLACE FUNCTION public.ec_bloquear_execucao_manual()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN
   IF auth.role() IS DISTINCT FROM 'service_role' AND
     (NEW.ec_execucao_id IS NOT NULL OR NEW.ec_fontes_snapshot IS NOT NULL
       OR NEW.ec_motor_versao IS NOT NULL OR NEW.ec_processado_em IS NOT NULL OR NEW.ec_origem_execucao IS NOT NULL OR NEW.ec_validado_em IS NOT NULL OR NEW.ec_validado_por IS NOT NULL) THEN
     RAISE EXCEPTION 'Identificador de execução só pode ser criado pelo servidor.' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 IF (NEW.ec_execucao_id IS DISTINCT FROM OLD.ec_execucao_id
   OR NEW.ec_fontes_snapshot IS DISTINCT FROM OLD.ec_fontes_snapshot
   OR NEW.ec_motor_versao IS DISTINCT FROM OLD.ec_motor_versao
   OR NEW.ec_processado_em IS DISTINCT FROM OLD.ec_processado_em
   OR NEW.ec_origem_execucao IS DISTINCT FROM OLD.ec_origem_execucao
   OR NEW.ec_validado_em IS DISTINCT FROM OLD.ec_validado_em
   OR NEW.ec_validado_por IS DISTINCT FROM OLD.ec_validado_por)
   AND auth.role() IS DISTINCT FROM 'service_role'
    AND NOT (current_user IN ('postgres','supabase_admin')
       AND current_setting('app.ec_escrita_local',true) = 'permitida') THEN
   RAISE EXCEPTION 'Manifesto e execução só podem ser atualizados pelo motor.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.ec_importar_itens_local(
  p_comp uuid, p_evidencias jsonb, p_itens jsonb, p_motor_versao text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $local$
DECLARE
 usuario uuid := auth.uid();
 v public.eletivas_competencias%ROWTYPE;
 arquivo jsonb;
 item jsonb;
 registro public.eletivas_arquivos%ROWTYPE;
 exec_id uuid := gen_random_uuid();
 numero integer := 0;
 categorias integer;
 achados integer;
BEGIN
 IF usuario IS NULL OR NOT public.has_any_role(usuario,ARRAY['admin','acp']::app_role[]) THEN
   RAISE EXCEPTION 'Apenas ACP/Admin podem registrar pré-conciliação local.' USING ERRCODE='42501';
 END IF;
 IF p_motor_versao IS NULL OR p_motor_versao !~ '^browser-eletivas-[a-zA-Z0-9._-]{3,50}$' THEN
   RAISE EXCEPTION 'Versão identificável do leitor do navegador obrigatória.' USING ERRCODE='23514';
 END IF;
 IF jsonb_typeof(p_evidencias) IS DISTINCT FROM 'array' OR
    jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Manifesto e itens devem ser listas JSON.' USING ERRCODE='23514';
 END IF;
 IF jsonb_array_length(p_evidencias) NOT BETWEEN 4 AND 16 OR
    jsonb_array_length(p_itens) NOT BETWEEN 1 AND 10000 THEN
   RAISE EXCEPTION 'Quantidade de fontes/itens inválida.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR v.status='encerrada' THEN
   RAISE EXCEPTION 'Competência não encontrada ou encerrada.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens
   WHERE competencia_id=p_comp
     AND (conferido_em IS NOT NULL OR decisao IS NOT NULL OR origem='manual')) THEN
   RAISE EXCEPTION 'Existe conferência, decisão ou item manual: não sobrescrever auditoria fiscal.' USING ERRCODE='23514';
 END IF;
 SELECT COUNT(DISTINCT f->>'categoria') INTO categorias
   FROM jsonb_array_elements(p_evidencias) f;
 IF categorias <> jsonb_array_length(p_evidencias) THEN
   RAISE EXCEPTION 'Há duas versões/papéis iguais no manifesto.' USING ERRCODE='23514';
 END IF;
 SELECT COUNT(DISTINCT f->>'sha256') INTO achados
   FROM jsonb_array_elements(p_evidencias) f;
 IF achados <> jsonb_array_length(p_evidencias) THEN
   RAISE EXCEPTION 'O mesmo arquivo foi atribuído a papéis diferentes; revise a classificação.' USING ERRCODE='23514';
 END IF;
 IF NOT (p_evidencias @> '[{"categoria":"dbf_faec"},{"categoria":"dbf_mac"},{"categoria":"s_faec"},{"categoria":"s_mac"}]'::jsonb) THEN
   RAISE EXCEPTION 'Fontes obrigatórias SIH FAEC/MAC e SES FAEC/MAC ausentes.' USING ERRCODE='23514';
 END IF;
 IF (split_part(v.competencia,'/',2)::integer*100+
     split_part(v.competencia,'/',1)::integer)>=202607
    AND NOT (p_evidencias @> '[{"categoria":"s_mac_ms"}]'::jsonb) THEN
   RAISE EXCEPTION 'Inclua s_mac_ms a partir da competência 07/2026.' USING ERRCODE='23514';
 END IF;
 FOR arquivo IN SELECT value FROM jsonb_array_elements(p_evidencias) LOOP
   IF jsonb_typeof(arquivo) IS DISTINCT FROM 'object'
      OR (arquivo->>'id') IS NULL
      OR (arquivo->>'id') !~ '^[0-9a-f-]{36}$'
      OR (arquivo->>'sha256') !~ '^[a-f0-9]{64}$'
      OR COALESCE(arquivo->>'categoria','')='' THEN
      RAISE EXCEPTION 'Manifesto com ID, categoria ou hash inválidos.' USING ERRCODE='23514';
   END IF;
   SELECT * INTO registro FROM public.eletivas_arquivos
     WHERE id=(arquivo->>'id')::uuid AND competencia_id=p_comp;
   IF registro.id IS NULL OR registro.categoria IS DISTINCT FROM arquivo->>'categoria'
     OR registro.sha256 IS DISTINCT FROM arquivo->>'sha256' THEN
      RAISE EXCEPTION 'Manifesto não corresponde às fontes registradas desta competência.' USING ERRCODE='23514';
   END IF;
 END LOOP;
 -- A decisão de usar versões antigas é intencional e congelada no manifesto.
 -- Não confundir último upload com evidência escolhida pelo fiscal.
 PERFORM set_config('app.ec_escrita_local','permitida',true);
 DELETE FROM public.eletivas_itens WHERE competencia_id=p_comp;
 FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR length(COALESCE(item->>'chave','')) NOT BETWEEN 1 AND 200
      OR length(COALESCE(item->>'descricao','')) NOT BETWEEN 1 AND 500
      OR COALESCE(item->>'categoria','')=''
      OR COALESCE(item->>'situacao','')=''
      OR jsonb_typeof(item->'valor_publicado') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'valor_esperado') IS DISTINCT FROM 'number'
      OR (item->>'valor_publicado')::numeric<0
      OR (item->>'valor_esperado')::numeric<0 THEN
     RAISE EXCEPTION 'Item de auditoria local com estrutura ou valores inválidos.' USING ERRCODE='23514';
   END IF;
   INSERT INTO public.eletivas_itens (
     competencia_id,chave,categoria,descricao,procedimento,aih,origem,
     valor_publicado,valor_esperado,situacao,detalhe,ec_execucao_id
   ) VALUES (
     p_comp,item->>'chave',item->>'categoria',item->>'descricao',
     nullif(item->>'procedimento',''),nullif(item->>'aih',''),
     'parser_local',(item->>'valor_publicado')::numeric,(item->>'valor_esperado')::numeric,
     item->>'situacao',COALESCE(item->'detalhe','{}'::jsonb),exec_id
   );
   numero:=numero+1;
 END LOOP;
 UPDATE public.eletivas_competencias SET
   status='auditoria',ec_execucao_id=exec_id,ec_fontes_snapshot=p_evidencias,
   ec_motor_versao=p_motor_versao,ec_processado_em=now(),
   ec_origem_execucao='navegador',ec_validado_por=NULL,ec_validado_em=NULL
 WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'motor_execucao_local',
   jsonb_build_object('execucao_id',exec_id,'versao',p_motor_versao,
     'tipo','pre_conciliacao_nao_certificada','itens',numero,
     'evidencias',p_evidencias),usuario);
 PERFORM set_config('app.ec_escrita_local','',true);
 RETURN numero;
END;
$local$;
REVOKE ALL ON FUNCTION public.ec_importar_itens_local(uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_importar_itens_local(uuid,jsonb,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ec_validar_execucao_local(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $validar$
DECLARE
 usuario uuid:=auth.uid();
 v public.eletivas_competencias%ROWTYPE;
BEGIN
 IF usuario IS NULL OR NOT public.has_any_role(usuario,ARRAY['admin','acp']::app_role[]) THEN
   RAISE EXCEPTION 'Apenas ACP/Admin podem validar execução do navegador.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR v.status='encerrada' OR v.ec_origem_execucao IS DISTINCT FROM 'navegador'
   OR v.ec_execucao_id IS NULL THEN
   RAISE EXCEPTION 'Execução local inexistente ou competência encerrada.' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.eletivas_itens
     WHERE competencia_id=p_comp AND ec_execucao_id=v.ec_execucao_id) THEN
   RAISE EXCEPTION 'Nenhum item local desta execução encontrado.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens
   WHERE competencia_id=p_comp
     AND (conferido_em IS NULL OR conferido_por IS NULL
       OR (situacao IN ('div','nc','fora','pendente') AND decisao IS NULL))) THEN
   RAISE EXCEPTION 'Confira TODOS os itens e trate pendências antes de validar.' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('app.ec_escrita_local','permitida',true);
 UPDATE public.eletivas_competencias
   SET ec_validado_por=usuario,ec_validado_em=now()
   WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'motor_local_conferencia_fiscal',
   jsonb_build_object('execucao_id',v.ec_execucao_id,'declaracao',
   'Conferi os cálculos pré-processados localmente; valores sujeitos aos documentos SEI.'),usuario);
 PERFORM set_config('app.ec_escrita_local','',true);
END;
$validar$;
REVOKE ALL ON FUNCTION public.ec_validar_execucao_local(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_validar_execucao_local(uuid) TO authenticated;

-- Se algum registro mudar depois da declaração fiscal, a validação deve ser refeita.
CREATE OR REPLACE FUNCTION public.ec_invalidar_validacao_local()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $invalidate$
DECLARE v_comp uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_comp:=OLD.competencia_id; ELSE v_comp:=NEW.competencia_id; END IF;
 IF TG_OP='UPDATE' AND
   NEW.decisao IS NOT DISTINCT FROM OLD.decisao
   AND NEW.justificativa IS NOT DISTINCT FROM OLD.justificativa
   AND NEW.conferido_em IS NOT DISTINCT FROM OLD.conferido_em
   AND NEW.conferido_por IS NOT DISTINCT FROM OLD.conferido_por THEN
   RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
   WHERE id=v_comp AND ec_origem_execucao='navegador' AND ec_validado_em IS NOT NULL
     AND status<>'encerrada') THEN
    PERFORM set_config('app.ec_escrita_local','permitida',true);
    UPDATE public.eletivas_competencias
      SET ec_validado_por=NULL,ec_validado_em=NULL WHERE id=v_comp;
    PERFORM set_config('app.ec_escrita_local','',true);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$invalidate$;
DROP TRIGGER IF EXISTS ec_validacao_invalidada ON public.eletivas_itens;
CREATE TRIGGER ec_validacao_invalidada AFTER INSERT OR UPDATE OR DELETE
 ON public.eletivas_itens FOR EACH ROW
 EXECUTE FUNCTION public.ec_invalidar_validacao_local();

-- O fechamento exige conferência adicional para toda execução LOCAL.
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

  IF jsonb_typeof(v.correcoes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Memória de correções inválida.' USING ERRCODE='23514';
  END IF;
  FOR v_corr IN SELECT value FROM jsonb_array_elements(v.correcoes) LOOP
    IF (v_corr->>'valor') IS NULL
       OR (v_corr->>'valor') !~ '^-?[0-9]+([.][0-9]{1,2})?$'
       OR COALESCE(v_corr->>'documento_sei','')=''
       OR COALESCE(v_corr->>'competencia_origem','') !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' THEN
      RAISE EXCEPTION 'Correções exigem competência de origem, valor e documento SEI.'
        USING ERRCODE='23514';
    END IF;
    v_ajustes := v_ajustes+(v_corr->>'valor')::numeric;
  END LOOP;

  SELECT COALESCE(
    sum(public.ec_valor_item(categoria,situacao,decisao,valor_publicado,valor_esperado)),0
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


REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_encerrar(uuid) TO authenticated;
COMMIT;
