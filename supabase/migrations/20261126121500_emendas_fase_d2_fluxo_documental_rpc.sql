-- PACTO · Emendas · D2: configuração homologada e subetapas transacionais.
-- A Fase B registrava documento e avançava status no mesmo ato.
-- A Fase D separa documento, assinaturas, envio confirmado e conclusão.
BEGIN;

CREATE FUNCTION public.emenda_sub_matriz_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Matriz homologada não pode ser excluída.' USING ERRCODE='23514';
 END IF;
 IF NOT (OLD.ativa AND NOT NEW.ativa) OR
  ROW(NEW.id,NEW.emenda_id,NEW.tipo,NEW.versao,NEW.grupos_obrigatorios,
      NEW.exige_encaminhamento,NEW.destino_encaminhamento,NEW.referencia_sei,
      NEW.referencia_link_sei,NEW.justificativa,NEW.homologada_por,NEW.homologada_em)
  IS DISTINCT FROM
  ROW(OLD.id,OLD.emenda_id,OLD.tipo,OLD.versao,OLD.grupos_obrigatorios,
      OLD.exige_encaminhamento,OLD.destino_encaminhamento,OLD.referencia_sei,
      OLD.referencia_link_sei,OLD.justificativa,OLD.homologada_por,OLD.homologada_em)
 THEN
  RAISE EXCEPTION 'Matriz homologada é imutável: crie nova versão.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_sub_matriz
 BEFORE UPDATE OR DELETE ON public.emenda_subempenho_matrizes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_sub_matriz_guard();

CREATE FUNCTION public.emenda_sub_matriz_homologar(
 p_emenda uuid,p_tipo text,p_grupos text[],p_exige_encaminhamento boolean,
 p_destino text,p_numero_sei text,p_link_sei text,p_justificativa text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); ver integer; novo uuid; grupos text[]; item text;
