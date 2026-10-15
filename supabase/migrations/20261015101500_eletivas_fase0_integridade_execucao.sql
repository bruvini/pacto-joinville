-- FASE 0 · Eletivas HMSJ · segurança, execuções, evidências e fechamento
-- Aplicar após as duas migrations iniciais do Encontro de Contas (10/10/2026).
-- Todas as alterações em uma transação. Sem DROP TABLE, sem apagar evidências.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.eletivas_competencias') IS NULL
    OR to_regclass('public.eletivas_arquivos') IS NULL
    OR to_regclass('public.eletivas_itens') IS NULL
    OR to_regclass('public.eletivas_eventos') IS NULL THEN
    RAISE EXCEPTION 'Instale primeiro as duas migrations de Eletivas de 10/10/2026.' USING ERRCODE='42P01';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='eletivas_itens' AND column_name='detalhe') THEN
    RAISE EXCEPTION 'A migration do motor 20261010210000 ainda não está aplicada.' USING ERRCODE='42703';
  END IF;
END;
$preflight$;

ALTER TABLE public.eletivas_competencias
  ADD COLUMN IF NOT EXISTS ec_execucao_id uuid,
  ADD COLUMN IF NOT EXISTS ec_fontes_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS ec_motor_versao text,
  ADD COLUMN IF NOT EXISTS ec_processado_em timestamptz;
ALTER TABLE public.eletivas_itens
  ADD COLUMN IF NOT EXISTS ec_execucao_id uuid;
