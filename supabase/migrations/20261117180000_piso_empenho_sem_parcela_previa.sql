-- Elimina a alocação prévia na etapa de empenho, preservando valores históricos.
BEGIN;
CREATE OR REPLACE FUNCTION public.piso_derivar_valor_obrigacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE devido numeric; homologado numeric; total numeric; situacao text; comp uuid;
  pendentes integer; quantidade integer; outras integer; subs numeric; total_sub numeric; qtd_sub integer; pend_sub integer;
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
    -- O antigo campo valor_aplicado é histórico; não limita o registro.
    SELECT COALESCE(sum(s.valor),0) INTO subs FROM public.piso_subempenhos s WHERE s.obrigacao_id=NEW.id;
    IF greatest(subs,COALESCE(NEW.valor_pago,0))>COALESCE(NEW.valor_empenhado,0) THEN
      RAISE EXCEPTION 'A NE não pode ser inferior ao subempenhado ou pago.' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT COALESCE(sum(p.valor_devido),0), count(*) FILTER(WHERE p.valor_devido IS NULL), count(*)
    INTO total,pendentes,quantidade FROM public.piso_participantes p WHERE p.competencia_id=comp AND NOT p.sem_elegiveis;
  reconciliado := homologado IS NOT NULL AND quantidade>0 AND pendentes=0 AND abs(total-homologado)<=0.02;
  SELECT COALESCE(sum(s.valor),0),count(*),count(*) FILTER (WHERE s.valor IS NULL)
    INTO total_sub,qtd_sub,pend_sub FROM public.piso_subempenhos s WHERE s.participante_id=NEW.participante_id;
  IF reconciliado AND qtd_sub>0 AND pend_sub=0 AND total_sub=devido THEN
    SELECT COALESCE(sum(s.valor),0) INTO NEW.valor_a_liquidar FROM public.piso_subempenhos s WHERE s.obrigacao_id=NEW.id;
  ELSE
    NEW.valor_a_liquidar := CASE WHEN reconciliado THEN CASE WHEN NEW.alocacao_manual OR outras>0 THEN NULL ELSE devido END ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_sincronizar_obrigacoes_conciliadas(p_comp uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE homologado numeric; situacao text; total numeric; pendentes integer; quantidade integer;
BEGIN
  SELECT c.valor_homologado,c.status INTO homologado,situacao FROM public.piso_competencias c WHERE c.id=p_comp;
  IF NOT FOUND OR situacao='encerrada' OR homologado IS NULL THEN RETURN; END IF;
  SELECT COALESCE(sum(p.valor_devido),0),count(*) FILTER(WHERE p.valor_devido IS NULL),count(*)
    INTO total,pendentes,quantidade FROM public.piso_participantes p WHERE p.competencia_id=p_comp AND NOT p.sem_elegiveis;
  IF quantidade=0 OR pendentes>0 OR abs(total-homologado)>0.02 THEN RETURN; END IF;
  UPDATE public.piso_obrigacoes o SET valor_a_liquidar=CASE WHEN EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id AND s.valor IS NULL)
      AND (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.participante_id=p.id)=p.valor_devido
    THEN (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.obrigacao_id=o.id)
    ELSE CASE WHEN o.alocacao_manual OR EXISTS(SELECT 1 FROM public.piso_obrigacoes outra WHERE outra.participante_id=p.id AND outra.id<>o.id) THEN NULL ELSE p.valor_devido END END
  FROM public.piso_participantes p WHERE o.participante_id=p.id AND p.competencia_id=p_comp AND NOT p.sem_elegiveis
    AND o.valor_a_liquidar IS DISTINCT FROM CASE WHEN EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id AND s.valor IS NULL)
      AND (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.participante_id=p.id)=p.valor_devido
    THEN (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.obrigacao_id=o.id)
    ELSE CASE WHEN o.alocacao_manual OR EXISTS(SELECT 1 FROM public.piso_obrigacoes outra WHERE outra.participante_id=p.id AND outra.id<>o.id) THEN NULL ELSE p.valor_devido END END;
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
      IF NOT EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual) AND (SELECT count(*) FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id)<=1 AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos sub WHERE sub.participante_id=r.id AND (NOT sub.legado OR sub.valor IS NOT NULL)) THEN CONTINUE; END IF;
      IF n IN (6,7) THEN
        SELECT COALESCE(sum(sub.valor),0),count(*) FILTER(WHERE sub.valor IS NULL) INTO total,qtd
          FROM public.piso_subempenhos sub WHERE sub.participante_id=r.id;
        IF r.valor_devido IS NULL OR qtd>0 OR total IS DISTINCT FROM r.valor_devido THEN
          RAISE EXCEPTION 'Total de subempenhos da instituição deve corresponder ao devido.'; END IF;
      END IF;
      IF n=7 THEN
        SELECT COALESCE(sum(ob.valor_pago),0), count(*) FILTER(WHERE ob.valor_a_liquidar IS NULL OR
          (ob.valor_a_liquidar>0 AND (ob.valor_pago IS NULL OR ob.data_pagamento IS NULL OR ob.valor_pago IS DISTINCT FROM ob.valor_a_liquidar))
          OR (ob.valor_a_liquidar=0 AND COALESCE(ob.valor_pago,0)<>0))
          INTO total,qtd FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id;
        IF r.valor_devido IS NULL OR qtd>0 OR total IS DISTINCT FROM r.valor_devido THEN RAISE EXCEPTION 'Total pago não corresponde ao devido da instituição.'; END IF;
      ELSE
        SELECT NULL::numeric,count(*) FILTER(WHERE ob.valor_empenhado IS NULL OR ob.valor_empenhado<=0 OR COALESCE(ob.valor_solicitado, CASE WHEN NOT ob.alocacao_manual THEN ob.valor_empenhado END,0)<=0) INTO total,qtd FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id;
        IF n=5 AND qtd>0 THEN RAISE EXCEPTION 'Informe o valor solicitado e o valor efetivo das NEs.'; END IF;
        IF n=5 AND EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND (
          NOT EXISTS (SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=ob.id AND d.tipo='nota_empenho' AND d.numero ~ '^\d{1,8}/\d{4}$' AND nullif(btrim(d.numero_sei),'') IS NOT NULL AND nullif(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL)
          OR NOT EXISTS (SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=ob.id AND d.tipo='solicitacao_ne' AND nullif(btrim(d.numero_sei),'') IS NOT NULL AND nullif(btrim(d.link_sei),'') IS NOT NULL AND d.data_documento IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM public.piso_assinatura_matriz m WHERE m.tipo_documento=d.tipo AND NOT m.opcional AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=d.id AND a.slot=m.slot_key))
            AND (SELECT e.acao FROM public.piso_encaminhamentos e WHERE e.documento_id=d.id ORDER BY e.ocorrido_em DESC LIMIT 1)='encaminhado')))
        THEN RAISE EXCEPTION 'Solicitação assinada/encaminhada ou nota de empenho incompleta.'; END IF;
        IF n=6 THEN
          FOR o IN SELECT * FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id LOOP
            SELECT COALESCE(sum(sub.valor),0),count(*) FILTER(WHERE sub.valor IS NULL) INTO total,qtd FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=o.id;
            IF qtd>0 OR total>COALESCE(o.valor_empenhado,0) OR COALESCE(o.valor_pago,0)>total OR o.valor_a_liquidar IS DISTINCT FROM total THEN
              RAISE EXCEPTION 'Confira o valor efetivamente subempenhado, empenhado e pago da NE.'; END IF;
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
COMMIT;
