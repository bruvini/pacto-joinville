-- PACTO Joinville · Emendas · E2 — RPCs financeiras serializadas.
-- Todos os movimentos novos passam pela linha da emenda FOR UPDATE.
-- Comprovante NÃO nasce da programação, nem quitação nasce do comprovante.
BEGIN;

CREATE FUNCTION public.emenda_pag_total_programado(
 p_subempenho uuid,p_ignorar_parcela uuid DEFAULT NULL
) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(ultima.valor_programado),0)::numeric
 FROM public.emenda_pagamento_parcelas p
 LEFT JOIN LATERAL (
  SELECT g.valor_programado
  FROM public.emenda_pagamento_programacoes g
  WHERE g.parcela_id=p.id ORDER BY g.sequencia DESC LIMIT 1
 ) ultima ON true
 WHERE p.subempenho_id=p_subempenho
  AND (p_ignorar_parcela IS NULL OR p.id<>p_ignorar_parcela);
$$;

CREATE FUNCTION public.emenda_pag_pago_liquido_parcela(p_parcela uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (
  coalesce((SELECT c.valor_pago FROM public.emenda_pagamento_comprovantes c
            WHERE c.parcela_id=p_parcela),0)
  -
  coalesce((SELECT sum(a.valor) FROM public.emenda_pagamento_ajustes a
            WHERE a.parcela_id=p_parcela),0)
 )::numeric;
$$;

CREATE FUNCTION public.emenda_pag_pago_liquido_sub(p_subempenho uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(public.emenda_pag_pago_liquido_parcela(p.id)),0)::numeric
 FROM public.emenda_pagamento_parcelas p WHERE p.subempenho_id=p_subempenho;
$$;

CREATE FUNCTION public.emenda_pag_conciliado(p_subempenho uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((
  SELECT x.evento='conciliado' FROM public.emenda_pagamento_conciliacoes x
  WHERE x.subempenho_id=p_subempenho ORDER BY x.sequencia DESC LIMIT 1
 ),false);
$$;

CREATE FUNCTION public.emenda_pagamento_guard_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Registro financeiro histórico é imutável: registre novo evento documentado.'
  USING ERRCODE='23514';
END;
$$;

CREATE TRIGGER guard_emenda_pag_parc_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_parcelas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();
CREATE TRIGGER guard_emenda_pag_prog_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_programacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();
CREATE TRIGGER guard_emenda_pag_comp_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_comprovantes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();
CREATE TRIGGER guard_emenda_pag_ajuste_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_ajustes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();
CREATE TRIGGER guard_emenda_pag_ret_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_retificacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();
CREATE TRIGGER guard_emenda_pag_conc_immut BEFORE UPDATE OR DELETE ON public.emenda_pagamento_conciliacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_pagamento_guard_imutavel();

-- Helper privado: chamado por RPCs autorizadas depois de serializar pela emenda.
CREATE FUNCTION public.emenda_pag_exigir_aberto(p_sub uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.emenda_subempenhos%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.emenda_subempenhos WHERE id=p_sub;
 IF s.id IS NULL OR s.status<>'subempenhado' OR s.valor_subempenhado IS NULL
 THEN RAISE EXCEPTION 'O pagamento exige subempenho confirmado no Aviso de Movimento.'
  USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_liberacoes l WHERE l.lancamento_id=s.lancamento_id)
 THEN RAISE EXCEPTION 'Execução legada encontrada; concilie antes de utilizar o novo livro.'
  USING ERRCODE='23514'; END IF;
 IF public.emenda_pag_conciliado(s.id)
 THEN RAISE EXCEPTION 'Subempenho conciliado: registre reabertura formal antes de novos eventos.'
  USING ERRCODE='23514'; END IF;
END;
$$;

CREATE FUNCTION public.emenda_pag_parcela_criar(p_subempenho uuid,p_chave uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
 antiga public.emenda_pagamento_parcelas%ROWTYPE; seq integer; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para criar parcela.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL THEN RAISE EXCEPTION 'Chave idempotente obrigatória.' USING ERRCODE='23514'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO antiga FROM public.emenda_pagamento_parcelas
  WHERE emenda_id=sub.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF antiga.subempenho_id=p_subempenho THEN RETURN antiga.id; END IF;
  RAISE EXCEPTION 'Chave idempotente usada para outro subempenho.' USING ERRCODE='23514';
 END IF;
 PERFORM public.emenda_pag_exigir_aberto(sub.id);
 SELECT coalesce(max(sequencia),0)+1 INTO seq
 FROM public.emenda_pagamento_parcelas WHERE subempenho_id=sub.id;
 INSERT INTO public.emenda_pagamento_parcelas
 (emenda_id,subempenho_id,sequencia,chave_idempotencia,registrado_por)
 VALUES(sub.emenda_id,sub.id,seq,p_chave,ator) RETURNING id INTO novo;
 RETURN novo;
END;
$$;

CREATE FUNCTION public.emenda_pag_programar(
 p_parcela uuid,p_valor numeric,p_data_prevista date,
 p_numero_sei text,p_link_sei text,p_data_documento date,
 p_motivo text,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); p public.emenda_pagamento_parcelas%ROWTYPE;
 sub public.emenda_subempenhos%ROWTYPE; anterior public.emenda_pagamento_programacoes%ROWTYPE;
 existente public.emenda_pagamento_programacoes%ROWTYPE;
 seq integer; tipo_novo text; outros numeric; pago_liquido numeric; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para programar pagamento.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL OR p_valor IS NULL OR p_valor<0 OR p_valor<>round(p_valor,2)
  OR p_data_prevista IS NULL OR p_data_documento IS NULL OR p_data_documento>CURRENT_DATE
  OR length(btrim(coalesce(p_numero_sei,''))) NOT BETWEEN 1 AND 100
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Programação, data, valor ou referência SEI inválidos.' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.emenda_pagamento_parcelas WHERE id=p_parcela;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=p.emenda_id FOR UPDATE;
 SELECT * INTO existente FROM public.emenda_pagamento_programacoes
 WHERE emenda_id=p.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF existente.parcela_id=p.id AND existente.valor_programado=p_valor
   AND existente.data_prevista=p_data_prevista AND existente.numero_sei=btrim(p_numero_sei)
   AND existente.link_sei=btrim(p_link_sei) AND existente.data_documento=p_data_documento
   AND existente.justificativa IS NOT DISTINCT FROM nullif(btrim(coalesce(p_motivo,'')),'')
  THEN RETURN existente.id; END IF;
  RAISE EXCEPTION 'Chave já utilizada com programação diferente.' USING ERRCODE='23514';
 END IF;
 PERFORM public.emenda_pag_exigir_aberto(p.subempenho_id);
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p.subempenho_id;
 SELECT * INTO anterior FROM public.emenda_pagamento_programacoes
 WHERE parcela_id=p.id ORDER BY sequencia DESC LIMIT 1;
 tipo_novo:=CASE WHEN anterior.id IS NULL THEN 'inicial'
                  WHEN p_valor=0 THEN 'cancelamento'
                  ELSE 'reprogramacao' END;
 IF (tipo_novo='inicial' AND p_valor=0)
  OR (tipo_novo<>'inicial' AND length(btrim(coalesce(p_motivo,'')))<10)
 THEN RAISE EXCEPTION 'Reprogramação/cancelamento exige justificativa; programação inicial deve ser positiva.'
  USING ERRCODE='23514'; END IF;
 pago_liquido:=public.emenda_pag_pago_liquido_parcela(p.id);
 IF p_valor<pago_liquido THEN
  RAISE EXCEPTION 'Programação não pode ser inferior ao pagamento líquido da parcela.'
  USING ERRCODE='23514'; END IF;
 outros:=public.emenda_pag_total_programado(sub.id,p.id);
 IF outros+p_valor>sub.valor_subempenhado THEN
  RAISE EXCEPTION 'Soma das programações vigentes supera o valor subempenhado.'
  USING ERRCODE='23514'; END IF;
 seq:=coalesce(anterior.sequencia,0)+1;
 INSERT INTO public.emenda_pagamento_programacoes
 (emenda_id,subempenho_id,parcela_id,sequencia,tipo,valor_programado,
  data_prevista,numero_sei,link_sei,data_documento,justificativa,
  chave_idempotencia,registrado_por)
 VALUES(sub.emenda_id,sub.id,p.id,seq,tipo_novo,p_valor,p_data_prevista,
  btrim(p_numero_sei),btrim(p_link_sei),p_data_documento,
  CASE WHEN tipo_novo='inicial' THEN NULL ELSE btrim(p_motivo) END,p_chave,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$$;

CREATE FUNCTION public.emenda_pag_comprovar(
 p_parcela uuid,p_valor numeric,p_data_pagamento date,
 p_numero_sei text,p_link_sei text,p_data_documento date,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); p public.emenda_pagamento_parcelas%ROWTYPE;
 sub public.emenda_subempenhos%ROWTYPE; prog public.emenda_pagamento_programacoes%ROWTYPE;
 existente public.emenda_pagamento_comprovantes%ROWTYPE;
 novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  OR p_data_pagamento IS NULL OR p_data_pagamento>CURRENT_DATE
  OR p_data_documento IS NULL OR p_data_documento>CURRENT_DATE
  OR p_data_documento<p_data_pagamento
  OR length(btrim(coalesce(p_numero_sei,''))) NOT BETWEEN 1 AND 100
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Comprovante, data, valor ou referência SEI inválidos.' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.emenda_pagamento_parcelas WHERE id=p_parcela;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não localizada.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=p.emenda_id FOR UPDATE;
 SELECT * INTO existente FROM public.emenda_pagamento_comprovantes
 WHERE emenda_id=p.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF existente.parcela_id=p.id AND existente.valor_pago=p_valor
   AND existente.data_pagamento=p_data_pagamento
   AND existente.numero_sei=btrim(p_numero_sei) AND existente.link_sei=btrim(p_link_sei)
   AND existente.data_documento=p_data_documento
  THEN RETURN existente.id; END IF;
  RAISE EXCEPTION 'Chave idempotente já utilizada com comprovante diferente.' USING ERRCODE='23514';
 END IF;
 PERFORM public.emenda_pag_exigir_aberto(p.subempenho_id);
 IF EXISTS(SELECT 1 FROM public.emenda_pagamento_comprovantes c WHERE c.parcela_id=p.id)
 THEN RAISE EXCEPTION 'Esta parcela já tem comprovante; use nova parcela para pagamento adicional.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO prog FROM public.emenda_pagamento_programacoes g
 WHERE g.parcela_id=p.id ORDER BY g.sequencia DESC LIMIT 1;
 IF prog.id IS NULL OR prog.valor_programado=0 OR p_valor>prog.valor_programado
 THEN RAISE EXCEPTION 'É obrigatório programar a parcela; pagamento não pode superar sua programação vigente.'
  USING ERRCODE='23514'; END IF;
 IF p_data_pagamento<prog.data_documento THEN
  RAISE EXCEPTION 'Pagamento não pode anteceder o documento de programação vigente.'
   USING ERRCODE='23514'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p.subempenho_id;
 IF public.emenda_pag_pago_liquido_sub(sub.id)+p_valor>sub.valor_subempenhado THEN
  RAISE EXCEPTION 'Pagamento excederia o valor do Aviso de Subempenho.'
   USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_pagamento_comprovantes
 (emenda_id,subempenho_id,parcela_id,valor_pago,data_pagamento,
  numero_sei,link_sei,data_documento,chave_idempotencia,registrado_por)
 VALUES(sub.emenda_id,sub.id,p.id,p_valor,p_data_pagamento,btrim(p_numero_sei),
  btrim(p_link_sei),p_data_documento,p_chave,ator) RETURNING id INTO novo;
 RETURN novo;
END;
$$;

CREATE FUNCTION public.emenda_pag_ajustar(
 p_comprovante uuid,p_tipo text,p_valor numeric,p_data_evento date,
 p_numero_sei text,p_link_sei text,p_data_documento date,
 p_motivo text,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); c public.emenda_pagamento_comprovantes%ROWTYPE;
 existente public.emenda_pagamento_ajustes%ROWTYPE; ja_ajustado numeric; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para registrar devolução/estorno.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('devolucao','estorno')
  OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  OR p_data_evento IS NULL OR p_data_evento>CURRENT_DATE
  OR p_data_documento IS NULL OR p_data_documento>CURRENT_DATE OR p_data_documento<p_data_evento
  OR length(btrim(coalesce(p_numero_sei,''))) NOT BETWEEN 1 AND 100
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR length(btrim(coalesce(p_motivo,'')))<10
 THEN RAISE EXCEPTION 'Ajuste exige valor, tipo, motivo e evidência SEI válidos.' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.emenda_pagamento_comprovantes WHERE id=p_comprovante;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comprovante não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=c.emenda_id FOR UPDATE;
 SELECT * INTO existente FROM public.emenda_pagamento_ajustes
 WHERE emenda_id=c.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF existente.comprovante_id=c.id AND existente.tipo=p_tipo AND existente.valor=p_valor
   AND existente.data_evento=p_data_evento AND existente.numero_sei=btrim(p_numero_sei)
   AND existente.link_sei=btrim(p_link_sei) AND existente.data_documento=p_data_documento
   AND existente.motivo=btrim(p_motivo)
  THEN RETURN existente.id; END IF;
  RAISE EXCEPTION 'Chave idempotente de ajuste utilizada com outros dados.' USING ERRCODE='23514';
 END IF;
 PERFORM public.emenda_pag_exigir_aberto(c.subempenho_id);
 IF p_data_evento<c.data_pagamento THEN
  RAISE EXCEPTION 'Devolução/estorno não pode anteceder a data do pagamento original.'
   USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(valor),0) INTO ja_ajustado FROM public.emenda_pagamento_ajustes
 WHERE comprovante_id=c.id;
 IF ja_ajustado+p_valor>c.valor_pago THEN
  RAISE EXCEPTION 'Devolução e estorno ultrapassariam o valor do comprovante.'
   USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_pagamento_ajustes
 (emenda_id,subempenho_id,parcela_id,comprovante_id,tipo,valor,data_evento,
  numero_sei,link_sei,data_documento,motivo,chave_idempotencia,registrado_por)
 VALUES(c.emenda_id,c.subempenho_id,c.parcela_id,c.id,p_tipo,p_valor,p_data_evento,
  btrim(p_numero_sei),btrim(p_link_sei),p_data_documento,btrim(p_motivo),p_chave,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$$;

CREATE FUNCTION public.emenda_pag_retificar(
 p_programacao uuid,p_comprovante uuid,p_ajuste uuid,p_numero_sei text,
 p_link_sei text,p_data_documento date,p_motivo text,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); em uuid; sub uuid; parcela uuid;
 pre public.emenda_pagamento_retificacoes%ROWTYPE; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para retificar evidência.' USING ERRCODE='42501'; END IF;
 IF num_nonnulls(p_programacao,p_comprovante,p_ajuste)<>1 OR p_chave IS NULL
  OR length(btrim(coalesce(p_numero_sei,''))) NOT BETWEEN 1 AND 100
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR p_data_documento IS NULL OR p_data_documento>CURRENT_DATE
  OR length(btrim(coalesce(p_motivo,'')))<10
 THEN RAISE EXCEPTION 'Retificação exige documento de origem único e nova evidência SEI.'
  USING ERRCODE='23514'; END IF;
 IF p_programacao IS NOT NULL THEN
  SELECT emenda_id,subempenho_id,parcela_id INTO em,sub,parcela
  FROM public.emenda_pagamento_programacoes WHERE id=p_programacao;
 ELSIF p_comprovante IS NOT NULL THEN
  SELECT emenda_id,subempenho_id,parcela_id INTO em,sub,parcela
  FROM public.emenda_pagamento_comprovantes WHERE id=p_comprovante;
 ELSE
  SELECT emenda_id,subempenho_id,parcela_id INTO em,sub,parcela
  FROM public.emenda_pagamento_ajustes WHERE id=p_ajuste;
 END IF;
 IF em IS NULL THEN RAISE EXCEPTION 'Documento de origem não encontrado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=em FOR UPDATE;
 SELECT * INTO pre FROM public.emenda_pagamento_retificacoes
 WHERE emenda_id=em AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF pre.programacao_id IS NOT DISTINCT FROM p_programacao
   AND pre.comprovante_id IS NOT DISTINCT FROM p_comprovante
   AND pre.ajuste_id IS NOT DISTINCT FROM p_ajuste
   AND pre.novo_numero_sei=btrim(p_numero_sei) AND pre.novo_link_sei=btrim(p_link_sei)
   AND pre.nova_data_documento=p_data_documento AND pre.motivo=btrim(p_motivo)
  THEN RETURN pre.id; END IF;
  RAISE EXCEPTION 'Chave idempotente de retificação usada com outros dados.' USING ERRCODE='23514';
 END IF;
 PERFORM public.emenda_pag_exigir_aberto(sub);
 INSERT INTO public.emenda_pagamento_retificacoes
 (emenda_id,subempenho_id,parcela_id,programacao_id,comprovante_id,ajuste_id,
  novo_numero_sei,novo_link_sei,nova_data_documento,motivo,chave_idempotencia,registrado_por)
 VALUES(em,sub,parcela,p_programacao,p_comprovante,p_ajuste,btrim(p_numero_sei),
  btrim(p_link_sei),p_data_documento,btrim(p_motivo),p_chave,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$$;

CREATE FUNCTION public.emenda_pag_conciliar(
 p_subempenho uuid,p_evento text,p_numero_sei text,p_link_sei text,
 p_data_evento date,p_motivo text,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
 ultimo public.emenda_pagamento_conciliacoes%ROWTYPE;
 existente public.emenda_pagamento_conciliacoes%ROWTYPE;
 liquido numeric; programado numeric; seq integer; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para conciliar ou reabrir pagamentos.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL OR p_evento IS NULL OR p_evento NOT IN ('conciliado','reaberto')
  OR length(btrim(coalesce(p_numero_sei,''))) NOT BETWEEN 1 AND 100
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR p_data_evento IS NULL OR p_data_evento>CURRENT_DATE
  OR length(btrim(coalesce(p_motivo,'')))<10
 THEN RAISE EXCEPTION 'Conciliação ou reabertura requer documento e justificativa.' USING ERRCODE='23514'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO existente FROM public.emenda_pagamento_conciliacoes
 WHERE emenda_id=sub.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF existente.subempenho_id=sub.id AND existente.evento=p_evento
   AND existente.numero_sei=btrim(p_numero_sei) AND existente.link_sei=btrim(p_link_sei)
   AND existente.data_evento=p_data_evento AND existente.motivo=btrim(p_motivo)
  THEN RETURN existente.id; END IF;
  RAISE EXCEPTION 'Chave idempotente de conciliação utilizada com outros dados.'
   USING ERRCODE='23514'; END IF;
 SELECT * INTO ultimo FROM public.emenda_pagamento_conciliacoes
 WHERE subempenho_id=sub.id ORDER BY sequencia DESC LIMIT 1;
 IF p_evento='reaberto' THEN
  IF ultimo.id IS NULL OR ultimo.evento<>'conciliado' THEN
   RAISE EXCEPTION 'A reabertura exige conciliação anterior vigente.' USING ERRCODE='23514'; END IF;
 ELSE
  IF ultimo.evento='conciliado' THEN
   RAISE EXCEPTION 'Subempenho já conciliado.' USING ERRCODE='23514'; END IF;
  IF sub.status<>'subempenhado' OR sub.valor_subempenhado IS NULL THEN
   RAISE EXCEPTION 'Só é possível conciliar subempenho efetivamente confirmado.'
    USING ERRCODE='23514'; END IF;
  liquido:=public.emenda_pag_pago_liquido_sub(sub.id);
  programado:=public.emenda_pag_total_programado(sub.id);
  IF liquido<>sub.valor_subempenhado OR programado<>sub.valor_subempenhado THEN
   RAISE EXCEPTION 'Conciliação exige pagamento líquido e programação vigentes iguais ao subempenhado.'
    USING ERRCODE='23514'; END IF;
 END IF;
 liquido:=public.emenda_pag_pago_liquido_sub(sub.id);
 seq:=coalesce(ultimo.sequencia,0)+1;
 INSERT INTO public.emenda_pagamento_conciliacoes
 (emenda_id,subempenho_id,sequencia,evento,numero_sei,link_sei,
  data_evento,motivo,valor_pago_liquido_snapshot,chave_idempotencia,registrado_por)
 VALUES(sub.emenda_id,sub.id,seq,p_evento,btrim(p_numero_sei),btrim(p_link_sei),
  p_data_evento,btrim(p_motivo),liquido,p_chave,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$$;

-- Leitura somente pela RLS; gravação só em funções autorizadas, com sessões do usuário.
REVOKE ALL ON FUNCTION public.emenda_pag_total_programado(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_pag_pago_liquido_parcela(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_pag_pago_liquido_sub(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_pag_conciliado(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_pagamento_guard_imutavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_pag_exigir_aberto(uuid) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.emenda_pag_parcela_criar(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_pag_programar(uuid,numeric,date,text,text,date,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_pag_comprovar(uuid,numeric,date,text,text,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_pag_ajustar(uuid,text,numeric,date,text,text,date,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_pag_retificar(uuid,uuid,uuid,text,text,date,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_pag_conciliar(uuid,text,text,text,date,text,uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.emenda_pag_parcela_criar(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_pag_programar(uuid,numeric,date,text,text,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_pag_comprovar(uuid,numeric,date,text,text,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_pag_ajustar(uuid,text,numeric,date,text,text,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_pag_retificar(uuid,uuid,uuid,text,text,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_pag_conciliar(uuid,text,text,text,date,text,uuid) TO authenticated;
COMMIT;
