-- Seleção/movimentação de NE por cadeia e exclusão auditada. Não altera dados na aplicação da migração.
BEGIN;
CREATE OR REPLACE FUNCTION public.piso_validar_subempenho()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o record; soma numeric; total_instituicao numeric; total_homologado numeric; homologado numeric; pendentes integer; devido numeric; pid uuid; oid uuid; cid uuid; situacao text; origem record;
BEGIN
  pid:=CASE WHEN TG_OP='DELETE' THEN OLD.participante_id ELSE NEW.participante_id END;
  oid:=CASE WHEN TG_OP='DELETE' THEN OLD.obrigacao_id ELSE NEW.obrigacao_id END;
  cid:=CASE WHEN TG_OP='DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:'||pid::text,0));
  SELECT ob.*,p.competencia_id AS comp_id,c.status AS situacao_comp INTO o
    FROM public.piso_obrigacoes ob JOIN public.piso_participantes p ON p.id=ob.participante_id
    JOIN public.piso_competencias c ON c.id=p.competencia_id WHERE ob.id=oid;
  IF NOT FOUND OR o.participante_id<>pid OR o.comp_id<>cid THEN RAISE EXCEPTION 'Subempenho fora do escopo da nota.' USING ERRCODE='23514'; END IF;
  IF o.situacao_comp='encerrada' THEN RAISE EXCEPTION 'Competência encerrada.' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.subempenho_id=OLD.id OR (OLD.legado AND d.obrigacao_id=OLD.obrigacao_id AND d.subempenho_id IS NULL AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho'))) THEN RAISE EXCEPTION 'Utilize a exclusão auditada da solicitação.'; END IF;
    IF COALESCE(o.valor_pago,0)>0 OR o.data_pagamento IS NOT NULL OR o.data_programacao IS NOT NULL OR COALESCE(o.valor_anulado,0)>0 OR EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=oid AND d.tipo IN ('programacao_pagamento','comprovante_pagamento','solicitacao_anulacao','aviso_anulacao')) THEN RAISE EXCEPTION 'NE com pagamento ou anulação vinculados; preserve o histórico.'; END IF;
    IF COALESCE(o.valor_pago,0)>(SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.id<>OLD.id) THEN
      RAISE EXCEPTION 'A remoção deixaria o subempenho abaixo do valor pago.' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.competencia_id,NEW.participante_id,NEW.legado,NEW.sequencia) IS DISTINCT FROM (OLD.id,OLD.competencia_id,OLD.participante_id,OLD.legado,OLD.sequencia) THEN
      RAISE EXCEPTION 'Identidade da solicitação de subempenho é imutável.';
    END IF;
    IF NEW.obrigacao_id IS DISTINCT FROM OLD.obrigacao_id THEN
      SELECT * INTO origem FROM public.piso_obrigacoes WHERE id=OLD.obrigacao_id;
      IF NOT FOUND OR origem.participante_id<>pid THEN RAISE EXCEPTION 'Nota de origem fora da instituição.'; END IF;
      IF COALESCE(origem.valor_pago,0)>0 OR origem.data_pagamento IS NOT NULL OR origem.data_programacao IS NOT NULL OR COALESCE(origem.valor_anulado,0)>0
        OR COALESCE(o.valor_pago,0)>0 OR o.data_pagamento IS NOT NULL OR o.data_programacao IS NOT NULL OR COALESCE(o.valor_anulado,0)>0
        OR EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id IN (OLD.obrigacao_id,NEW.obrigacao_id) AND d.tipo IN ('programacao_pagamento','comprovante_pagamento','solicitacao_anulacao','aviso_anulacao')) THEN
        RAISE EXCEPTION 'Não é possível trocar a NE após registro de pagamento ou anulação.';
      END IF;
      -- Número sequencial pertence à nota; converte legado somente na troca.
      SELECT COALESCE(max(sub.sequencia),0)+1 INTO NEW.sequencia FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=NEW.obrigacao_id;
      NEW.legado:=false;
    END IF;
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.valor IS NULL) THEN
    RAISE EXCEPTION 'Informe o valor das solicitações existentes antes de cadastrar outra.';
  END IF;
  IF NOT NEW.legado AND (o.valor_empenhado IS NULL OR NOT EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=oid AND d.tipo='nota_empenho' AND d.numero IS NOT NULL AND d.numero_sei IS NOT NULL AND d.data_documento IS NOT NULL AND d.link_sei IS NOT NULL)) THEN
    RAISE EXCEPTION 'Registre a nota de empenho antes de cadastrar subempenho.';
  END IF;
  -- Validação da execução: vinculação à NE, saldo da própria NE e limite da instituição.
  SELECT p.valor_devido,c.valor_homologado INTO devido,homologado
    FROM public.piso_participantes p JOIN public.piso_competencias c ON c.id=p.competencia_id WHERE p.id=pid;
  SELECT COALESCE(sum(p.valor_devido),0),count(*) FILTER(WHERE p.valor_devido IS NULL)
    INTO total_homologado,pendentes FROM public.piso_participantes p WHERE p.competencia_id=cid AND NOT p.sem_elegiveis;
  SELECT COALESCE(sum(s.valor),0) INTO soma FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.id<>NEW.id;
  IF TG_OP='UPDATE' AND COALESCE(o.valor_pago,0)>soma+COALESCE(NEW.valor,0) THEN
    RAISE EXCEPTION 'O subempenho não pode ser inferior ao pagamento já registrado.' USING ERRCODE='23514';
  END IF;
  IF NEW.valor IS NULL THEN RETURN NEW; END IF;
  IF devido IS NULL OR homologado IS NULL OR pendentes>0 OR abs(total_homologado-homologado)>0.02 OR o.valor_empenhado IS NULL THEN
    RAISE EXCEPTION 'Confira o valor homologado e a NE antes de informar o subempenho.'; END IF;
  IF soma+NEW.valor>o.valor_empenhado THEN RAISE EXCEPTION 'Total de subempenhos excede o valor da NE.' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(s.valor),0) INTO total_instituicao FROM public.piso_subempenhos s WHERE s.participante_id=pid AND s.id<>NEW.id;
  IF total_instituicao+NEW.valor>devido THEN RAISE EXCEPTION 'Total de subempenhos excede o devido da instituição.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_validar_documento_cadeia()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE s record;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.subempenho_id,NEW.obrigacao_id,NEW.competencia_id,NEW.participante_id,NEW.tipo) IS DISTINCT FROM (OLD.subempenho_id,OLD.obrigacao_id,OLD.competencia_id,OLD.participante_id,OLD.tipo) THEN
    -- Apenas a atualização aninhada do trigger de transferência de uma cadeia
    -- pode mover seus documentos. Atualizações diretas continuam proibidas.
    IF NOT (pg_trigger_depth()>1 AND OLD.competencia_id=NEW.competencia_id
       AND OLD.participante_id IS NOT DISTINCT FROM NEW.participante_id AND OLD.tipo=NEW.tipo
       AND OLD.obrigacao_id IS DISTINCT FROM NEW.obrigacao_id AND NEW.subempenho_id IS NOT NULL
       AND (OLD.subempenho_id IS NULL OR OLD.subempenho_id=NEW.subempenho_id)
       AND NEW.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho')
       AND EXISTS(SELECT 1 FROM public.piso_subempenhos sub WHERE sub.id=NEW.subempenho_id
         AND sub.obrigacao_id=NEW.obrigacao_id AND sub.competencia_id=NEW.competencia_id AND NOT sub.legado)) THEN
      RAISE EXCEPTION 'Escopo documental imutável.';
    END IF;
  END IF;
  IF NEW.subempenho_id IS NULL THEN
    IF NEW.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=NEW.obrigacao_id AND sub.legado) THEN RAISE EXCEPTION 'Cadastre primeiro a solicitação de subempenho.'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.piso_subempenhos WHERE id=NEW.subempenho_id;
  IF NOT FOUND OR s.legado OR s.obrigacao_id IS DISTINCT FROM NEW.obrigacao_id OR s.competencia_id<>NEW.competencia_id OR NEW.participante_id IS NOT NULL OR NEW.tipo NOT IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') THEN RAISE EXCEPTION 'Documento fora do escopo da cadeia.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.piso_audit_subempenho()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j jsonb; uid uuid:=auth.uid(); uname text; comp uuid; part uuid; inst text; prest uuid;
