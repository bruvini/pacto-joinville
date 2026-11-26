-- PACTO / Emendas · Fase B2 — regras financeiras transacionais.
-- Padrão: serializar operações por emenda; não mexer nos registros legados.
BEGIN;

-- O gatilho protege inclusive alterações privilegiadas feitas fora das RPCs.
CREATE FUNCTION public.emenda_subempenho_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE
 lanc public.emenda_lancamentos%ROWTYPE;
 nota public.emenda_solicitacoes%ROWTYPE;
 anulado numeric(16,2);
 outros numeric(16,2);
 reserva numeric(16,2);
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Subempenhos possuem histórico; utilize cancelamento controlado.'
   USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.emenda_id,NEW.lancamento_id,NEW.competencia_id,NEW.solicitacao_id,
         NEW.sequencia,NEW.chave_idempotencia,NEW.registrado_por,NEW.registrado_em)
     IS DISTINCT FROM
     ROW(OLD.emenda_id,OLD.lancamento_id,OLD.competencia_id,OLD.solicitacao_id,
         OLD.sequencia,OLD.chave_idempotencia,OLD.registrado_por,OLD.registrado_em)
  THEN RAISE EXCEPTION 'Identidade, NE e competência do subempenho são imutáveis.' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('cancelado','subempenhado') THEN
   RAISE EXCEPTION 'Subempenho cancelado ou confirmado não admite alteração direta.' USING ERRCODE='23514';
  END IF;
  IF OLD.valor_solicitado IS DISTINCT FROM NEW.valor_solicitado
     AND OLD.status<>'rascunho' THEN
   RAISE EXCEPTION 'Valor solicitado somente pode ser corrigido no rascunho.' USING ERRCODE='23514';
  END IF;
  IF NEW.status<>OLD.status AND NOT (
     (OLD.status='rascunho' AND NEW.status IN ('solicitado','cancelado'))
     OR (OLD.status='solicitado' AND NEW.status='em_liquidacao')
     OR (OLD.status='em_liquidacao' AND NEW.status='subempenhado')
  ) THEN RAISE EXCEPTION 'Transição inválida no subempenho.' USING ERRCODE='23514'; END IF;
 END IF;

 -- Mesma linha de serialização utilizada pelas RPCs financeiras legadas.
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=NEW.lancamento_id;
 SELECT * INTO nota FROM public.emenda_solicitacoes WHERE id=NEW.solicitacao_id;
 IF lanc.id IS NULL OR nota.id IS NULL OR lanc.emenda_id<>NEW.emenda_id
  OR lanc.solicitacao_id IS DISTINCT FROM nota.id
  OR nota.emenda_id<>NEW.emenda_id OR lanc.status<>'emitido'
  OR lanc.excluido_em IS NOT NULL OR nota.status<>'emitida' OR nota.valor_ne IS NULL
 THEN RAISE EXCEPTION 'NE ou lançamento indisponível para subempenho.' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.emenda_lancamento_meses m
  WHERE m.lancamento_id=NEW.lancamento_id AND m.competencia_id=NEW.competencia_id
 ) OR EXISTS(
  SELECT 1 FROM public.emenda_encerramentos_sem_execucao x
  WHERE x.lancamento_id=NEW.lancamento_id AND x.competencia_id=NEW.competencia_id
 ) OR EXISTS(
  SELECT 1 FROM public.emenda_conciliacoes_ne x WHERE x.lancamento_id=NEW.lancamento_id
 ) THEN RAISE EXCEPTION 'Competência encerrada ou não vinculada à NE.' USING ERRCODE='23514'; END IF;

 IF NEW.status='cancelado' THEN
  IF TG_OP='INSERT' OR OLD.status<>'rascunho'
   OR EXISTS(SELECT 1 FROM public.emenda_subempenho_documentos d WHERE d.subempenho_id=NEW.id)
  THEN RAISE EXCEPTION 'Cancelamento simples permitido apenas para rascunho sem documentos.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;

 -- Não misturar o Aviso de Movimento do fluxo legado com o novo livro.
 IF EXISTS (SELECT 1 FROM public.emenda_liberacoes lib WHERE lib.lancamento_id=NEW.lancamento_id)
 THEN RAISE EXCEPTION 'Há liberação do modelo anterior: concilie antes de iniciar subempenhos.' USING ERRCODE='23514'; END IF;

 IF NEW.status IN ('solicitado','em_liquidacao','subempenhado') AND NOT EXISTS (
  SELECT 1 FROM public.emenda_subempenho_documentos d
  WHERE d.subempenho_id=NEW.id AND d.tipo='solicitacao_liquidacao'
 ) THEN RAISE EXCEPTION 'Solicitação de Subempenho/Liquidação não documentada.' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('em_liquidacao','subempenhado') AND NOT EXISTS (
  SELECT 1 FROM public.emenda_subempenho_documentos d
  WHERE d.subempenho_id=NEW.id AND d.tipo='movimento_liquidacao'
 ) THEN RAISE EXCEPTION 'Aviso de Movimento - Empenho em Liquidação não documentado.' USING ERRCODE='23514'; END IF;
 IF NEW.status='subempenhado' AND NOT EXISTS (
  SELECT 1 FROM public.emenda_subempenho_documentos d
  WHERE d.subempenho_id=NEW.id AND d.tipo='aviso_subempenho'
   AND d.valor_documentado=NEW.valor_subempenhado
 ) THEN RAISE EXCEPTION 'Valor e documento do Aviso de Movimento - Subempenho não conferem.' USING ERRCODE='23514'; END IF;

 SELECT coalesce(sum(x.valor),0) INTO anulado
 FROM public.emenda_anulacoes x WHERE x.lancamento_id=NEW.lancamento_id;
 SELECT coalesce(sum(CASE WHEN x.status='subempenhado'
                         THEN x.valor_subempenhado ELSE x.valor_solicitado END),0)
 INTO outros FROM public.emenda_subempenhos x
 WHERE x.lancamento_id=NEW.lancamento_id AND x.id<>NEW.id AND x.status<>'cancelado';
 reserva:=CASE WHEN NEW.status='subempenhado'
  THEN NEW.valor_subempenhado ELSE NEW.valor_solicitado END;
 IF (anulado+outros+reserva)>nota.valor_ne THEN
  RAISE EXCEPTION 'Soma dos compromissos supera a NE líquida de anulações.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;

