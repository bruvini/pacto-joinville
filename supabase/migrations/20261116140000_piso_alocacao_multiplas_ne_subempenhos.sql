-- Uma obrigação representa uma NE. O valor a liquidar permanece derivado,
-- agora da parcela explicitamente alocada quando há múltiplas notas.
-- Nenhuma obrigação, documento ou assinatura histórica é regravada.
BEGIN;

ALTER TABLE public.piso_obrigacoes
  ADD COLUMN valor_aplicado numeric(14,2) CHECK (valor_aplicado >= 0),
  ADD COLUMN alocacao_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_solicitado numeric(14,2) CHECK (valor_solicitado >= 0);
CREATE INDEX IF NOT EXISTS idx_piso_obrigacoes_participante ON public.piso_obrigacoes(participante_id);

CREATE TABLE public.piso_subempenhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE RESTRICT,
  participante_id uuid NOT NULL REFERENCES public.piso_participantes(id) ON DELETE RESTRICT,
  obrigacao_id uuid NOT NULL REFERENCES public.piso_obrigacoes(id) ON DELETE RESTRICT,
  sequencia integer NOT NULL CHECK (sequencia > 0),
  legado boolean NOT NULL DEFAULT false,
  valor numeric(14,2) CHECK (valor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrigacao_id, sequencia)
);
CREATE INDEX idx_piso_subempenhos_comp ON public.piso_subempenhos(competencia_id);
CREATE INDEX idx_piso_subempenhos_part ON public.piso_subempenhos(participante_id);
CREATE UNIQUE INDEX idx_piso_subempenhos_legado ON public.piso_subempenhos(obrigacao_id) WHERE legado;
ALTER TABLE public.piso_subempenhos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piso_subempenhos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piso_subempenhos TO authenticated;
GRANT ALL ON public.piso_subempenhos TO service_role;
CREATE POLICY "piso read" ON public.piso_subempenhos FOR SELECT TO authenticated
  USING (public.has_any_role((select auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]));
CREATE POLICY "piso insert" ON public.piso_subempenhos FOR INSERT TO authenticated
  WITH CHECK (NOT legado AND public.has_any_role((select auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]));
CREATE POLICY "piso update" ON public.piso_subempenhos FOR UPDATE TO authenticated
  USING (public.has_any_role((select auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]))
  WITH CHECK (public.has_any_role((select auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]));
CREATE POLICY "piso delete draft" ON public.piso_subempenhos FOR DELETE TO authenticated
  USING (NOT legado AND public.has_any_role((select auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]));

