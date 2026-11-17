-- Uniformiza a validação documental com a interface e identifica exatamente a NE pendente.
-- Não altera documentos, assinaturas, encaminhamentos ou valores históricos.
BEGIN;
CREATE OR REPLACE FUNCTION public.piso_validar_somas_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE n integer; r record; o record; s record; total numeric; qtd integer; doc_count integer; nota record; solicitacao record; numero_ne text; falta text; ultima_acao text;
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
        IF n=5 THEN
          FOR o IN SELECT * FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id LOOP
            SELECT d.id,d.numero,d.numero_sei,d.link_sei,d.data_documento INTO nota
              FROM public.piso_documentos d
              WHERE d.obrigacao_id=o.id AND d.tipo='nota_empenho'
                AND d.participante_id IS NULL AND d.subempenho_id IS NULL
              ORDER BY d.id LIMIT 1;
            numero_ne := COALESCE(NULLIF(btrim(nota.numero, ' '||chr(9)||chr(10)||chr(13)||chr(160)||chr(65279)),''),o.id::text);
            IF nota.id IS NULL THEN
              RAISE EXCEPTION 'NE %: documento Nota de Empenho não localizado.', numero_ne;
            END IF;
            -- Mesmo formato da interface: ignora espaços nas extremidades.
            IF numero_ne !~ '^[0-9]{1,8}/[0-9]{4}$' THEN
              RAISE EXCEPTION 'NE %: número da Nota de Empenho inválido; use XXXX/AAAA.', numero_ne;
            END IF;
            IF NULLIF(btrim(nota.numero_sei),'') IS NULL OR NULLIF(btrim(nota.link_sei),'') IS NULL OR nota.data_documento IS NULL THEN
              RAISE EXCEPTION 'NE %: falta número SEI, link ou data da Nota de Empenho.', numero_ne;
            END IF;
            SELECT m.slot_key INTO falta FROM public.piso_assinatura_matriz m
              WHERE m.tipo_documento='nota_empenho' AND m.opcional IS NOT TRUE
                AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=nota.id AND a.slot=m.slot_key)
              ORDER BY m.slot_key LIMIT 1;
            IF falta IS NOT NULL THEN
              RAISE EXCEPTION 'NE %: assinatura obrigatória % ausente na Nota de Empenho.', numero_ne, falta;
            END IF;
            SELECT d.id,d.numero_sei,d.link_sei,d.data_documento INTO solicitacao
              FROM public.piso_documentos d
              WHERE d.obrigacao_id=o.id AND d.tipo='solicitacao_ne'
                AND d.participante_id IS NULL AND d.subempenho_id IS NULL
              ORDER BY d.id LIMIT 1;
            IF solicitacao.id IS NULL THEN
              RAISE EXCEPTION 'NE %: Solicitação de Nota de Empenho não localizada.', numero_ne;
            END IF;
            IF NULLIF(btrim(solicitacao.numero_sei),'') IS NULL OR NULLIF(btrim(solicitacao.link_sei),'') IS NULL OR solicitacao.data_documento IS NULL THEN
              RAISE EXCEPTION 'NE %: falta número SEI, link ou data na Solicitação de NE.', numero_ne;
            END IF;
            SELECT m.slot_key INTO falta FROM public.piso_assinatura_matriz m
              WHERE m.tipo_documento='solicitacao_ne' AND m.opcional IS NOT TRUE
                AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a WHERE a.documento_id=solicitacao.id AND a.slot=m.slot_key)
              ORDER BY m.slot_key LIMIT 1;
            IF falta IS NOT NULL THEN
              RAISE EXCEPTION 'NE %: assinatura obrigatória % ausente na Solicitação de NE.', numero_ne, falta;
            END IF;
            SELECT e.acao INTO ultima_acao FROM public.piso_encaminhamentos e
              WHERE e.documento_id=solicitacao.id
              ORDER BY e.ocorrido_em DESC NULLS LAST, (e.acao='encaminhado') ASC LIMIT 1;
            IF ultima_acao IS DISTINCT FROM 'encaminhado' THEN
              RAISE EXCEPTION 'NE %: Solicitação de NE sem encaminhamento vigente (última ação: %).', numero_ne, COALESCE(ultima_acao,'nenhuma');
            END IF;
          END LOOP;
        END IF;
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