CREATE TRIGGER guard_emenda_subempenhos
 BEFORE INSERT OR UPDATE OR DELETE ON public.emenda_subempenhos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_subempenho_validar();

-- Nenhuma exclusão documental; a retificação formal terá fluxo próprio.
CREATE FUNCTION public.emenda_subempenho_guard_documento()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Documento de subempenho não pode ser removido.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION 'Documento já registrado: retificação requer procedimento formal.' USING ERRCODE='23514';
 END IF;
 IF NEW.data_documento>CURRENT_DATE THEN
  RAISE EXCEPTION 'Data de documento não pode ser futura.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_sub_documentos
 BEFORE INSERT OR UPDATE OR DELETE ON public.emenda_subempenho_documentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_subempenho_guard_documento();

-- O registro legado de liberação não pode ser usado para "subempenhar" novamente.
CREATE FUNCTION public.emenda_guard_liberacao_legada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 IF EXISTS(
  SELECT 1 FROM public.emenda_subempenhos s
  WHERE s.lancamento_id=NEW.lancamento_id AND s.status<>'cancelado'
 ) THEN
  RAISE EXCEPTION 'Há subempenhos no novo modelo: não registrar liberação legada como Aviso de Movimento.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_liberacao_legada
 BEFORE INSERT OR UPDATE ON public.emenda_liberacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_guard_liberacao_legada();

-- Anulações posteriores não podem consumir valor reservado/subempenhado.
-- Emenda é bloqueada como no fluxo atual de anulação.
CREATE FUNCTION public.emenda_guard_anulacao_subempenhos()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE valor_ne numeric(16,2); existente numeric(16,2); reservado numeric(16,2);
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT s.valor_ne INTO valor_ne FROM public.emenda_lancamentos l
 JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
 WHERE l.id=NEW.lancamento_id AND l.emenda_id=NEW.emenda_id;
 SELECT coalesce(sum(x.valor),0) INTO existente FROM public.emenda_anulacoes x
 WHERE x.lancamento_id=NEW.lancamento_id AND (TG_OP='INSERT' OR x.id<>NEW.id);
 SELECT coalesce(sum(CASE WHEN x.status='subempenhado'
                         THEN x.valor_subempenhado ELSE x.valor_solicitado END),0)
 INTO reservado FROM public.emenda_subempenhos x
 WHERE x.lancamento_id=NEW.lancamento_id AND x.status<>'cancelado';
 IF valor_ne IS NULL OR existente+NEW.valor+reservado>valor_ne THEN
  RAISE EXCEPTION 'Anulação invadiria saldo reservado ou subempenhado.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_anulacao_subempenhos
 BEFORE INSERT OR UPDATE ON public.emenda_anulacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_guard_anulacao_subempenhos();

