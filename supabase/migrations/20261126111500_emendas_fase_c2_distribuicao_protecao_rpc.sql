-- PACTO · Emendas · Fase C2: validações transacionais de distribuição.
-- Controle por linha de emendas FOR UPDATE (mesma ordem de bloqueio da Fase B).
BEGIN;

CREATE FUNCTION public.emenda_ne_competencia_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE
 l public.emenda_lancamentos%ROWTYPE;
 ne public.emenda_solicitacoes%ROWTYPE;
 anuladas numeric(16,2);
 demais numeric(16,2);
 reservado_competencia numeric(16,2);
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Distribuição da NE não pode ser apagada. Utilize cancelamento documentado.'
   USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.emenda_id,NEW.lancamento_id,NEW.solicitacao_id,NEW.competencia_id,
         NEW.registrado_por,NEW.registrado_em)
    IS DISTINCT FROM
     ROW(OLD.emenda_id,OLD.lancamento_id,OLD.solicitacao_id,OLD.competencia_id,
         OLD.registrado_por,OLD.registrado_em)
  THEN RAISE EXCEPTION 'Identidade da distribuição é imutável.' USING ERRCODE='23514'; END IF;
  IF OLD.status='cancelada' AND NEW.status<>'ativa' THEN
   RAISE EXCEPTION 'Distribuição cancelada somente admite reativação formal.' USING ERRCODE='23514';
  END IF;
  IF NEW.status NOT IN ('ativa','cancelada') OR
     (NEW.valor_alocado IS DISTINCT FROM OLD.valor_alocado OR NEW.status IS DISTINCT FROM OLD.status)
     AND length(btrim(coalesce(NEW.motivo_revisao,'')))<10
  THEN RAISE EXCEPTION 'Alteração ou cancelamento exige justificativa de pelo menos 10 caracteres.'
   USING ERRCODE='23514'; END IF;
 END IF;

 PERFORM 1 FROM public.emendas e
 WHERE e.id=NEW.emenda_id AND e.situacao IN ('cadastrada','ativa')
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda indisponível para distribuição.' USING ERRCODE='23514'; END IF;

 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=NEW.lancamento_id;
 SELECT * INTO ne FROM public.emenda_solicitacoes WHERE id=NEW.solicitacao_id;
 IF l.id IS NULL OR ne.id IS NULL OR l.emenda_id<>NEW.emenda_id
    OR l.solicitacao_id IS DISTINCT FROM ne.id
    OR l.status<>'emitido' OR l.excluido_em IS NOT NULL
    OR ne.emenda_id<>NEW.emenda_id OR ne.status<>'emitida'
    OR ne.numero_ne IS NULL OR ne.valor_ne IS NULL
 THEN RAISE EXCEPTION 'Distribuição exige NE emitida no lançamento informado.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne x WHERE x.lancamento_id=l.id)
    OR NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses x
      WHERE x.lancamento_id=l.id AND x.competencia_id=NEW.competencia_id)
 THEN RAISE EXCEPTION 'Competência não pertence ao lançamento ou NE já conciliada.'
  USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_liberacoes x WHERE x.lancamento_id=l.id) THEN
  RAISE EXCEPTION 'Execução legada existente: conciliação necessária antes de distribuir esta NE.'
   USING ERRCODE='23514';
 END IF;

 SELECT coalesce(sum(x.valor),0) INTO anuladas FROM public.emenda_anulacoes x
 WHERE x.lancamento_id=l.id;
 SELECT coalesce(sum(x.valor_alocado),0) INTO demais
 FROM public.emenda_ne_competencias x
 WHERE x.solicitacao_id=ne.id AND x.status='ativa' AND x.id<>NEW.id;
 SELECT coalesce(sum(CASE WHEN x.status='subempenhado'
                          THEN x.valor_subempenhado ELSE x.valor_solicitado END),0)
 INTO reservado_competencia
 FROM public.emenda_subempenhos x
 WHERE x.solicitacao_id=ne.id AND x.competencia_id=NEW.competencia_id
   AND x.status<>'cancelado';

 IF NEW.status='cancelada' THEN
  IF reservado_competencia>0 THEN
   RAISE EXCEPTION 'Não é possível cancelar distribuição com subempenhos ativos.'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.valor_alocado<>round(NEW.valor_alocado,2) THEN
  RAISE EXCEPTION 'Valor de distribuição deve ter precisão de centavos.'
   USING ERRCODE='23514'; END IF;
 IF NEW.valor_alocado<reservado_competencia THEN
  RAISE EXCEPTION 'Distribuição inferior aos compromissos da competência (solicitados e confirmados).'
   USING ERRCODE='23514'; END IF;
 IF demais+NEW.valor_alocado>ne.valor_ne-anuladas THEN
  RAISE EXCEPTION 'Soma distribuída ultrapassaria a NE líquida de anulações.'
   USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_ne_competencias
 BEFORE INSERT OR UPDATE OR DELETE ON public.emenda_ne_competencias
 FOR EACH ROW EXECUTE FUNCTION public.emenda_ne_competencia_validar();

