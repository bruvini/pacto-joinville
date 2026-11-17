-- Execução por instituição: cada subempenho aponta para uma NE, e NEs sem uso não exigem pagamento.
-- A previsão permanece em valor_aplicado. O valor a liquidar deriva dos subempenhos conciliados.
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
      -- A previsão não limita a execução; a capacidade da NE continua obrigatória.
    ELSIF NEW.valor_aplicado IS NOT NULL THEN RAISE EXCEPTION 'Ative a alocação manual.';
    END IF;
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
    NEW.valor_a_liquidar := CASE WHEN reconciliado THEN CASE WHEN NEW.alocacao_manual THEN NEW.valor_aplicado ELSE devido END ELSE NULL END;
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
    ELSE CASE WHEN o.alocacao_manual THEN o.valor_aplicado ELSE p.valor_devido END END
  FROM public.piso_participantes p WHERE o.participante_id=p.id AND p.competencia_id=p_comp AND NOT p.sem_elegiveis
    AND o.valor_a_liquidar IS DISTINCT FROM CASE WHEN EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id AND s.valor IS NULL)
      AND (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.participante_id=p.id)=p.valor_devido
    THEN (SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.obrigacao_id=o.id)
    ELSE CASE WHEN o.alocacao_manual THEN o.valor_aplicado ELSE p.valor_devido END END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_validar_subempenho()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o record; soma numeric; total_instituicao numeric; total_homologado numeric; homologado numeric; pendentes integer; devido numeric; pid uuid; oid uuid; cid uuid; situacao text;
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
    IF COALESCE(o.valor_pago,0)>(SELECT COALESCE(sum(s.valor),0) FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.id<>OLD.id) THEN
      RAISE EXCEPTION 'A remoção deixaria o subempenho abaixo do valor pago.' USING ERRCODE='23514';
    END IF;
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
        SELECT sum(ob.valor_aplicado),count(*) FILTER(WHERE ob.valor_aplicado IS NULL OR ob.valor_empenhado IS NULL OR ob.valor_empenhado<=0 OR ob.valor_solicitado IS NULL OR ob.valor_solicitado<=0 OR ob.valor_empenhado<ob.valor_aplicado) INTO total,qtd FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual;
        IF EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual) AND n=5 AND qtd>0 THEN RAISE EXCEPTION 'Informe as parcelas das NEs; concilie o devido antes da liquidação.'; END IF;
        IF n=5 AND EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual AND (
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
  -- Recalcula somente notas da instituição em que a execução foi alterada.
  UPDATE public.piso_obrigacoes ob SET valor_a_liquidar=ob.valor_a_liquidar WHERE ob.participante_id=part;
  PERFORM public.piso_marcar_reconferencia(comp,6);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  etapa int := NULL;
  old_j jsonb;
  new_j jsonb;
  base_j jsonb;
  k text;
  diffs jsonb := '{}'::jsonb;
  rotulo text := TG_TABLE_NAME;
  part uuid;
  prest uuid;
  inst text;
  doc_id uuid;
  obrigacao_id uuid;
  categoria_arquivo text;
  tipo_documento text;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;

  old_j := CASE
    WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD)
    ELSE '{}'::jsonb
  END;

  new_j := CASE
    WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW)
    ELSE '{}'::jsonb
  END;

  IF TG_TABLE_NAME = 'piso_competencias' THEN
    comp := COALESCE(
      NULLIF(new_j->>'id','')::uuid,
      NULLIF(old_j->>'id','')::uuid
    );

  ELSIF TG_TABLE_NAME = 'piso_participantes' THEN
    comp := COALESCE(
      NULLIF(new_j->>'competencia_id','')::uuid,
      NULLIF(old_j->>'competencia_id','')::uuid
    );

    part := COALESCE(
      NULLIF(new_j->>'id','')::uuid,
      NULLIF(old_j->>'id','')::uuid
    );

    prest := COALESCE(
      NULLIF(new_j->>'prestador_id','')::uuid,
      NULLIF(old_j->>'prestador_id','')::uuid
    );

  ELSIF TG_TABLE_NAME IN ('piso_arquivos','piso_documentos') THEN
    comp := COALESCE(
      NULLIF(new_j->>'competencia_id','')::uuid,
      NULLIF(old_j->>'competencia_id','')::uuid
    );

    part := COALESCE(
      NULLIF(new_j->>'participante_id','')::uuid,
      NULLIF(old_j->>'participante_id','')::uuid
    );

    IF part IS NULL AND TG_TABLE_NAME = 'piso_documentos' THEN
      obrigacao_id := COALESCE(
        NULLIF(new_j->>'obrigacao_id','')::uuid,
        NULLIF(old_j->>'obrigacao_id','')::uuid
      );

      IF obrigacao_id IS NOT NULL THEN
        SELECT participante_id
        INTO part
        FROM public.piso_obrigacoes
        WHERE id = obrigacao_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME IN ('piso_participante_cnes','piso_obrigacoes') THEN
    part := COALESCE(
      NULLIF(new_j->>'participante_id','')::uuid,
      NULLIF(old_j->>'participante_id','')::uuid
    );

    IF part IS NOT NULL THEN
      SELECT competencia_id, prestador_id
      INTO comp, prest
      FROM public.piso_participantes
      WHERE id = part;
    END IF;

  ELSIF TG_TABLE_NAME IN (
    'piso_documento_assinaturas',
    'piso_encaminhamentos'
  ) THEN
    doc_id := COALESCE(
      NULLIF(new_j->>'documento_id','')::uuid,
      NULLIF(old_j->>'documento_id','')::uuid
    );

    IF doc_id IS NOT NULL THEN
      SELECT
        d.competencia_id,
        COALESCE(d.participante_id, o.participante_id)
      INTO comp, part
      FROM public.piso_documentos d
      LEFT JOIN public.piso_obrigacoes o
        ON o.id = d.obrigacao_id
      WHERE d.id = doc_id;
    END IF;
  END IF;

  IF part IS NOT NULL AND prest IS NULL THEN
    SELECT prestador_id
    INTO prest
    FROM public.piso_participantes
    WHERE id = part;
  END IF;

  IF prest IS NOT NULL THEN
    SELECT nome_instituicao
    INTO inst
    FROM public.prestadores
    WHERE id = prest;
  END IF;

  IF comp IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  base_j := jsonb_strip_nulls(
    jsonb_build_object(
      'participante_id', part,
      'prestador_id', prest,
      'instituicao_nome', inst
    )
  );

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · removido: ' || rotulo,
      base_j || jsonb_strip_nulls(
        jsonb_build_object(
          'tipo', old_j->'tipo',
          'slot', old_j->'slot',
          'arquivo', old_j->'nome_original'
        )
      )
    );

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · criado: ' || rotulo,
      base_j || jsonb_strip_nulls(
        jsonb_build_object(
          'competencia', new_j->'competencia',
          'tipo', new_j->'tipo',
          'slot', new_j->'slot',
          'servidor', new_j->'servidor_nome',
          'acao', new_j->'acao',
          'destino', new_j->'destino',
          'arquivo', new_j->'nome_original',
          'sha256', new_j->'sha256',
          'categoria', new_j->'categoria',
          'valor_a_liquidar', new_j->'valor_a_liquidar'
        )
      )
    );

  ELSE
    FOR k IN
      SELECT jsonb_object_keys(new_j)
    LOOP
      IF k = ANY(
        ARRAY[
          'updated_at',
          'created_at',
          'etapas_reconferir',
          'investsus_resumo',
          'investsus_auditoria',
          'auditoria_resumo'
        ]
      ) THEN
        CONTINUE;
      END IF;

      IF (new_j->k) IS DISTINCT FROM (old_j->k) THEN
        diffs := diffs || jsonb_build_object(
          k,
          jsonb_build_object(
            'de', old_j->k,
            'para', new_j->k
          )
        );
      END IF;
    END LOOP;

    IF TG_TABLE_NAME = 'piso_participantes'
      AND (new_j->'auditoria_resumo')
        IS DISTINCT FROM
          (old_j->'auditoria_resumo')
    THEN
      diffs := diffs || jsonb_build_object(
        'auditoria_planilha',
        jsonb_build_object(
          'linhas',
          new_j->'auditoria_resumo'->'linhas',
          'ocorrencias',
          new_j->'auditoria_resumo'->'ocorrencias'
        )
      );
    END IF;

    IF TG_TABLE_NAME = 'piso_competencias'
      AND (new_j->'investsus_auditoria')
        IS DISTINCT FROM
          (old_j->'investsus_auditoria')
    THEN
      diffs := diffs || jsonb_build_object(
        'conciliacao_auditoria',
        jsonb_build_object(
          'criticas',
          new_j->'investsus_auditoria'->'conciliacao'->'criticas',
          'alertas',
          new_j->'investsus_auditoria'->'conciliacao'->'alertas'
        )
      );
    END IF;

    IF diffs = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.historico_logs(
      piso_competencia_id,
      usuario_id,
      usuario_nome,
      acao,
      detalhes
    )
    VALUES (
      comp,
      uid,
      uname,
      'Piso · atualizado: ' || rotulo,
      base_j || diffs
    );
  END IF;

  IF TG_TABLE_NAME = 'piso_competencias'
    AND TG_OP = 'UPDATE'
  THEN
    IF diffs ?| ARRAY[
      'investsus_carga_em',
      'investsus_confirmacao_em',
      'investsus_ocorrencia'
    ] THEN
      etapa := 1;

    ELSIF diffs ?| ARRAY[
      'valor_apurado_investsus',
      'valor_homologado',
      'desconto_saldo',
      'acerto_contas',
      'valor_transferido',
      'portaria_gm_numero',
      'portaria_gm_url_dou'
    ] THEN
      etapa := 2;

    ELSIF diffs ?| ARRAY[
      'total_publicado_municipal',
      'municipal_config'
    ] THEN
      etapa := 3;

    ELSIF diffs ?| ARRAY[
      'credito_fms_valor',
      'credito_fms_data',
      'credito_fms_referencia'
    ] THEN
      etapa := 4;
    END IF;

  ELSIF TG_TABLE_NAME = 'piso_arquivos' THEN
    categoria_arquivo := COALESCE(
      new_j->>'categoria',
      old_j->>'categoria'
    );

    etapa := CASE
      WHEN categoria_arquivo IN ('investsus','portaria_gm')
        THEN 2
      ELSE 1
    END;

  ELSIF TG_TABLE_NAME IN (
    'piso_participantes',
    'piso_participante_cnes'
  ) THEN
    etapa := 1;

  ELSIF TG_TABLE_NAME = 'piso_obrigacoes' THEN
    etapa := CASE
      WHEN diffs ?| ARRAY[
        'valor_pago',
        'data_pagamento',
        'data_programacao'
      ] THEN 7

      WHEN diffs ? 'valor_a_liquidar' AND (diffs - 'valor_a_liquidar') = '{}'::jsonb THEN 6
      WHEN diffs ?| ARRAY[
        'data_solicitacao_liquidacao',
        'data_movimento_liquidacao',
        'movimento_transmitido'
      ] THEN 6

      ELSE 5
    END;

  ELSIF TG_TABLE_NAME = 'piso_documentos' THEN
    tipo_documento := COALESCE(
      new_j->>'tipo',
      old_j->>'tipo'
    );

    etapa := public.piso_etapa_doc(tipo_documento);
  END IF;

  IF etapa IS NOT NULL THEN
    PERFORM public.piso_marcar_reconferencia(
      comp,
      etapa
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_bloquear_anulacao_sem_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') AND NOT EXISTS (
    SELECT 1 FROM public.piso_documentos pr JOIN public.piso_obrigacoes o ON o.id=NEW.obrigacao_id
    WHERE (pr.obrigacao_id=o.id OR (o.valor_a_liquidar=0 AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos ss WHERE ss.obrigacao_id=o.id) AND EXISTS(SELECT 1 FROM public.piso_obrigacoes usada WHERE usada.id=pr.obrigacao_id AND usada.participante_id=o.participante_id AND usada.valor_a_liquidar>0)))
      AND pr.tipo='programacao_pagamento'
      AND nullif(btrim(pr.numero_sei),'') IS NOT NULL
      AND nullif(btrim(pr.link_sei),'') IS NOT NULL
      AND pr.data_documento IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Preencha primeiro a Programação de Pagamento desta instituição na Etapa 7.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.piso_validar_dependencias_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  n integer;
  requisito integer;
  requisitos integer[];
  precisa_validar boolean;