ALTER TABLE public.piso_documentos ADD COLUMN subempenho_id uuid REFERENCES public.piso_subempenhos(id) ON DELETE RESTRICT;
CREATE INDEX idx_piso_documentos_subempenho ON public.piso_documentos(subempenho_id);
CREATE UNIQUE INDEX piso_documentos_tipo_subempenho ON public.piso_documentos(subempenho_id,tipo) WHERE subempenho_id IS NOT NULL;
CREATE UNIQUE INDEX piso_documentos_escopo_tipo_cadeia ON public.piso_documentos (
  competencia_id, COALESCE(participante_id,'00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(obrigacao_id,'00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(subempenho_id,'00000000-0000-0000-0000-000000000000'::uuid), tipo);
DROP INDEX public.piso_documentos_escopo_tipo;

-- A cadeia legada usa os mesmos IDs documentais (subempenho_id NULL). Não
-- inferimos o valor de subempenho a partir do crédito nem do valor devido.
INSERT INTO public.piso_subempenhos (competencia_id, participante_id, obrigacao_id, sequencia, legado)
SELECT p.competencia_id, o.participante_id, o.id, 1, true
FROM public.piso_obrigacoes o JOIN public.piso_participantes p ON p.id=o.participante_id
WHERE EXISTS (SELECT 1 FROM public.piso_documentos d WHERE d.obrigacao_id=o.id
  AND d.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho'));

-- A mesma trava por participante serializa alocação e subempenho, inclusive
-- alterações concorrentes de notas diferentes. Nenhum cliente pode alterar
-- diretamente a coluna derivada valor_a_liquidar.
CREATE OR REPLACE FUNCTION public.piso_derivar_valor_obrigacao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE devido numeric; homologado numeric; total numeric; situacao text; comp uuid;
  pendentes integer; quantidade integer; outras integer; soma numeric; subs numeric;
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
  SELECT count(*), COALESCE(sum(o.valor_aplicado),0) INTO outras,soma FROM public.piso_obrigacoes o
    WHERE o.participante_id=NEW.participante_id AND o.id<>NEW.id;
  IF mudou THEN
    IF outras>0 AND (NOT NEW.alocacao_manual OR EXISTS(SELECT 1 FROM public.piso_obrigacoes o
      WHERE o.participante_id=NEW.participante_id AND o.id<>NEW.id AND NOT o.alocacao_manual)) THEN
      RAISE EXCEPTION 'Informe a alocação explícita das notas existentes antes de acrescentar outra NE.';
    END IF;
    IF NEW.alocacao_manual THEN
      IF NEW.valor_aplicado IS NOT NULL AND devido IS NOT NULL AND soma+NEW.valor_aplicado>devido THEN
        RAISE EXCEPTION 'A soma das alocações excede o devido da instituição.' USING ERRCODE='23514';
      END IF;
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
$fn$;
REVOKE ALL ON FUNCTION public.piso_derivar_valor_obrigacao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER trg_piso_obr_derivar_valor ON public.piso_obrigacoes;
CREATE TRIGGER trg_piso_obr_derivar_valor BEFORE INSERT OR UPDATE OF participante_id,valor_a_liquidar,valor_aplicado,alocacao_manual,valor_empenhado
  ON public.piso_obrigacoes FOR EACH ROW EXECUTE FUNCTION public.piso_derivar_valor_obrigacao();

CREATE OR REPLACE FUNCTION public.piso_sincronizar_obrigacoes_conciliadas(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE homologado numeric; situacao text; total numeric; pendentes integer; quantidade integer;
BEGIN
  SELECT c.valor_homologado,c.status INTO homologado,situacao FROM public.piso_competencias c WHERE c.id=p_comp;
  IF NOT FOUND OR situacao='encerrada' OR homologado IS NULL THEN RETURN; END IF;
  SELECT COALESCE(sum(p.valor_devido),0),count(*) FILTER(WHERE p.valor_devido IS NULL),count(*)
    INTO total,pendentes,quantidade FROM public.piso_participantes p WHERE p.competencia_id=p_comp AND NOT p.sem_elegiveis;
  IF quantidade=0 OR pendentes>0 OR abs(total-homologado)>0.02 THEN RETURN; END IF;
  UPDATE public.piso_obrigacoes o SET valor_a_liquidar=CASE WHEN o.alocacao_manual THEN o.valor_aplicado ELSE p.valor_devido END
  FROM public.piso_participantes p WHERE o.participante_id=p.id AND p.competencia_id=p_comp AND NOT p.sem_elegiveis
    AND o.valor_a_liquidar IS DISTINCT FROM CASE WHEN o.alocacao_manual THEN o.valor_aplicado ELSE p.valor_devido END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_sincronizar_obrigacoes_conciliadas(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.piso_validar_subempenho()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE o record; soma numeric; pid uuid; oid uuid; cid uuid; situacao text;
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
  IF NEW.valor IS NULL THEN RETURN NEW; END IF;
  IF o.valor_a_liquidar IS NULL OR o.valor_empenhado IS NULL THEN RAISE EXCEPTION 'Informe o valor conciliado e a NE antes do subempenho.'; END IF;
  SELECT COALESCE(sum(s.valor),0) INTO soma FROM public.piso_subempenhos s WHERE s.obrigacao_id=oid AND s.id<>NEW.id;
  IF soma+NEW.valor>least(o.valor_a_liquidar,o.valor_empenhado) THEN RAISE EXCEPTION 'Total de subempenhos excede a alocação da nota.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_subempenho() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_piso_subempenhos_validar BEFORE INSERT OR UPDATE OR DELETE ON public.piso_subempenhos FOR EACH ROW EXECUTE FUNCTION public.piso_validar_subempenho();
CREATE TRIGGER trg_piso_subempenhos_upd BEFORE UPDATE ON public.piso_subempenhos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.piso_validar_documento_cadeia()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE s record;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.subempenho_id,NEW.obrigacao_id,NEW.competencia_id,NEW.participante_id,NEW.tipo) IS DISTINCT FROM (OLD.subempenho_id,OLD.obrigacao_id,OLD.competencia_id,OLD.participante_id,OLD.tipo) THEN RAISE EXCEPTION 'Escopo documental imutável.'; END IF;
  IF NEW.subempenho_id IS NULL THEN
    IF NEW.tipo IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') AND NOT EXISTS(SELECT 1 FROM public.piso_subempenhos sub WHERE sub.obrigacao_id=NEW.obrigacao_id AND sub.legado) THEN RAISE EXCEPTION 'Cadastre primeiro a solicitação de subempenho.'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.piso_subempenhos WHERE id=NEW.subempenho_id;
  IF NOT FOUND OR s.legado OR s.obrigacao_id IS DISTINCT FROM NEW.obrigacao_id OR s.competencia_id<>NEW.competencia_id OR NEW.participante_id IS NOT NULL OR NEW.tipo NOT IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') THEN RAISE EXCEPTION 'Documento fora do escopo da cadeia.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_documento_cadeia() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_piso_validar_documento_cadeia BEFORE INSERT OR UPDATE OF subempenho_id,obrigacao_id,competencia_id,participante_id,tipo ON public.piso_documentos FOR EACH ROW EXECUTE FUNCTION public.piso_validar_documento_cadeia();

-- Validação no servidor das novas etapas/reconferências; o legado de uma NE
-- e uma cadeia permanece válido, sem completar dados que não foram informados.
CREATE OR REPLACE FUNCTION public.piso_validar_somas_conclusao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
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
        IF EXISTS(SELECT 1 FROM public.piso_obrigacoes ob WHERE ob.participante_id=r.id AND ob.alocacao_manual) AND (qtd>0 OR (r.valor_devido IS NOT NULL AND total IS DISTINCT FROM r.valor_devido)) THEN RAISE EXCEPTION 'Distribuição das notas de empenho incompleta.'; END IF;
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
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_somas_conclusao() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_piso_validar_somas_conclusao BEFORE UPDATE OF etapas_concluidas,etapas_reconferir ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.piso_validar_somas_conclusao();

CREATE OR REPLACE FUNCTION public.piso_audit_subempenho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE j jsonb; uid uuid:=auth.uid(); uname text; comp uuid; part uuid; inst text; prest uuid;
BEGIN
  j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  comp:=(j->>'competencia_id')::uuid; part:=(j->>'participante_id')::uuid;
  SELECT nome INTO uname FROM public.profiles WHERE id=uid;
  SELECT p.prestador_id,v.nome_instituicao INTO prest,inst FROM public.piso_participantes p JOIN public.prestadores v ON v.id=p.prestador_id WHERE p.id=part;
  INSERT INTO public.historico_logs(piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
    VALUES(comp,uid,uname,'Piso · '||CASE TG_OP WHEN 'INSERT' THEN 'criado' WHEN 'DELETE' THEN 'removido' ELSE 'atualizado' END||': piso_subempenhos',jsonb_build_object('participante_id',part,'prestador_id',prest,'instituicao_nome',inst,'obrigacao_id',j->'obrigacao_id','subempenho_id',j->'id','valor',jsonb_build_object('de',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)->'valor' END,'para',CASE WHEN TG_OP='DELETE' THEN NULL ELSE j->'valor' END)));
  PERFORM public.piso_marcar_reconferencia(comp,6);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_audit_subempenho() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_piso_audit_subempenho AFTER INSERT OR UPDATE OR DELETE ON public.piso_subempenhos FOR EACH ROW EXECUTE FUNCTION public.piso_audit_subempenho();
COMMIT;
