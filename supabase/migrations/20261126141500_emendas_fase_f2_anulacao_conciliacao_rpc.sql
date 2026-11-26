-- PACTO Joinville · Emendas · F2 — Anulação e fechamento reconciliados.
-- Substitui apenas RPCs de Emendas; não altera nem migra registros existentes.
-- Depende das visões da F1 e das estruturas das Fases A–E.
BEGIN;

-- Os campos anteriores permanecem intactos. Novos snapshots têm significado explícito,
-- inclusive quando o modelo operacional não utiliza emenda_liberacoes.
ALTER TABLE public.emenda_conciliacoes_ne
 ADD COLUMN modelo_financeiro text,
 ADD COLUMN total_comprometido numeric(16,2),
 ADD COLUMN total_pago_liquido numeric(16,2),
 ADD COLUMN total_distribuido numeric(16,2),
 ADD COLUMN competencias_sem_execucao integer,
 ADD CONSTRAINT emenda_f_conc_snapshot_modelo CHECK(
  modelo_financeiro IS NULL OR modelo_financeiro IN
    ('modelo_legado','novo_subempenho','sem_movimentacao')
 ),
 ADD CONSTRAINT emenda_f_conc_snapshot_valores CHECK (
  (total_comprometido IS NULL OR total_comprometido>=0) AND
  (total_pago_liquido IS NULL OR total_pago_liquido>=0) AND
  (total_distribuido IS NULL OR total_distribuido>=0) AND
  (competencias_sem_execucao IS NULL OR competencias_sem_execucao>=0)
 );

