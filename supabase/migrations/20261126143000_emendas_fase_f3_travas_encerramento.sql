-- PACTO Joinville · Emendas · F3 — Proteção do fechamento e histórico.
-- As RPCs das Fases anteriores seguem válidas, mas não podem reabrir
-- pagamentos nem alterar distribuição/anulações depois da NE conciliada.
BEGIN;

CREATE FUNCTION public.emenda_f_guard_movimento_ne_fechada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE lanc uuid; sub uuid; em uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Excluir registros de execução financeira é proibido.'
   USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME IN
 ('emenda_ne_competencias','emenda_anulacoes','emenda_liberacoes',
  'emenda_blocos_pagamento','emenda_encerramentos_sem_execucao') THEN
  lanc:=NEW.lancamento_id;
 ELSIF TG_TABLE_NAME='emenda_subempenhos' THEN
  lanc:=NEW.lancamento_id;
 ELSE
  sub:=NEW.subempenho_id;
  SELECT s.lancamento_id INTO lanc FROM public.emenda_subempenhos s
   WHERE s.id=sub;
 END IF;
 IF lanc IS NULL THEN RAISE EXCEPTION 'Lançamento financeiro não identificado.'
  USING ERRCODE='23514'; END IF;
 SELECT l.emenda_id INTO em FROM public.emenda_lancamentos l WHERE l.id=lanc;
 IF em IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=em FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne c WHERE c.lancamento_id=lanc)
 THEN RAISE EXCEPTION 'NE conciliada e encerrada: movimentos financeiros proibidos.'
  USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='emenda_ne_competencias' AND NEW.status='ativa'
  AND EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao e
   WHERE e.lancamento_id=lanc AND e.competencia_id=NEW.competencia_id)
 THEN RAISE EXCEPTION
  'Competência encerrada sem execução não pode receber distribuição ativa.'
  USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='emenda_liberacoes'
  AND EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao e
   WHERE e.lancamento_id=lanc AND e.competencia_id=NEW.competencia_id)
 THEN RAISE EXCEPTION
  'Competência encerrada sem execução não pode receber liberação.'
  USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='emenda_encerramentos_sem_execucao' THEN
  IF EXISTS(SELECT 1 FROM public.emenda_subempenhos s WHERE s.lancamento_id=lanc
   AND s.competencia_id=NEW.competencia_id AND s.status<>'cancelado')
   OR EXISTS(SELECT 1 FROM public.emenda_liberacoes l WHERE l.lancamento_id=lanc
    AND l.competencia_id=NEW.competencia_id)
   OR EXISTS(SELECT 1 FROM public.emenda_ne_competencias a
    WHERE a.lancamento_id=lanc AND a.competencia_id=NEW.competencia_id AND a.status='ativa')
   OR EXISTS(SELECT 1 FROM public.emenda_fluxo_documentos d WHERE d.lancamento_id=lanc
    AND d.contexto='lib:'||NEW.competencia_id::text)
  THEN RAISE EXCEPTION
   'Encerramento sem execução incompatível com movimentação ou documento existente.'
   USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$body$;

CREATE TRIGGER guard_f_distribuicao_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_ne_competencias
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_anulacoes_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_anulacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_liberacoes_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_liberacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_legado_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_blocos_pagamento
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_sem_execucao_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_encerramentos_sem_execucao
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_subempenho_fechamento
 BEFORE INSERT OR UPDATE ON public.emenda_subempenhos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_parcelas_fechamento
 BEFORE INSERT ON public.emenda_pagamento_parcelas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_prog_fechamento
 BEFORE INSERT ON public.emenda_pagamento_programacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_comp_fechamento
 BEFORE INSERT ON public.emenda_pagamento_comprovantes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_ajuste_fechamento
 BEFORE INSERT ON public.emenda_pagamento_ajustes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_ret_fechamento
 BEFORE INSERT ON public.emenda_pagamento_retificacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();
CREATE TRIGGER guard_f_pag_conc_fechamento
 BEFORE INSERT ON public.emenda_pagamento_conciliacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_guard_movimento_ne_fechada();

-- Impede edição/destruição dos eventos de conclusão sem execução e anulação.
CREATE FUNCTION public.emenda_f_evidencia_fechamento_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 RAISE EXCEPTION 'Ato financeiro documentado é imutável; eventual correção exige procedimento próprio.'
 USING ERRCODE='23514';
END;
$body$;
CREATE TRIGGER guard_f_anulacao_imutavel BEFORE UPDATE OR DELETE
 ON public.emenda_anulacoes FOR EACH ROW EXECUTE FUNCTION public.emenda_f_evidencia_fechamento_imutavel();
CREATE TRIGGER guard_f_sem_exec_imutavel BEFORE UPDATE OR DELETE
 ON public.emenda_encerramentos_sem_execucao
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_evidencia_fechamento_imutavel();
CREATE TRIGGER guard_f_conc_immut BEFORE UPDATE OR DELETE
 ON public.emenda_conciliacoes_ne FOR EACH ROW EXECUTE FUNCTION public.emenda_f_evidencia_fechamento_imutavel();

-- Segurança adicional em inserção privilegiada (RLS já restringe escrita direta).
CREATE FUNCTION public.emenda_f_conciliacao_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE f public.emenda_f_ne_painel%ROWTYPE; compromisso numeric; pago numeric;
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT * INTO f FROM public.emenda_f_ne_painel WHERE lancamento_id=NEW.lancamento_id;
 IF f.solicitacao_id IS NULL OR f.solicitacao_id<>NEW.solicitacao_id
 OR NOT coalesce(f.pronta_conciliar,false) THEN
  RAISE EXCEPTION 'Não é permitido conciliar NE com pendências financeiras ou documentais.'
   USING ERRCODE='23514'; END IF;
 compromisso:=CASE WHEN f.liberacoes_legadas>0 THEN f.liberacoes_legadas
  ELSE f.compromissos_novos END;
 pago:=CASE WHEN f.liberacoes_legadas>0 THEN f.pago_legado ELSE f.pago_liquido_novo END;
 IF ROW(NEW.valor_ne,NEW.total_anulado,NEW.total_liberado,NEW.total_pago,NEW.competencia_total,
        NEW.modelo_financeiro,NEW.total_comprometido,NEW.total_pago_liquido,
        NEW.total_distribuido,NEW.competencias_sem_execucao)
 IS DISTINCT FROM
 ROW(f.valor_ne_emitida,f.total_anulado,f.liberacoes_legadas,pago,f.total_competencias,
     f.modelo_financeiro,compromisso,pago,f.distribuido_competencias,f.competencias_sem_execucao)
 THEN RAISE EXCEPTION 'Valores da conciliação devem reproduzir a fotografia financeira atual.'
  USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_f_conciliacao_validar
 BEFORE INSERT ON public.emenda_conciliacoes_ne
 FOR EACH ROW EXECUTE FUNCTION public.emenda_f_conciliacao_validar();

REVOKE ALL ON FUNCTION public.emenda_f_guard_movimento_ne_fechada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_f_evidencia_fechamento_imutavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_f_conciliacao_validar() FROM PUBLIC,anon,authenticated;

COMMIT;