BEGIN
  j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  comp:=(j->>'competencia_id')::uuid; part:=(j->>'participante_id')::uuid;
  SELECT nome INTO uname FROM public.profiles WHERE id=uid;
  SELECT p.prestador_id,v.nome_instituicao INTO prest,inst FROM public.piso_participantes p JOIN public.prestadores v ON v.id=p.prestador_id WHERE p.id=part;
  INSERT INTO public.historico_logs(piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
    VALUES(comp,uid,uname,'Piso · '||CASE TG_OP WHEN 'INSERT' THEN 'criado' WHEN 'DELETE' THEN 'removido' ELSE 'atualizado' END||': piso_subempenhos',jsonb_build_object('participante_id',part,'prestador_id',prest,'instituicao_nome',inst,'obrigacao_id',j->'obrigacao_id','subempenho_id',j->'id','valor',jsonb_build_object('de',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)->'valor' END,'para',CASE WHEN TG_OP='DELETE' THEN NULL ELSE j->'valor' END)));
  IF TG_OP='UPDATE' AND NEW.obrigacao_id IS DISTINCT FROM OLD.obrigacao_id THEN
    UPDATE public.piso_documentos d SET obrigacao_id=NEW.obrigacao_id, subempenho_id=NEW.id
      WHERE d.obrigacao_id=OLD.obrigacao_id AND d.competencia_id=NEW.competencia_id
        AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho')
        AND (d.subempenho_id=OLD.id OR (OLD.legado AND d.subempenho_id IS NULL));
    INSERT INTO public.historico_logs(piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
      VALUES(comp,uid,uname,'Piso · NE do subempenho corrigida',
        jsonb_build_object('participante_id',part,'prestador_id',prest,'instituicao_nome',inst,'subempenho_id',NEW.id,
          'obrigacao_id',jsonb_build_object('de',OLD.obrigacao_id,'para',NEW.obrigacao_id)));
  END IF;
  -- Recalcula somente notas da instituição em que a execução foi alterada.
  UPDATE public.piso_obrigacoes ob SET valor_a_liquidar=ob.valor_a_liquidar WHERE ob.participante_id=part;
  PERFORM public.piso_marcar_reconferencia(comp,6);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_excluir_subempenho(p_subempenho_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s record; o record; uid uuid:=auth.uid(); uname text; evidencia jsonb;
BEGIN
  IF uid IS NULL OR public.has_any_role(uid,ARRAY['admin','acp','aco']::public.app_role[]) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sem permissão para excluir subempenho.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM public.piso_subempenhos WHERE id=p_subempenho_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:'||s.participante_id::text,0));
  SELECT ob.*,c.status AS comp_status INTO o FROM public.piso_obrigacoes ob
    JOIN public.piso_participantes p ON p.id=ob.participante_id
    JOIN public.piso_competencias c ON c.id=p.competencia_id WHERE ob.id=s.obrigacao_id AND p.id=s.participante_id AND c.id=s.competencia_id;
  IF NOT FOUND OR o.comp_status='encerrada' THEN RAISE EXCEPTION 'Competência encerrada ou escopo inválido.'; END IF;
  IF COALESCE(o.valor_pago,0)>0 OR o.data_pagamento IS NOT NULL OR o.data_programacao IS NOT NULL OR COALESCE(o.valor_anulado,0)>0 OR EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=o.id AND d.tipo IN ('programacao_pagamento','comprovante_pagamento','solicitacao_anulacao','aviso_anulacao')) THEN
    RAISE EXCEPTION 'NE com pagamento ou anulação vinculados; não é possível excluir a solicitação.';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('documento',to_jsonb(d),
    'assinaturas',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM public.piso_documento_assinaturas a WHERE a.documento_id=d.id),
    'encaminhamentos',(SELECT COALESCE(jsonb_agg(to_jsonb(e)),'[]'::jsonb) FROM public.piso_encaminhamentos e WHERE e.documento_id=d.id))),'[]'::jsonb)
    INTO evidencia FROM public.piso_documentos d WHERE d.obrigacao_id=s.obrigacao_id AND d.competencia_id=s.competencia_id
    AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho')
    AND (d.subempenho_id=s.id OR (s.legado AND d.subempenho_id IS NULL));
  SELECT nome INTO uname FROM public.profiles WHERE id=uid;
  INSERT INTO public.historico_logs(piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
    VALUES(s.competencia_id,uid,uname,'Piso · exclusão auditada de solicitação de subempenho',
      jsonb_build_object('participante_id',s.participante_id,'obrigacao_id',s.obrigacao_id,'subempenho_id',s.id,'registro_anterior',to_jsonb(s),'documentos_anteriores',evidencia));
  DELETE FROM public.piso_documentos d WHERE d.obrigacao_id=s.obrigacao_id AND d.competencia_id=s.competencia_id
    AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho')
    AND (d.subempenho_id=s.id OR (s.legado AND d.subempenho_id IS NULL));
  DELETE FROM public.piso_subempenhos WHERE id=s.id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_excluir_subempenho(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.piso_excluir_subempenho(uuid) TO authenticated;

COMMIT;