-- A função antiga só subtraía liberações. Agora respeita compromissos novos,
-- distribuições ativas, anulações anteriores e atos já conciliados.
CREATE OR REPLACE FUNCTION public.emenda_anular_residual(
 p_lancamento uuid,p_valor numeric,p_justificativa text,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE;
 em public.emendas%ROWTYPE; ne public.emenda_f_ne_painel%ROWTYPE; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
 ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para anular NE.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.' USING ERRCODE='23514'; END IF;
 SELECT * INTO em FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF lan.status<>'emitido' OR lan.solicitacao_id IS NULL OR lan.excluido_em IS NOT NULL OR
  EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne c WHERE c.lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'NE indisponível para anulação.' USING ERRCODE='23514'; END IF;
 IF nullif(btrim(coalesce(em.processo_sei_numero,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Informe o processo SEI principal no cadastro da emenda.'
  USING ERRCODE='23514'; END IF;
 IF p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
 OR length(btrim(coalesce(p_justificativa,'')))<10
 OR nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL
 OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Valor positivo, justificativa e documento SEI são obrigatórios.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO ne FROM public.emenda_f_ne_painel WHERE lancamento_id=p_lancamento;
 IF ne.solicitacao_id IS NULL OR ne.valor_ne_emitida IS NULL OR ne.status_ne<>'emitida'
 THEN RAISE EXCEPTION 'NE não emitida ou não localizada.' USING ERRCODE='23514'; END IF;
 IF ne.modelo_financeiro='conflito_entre_modelos' OR ne.saldo_disponivel_anular<0
 THEN RAISE EXCEPTION 'Conflito de modelos ou saldo da NE inconsistente.'
  USING ERRCODE='23514'; END IF;
 IF p_valor>ne.saldo_disponivel_anular
 THEN RAISE EXCEPTION
  'Anulação excede saldo livre de compromissos e distribuições. Reduza primeiro a distribuição não utilizada.'
  USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_anulacoes
 (emenda_id,lancamento_id,solicitacao_id,valor,motivo,
  numero_sei,link_sei,processo_principal)
 VALUES(lan.emenda_id,lan.id,lan.solicitacao_id,p_valor,btrim(p_justificativa),
  btrim(p_numero_sei),btrim(p_link_sei),em.processo_sei_numero)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

-- Encerramento sem execução precisa ser verdadeiro, não uma maneira de
-- ignorar execução parcial, distribuição ativa ou documentos já iniciados.
CREATE OR REPLACE FUNCTION public.emenda_encerrar_competencia_sem_execucao(
 p_lancamento uuid,p_competencia uuid,p_justificativa text,p_numero text,p_link text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE;
 comp public.emenda_f_competencias_painel%ROWTYPE;
 anterior uuid; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
 ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para encerrar competência.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF lan.status<>'emitido' OR lan.solicitacao_id IS NULL OR lan.excluido_em IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'Emita a NE antes de encerrar competência; NE já encerrada não admite alteração.'
  USING ERRCODE='23514'; END IF;
 IF length(btrim(coalesce(p_justificativa,'')))<10
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Encerramento sem execução exige justificativa e documento SEI.'
  USING ERRCODE='23514'; END IF;
 SELECT id INTO anterior FROM public.emenda_encerramentos_sem_execucao
 WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia;
 IF anterior IS NOT NULL THEN RETURN anterior; END IF;
 SELECT * INTO comp FROM public.emenda_f_competencias_painel
 WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia;
 IF comp.competencia_id IS NULL THEN RAISE EXCEPTION 'Competência fora da NE.'
  USING ERRCODE='23514'; END IF;
 IF comp.valor_distribuido<>0 OR comp.subempenhos_ativos<>0
  OR comp.liberado_legado<>0 OR comp.pago_legado<>0
  OR comp.documentos_legados<>0
 THEN RAISE EXCEPTION
  'Competência possui distribuição, subempenho, liberação ou documento: não é sem execução. Regularize os registros antes.'
  USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_encerramentos_sem_execucao
 (emenda_id,lancamento_id,competencia_id,justificativa,numero_sei,link_sei)
 VALUES(lan.emenda_id,p_lancamento,p_competencia,btrim(p_justificativa),
  btrim(p_numero),btrim(p_link)) RETURNING id INTO novo;
 UPDATE public.emenda_competencias_filhas SET status='sem_execucao'
 WHERE solicitacao_id=lan.solicitacao_id AND competencia_id=p_competencia;
 RETURN novo;
END;
$body$;

-- O envio da anulação não exige pagamento em TODOS os meses.
-- O limite é financeiro, não uma contagem de liberações legadas.
CREATE OR REPLACE FUNCTION public.emenda_fluxo_enviar(
 p_documento uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE;
 val numeric; usado numeric; ne_valor numeric; f public.emenda_f_ne_painel%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto='ne' OR d.enviado_em IS NOT NULL
 THEN RAISE EXCEPTION 'Etapa já enviada ou inválida.' USING ERRCODE='23514'; END IF;
 IF NOT public.emenda_fluxo_assinaturas_ok(d.id)
 THEN RAISE EXCEPTION 'Assinaturas obrigatórias pendentes.' USING ERRCODE='23514'; END IF;
 IF nullif(btrim(d.dados->>'solicitacao_numero'),'') IS NULL OR
  coalesce(d.dados->>'solicitacao_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Solicitação SEI obrigatória.' USING ERRCODE='23514'; END IF;
 IF d.contexto='anulacao' THEN
  SELECT * INTO f FROM public.emenda_f_ne_painel WHERE lancamento_id=d.lancamento_id;
  IF f.saldo_disponivel_anular IS NULL OR f.saldo_disponivel_anular<=0
   OR f.modelo_financeiro='conflito_entre_modelos'
  THEN RAISE EXCEPTION 'Não há saldo livre para solicitar anulação nesta NE.'
    USING ERRCODE='23514'; END IF;
 ELSE
  -- Preservar apenas a conclusão de liberações legadas já iniciadas.
  IF NOT EXISTS(SELECT 1 FROM public.emenda_liberacoes x
   WHERE x.lancamento_id=d.lancamento_id)
  THEN RAISE EXCEPTION
   'Não inicie liberações no modelo legado. Utilize a distribuição e as solicitações individualizadas de subempenho.'
   USING ERRCODE='23514'; END IF;
  val:=nullif(d.dados->>'valor_executado','')::numeric;
  SELECT valor_ne INTO ne_valor FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
  SELECT coalesce(sum(valor),0) INTO usado FROM public.emenda_liberacoes
   WHERE lancamento_id=d.lancamento_id;
  IF val IS NULL OR val<=0 OR val>ne_valor-usado
   OR nullif(btrim(d.dados->>'comprovante_numero'),'') IS NULL
   OR coalesce(d.dados->>'comprovante_link','') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Comprovante ou valor executado inválido/acima do saldo da NE.'
   USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE public.emenda_fluxo_documentos SET enviado_em=now(),
  enviado_por=auth.uid(),atualizado_em=now() WHERE id=d.id;
 RETURN true;
END;
$body$;

-- O saldo para anulação final é NE líquida menos COMPROMISSO;
-- se a alocação ainda exceder o compromisso, exigir revisão explícita.
CREATE OR REPLACE FUNCTION public.emenda_fluxo_finalizar_anulacao(
 p_documento uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE;
 f public.emenda_f_ne_painel%ROWTYPE; novo uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto<>'anulacao' OR d.enviado_em IS NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'Anulação não disponível.' USING ERRCODE='23514'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL
  OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link SEI do Aviso de Anulação obrigatórios.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO f FROM public.emenda_f_ne_painel WHERE lancamento_id=d.lancamento_id;
 IF f.saldo_a_anular_fechamento IS NULL OR f.saldo_a_anular_fechamento<=0
 THEN RAISE EXCEPTION 'Nenhum residual não comprometido para anular.'
  USING ERRCODE='23514'; END IF;
 IF f.saldo_a_anular_fechamento>f.saldo_disponivel_anular THEN
  RAISE EXCEPTION
  'A distribuição excede os compromissos; reduza o valor alocado sem execução antes de anular o residual.'
  USING ERRCODE='23514'; END IF;
 novo:=public.emenda_anular_residual(d.lancamento_id,f.saldo_a_anular_fechamento,
  'Anulação de saldo residual sem compromissos após conferência dos atos da NE.',
  d.dados->>'aviso_numero',d.dados->>'aviso_link');
 UPDATE public.emenda_fluxo_documentos SET anulacao_id=novo,
  atualizado_em=now() WHERE id=d.id;
 RETURN novo;
END;
$body$;

-- Snapshot de fechamento: total_liberado mantém significado LEGADO.
-- O modelo novo grava separado total_comprometido e total_pago_liquido.
CREATE OR REPLACE FUNCTION public.emenda_conciliar_encerrar_ne(
 p_lancamento uuid,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE;
 f public.emenda_f_ne_painel%ROWTYPE; novo uuid;
 total_comprometido numeric; total_pago numeric;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
 ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para conciliar NE.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF lan.status<>'emitido' OR lan.solicitacao_id IS NULL OR lan.excluido_em IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'NE indisponível para conciliação ou já encerrada.'
   USING ERRCODE='23514'; END IF;
 IF nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL OR
  coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Informe número e link SEI da conciliação.' USING ERRCODE='23514'; END IF;
 SELECT * INTO f FROM public.emenda_f_ne_painel WHERE lancamento_id=p_lancamento;
 IF f.solicitacao_id IS NULL OR f.status_ne<>'emitida' OR NOT coalesce(f.pronta_conciliar,false)
 THEN RAISE EXCEPTION
  'NE não conciliável: verifique competências sem execução, documentos, subempenhos, pagamentos, distribuição e residual.'
  USING ERRCODE='23514'; END IF;
 total_comprometido:=CASE WHEN f.liberacoes_legadas>0 THEN f.liberacoes_legadas
  ELSE f.compromissos_novos END;
 total_pago:=CASE WHEN f.liberacoes_legadas>0 THEN f.pago_legado
  ELSE f.pago_liquido_novo END;
 INSERT INTO public.emenda_conciliacoes_ne
 (emenda_id,lancamento_id,solicitacao_id,valor_ne,total_anulado,
  total_liberado,total_pago,competencia_total,numero_sei,link_sei,
  modelo_financeiro,total_comprometido,total_pago_liquido,total_distribuido,
  competencias_sem_execucao)
 VALUES(f.emenda_id,f.lancamento_id,f.solicitacao_id,f.valor_ne_emitida,f.total_anulado,
  f.liberacoes_legadas,total_pago,f.total_competencias,btrim(p_numero_sei),
  btrim(p_link_sei),f.modelo_financeiro,total_comprometido,total_pago,
  f.distribuido_competencias,f.competencias_sem_execucao)
 RETURNING id INTO novo;
 UPDATE public.emenda_competencias_filhas SET status='concluida'
 WHERE solicitacao_id=f.solicitacao_id
  AND EXISTS(SELECT 1 FROM public.emenda_lancamento_meses m
   WHERE m.lancamento_id=f.lancamento_id AND m.competencia_id=emenda_competencias_filhas.competencia_id)
  AND status<>'sem_execucao';
 UPDATE public.emenda_solicitacoes SET status='encerrada'
 WHERE id=f.solicitacao_id;
 RETURN novo;
END;
$body$;

-- Permitir a única transição de status emitida→encerrada após a conciliação
-- formal; as FKs e os demais campos da NE continuam imutáveis.
CREATE OR REPLACE FUNCTION public.emenda_c_guard_ne_distribuida()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF ROW(NEW.numero_ne,NEW.exercicio_ne,NEW.valor_ne,NEW.status)
   IS DISTINCT FROM ROW(OLD.numero_ne,OLD.exercicio_ne,OLD.valor_ne,OLD.status)
   AND EXISTS(SELECT 1 FROM public.emenda_ne_competencias x
    WHERE x.solicitacao_id=NEW.id AND x.status='ativa')
 THEN
  IF NOT (NEW.numero_ne IS NOT DISTINCT FROM OLD.numero_ne
    AND NEW.exercicio_ne IS NOT DISTINCT FROM OLD.exercicio_ne
    AND NEW.valor_ne IS NOT DISTINCT FROM OLD.valor_ne
    AND OLD.status='emitida' AND NEW.status='encerrada'
    AND EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne c
     WHERE c.solicitacao_id=NEW.id))
  THEN RAISE EXCEPTION
   'NE com distribuição ativa: alteração não permitida sem conciliação formal.'
   USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$body$;

REVOKE ALL ON FUNCTION public.emenda_c_guard_ne_distribuida() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_anular_residual(uuid,numeric,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_encerrar_competencia_sem_execucao(uuid,uuid,text,text,text)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_fluxo_enviar(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_conciliar_encerrar_ne(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_anular_residual(uuid,numeric,text,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_encerrar_competencia_sem_execucao(uuid,uuid,text,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_enviar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_conciliar_encerrar_ne(uuid,text,text) TO authenticated;
COMMIT;