-- Impede reservar recursos pela Fase B fora da distribuição explícita.
CREATE FUNCTION public.emenda_c_guard_subempenho_distribuicao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE teto numeric(16,2); comprometido numeric(16,2); valor_novo numeric(16,2);
BEGIN
 IF NEW.status='cancelado' THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT valor_alocado INTO teto FROM public.emenda_ne_competencias
 WHERE solicitacao_id=NEW.solicitacao_id
  AND lancamento_id=NEW.lancamento_id
  AND competencia_id=NEW.competencia_id
  AND status='ativa';
 IF teto IS NULL THEN
  RAISE EXCEPTION 'Antes de subempenhar, distribua explicitamente a NE nesta competência.'
   USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(CASE WHEN x.status='subempenhado'
                           THEN x.valor_subempenhado ELSE x.valor_solicitado END),0)
 INTO comprometido FROM public.emenda_subempenhos x
 WHERE x.solicitacao_id=NEW.solicitacao_id
  AND x.competencia_id=NEW.competencia_id
  AND x.id<>NEW.id AND x.status<>'cancelado';
 IF NEW.status='subempenhado' THEN
  valor_novo:=NEW.valor_subempenhado;
 ELSE
  valor_novo:=NEW.valor_solicitado;
 END IF;
 IF comprometido + valor_novo > teto THEN
  RAISE EXCEPTION 'Solicitações e subempenhos excederiam o valor alocado para esta NE/competência.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_c_subempenho_distribuicao
 BEFORE INSERT OR UPDATE ON public.emenda_subempenhos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_c_guard_subempenho_distribuicao();

-- A anulação posterior não pode invadir o total planejado, ainda que não subempenhado.
CREATE FUNCTION public.emenda_c_guard_anulacao_distribuicao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
DECLARE ne_total numeric(16,2); ja_anulado numeric(16,2); distribuido numeric(16,2);
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 SELECT s.valor_ne INTO ne_total
 FROM public.emenda_lancamentos l
 JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
 WHERE l.id=NEW.lancamento_id AND l.emenda_id=NEW.emenda_id;
 SELECT coalesce(sum(a.valor),0) INTO ja_anulado
 FROM public.emenda_anulacoes a
 WHERE a.lancamento_id=NEW.lancamento_id AND a.id<>NEW.id;
 SELECT coalesce(sum(v.valor_alocado),0) INTO distribuido
 FROM public.emenda_ne_competencias v
 WHERE v.lancamento_id=NEW.lancamento_id AND v.status='ativa';
 IF ne_total IS NULL OR ja_anulado+NEW.valor+distribuido>ne_total THEN
  RAISE EXCEPTION 'Anulação exigiria rever primeiro a distribuição das competências.'
   USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_c_anulacao_distribuicao
 BEFORE INSERT OR UPDATE ON public.emenda_anulacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_c_guard_anulacao_distribuicao();

-- O modelo legado não pode retomar movimentações após a distribuição nova.
CREATE FUNCTION public.emenda_c_guard_liberacao_legada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 PERFORM 1 FROM public.emendas WHERE id=NEW.emenda_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.emenda_ne_competencias x
   WHERE x.lancamento_id=NEW.lancamento_id AND x.status='ativa')
 THEN RAISE EXCEPTION 'NE distribuída no modelo novo; não registre Aviso de Movimento como liberação legada.'
   USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_c_liberacao_legada
 BEFORE INSERT OR UPDATE ON public.emenda_liberacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_c_guard_liberacao_legada();

