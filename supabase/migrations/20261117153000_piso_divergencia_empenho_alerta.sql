-- Divergência de planejamento não impede registro do empenho. Liquidação e pagamento permanecem conciliados.
-- Nenhum registro é alterado; conserva triggers, permissões e travas de concorrência.
BEGIN;
CREATE OR REPLACE FUNCTION public.piso_derivar_valor_obrigacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE devido numeric; homologado numeric; total numeric; situacao text; comp uuid;
  pendentes integer; quantidade integer; outras integer; subs numeric;
  reconciliado boolean; mudou boolean; manutencao boolean := current_user IN ('postgres','supabase_admin');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:'||NEW.participante_id::text,0));
  SELECT p.valor_devido,c.valor_homologado,c.status,c.id INTO devido,homologado,situacao,comp
    FROM public.piso_participantes p JOIN public.piso_competencias c ON c.id=p.competencia_id
    WHERE p.id=NEW.participante_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participante não encontrado.' USING ERRCODE='23503'; END IF;
  IF TG_OP='UPDATE' AND NEW.participante_id IS DISTINCT FROM OLD.participante_id THEN
    RAISE EXCEPTION 'Não é permitido mover uma nota entre instituições.';
  END IF;
  IF situacao='encerrada' THEN RAISE EXCEPTION 'Competência encerrada.' USING ERRCODE='42501'; END IF;
  mudou := TG_OP='INSERT' OR NEW.valor_aplicado IS DISTINCT FROM OLD.valor_aplicado
    OR NEW.alocacao_manual IS DISTINCT FROM OLD.alocacao_manual OR NEW.valor_empenhado IS DISTINCT FROM OLD.valor_empenhado;
  IF TG_OP='UPDATE' AND NOT manutencao AND COALESCE(auth.role(),'')<>'service_role'
    AND NEW.valor_a_liquidar IS DISTINCT FROM OLD.valor_a_liquidar THEN
    RAISE EXCEPTION 'O valor a liquidar é derivado e não pode ser alterado diretamente.' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO outras FROM public.piso_obrigacoes o
    WHERE o.participante_id=NEW.participante_id AND o.id<>NEW.id;
  IF mudou THEN
    IF outras>0 AND (NOT NEW.alocacao_manual OR EXISTS(SELECT 1 FROM public.piso_obrigacoes o
      WHERE o.participante_id=NEW.participante_id AND o.id<>NEW.id AND NOT o.alocacao_manual)) THEN
      RAISE EXCEPTION 'Informe a alocação explícita das notas existentes antes de acrescentar outra NE.';
    END IF;
    IF NEW.alocacao_manual THEN
      -- Valor planejado: a divergência global não bloqueia registro da NE.
      -- Os limites de liquidação permanecem nas funções próprias.
      IF NEW.valor_empenhado IS NOT NULL AND NEW.valor_aplicado>NEW.valor_empenhado THEN
        RAISE EXCEPTION 'Valor aplicado maior que o valor da NE.' USING ERRCODE='23514';
      END IF;
      SELECT COALESCE(sum(s.valor),0) INTO subs FROM public.piso_subempenhos s WHERE s.obrigacao_id=NEW.id;
      IF (subs>0 OR COALESCE(NEW.valor_pago,0)>0) AND (NEW.valor_aplicado IS NULL OR NEW.valor_aplicado<greatest(subs,COALESCE(NEW.valor_pago,0))) THEN
        RAISE EXCEPTION 'A alocação não pode ser inferior ao subempenhado ou pago.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.valor_aplicado IS NOT NULL THEN RAISE EXCEPTION 'Ative a alocação manual.';
    END IF;
  END IF;
  SELECT COALESCE(sum(p.valor_devido),0), count(*) FILTER(WHERE p.valor_devido IS NULL), count(*)
    INTO total,pendentes,quantidade FROM public.piso_participantes p WHERE p.competencia_id=comp AND NOT p.sem_elegiveis;
  reconciliado := homologado IS NOT NULL AND quantidade>0 AND pendentes=0 AND abs(total-homologado)<=0.02;
  NEW.valor_a_liquidar := CASE WHEN reconciliado THEN CASE WHEN NEW.alocacao_manual THEN NEW.valor_aplicado ELSE devido END ELSE NULL END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_validar_somas_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE n integer; r record; o record; s record; total numeric; qtd integer; doc_count integer;