-- Protege vínculo de pagamento e evita ultrapassar valor efetivo.
CREATE FUNCTION public.emenda_guard_pagamento_subempenho()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE valor_liquido numeric(16,2); soma numeric(16,2);
BEGIN
 IF NEW.subempenho_id IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT s.valor_subempenhado INTO valor_liquido
 FROM public.emenda_subempenhos s
 WHERE s.id=NEW.subempenho_id AND s.emenda_id=NEW.emenda_id
  AND s.lancamento_id=NEW.lancamento_id AND s.competencia_id=NEW.competencia_id
  AND s.status='subempenhado';
 IF valor_liquido IS NULL THEN
  RAISE EXCEPTION 'Pagamento só pode se vincular a subempenho documentalmente confirmado.'
   USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(p.valor),0) INTO soma FROM public.emenda_blocos_pagamento p
 WHERE p.subempenho_id=NEW.subempenho_id AND p.id<>NEW.id;
 IF soma+NEW.valor>valor_liquido THEN
  RAISE EXCEPTION 'Pagamentos superariam o valor efetivo do subempenho.'
   USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_pagamento_subempenho
 BEFORE INSERT OR UPDATE ON public.emenda_blocos_pagamento
 FOR EACH ROW EXECUTE FUNCTION public.emenda_guard_pagamento_subempenho();

-- Uma NE com subempenho não pode ser reidentificada ou reduzida diretamente.
CREATE FUNCTION public.emenda_guard_ne_subempenhada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.emenda_subempenhos s
  WHERE s.solicitacao_id=NEW.id AND s.status<>'cancelado'
 ) AND (
  ROW(NEW.numero_ne,NEW.exercicio_ne,NEW.valor_ne,NEW.status) IS DISTINCT FROM
  ROW(OLD.numero_ne,OLD.exercicio_ne,OLD.valor_ne,OLD.status)
 ) THEN RAISE EXCEPTION 'NE com subempenhos: alterações exigem retificação controlada.'
  USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_ne_subempenhada
 BEFORE UPDATE OF numero_ne,exercicio_ne,valor_ne,status ON public.emenda_solicitacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_guard_ne_subempenhada();