CREATE INDEX IF NOT EXISTS idx_eletivas_itens_comp_atualizado
  ON public.eletivas_itens(competencia_id,atualizado_em DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_eletivas_itens_execucao
  ON public.eletivas_itens(competencia_id,ec_execucao_id);

-- Corrige o erro "record OLD has no field competencia_id" em INSERT de competência:
-- OLD não é acessado em INSERT, e o vínculo de competência vem de id na tabela-mãe.
CREATE OR REPLACE FUNCTION public.ec_registrar_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $audit$
DECLARE
  antes jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  depois jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  registro jsonb;
  v_comp uuid;
  v_dados jsonb;
BEGIN
  registro:=CASE WHEN TG_OP='DELETE' THEN antes ELSE depois END;
  v_comp:=(CASE WHEN TG_TABLE_NAME='eletivas_competencias' THEN registro->>'id'
                ELSE registro->>'competencia_id' END)::uuid;
  IF v_comp IS NULL THEN RAISE EXCEPTION 'Auditoria EC sem competência vinculada.'; END IF;
  v_dados:=jsonb_build_object('operacao',TG_OP,'tabela',TG_TABLE_NAME);
  IF TG_TABLE_NAME='eletivas_itens' THEN
    v_dados:=v_dados||jsonb_build_object(
      'chave',registro->>'chave',
      'decisao_anterior',antes->'decisao',
      'situacao_anterior',antes->'situacao',
      'valor_anterior',antes->'valor_publicado',
      'decisao_nova',depois->'decisao',
      'valor_novo',depois->'valor_publicado',
      'conferido_anterior',antes->'conferido_em',
      'conferido_novo',depois->'conferido_em',
      'execucao_id',registro->'ec_execucao_id');
  ELSIF TG_TABLE_NAME='eletivas_competencias' THEN
    v_dados:=v_dados||jsonb_build_object(
      'status_anterior',antes->'status','status_novo',depois->'status',
      'correcoes_anteriores',COALESCE(jsonb_array_length(antes->'correcoes'),0),
      'correcoes_atuais',COALESCE(jsonb_array_length(depois->'correcoes'),0),
      'execucao_id',registro->'ec_execucao_id');
  ELSE
    v_dados:=v_dados||jsonb_build_object('categoria',registro->'categoria',
      'sha256',registro->'sha256');
  END IF;
  INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
  VALUES(v_comp,TG_TABLE_NAME||'_'||lower(TG_OP),v_dados,auth.uid());
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$audit$;

-- A inserção automatizada jamais assina conferência. Somente RPC de fiscal
-- pode registrar o carimbo. Impede alterar valores e a origem após processamento.
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
      IF NEW.origem='parser_validado' AND auth.role() IS DISTINCT FROM 'service_role'
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
      IF (OLD.origem='parser_validado' OR NEW.origem='parser_validado')
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

-- Competências em andamento com marcas do trigger antigo exigem reconferência.
-- Competências fechadas não são modificadas e devem ser avaliadas separadamente.
DO $reconferencia$
BEGIN
  -- A migração é executada com controle administrativo. Autoriza apenas
  -- esta correção transacional; a trigger permanece restritiva para usuários.
  PERFORM set_config('app.ec_confirmacao_fiscal','permitida',true);
  UPDATE public.eletivas_itens i
     SET conferido_em=NULL,conferido_por=NULL
   WHERE i.conferido_em IS NOT NULL
     AND EXISTS(SELECT 1 FROM public.eletivas_competencias c
       WHERE c.id=i.competencia_id AND c.status<>'encerrada');
  PERFORM set_config('app.ec_confirmacao_fiscal','',true);
END;
$reconferencia$;

-- A marca é efetuada pelo servidor, com identidade do usuário autenticado.
CREATE OR REPLACE FUNCTION public.ec_conferir_item(p_item uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $conf$
DECLARE id_comp uuid; usuario uuid := auth.uid();
BEGIN
 IF usuario IS NULL OR NOT public.has_any_role(usuario,ARRAY['admin','acp']::app_role[]) THEN
   RAISE EXCEPTION 'Fiscal sem permissão para conferir itens.' USING ERRCODE='42501';
 END IF;
 SELECT i.competencia_id INTO id_comp FROM public.eletivas_itens i
 WHERE i.id=p_item FOR UPDATE;
 IF id_comp IS NULL THEN RAISE EXCEPTION 'Item de auditoria não encontrado.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias WHERE id=id_comp AND status='encerrada') THEN
   RAISE EXCEPTION 'Encontro encerrado.' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('app.ec_confirmacao_fiscal','permitida',true);
 UPDATE public.eletivas_itens SET conferido_por=usuario,conferido_em=now()
 WHERE id=p_item AND conferido_em IS NULL;
 PERFORM set_config('app.ec_confirmacao_fiscal','',true);
END;
$conf$;
REVOKE ALL ON FUNCTION public.ec_conferir_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_conferir_item(uuid) TO authenticated;

-- A nova importação recebe MANIFESTO explícito (id, categoria, SHA),
-- confere todas as evidências, grava a execução no mesmo commit dos itens,
-- e mantém a identidade de cada execução no histórico append-only.
CREATE OR REPLACE FUNCTION public.ec_importar_itens_v2(
 p_comp uuid,p_evidencias jsonb,p_itens jsonb,p_motor_versao text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rpc$
DECLARE
 v public.eletivas_competencias%ROWTYPE;
 item jsonb; evid jsonb; linha public.eletivas_arquivos%ROWTYPE;
 qtd integer:=0; exec_id uuid:=gen_random_uuid(); total_arquivos integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Processamento reservado à Edge Function.' USING ERRCODE='42501';
 END IF;
 IF p_motor_versao IS NULL OR length(trim(p_motor_versao))<3 THEN
   RAISE EXCEPTION 'Versão do motor obrigatória.' USING ERRCODE='23514';
 END IF;
 IF jsonb_typeof(p_evidencias)<>'array' OR jsonb_array_length(p_evidencias)=0
   OR jsonb_typeof(p_itens)<>'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 10000 THEN
   RAISE EXCEPTION 'Manifesto ou itens inválidos.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR v.status='encerrada' THEN
   RAISE EXCEPTION 'Competência inexistente ou encerrada.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp
   AND (conferido_em IS NOT NULL OR decisao IS NOT NULL OR origem='manual')) THEN
   RAISE EXCEPTION 'Itens já auditados ou manuais: não substituir automaticamente.' USING ERRCODE='23514';
 END IF;
 SELECT COUNT(*),COUNT(DISTINCT x->>'categoria') INTO total_arquivos,qtd
 FROM jsonb_array_elements(p_evidencias) x;
 IF total_arquivos<>qtd THEN
   RAISE EXCEPTION 'Manifesto tem categorias duplicadas.' USING ERRCODE='23514';
 END IF;
 FOR evid IN SELECT value FROM jsonb_array_elements(p_evidencias) LOOP
   SELECT a.id,a.categoria,a.sha256 INTO linha FROM public.eletivas_arquivos a
   WHERE a.id=(evid->>'id')::uuid AND a.competencia_id=p_comp;
   IF linha.id IS NULL OR linha.categoria IS DISTINCT FROM evid->>'categoria'
      OR linha.sha256 IS DISTINCT FROM evid->>'sha256' THEN
     RAISE EXCEPTION 'Evidência do manifesto inexistente, alterada ou de outra competência.' USING ERRCODE='23514';
   END IF;
   IF EXISTS(
     SELECT 1 FROM public.eletivas_arquivos a
     WHERE a.competencia_id=p_comp AND a.categoria=linha.categoria
       AND (a.enviado_em,a.id) >
       (SELECT b.enviado_em,b.id FROM public.eletivas_arquivos b WHERE b.id=linha.id)
   ) THEN
      RAISE EXCEPTION 'Existe versão mais recente da fonte %; recarregue antes de conciliar.',linha.categoria USING ERRCODE='23514';
   END IF;
 END LOOP;
 IF NOT (p_evidencias @> '[{"categoria":"dbf_faec"},{"categoria":"dbf_mac"},{"categoria":"s_faec"},{"categoria":"s_mac"}]'::jsonb) THEN
   RAISE EXCEPTION 'Quatro fontes obrigatórias ausentes no manifesto.' USING ERRCODE='23514';
 END IF;
 DELETE FROM public.eletivas_itens WHERE competencia_id=p_comp;
 qtd:=0;
 FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
   IF COALESCE(item->>'chave','')='' OR COALESCE(item->>'categoria','')=''
      OR COALESCE(item->>'situacao','')='' OR COALESCE(item->>'descricao','')='' THEN
     RAISE EXCEPTION 'Item processado incompleto.' USING ERRCODE='23514';
   END IF;
   INSERT INTO public.eletivas_itens(
     competencia_id,chave,categoria,descricao,procedimento,aih,origem,
     valor_publicado,valor_esperado,situacao,detalhe,ec_execucao_id
   ) VALUES(
     p_comp,item->>'chave',item->>'categoria',item->>'descricao',
     nullif(item->>'procedimento',''),nullif(item->>'aih',''),
     'parser_validado',(item->>'valor_publicado')::numeric,
     (item->>'valor_esperado')::numeric,item->>'situacao',
     COALESCE(item->'detalhe','{}'::jsonb),exec_id);
   qtd:=qtd+1;
 END LOOP;
 UPDATE public.eletivas_competencias SET
  status='auditoria',ec_execucao_id=exec_id,ec_fontes_snapshot=p_evidencias,
  ec_motor_versao=p_motor_versao,ec_processado_em=now()
 WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES (p_comp,'motor_execucao_v2',
   jsonb_build_object('execucao_id',exec_id,'motor',p_motor_versao,
     'quantidade_itens',qtd,'fontes',p_evidencias),NULL);
 RETURN qtd;
END;
$rpc$;
REVOKE ALL ON FUNCTION public.ec_importar_itens_v2(uuid,jsonb,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ec_importar_itens_v2(uuid,jsonb,jsonb,text) TO service_role;
-- Bloqueia o RPC legado para impedir processamento sem manifesto.
REVOKE EXECUTE ON FUNCTION public.ec_importar_itens_processados(uuid,uuid[],jsonb) FROM service_role;

-- Protege manifesto e identidade da execução contra alterações diretas pelo cliente.
CREATE OR REPLACE FUNCTION public.ec_bloquear_execucao_manual()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN
   IF auth.role() IS DISTINCT FROM 'service_role' AND
     (NEW.ec_execucao_id IS NOT NULL OR NEW.ec_fontes_snapshot IS NOT NULL
       OR NEW.ec_motor_versao IS NOT NULL OR NEW.ec_processado_em IS NOT NULL) THEN
     RAISE EXCEPTION 'Identificador de execução só pode ser criado pelo servidor.' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 IF (NEW.ec_execucao_id IS DISTINCT FROM OLD.ec_execucao_id
   OR NEW.ec_fontes_snapshot IS DISTINCT FROM OLD.ec_fontes_snapshot
   OR NEW.ec_motor_versao IS DISTINCT FROM OLD.ec_motor_versao
   OR NEW.ec_processado_em IS DISTINCT FROM OLD.ec_processado_em)
   AND auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Manifesto e execução só podem ser atualizados pelo motor.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS ec_execucao_guard ON public.eletivas_competencias;
CREATE TRIGGER ec_execucao_guard BEFORE INSERT OR UPDATE ON public.eletivas_competencias
FOR EACH ROW EXECUTE FUNCTION public.ec_bloquear_execucao_manual();

-- Atualiza encerramento preservando validações documentais e monetárias anteriores.
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
  IF v.ec_execucao_id IS NULL OR v.ec_fontes_snapshot IS NULL OR v.ec_motor_versao IS NULL THEN
    RAISE EXCEPTION 'É necessária execução validada do motor com manifesto das evidências antes do encerramento.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.eletivas_eventos ev
    WHERE ev.competencia_id=p_comp AND ev.tipo='motor_execucao_v2'
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
  IF v.competencia ~ '^(0[1-9]|1[0-2])/20[0-9]{2}
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

    AND (split_part(v.competencia,'/',2)::int*100+split_part(v.competencia,'/',1)::int)>=202607
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v.ec_fontes_snapshot) f
      WHERE f->>'categoria'='s_mac_ms'
    )
  THEN
    RAISE EXCEPTION 'MAC múltiplas/sequenciais é obrigatório desde 07/2026.' USING ERRCODE='23514';
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
COMMIT;