BEGIN
  FOR n IN 1..10 LOOP
    IF n = 1 AND NEW.tipo_parcela = 'decimo_terceiro'
      AND NEW.etapas_concluidas ->> '1' = 'true'
      AND OLD.etapas_concluidas ->> '1' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Etapa 1 mensal não é aplicável à 13ª parcela do Piso.'
        USING ERRCODE = '23514';
    END IF;

    precisa_validar := NEW.etapas_concluidas ->> n::text = 'true'
      AND (
        OLD.etapas_concluidas ->> n::text IS DISTINCT FROM 'true'
        OR (
          n = ANY(COALESCE(OLD.etapas_reconferir, ARRAY[]::integer[]))
          AND NOT (n = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[])))
        )
      );
    IF precisa_validar IS NOT TRUE THEN CONTINUE; END IF;

    requisitos := CASE n
      WHEN 2 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[]::integer[] ELSE ARRAY[1] END
      WHEN 3 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2] ELSE ARRAY[1,2] END
      WHEN 4 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3] ELSE ARRAY[1,2,3] END
      WHEN 6 THEN ARRAY[5]
      WHEN 7 THEN ARRAY[5,6]
      WHEN 8 THEN ARRAY[5,6]
      WHEN 10 THEN ARRAY[]::integer[]
      WHEN 9 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3,4,5,6,7,8]
        ELSE ARRAY[1,2,3,4,5,6,7,8] END
      ELSE ARRAY[]::integer[]
    END;

    -- A 7A é obrigatória somente quando existe excedente real de empenho.
    -- Em competências antigas, nenhum valor empenhado foi declarado:
    -- isso NÃO retroage uma obrigação inexistente.
    IF n IN (8,9) AND EXISTS (
      SELECT 1
      FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=NEW.id
        AND o.valor_empenhado IS NOT NULL AND o.valor_a_liquidar IS NOT NULL
        AND o.valor_empenhado-o.valor_a_liquidar > 0.009
    ) THEN
      requisitos := array_append(requisitos,10);
    END IF;
    IF n=10 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
      ) THEN
        RAISE EXCEPTION 'A etapa 7A só é aplicável com excedente confirmado de empenho.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        LEFT JOIN public.piso_documentos s
          ON s.obrigacao_id=o.id AND s.tipo='solicitacao_anulacao'
        LEFT JOIN public.piso_documentos a
          ON a.obrigacao_id=o.id AND a.tipo='aviso_anulacao'
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
          AND (
            o.valor_anulado IS NULL OR abs(o.valor_anulado-(o.valor_empenhado-o.valor_a_liquidar))>0.01
            OR NOT EXISTS (SELECT 1 FROM public.piso_documentos pr
              WHERE (pr.obrigacao_id=o.id OR (o.valor_a_liquidar=0 AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos ss WHERE ss.obrigacao_id=o.id) AND EXISTS(SELECT 1 FROM public.piso_obrigacoes usada WHERE usada.id=pr.obrigacao_id AND usada.participante_id=o.participante_id AND usada.valor_a_liquidar>0))) AND pr.tipo='programacao_pagamento'
                AND nullif(btrim(pr.numero_sei),'') IS NOT NULL AND nullif(btrim(pr.link_sei),'') IS NOT NULL AND pr.data_documento IS NOT NULL)
            OR s.numero_sei IS NULL OR s.link_sei IS NULL OR s.data_documento IS NULL
            OR a.numero_sei IS NULL OR a.link_sei IS NULL OR a.data_documento IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.piso_encaminhamentos e
              WHERE e.documento_id=s.id AND e.acao='encaminhado'
              AND NOT EXISTS(SELECT 1 FROM public.piso_encaminhamentos e2
                WHERE e2.documento_id=e.documento_id AND e2.ocorrido_em>e.ocorrido_em))
            OR EXISTS (
              SELECT 1 FROM public.piso_assinatura_matriz m
              WHERE m.tipo_documento='solicitacao_anulacao' AND NOT m.opcional
                AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas sig
                  WHERE sig.documento_id=s.id AND sig.slot=m.slot_key)
            )
          )
      ) THEN
        RAISE EXCEPTION 'Anulação de empenho incompleta: confira valor, documento assinado, envio SEFAZ e aviso.';
      END IF;
    END IF;
    FOREACH requisito IN ARRAY requisitos LOOP
      IF NEW.etapas_concluidas ->> requisito::text IS DISTINCT FROM 'true'
        OR requisito = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[]))
      THEN
        RAISE EXCEPTION 'Etapa % do Piso depende da Etapa % concluída e sem reconferência.', n, requisito
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;
-- Atualizar apenas valores derivados das competências abertas, sem modificar previsões ou documentos.
DO $fix$
DECLARE c record;
BEGIN
  FOR c IN SELECT DISTINCT p.competencia_id FROM public.piso_participantes p
    JOIN public.piso_competencias cp ON cp.id=p.competencia_id
    WHERE cp.status<>'encerrada' AND EXISTS (SELECT 1 FROM public.piso_subempenhos s WHERE s.participante_id=p.id AND s.valor IS NOT NULL)
  LOOP
    PERFORM public.piso_sincronizar_obrigacoes_conciliadas(c.competencia_id);
  END LOOP;
END;
$fix$;
COMMIT;