-- Nova abertura independente de liberações legadas, com idempotência por emenda.
CREATE FUNCTION public.emenda_subempenho_criar(
 p_lancamento uuid,p_competencia uuid,p_valor_solicitado numeric,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lanc public.emenda_lancamentos%ROWTYPE;
 atual public.emenda_subempenhos%ROWTYPE; seq integer; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
  ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para registrar subempenhos.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL OR p_valor_solicitado IS NULL OR p_valor_solicitado<=0
   OR p_valor_solicitado<>round(p_valor_solicitado,2)
 THEN RAISE EXCEPTION 'Informe valor solicitado positivo em centavos e chave idempotente.' USING ERRCODE='23514'; END IF;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lanc.emenda_id FOR UPDATE;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 SELECT * INTO atual FROM public.emenda_subempenhos
 WHERE emenda_id=lanc.emenda_id AND chave_idempotencia=p_chave;
 IF FOUND THEN
  IF atual.lancamento_id=p_lancamento AND atual.competencia_id=p_competencia
   AND atual.valor_solicitado=p_valor_solicitado
  THEN RETURN atual.id; END IF;
  RAISE EXCEPTION 'Chave idempotente já utilizada com outros dados.' USING ERRCODE='23514';
 END IF;
 IF lanc.status<>'emitido' OR lanc.solicitacao_id IS NULL THEN
  RAISE EXCEPTION 'A Nota de Empenho precisa estar emitida.' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(sequencia),0)+1 INTO seq
 FROM public.emenda_subempenhos WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia;
 INSERT INTO public.emenda_subempenhos
 (emenda_id,lancamento_id,competencia_id,solicitacao_id,sequencia,
  chave_idempotencia,valor_solicitado,registrado_por)
 VALUES(lanc.emenda_id,p_lancamento,p_competencia,lanc.solicitacao_id,seq,
  p_chave,p_valor_solicitado,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

-- Registra a evidência de cada marco sem simular integração automática ao e-Pública.
-- Repetição idêntica retorna o documento existente. Divergência exige retificação.
CREATE FUNCTION public.emenda_subempenho_documentar(
 p_subempenho uuid,p_tipo text,p_numero text,p_link text,p_data date,
 p_valor_aviso numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
 existente public.emenda_subempenho_documentos%ROWTYPE; novo uuid;
 proximo text;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
  ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para documentar subempenhos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho FOR UPDATE;
 IF p_tipo NOT IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR length(btrim(p_numero))>100
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
  OR p_data IS NULL OR p_data>CURRENT_DATE
 THEN RAISE EXCEPTION 'Documento SEI inválido ou data futura.' USING ERRCODE='23514'; END IF;
 IF (p_tipo='aviso_subempenho' AND
     (p_valor_aviso IS NULL OR p_valor_aviso<=0 OR p_valor_aviso<>round(p_valor_aviso,2)))
  OR (p_tipo<>'aviso_subempenho' AND p_valor_aviso IS NOT NULL)
 THEN RAISE EXCEPTION 'Informe o valor efetivo somente no Aviso de Movimento - Subempenho.' USING ERRCODE='23514'; END IF;

 SELECT * INTO existente FROM public.emenda_subempenho_documentos
 WHERE subempenho_id=p_subempenho AND tipo=p_tipo;
 IF FOUND THEN
  IF existente.numero_sei=btrim(p_numero)
     AND existente.link_sei=btrim(p_link)
     AND existente.data_documento=p_data
     AND existente.valor_documentado IS NOT DISTINCT FROM p_valor_aviso
  THEN RETURN existente.id; END IF;
  RAISE EXCEPTION 'Documento já registrado com dados diferentes; utilize retificação formal.'
   USING ERRCODE='23514';
 END IF;

 proximo:=CASE p_tipo
  WHEN 'solicitacao_liquidacao' THEN 'solicitado'
  WHEN 'movimento_liquidacao' THEN 'em_liquidacao'
  WHEN 'aviso_subempenho' THEN 'subempenhado' END;
 IF NOT (
   (sub.status='rascunho' AND proximo='solicitado') OR
   (sub.status='solicitado' AND proximo='em_liquidacao') OR
   (sub.status='em_liquidacao' AND proximo='subempenhado')
 ) THEN RAISE EXCEPTION 'Documento fora da sequência financeira prevista.' USING ERRCODE='23514'; END IF;

 INSERT INTO public.emenda_subempenho_documentos
 (emenda_id,subempenho_id,tipo,numero_sei,link_sei,data_documento,valor_documentado,registrado_por)
 VALUES(sub.emenda_id,sub.id,p_tipo,btrim(p_numero),btrim(p_link),p_data,p_valor_aviso,ator)
 RETURNING id INTO novo;
 UPDATE public.emenda_subempenhos SET status=proximo,
  valor_subempenhado=CASE WHEN proximo='subempenhado' THEN p_valor_aviso ELSE NULL END,
  atualizado_em=now() WHERE id=sub.id;
 RETURN novo;
END;
$body$;

-- Cancelamento apenas antes de qualquer formalização; preserva linha e auditoria.
CREATE FUNCTION public.emenda_subempenho_cancelar_rascunho(
 p_subempenho uuid,p_motivo text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); sub public.emenda_subempenhos%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
  ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_motivo,'')))<10 THEN
  RAISE EXCEPTION 'Justificativa de cancelamento com pelo menos 10 caracteres.'
   USING ERRCODE='23514'; END IF;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subempenho não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=sub.emenda_id FOR UPDATE;
 SELECT * INTO sub FROM public.emenda_subempenhos WHERE id=p_subempenho FOR UPDATE;
 IF sub.status<>'rascunho' THEN
  RAISE EXCEPTION 'Ato já iniciado; cancelamento administrativo exige fluxo próprio.'
   USING ERRCODE='23514'; END IF;
 UPDATE public.emenda_subempenhos SET status='cancelado',
  motivo_cancelamento=btrim(p_motivo),atualizado_em=now()
 WHERE id=p_subempenho;
 RETURN true;
END;
$body$;

-- Endpoints públicos não herdam EXECUTE para visitantes anônimos.
REVOKE ALL ON FUNCTION public.emenda_subempenho_validar() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_subempenho_guard_documento() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_guard_liberacao_legada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_guard_anulacao_subempenhos() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_guard_pagamento_subempenho() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_guard_ne_subempenhada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_subempenho_criar(uuid,uuid,numeric,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_subempenho_documentar(uuid,text,text,text,date,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_subempenho_cancelar_rascunho(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_criar(uuid,uuid,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_documentar(uuid,text,text,text,date,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_subempenho_cancelar_rascunho(uuid,text) TO authenticated;
COMMIT;