CREATE FUNCTION public.emenda_c_guard_ne_distribuida()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF ROW(NEW.numero_ne,NEW.exercicio_ne,NEW.valor_ne,NEW.status)
   IS DISTINCT FROM ROW(OLD.numero_ne,OLD.exercicio_ne,OLD.valor_ne,OLD.status)
   AND EXISTS(SELECT 1 FROM public.emenda_ne_competencias x
              WHERE x.solicitacao_id=NEW.id AND x.status='ativa')
 THEN RAISE EXCEPTION 'NE com distribuição ativa: retificação documental e financeira controlada necessária.'
  USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER guard_emenda_c_ne_distribuida
 BEFORE UPDATE OF numero_ne,exercicio_ne,valor_ne,status ON public.emenda_solicitacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_c_guard_ne_distribuida();

-- API administrativa: não insere competência automaticamente e não rateia por período.
CREATE FUNCTION public.emenda_ne_competencia_definir(
 p_lancamento uuid,p_competencia uuid,p_valor numeric,p_justificativa text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lanc public.emenda_lancamentos%ROWTYPE;
 existente public.emenda_ne_competencias%ROWTYPE; retorno uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
   ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para distribuir NE.' USING ERRCODE='42501'; END IF;
 IF p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
 THEN RAISE EXCEPTION 'Informe valor positivo de distribuição com centavos.' USING ERRCODE='23514'; END IF;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF lanc.id IS NULL THEN RAISE EXCEPTION 'Lançamento inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lanc.emenda_id FOR UPDATE;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF lanc.status<>'emitido' OR lanc.solicitacao_id IS NULL
 THEN RAISE EXCEPTION 'Emita a Nota de Empenho antes de distribuir valores.' USING ERRCODE='23514'; END IF;
 SELECT * INTO existente FROM public.emenda_ne_competencias
 WHERE solicitacao_id=lanc.solicitacao_id AND competencia_id=p_competencia FOR UPDATE;
 IF FOUND THEN
  IF existente.status='ativa' AND existente.valor_alocado=p_valor THEN RETURN existente.id; END IF;
  IF length(btrim(coalesce(p_justificativa,'')))<10 THEN
   RAISE EXCEPTION 'Justifique a alteração do valor (mínimo de 10 caracteres).'
    USING ERRCODE='23514'; END IF;
  UPDATE public.emenda_ne_competencias
   SET valor_alocado=p_valor,status='ativa',motivo_revisao=btrim(p_justificativa),
       atualizado_por=ator,atualizado_em=now()
  WHERE id=existente.id RETURNING id INTO retorno;
  RETURN retorno;
 END IF;
 INSERT INTO public.emenda_ne_competencias
 (emenda_id,lancamento_id,solicitacao_id,competencia_id,valor_alocado,registrado_por)
 VALUES(lanc.emenda_id,lanc.id,lanc.solicitacao_id,p_competencia,p_valor,ator)
 RETURNING id INTO retorno;
 RETURN retorno;
END;
$body$;

CREATE FUNCTION public.emenda_ne_competencia_cancelar(
 p_distribuicao uuid,p_motivo text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); al public.emenda_ne_competencias%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,
   ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para cancelar distribuição.' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_motivo,'')))<10
 THEN RAISE EXCEPTION 'Informe justificativa de cancelamento com 10 caracteres.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO al FROM public.emenda_ne_competencias WHERE id=p_distribuicao;
 IF NOT FOUND THEN RAISE EXCEPTION 'Distribuição inexistente.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=al.emenda_id FOR UPDATE;
 SELECT * INTO al FROM public.emenda_ne_competencias WHERE id=p_distribuicao FOR UPDATE;
 IF al.status='cancelada' THEN RETURN true; END IF;
 UPDATE public.emenda_ne_competencias
 SET status='cancelada',motivo_revisao=btrim(p_motivo),
  atualizado_por=ator,atualizado_em=now()
 WHERE id=p_distribuicao;
 RETURN true;
END;
$body$;

REVOKE ALL ON FUNCTION public.emenda_ne_competencia_validar() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_c_guard_subempenho_distribuicao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_c_guard_anulacao_distribuicao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_c_guard_liberacao_legada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_c_guard_ne_distribuida() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_ne_competencia_definir(uuid,uuid,numeric,text)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.emenda_ne_competencia_cancelar(uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_ne_competencia_definir(uuid,uuid,numeric,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_ne_competencia_cancelar(uuid,text)
 TO authenticated;
COMMIT;