BEGIN
  FOR n IN 5..7 LOOP
    IF (NEW.etapas_concluidas->>n::text='true' AND (OLD.etapas_concluidas->>n::text IS DISTINCT FROM 'true' OR (n=ANY(COALESCE(OLD.etapas_reconferir,ARRAY[]::integer[])) AND NOT n=ANY(COALESCE(NEW.etapas_reconferir,ARRAY[]::integer[]))))) IS NOT TRUE THEN CONTINUE; END IF;
    FOR r IN SELECT p.id,p.valor_devido FROM public.piso_participantes p WHERE p.competencia_id=NEW.id AND NOT p.sem_elegiveis LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:'||r.id::text,0));
      IF NOT EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual) AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos sub WHERE sub.participante_id=r.id AND (NOT sub.legado OR sub.valor IS NOT NULL)) THEN CONTINUE; END IF;
      IF n=7 THEN
        SELECT sum(ob.valor_pago), count(*) FILTER(WHERE ob.valor_pago IS NULL OR ob.data_pagamento IS NULL OR ob.valor_pago IS DISTINCT FROM ob.valor_a_liquidar) INTO total,qtd FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id;
        IF r.valor_devido IS NULL OR qtd>0 OR total IS DISTINCT FROM r.valor_devido THEN RAISE EXCEPTION 'Total pago não corresponde ao devido da instituição.'; END IF;
      ELSE
        SELECT sum(ob.valor_aplicado),count(*) FILTER(WHERE ob.valor_aplicado IS NULL OR ob.valor_empenhado IS NULL OR ob.valor_empenhado<=0 OR ob.valor_solicitado IS NULL OR ob.valor_solicitado<=0 OR ob.valor_empenhado<ob.valor_aplicado) INTO total,qtd FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual;
        IF EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual) AND (qtd>0 OR (n=6 AND (r.valor_devido IS NULL OR total IS DISTINCT FROM r.valor_devido))) THEN RAISE EXCEPTION 'Informe as parcelas das NEs; concilie o devido antes da liquidação.'; END IF;
        IF n=5 AND EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual AND (
          NOT EXISTS (SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=ob.id AND d.tipo='nota_empenho' AND d.numero ~ '^\d{1,8}/\d{4}$' AND nullif(btrim(d.numero_sei),'') IS NOT NULL AND nullif(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL)
          OR NOT EXISTS (SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=ob.id AND d.tipo='solicitacao_ne' AND nullif(btrim(d.numero_sei),'') IS NOT NULL AND nullif(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM public.piso_assinatura_matriz m WHERE m.tipo_documento=d.tipo AND NOT m.opcional AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=d.id AND a.slot=m.slot_key))
            AND (SELECT e.acao FROM public.piso_encaminhamentos e WHERE e.documento_id=d.id ORDER BY e.ocorrido_em DESC LIMIT 1)='encaminhado')))
        THEN RAISE EXCEPTION 'Solicitação assinada/encaminhada ou nota de empenho incompleta.'; END IF;
        IF n=6 THEN
          FOR o IN SELECT * FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id LOOP
            SELECT COALESCE(sum(sub.valor),0),count(*) FILTER(WHERE sub.valor IS NULL) INTO total,qtd FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=o.id;
            IF o.valor_a_liquidar IS NULL OR total<>o.valor_a_liquidar OR qtd>0 THEN RAISE EXCEPTION 'Total de subempenhos não corresponde à parcela da NE.'; END IF;
            FOR s IN SELECT * FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=o.id LOOP
              SELECT count(DISTINCT d.tipo) INTO doc_count FROM public.piso_documentos d WHERE d.obrigacao_id=o.id AND d.subempenho_id IS NOT DISTINCT FROM CASE WHEN s.legado THEN NULL ELSE s.id END AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') AND nullif(btrim(d.numero_sei),'') IS NOT NULL AND nullif(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL
                AND NOT EXISTS(SELECT 1 FROM public.piso_assinatura_matriz m WHERE m.tipo_documento=d.tipo AND NOT m.opcional AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=d.id AND a.slot=m.slot_key))
                AND (d.tipo<>'aviso_liquidacao' OR (SELECT e.acao FROM public.piso_encaminhamentos e WHERE e.documento_id=d.id ORDER BY e.ocorrido_em DESC LIMIT 1)='encaminhado');
              IF doc_count<>3 THEN RAISE EXCEPTION 'Cadeia documental de subempenho incompleta.'; END IF;
            END LOOP;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_validar_subempenho()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o record; soma numeric; total_planejado numeric; pendentes integer; devido numeric; pid uuid; oid uuid; cid uuid; situacao text;
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
    IF OLD.legado OR EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.subempenho_id=OLD.id) THEN RAISE EXCEPTION 'Somente rascunhos sem documentos podem ser removidos.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.competencia_id,NEW.participante_id,NEW.obrigacao_id,NEW.legado,NEW.sequencia) IS DISTINCT FROM (OLD.id,OLD.competencia_id,OLD.participante_id,OLD.obrigacao_id,OLD.legado,OLD.sequencia) THEN
    RAISE EXCEPTION 'Identidade da solicitação de subempenho é imutável.';
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.valor IS NULL) THEN
    RAISE EXCEPTION 'Informe o valor das solicitações existentes antes de cadastrar outra.';
  END IF;
  IF NOT NEW.legado AND (o.valor_empenhado IS NULL OR NOT EXISTS(SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=oid AND d.tipo='nota_empenho' AND d.numero IS NOT NULL AND d.numero_sei IS NOT NULL AND d.data_documento IS NOT NULL AND d.link_sei IS NOT NULL)) THEN
    RAISE EXCEPTION 'Registre a nota de empenho antes de cadastrar subempenho.';
  END IF;
  IF o.alocacao_manual THEN
    SELECT p.valor_devido INTO devido FROM public.piso_participantes p WHERE p.id=pid;
    SELECT COALESCE(sum(ob.valor_aplicado),0), count(*) FILTER (WHERE ob.valor_aplicado IS NULL OR NOT ob.alocacao_manual)
      INTO total_planejado,pendentes FROM public.piso_obrigacoes ob WHERE ob.participante_id=pid;
    IF devido IS NULL OR pendentes>0 OR total_planejado<>devido THEN
      RAISE EXCEPTION 'Concilie as parcelas das NEs com o valor devido antes da liquidação.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.valor IS NULL THEN RETURN NEW; END IF;
  IF o.valor_a_liquidar IS NULL OR o.valor_empenhado IS NULL THEN RAISE EXCEPTION 'Informe o valor conciliado e a NE antes do subempenho.'; END IF;
  SELECT COALESCE(sum(s.valor),0) INTO soma FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.id<>NEW.id;
  IF soma+NEW.valor>least(o.valor_a_liquidar,o.valor_empenhado) THEN RAISE EXCEPTION 'Total de subempenhos excede a alocação da nota.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.piso_derivar_valor_obrigacao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.piso_validar_somas_conclusao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.piso_validar_subempenho() FROM PUBLIC,anon,authenticated;
COMMIT;