BEGIN
 -- Homologação administrativa, não importada automaticamente do PVH.
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role])
 THEN RAISE EXCEPTION 'Somente administrador homologa a matriz de assinaturas.'
  USING ERRCODE='42501'; END IF;
 IF p_tipo IS NULL OR p_tipo NOT IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')
  OR p_grupos IS NULL OR cardinality(p_grupos)>10 OR p_exige_encaminhamento IS NULL
  OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR length(btrim(coalesce(p_justificativa,'')))<10
 THEN RAISE EXCEPTION 'Dados da matriz incompletos; informe referência SEI e justificativa.'
  USING ERRCODE='23514'; END IF;
 IF (p_tipo='movimento_liquidacao' AND
  (NOT p_exige_encaminhamento OR btrim(coalesce(p_destino,''))<>'SEFAZ.UAF.ADE'))
  OR (p_exige_encaminhamento AND length(btrim(coalesce(p_destino,'')))<3)
  OR (NOT p_exige_encaminhamento AND p_destino IS NOT NULL)
 THEN RAISE EXCEPTION 'Movimento de liquidação exige encaminhamento à SEFAZ.UAF.ADE.'
  USING ERRCODE='23514'; END IF;

 SELECT array_agg(btrim(x) ORDER BY ord) INTO grupos
 FROM unnest(p_grupos) WITH ORDINALITY AS g(x,ord);
 grupos:=coalesce(grupos,ARRAY[]::text[]);
 FOREACH item IN ARRAY grupos LOOP
  IF item IS NULL OR length(item)<2 OR length(item)>80
  THEN RAISE EXCEPTION 'Código de grupo de assinatura inválido.' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT g.grupo_codigo) FROM unnest(grupos) AS g(grupo_codigo))<>cardinality(grupos)
 THEN RAISE EXCEPTION 'Os grupos obrigatórios não podem ser repetidos.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=p_emenda FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda não localizada.' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(versao),0)+1 INTO ver FROM public.emenda_subempenho_matrizes
 WHERE emenda_id=p_emenda AND tipo=p_tipo;
 UPDATE public.emenda_subempenho_matrizes SET ativa=false
 WHERE emenda_id=p_emenda AND tipo=p_tipo AND ativa;
 INSERT INTO public.emenda_subempenho_matrizes
 (emenda_id,tipo,versao,grupos_obrigatorios,exige_encaminhamento,
 destino_encaminhamento,referencia_sei,referencia_link_sei,justificativa,homologada_por)
 VALUES(p_emenda,p_tipo,ver,grupos,p_exige_encaminhamento,
  CASE WHEN p_exige_encaminhamento THEN btrim(p_destino) ELSE NULL END,
  btrim(p_numero_sei),btrim(p_link_sei),btrim(p_justificativa),ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

-- Bloqueio também no banco: uma RPC antiga não pode criar rascunhos
-- em emendas cuja matriz documental ainda não foi homologada integralmente.
CREATE FUNCTION public.emenda_d_guard_matriz_para_subempenho()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE total integer;
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT count(DISTINCT tipo) INTO total
 FROM public.emenda_subempenho_matrizes
 WHERE emenda_id=NEW.emenda_id AND ativa;
 IF total<>3 THEN
  RAISE EXCEPTION 'Homologue as matrizes das três subetapas antes de criar subempenho.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_d_matriz_criar_sub
 BEFORE INSERT ON public.emenda_subempenhos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_d_guard_matriz_para_subempenho();

-- Documentação NÃO implica assinatura, envio ou ato confirmado.
CREATE OR REPLACE FUNCTION public.emenda_subempenho_documentar(
 p_subempenho uuid,p_tipo text,p_numero text,p_link text,p_data date,
 p_valor_aviso numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
 doc public.emenda_subempenho_documentos%ROWTYPE;
 politica public.emenda_subempenho_matrizes%ROWTYPE;
 esperado text; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
  ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para documentar subempenhos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho FOR UPDATE;

 IF p_tipo IS NULL OR p_tipo NOT IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')
  OR length(btrim(coalesce(p_numero,'')))=0 OR length(btrim(coalesce(p_numero,'')))>100
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
  OR p_data IS NULL OR p_data>CURRENT_DATE
  OR (p_tipo='aviso_subempenho' AND
   (p_valor_aviso IS NULL OR p_valor_aviso<=0 OR p_valor_aviso<>round(p_valor_aviso,2)))
  OR (p_tipo<>'aviso_subempenho' AND p_valor_aviso IS NOT NULL)
 THEN RAISE EXCEPTION 'Documento, data ou valor efetivo inválidos.' USING ERRCODE='23514'; END IF;

 SELECT * INTO doc FROM public.emenda_subempenho_documentos
 WHERE subempenho_id=p_subempenho AND tipo=p_tipo;
 IF FOUND THEN
  IF doc.numero_sei=btrim(p_numero) AND doc.link_sei=btrim(p_link)
   AND doc.data_documento=p_data AND doc.valor_documentado IS NOT DISTINCT FROM p_valor_aviso
  THEN RETURN doc.id; END IF;
  RAISE EXCEPTION 'Documento registrado com dados diferentes; retificação formal necessária.'
   USING ERRCODE='23514';
 END IF;

 esperado:=CASE p_tipo WHEN 'solicitacao_liquidacao' THEN 'rascunho'
  WHEN 'movimento_liquidacao' THEN 'solicitado'
  WHEN 'aviso_subempenho' THEN 'em_liquidacao' END;
 IF sub.status IS DISTINCT FROM esperado THEN
  RAISE EXCEPTION 'Subetapa indisponível: conclua a anterior.' USING ERRCODE='23514'; END IF;

 SELECT * INTO politica FROM public.emenda_subempenho_matrizes
 WHERE emenda_id=sub.emenda_id AND tipo=p_tipo AND ativa;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Matriz de assinatura e encaminhamento não homologada para esta subetapa.'
   USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_subempenho_documentos
 (emenda_id,subempenho_id,tipo,numero_sei,link_sei,data_documento,valor_documentado,
  politica_id,registrado_por)
 VALUES(sub.emenda_id,sub.id,p_tipo,btrim(p_numero),btrim(p_link),p_data,
  p_valor_aviso,politica.id,ator) RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

CREATE FUNCTION public.emenda_subempenho_assinar(
 p_documento uuid,p_grupo text,p_signatario text,p_cargo text,
 p_numero_sei text,p_link_sei text,p_data date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); doc public.emenda_subempenho_documentos%ROWTYPE;
 politica public.emenda_subempenho_matrizes%ROWTYPE;
 anterior public.emenda_subempenho_assinaturas%ROWTYPE; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para conferir assinaturas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=doc.emenda_id FOR UPDATE;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.emenda_subempenho_conclusoes WHERE documento_id=doc.id)
 THEN RAISE EXCEPTION 'Etapa já concluída: assinatura adicional exige revisão formal.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO politica FROM public.emenda_subempenho_matrizes WHERE id=doc.politica_id;
 IF politica.id IS NULL OR NOT (p_grupo=ANY(politica.grupos_obrigatorios))
  OR length(btrim(coalesce(p_signatario,'')))<3
  OR length(btrim(coalesce(p_cargo,'')))<3
  OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR p_data IS NULL OR p_data> CURRENT_DATE OR p_data<doc.data_documento
 THEN RAISE EXCEPTION 'Grupo, signatário ou evidência de assinatura inválidos.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO anterior FROM public.emenda_subempenho_assinaturas
 WHERE documento_id=doc.id AND grupo=p_grupo;
 IF FOUND THEN
  IF anterior.signatario_nome=btrim(p_signatario) AND anterior.cargo_signatario=btrim(p_cargo)
   AND anterior.numero_sei=btrim(p_numero_sei) AND anterior.link_sei=btrim(p_link_sei)
   AND anterior.data_assinatura=p_data THEN RETURN anterior.id; END IF;
  RAISE EXCEPTION 'Assinatura deste grupo já conferida. Retificação formal necessária.'
   USING ERRCODE='23514';
 END IF;
 INSERT INTO public.emenda_subempenho_assinaturas
 (emenda_id,subempenho_id,documento_id,grupo,signatario_nome,cargo_signatario,
  numero_sei,link_sei,data_assinatura,registrado_por)
 VALUES(doc.emenda_id,doc.subempenho_id,doc.id,p_grupo,btrim(p_signatario),
  btrim(p_cargo),btrim(p_numero_sei),btrim(p_link_sei),p_data,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

CREATE FUNCTION public.emenda_subempenho_encaminhar(
 p_documento uuid,p_numero_sei text,p_link_sei text,p_data date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); doc public.emenda_subempenho_documentos%ROWTYPE;
 politica public.emenda_subempenho_matrizes%ROWTYPE;
 enviado public.emenda_subempenho_encaminhamentos%ROWTYPE; pendentes integer; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para confirmar encaminhamento.' USING ERRCODE='42501'; END IF;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=doc.emenda_id FOR UPDATE;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento FOR UPDATE;
 SELECT * INTO politica FROM public.emenda_subempenho_matrizes WHERE id=doc.politica_id;
 IF politica.id IS NULL OR NOT politica.exige_encaminhamento THEN
  RAISE EXCEPTION 'Esta subetapa não exige confirmação de encaminhamento.'
   USING ERRCODE='23514'; END IF;
 IF coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR p_data IS NULL OR p_data<doc.data_documento OR p_data>CURRENT_DATE
 THEN RAISE EXCEPTION 'Comprovante de encaminhamento inválido.' USING ERRCODE='23514'; END IF;

 SELECT count(*) INTO pendentes FROM unnest(politica.grupos_obrigatorios) AS g(grupo_codigo)
 WHERE NOT EXISTS(SELECT 1 FROM public.emenda_subempenho_assinaturas a
  WHERE a.documento_id=doc.id AND a.grupo=g.grupo_codigo);
 IF pendentes>0 THEN
  RAISE EXCEPTION 'Confira todos os grupos de assinatura antes de confirmar o encaminhamento.'
   USING ERRCODE='23514'; END IF;

 SELECT * INTO enviado FROM public.emenda_subempenho_encaminhamentos WHERE documento_id=doc.id;
 IF FOUND THEN
  IF enviado.numero_sei=btrim(p_numero_sei) AND enviado.link_sei=btrim(p_link_sei)
   AND enviado.data_encaminhamento=p_data THEN RETURN enviado.id; END IF;
  RAISE EXCEPTION 'Encaminhamento já confirmado com outra evidência.'
   USING ERRCODE='23514';
 END IF;
 INSERT INTO public.emenda_subempenho_encaminhamentos
 (emenda_id,subempenho_id,documento_id,destino,numero_sei,link_sei,
  data_encaminhamento,confirmado_por)
 VALUES(doc.emenda_id,doc.subempenho_id,doc.id,politica.destino_encaminhamento,
  btrim(p_numero_sei),btrim(p_link_sei),p_data,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

CREATE FUNCTION public.emenda_subempenho_concluir_etapa(
 p_subempenho uuid,p_tipo text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
 doc public.emenda_subempenho_documentos%ROWTYPE;
 politica public.emenda_subempenho_matrizes%ROWTYPE;
 pendentes integer; estado_esperado text; novo_estado text;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para concluir subetapas.' USING ERRCODE='42501'; END IF;
 IF p_tipo IS NULL OR p_tipo NOT IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')
 THEN RAISE EXCEPTION 'Subetapa não reconhecida.' USING ERRCODE='23514'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho FOR UPDATE;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos
 WHERE subempenho_id=sub.id AND tipo=p_tipo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registre primeiro o documento desta subetapa.'
  USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_subempenho_conclusoes WHERE documento_id=doc.id)
 THEN RETURN true; END IF;
 SELECT * INTO politica FROM public.emenda_subempenho_matrizes WHERE id=doc.politica_id;
 IF politica.id IS NULL THEN
  RAISE EXCEPTION 'Documento sem matriz homologada de assinaturas.' USING ERRCODE='23514'; END IF;

 estado_esperado:=CASE p_tipo WHEN 'solicitacao_liquidacao' THEN 'rascunho'
  WHEN 'movimento_liquidacao' THEN 'solicitado'
  WHEN 'aviso_subempenho' THEN 'em_liquidacao' END;
 novo_estado:=CASE p_tipo WHEN 'solicitacao_liquidacao' THEN 'solicitado'
  WHEN 'movimento_liquidacao' THEN 'em_liquidacao'
  WHEN 'aviso_subempenho' THEN 'subempenhado' END;
 IF sub.status IS DISTINCT FROM estado_esperado THEN
  RAISE EXCEPTION 'A subetapa anterior precisa estar concluída.' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO pendentes FROM unnest(politica.grupos_obrigatorios) AS g(grupo_codigo)
 WHERE NOT EXISTS(SELECT 1 FROM public.emenda_subempenho_assinaturas a
  WHERE a.documento_id=doc.id AND a.grupo=g.grupo_codigo);
 IF pendentes>0 THEN
  RAISE EXCEPTION 'Faltam assinaturas obrigatórias para esta subetapa.'
   USING ERRCODE='23514'; END IF;
 IF politica.exige_encaminhamento AND NOT EXISTS(
  SELECT 1 FROM public.emenda_subempenho_encaminhamentos e
  WHERE e.documento_id=doc.id AND e.destino=politica.destino_encaminhamento)
 THEN RAISE EXCEPTION 'Confirme o encaminhamento documental antes de concluir.'
  USING ERRCODE='23514'; END IF;
 IF p_tipo='aviso_subempenho' AND (doc.valor_documentado IS NULL OR doc.valor_documentado<=0)
 THEN RAISE EXCEPTION 'Aviso de Subempenho sem valor efetivo.' USING ERRCODE='23514'; END IF;

 UPDATE public.emenda_subempenhos SET status=novo_estado,
  valor_subempenhado=CASE WHEN p_tipo='aviso_subempenho' THEN doc.valor_documentado ELSE NULL END,
  atualizado_em=now()
 WHERE id=sub.id;
 INSERT INTO public.emenda_subempenho_conclusoes
 (emenda_id,subempenho_id,documento_id,status_resultante,concluido_por)
 VALUES(sub.emenda_id,sub.id,doc.id,novo_estado,ator);
 RETURN true;
END;
$body$;

-- Evidências imutáveis, também sob acesso privilegiado direto.
CREATE FUNCTION public.emenda_sub_evidencia_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 RAISE EXCEPTION 'Evidência documental registrada é imutável: use retificação formal.'
 USING ERRCODE='23514';
END;
$body$;
CREATE TRIGGER guard_emenda_sub_ass_imutavel BEFORE UPDATE OR DELETE
 ON public.emenda_subempenho_assinaturas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_sub_evidencia_imutavel();
CREATE TRIGGER guard_emenda_sub_env_imutavel BEFORE UPDATE OR DELETE
 ON public.emenda_subempenho_encaminhamentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_sub_evidencia_imutavel();
CREATE TRIGGER guard_emenda_sub_concl_imutavel BEFORE UPDATE OR DELETE
 ON public.emenda_subempenho_conclusoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_sub_evidencia_imutavel();

REVOKE ALL ON FUNCTION public.emenda_sub_matriz_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_d_guard_matriz_para_subempenho() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_sub_evidencia_imutavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_sub_matriz_homologar(uuid,text,text[],boolean,text,text,text,text)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_subempenho_assinar(uuid,text,text,text,text,text,date)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_subempenho_encaminhar(uuid,text,text,date)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_subempenho_concluir_etapa(uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_sub_matriz_homologar(uuid,text,text[],boolean,text,text,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_assinar(uuid,text,text,text,text,text,date)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_encaminhar(uuid,text,text,date)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_concluir_etapa(uuid,text)
 TO authenticated;
COMMIT;
