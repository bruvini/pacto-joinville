-- Encontro de Contas HMSJ | Fase 4 (incremental).
-- Auditoria fiscal e correções de competências anteriores com rastreabilidade.
-- Aplicar depois da Fase 3. Não importar pacientes/nomes/CPF.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('public.eletivas_itens') IS NULL
   OR to_regclass('public.eletivas_competencias') IS NULL
   OR to_regprocedure('public.ec_encerrar(uuid)') IS NULL
   OR to_regprocedure('public.ec_resumo_financeiro(uuid)') IS NULL
   OR to_regtype('public.app_role') IS NULL THEN
  RAISE EXCEPTION 'Fase 4 exige Fases 0-3 instaladas.' USING ERRCODE='23514';
 END IF;
END;$pre$;

ALTER TABLE public.eletivas_itens
 ADD COLUMN IF NOT EXISTS decisao_versao integer NOT NULL DEFAULT 0
 CHECK(decisao_versao>=0);
CREATE TABLE IF NOT EXISTS public.eletivas_decisoes_revisoes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.eletivas_itens(id) ON DELETE RESTRICT,
 versao integer NOT NULL CHECK(versao>0),
 decisao_anterior text,
 decisao_nova text NOT NULL CHECK(decisao_nova IN ('aceito','oficio','erro','analise')),
 justificativa_anterior text,
 justificativa_nova text NOT NULL,
 motivo_revisao text,
 autor uuid NOT NULL REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(item_id,versao)
);
CREATE INDEX IF NOT EXISTS ec_revisao_comp_idx
 ON public.eletivas_decisoes_revisoes(competencia_id,item_id,registrado_em DESC);
ALTER TABLE public.eletivas_decisoes_revisoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_revisoes_leitura ON public.eletivas_decisoes_revisoes;
CREATE POLICY ec_revisoes_leitura ON public.eletivas_decisoes_revisoes
 FOR SELECT TO authenticated
 USING(auth.uid() IS NOT NULL
   AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_decisoes_revisoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_decisoes_revisoes TO authenticated;

CREATE OR REPLACE FUNCTION public.ec_proteger_decisao_fase4()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF NEW.decisao IS DISTINCT FROM OLD.decisao
   OR NEW.justificativa IS DISTINCT FROM OLD.justificativa THEN
   IF current_setting('app.ec_decisao_item',true) IS DISTINCT FROM NEW.id::text
      OR NEW.decisao_versao IS DISTINCT FROM OLD.decisao_versao+1 THEN
     RAISE EXCEPTION 'Decisões só podem ser registradas pela ação fiscal auditável.'
       USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END;$guard$;
DROP TRIGGER IF EXISTS ec_decisao_fase4_guard ON public.eletivas_itens;
CREATE TRIGGER ec_decisao_fase4_guard BEFORE UPDATE ON public.eletivas_itens
 FOR EACH ROW EXECUTE FUNCTION public.ec_proteger_decisao_fase4();

CREATE OR REPLACE FUNCTION public.ec_registrar_decisao_fase4()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $log$
BEGIN
 IF NEW.decisao IS DISTINCT FROM OLD.decisao
   OR NEW.justificativa IS DISTINCT FROM OLD.justificativa THEN
   INSERT INTO public.eletivas_decisoes_revisoes(
      competencia_id,item_id,versao,decisao_anterior,decisao_nova,
      justificativa_anterior,justificativa_nova,motivo_revisao,autor)
   VALUES(NEW.competencia_id,NEW.id,NEW.decisao_versao,OLD.decisao,NEW.decisao,
      OLD.justificativa,NEW.justificativa,
      nullif(current_setting('app.ec_revisao_motivo',true),''),auth.uid());
 END IF;
 RETURN NEW;
END;$log$;
DROP TRIGGER IF EXISTS ec_decisao_fase4_log ON public.eletivas_itens;
CREATE TRIGGER ec_decisao_fase4_log AFTER UPDATE OF decisao,justificativa
 ON public.eletivas_itens FOR EACH ROW EXECUTE FUNCTION public.ec_registrar_decisao_fase4();

CREATE OR REPLACE FUNCTION public.ec_decidir_item(
 p_item uuid,p_decisao text,p_justificativa text,
 p_versao integer,p_motivo_revisao text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rpc$
DECLARE it public.eletivas_itens%ROWTYPE;
 cp public.eletivas_competencias%ROWTYPE;
 usuario uuid:=auth.uid();
 motivo_revisao text:=trim(coalesce(p_motivo_revisao,''));
BEGIN
 IF usuario IS NULL OR NOT public.has_any_role(
  usuario,ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Somente ACP/Admin podem registrar decisões fiscais.' USING ERRCODE='42501';
 END IF;
 IF p_decisao IS NULL OR p_decisao NOT IN ('aceito','oficio','erro','analise')
    OR length(trim(coalesce(p_justificativa,'')))<10 THEN
   RAISE EXCEPTION 'Decisão válida e justificativa de pelo menos 10 caracteres obrigatórias.'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO it FROM public.eletivas_itens WHERE id=p_item FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado.' USING ERRCODE='23514'; END IF;
 SELECT * INTO cp FROM public.eletivas_competencias WHERE id=it.competencia_id FOR UPDATE;
 IF cp.status='encerrada' THEN
   RAISE EXCEPTION 'Competência encerrada. Revisão bloqueada.' USING ERRCODE='23514';
 END IF;
 IF it.decisao_versao IS DISTINCT FROM p_versao THEN
   RAISE EXCEPTION 'Outro fiscal alterou a decisão; atualize a tela.' USING ERRCODE='40001';
 END IF;
 IF it.decisao IS NOT NULL AND length(motivo_revisao)<15 THEN
   RAISE EXCEPTION 'Alterações em decisões anteriores exigem motivo formal de 15 caracteres.'
     USING ERRCODE='23514';
 END IF;
 IF it.decisao IS NOT DISTINCT FROM p_decisao
    AND it.justificativa IS NOT DISTINCT FROM trim(p_justificativa) THEN
   RAISE EXCEPTION 'A decisão já está registrada; nenhuma revisão necessária.'
     USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_decisao_item',p_item::text,true);
 PERFORM pg_catalog.set_config('app.ec_revisao_motivo',motivo_revisao,true);
 UPDATE public.eletivas_itens SET decisao=p_decisao,
   justificativa=trim(p_justificativa),decisao_versao=it.decisao_versao+1
 WHERE id=p_item;
 RETURN it.decisao_versao+1;
END;$rpc$;
REVOKE ALL ON FUNCTION public.ec_decidir_item(uuid,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_decidir_item(uuid,text,text,integer,text) TO authenticated;

-- Correções antigas e novas deixam de ser somadas a partir de JSON.
-- Uma mesma referência de origem não pode gerar dois créditos aprovados
-- em competências de recebimento diferentes.
CREATE TABLE IF NOT EXISTS public.eletivas_correcoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 competencia_origem text NOT NULL CHECK (competencia_origem ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
 aihs text[] NOT NULL DEFAULT ARRAY[]::text[],
 valor numeric(16,2) NOT NULL,
 fonte_origem text NOT NULL,
 referencia_origem text NOT NULL,
 documento_sei text NOT NULL,
 motivo text NOT NULL,
 status text NOT NULL DEFAULT 'em_analise'
  CHECK(status IN ('em_analise','aprovada','rejeitada','duplicada')),
 fingerprint text NOT NULL CHECK(length(fingerprint)=32),
 origem_legada_indice integer,
 criado_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 revisado_por uuid REFERENCES auth.users(id),
 revisado_em timestamptz,
 justificativa_revisao text,
 UNIQUE(competencia_id,origem_legada_indice),
 CONSTRAINT ec_correcoes_aihs_validas CHECK(
   array_position(aihs,NULL) IS NULL
   AND array_to_string(aihs,',') !~ '[^0-9,]')
);
CREATE UNIQUE INDEX IF NOT EXISTS ec_correcao_unica_aprovada
 ON public.eletivas_correcoes(prestador_id,fingerprint)
 WHERE status='aprovada';
CREATE INDEX IF NOT EXISTS ec_correcao_comp_idx
 ON public.eletivas_correcoes(competencia_id,status);
ALTER TABLE public.eletivas_correcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_correcoes_leitura ON public.eletivas_correcoes;
CREATE POLICY ec_correcoes_leitura ON public.eletivas_correcoes
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND
  public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_correcoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_correcoes TO authenticated;

-- Migrar correções legadas preservando o registro JSON apenas para auditoria.
-- Se a mesma origem/SEI/valor já aparecer, marcar duplicada (não somar).
DO $backfill$
DECLARE c record; entrada jsonb; ordem integer; valor_corr numeric;
 origem_txt text; doc_txt text; motivo_txt text; fingerprint_txt text;
 estado text;
BEGIN
 FOR c IN SELECT id,prestador_id,correcoes FROM public.eletivas_competencias
   ORDER BY criado_em,id LOOP
   ordem:=0;
   IF jsonb_typeof(c.correcoes) IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Fase 4: memória legada inválida na competência %.',c.id;
   END IF;
   FOR entrada IN SELECT value FROM jsonb_array_elements(c.correcoes) LOOP
     ordem:=ordem+1;
     origem_txt:=trim(coalesce(entrada->>'competencia_origem',''));
     doc_txt:=upper(trim(coalesce(entrada->>'documento_sei','')));
     motivo_txt:=trim(coalesce(entrada->>'motivo',''));
     IF origem_txt !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' OR doc_txt=''
       OR coalesce(entrada->>'valor','') !~ '^-?[0-9]+([.][0-9]{1,2})?$' THEN
       RAISE EXCEPTION 'Fase 4: correção legada incompleta na competência %, posição %.',
         c.id,ordem USING ERRCODE='23514';
     END IF;
     valor_corr:=(entrada->>'valor')::numeric;
     fingerprint_txt:=md5('LEGADO|'||origem_txt||'|'||doc_txt||'|'||valor_corr::text);
     estado:=CASE WHEN EXISTS(
       SELECT 1 FROM public.eletivas_correcoes x
       WHERE x.prestador_id=c.prestador_id AND x.fingerprint=fingerprint_txt
         AND x.status='aprovada') THEN 'duplicada' ELSE 'aprovada' END;
     INSERT INTO public.eletivas_correcoes (
       competencia_id,prestador_id,competencia_origem,valor,
       fonte_origem,referencia_origem,documento_sei,motivo,
       status,fingerprint,origem_legada_indice)
     VALUES(c.id,c.prestador_id,origem_txt,valor_corr,'Importação do JSON histórico',
       'LEGADO|'||origem_txt||'|'||doc_txt||'|'||valor_corr::text,
       doc_txt,motivo_txt,estado,fingerprint_txt,ordem)
     ON CONFLICT (competencia_id,origem_legada_indice) DO NOTHING;
   END LOOP;
 END LOOP;
END;$backfill$;

CREATE OR REPLACE FUNCTION public.ec_bloquear_correcoes_legadas()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $freeze$
BEGIN
 IF NEW.correcoes IS DISTINCT FROM OLD.correcoes THEN
   RAISE EXCEPTION 'Use a aba de correções auditáveis; o JSON histórico está congelado.'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$freeze$;
DROP TRIGGER IF EXISTS ec_bloquear_correcoes_json ON public.eletivas_competencias;
CREATE TRIGGER ec_bloquear_correcoes_json BEFORE UPDATE OF correcoes
 ON public.eletivas_competencias FOR EACH ROW
 EXECUTE FUNCTION public.ec_bloquear_correcoes_legadas();

CREATE OR REPLACE FUNCTION public.ec_auditar_correcao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $logcor$
BEGIN
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
   WHERE id=NEW.competencia_id AND status='encerrada') THEN
   RAISE EXCEPTION 'Encontro encerrado: correções imutáveis.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (
   NEW.competencia_id IS DISTINCT FROM OLD.competencia_id
   OR NEW.prestador_id IS DISTINCT FROM OLD.prestador_id
   OR NEW.competencia_origem IS DISTINCT FROM OLD.competencia_origem
   OR NEW.aihs IS DISTINCT FROM OLD.aihs
   OR NEW.valor IS DISTINCT FROM OLD.valor
   OR NEW.documento_sei IS DISTINCT FROM OLD.documento_sei
   OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
   OR NEW.referencia_origem IS DISTINCT FROM OLD.referencia_origem
   OR NEW.criado_por IS DISTINCT FROM OLD.criado_por ) THEN
   RAISE EXCEPTION 'Origem e valor imutáveis; somente revisão de status é permitida.'
     USING ERRCODE='23514';
 END IF;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES (NEW.competencia_id,'correcao_'||lower(TG_OP),
   jsonb_build_object('correcao_id',NEW.id,'competencia_origem',NEW.competencia_origem,
     'aihs',NEW.aihs,'valor',NEW.valor,'documento_sei',NEW.documento_sei,
     'status_anterior',CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,
     'status_novo',NEW.status),auth.uid());
 RETURN NEW;
END;$logcor$;
DROP TRIGGER IF EXISTS ec_correcoes_auditoria ON public.eletivas_correcoes;
CREATE TRIGGER ec_correcoes_auditoria AFTER INSERT OR UPDATE
 ON public.eletivas_correcoes FOR EACH ROW EXECUTE FUNCTION public.ec_auditar_correcao();

CREATE OR REPLACE FUNCTION public.ec_incluir_correcao(
 p_comp uuid,p_origem text,p_aihs text[],p_valor numeric,p_fonte text,
 p_referencia text,p_sei text,p_motivo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $include$
DECLARE v public.eletivas_competencias%ROWTYPE;
 lista text[]; chave text; nova uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(
   auth.uid(),ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Somente ACP/Admin podem cadastrar correções.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR v.status='encerrada' THEN
   RAISE EXCEPTION 'Competência inexistente ou encerrada.' USING ERRCODE='23514';
 END IF;
 IF coalesce(p_origem,'') !~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
   OR p_valor IS NULL OR round(p_valor,2)<>p_valor
   OR length(trim(coalesce(p_fonte,'')))<3
   OR length(trim(coalesce(p_referencia,'')))<5
   OR length(trim(coalesce(p_sei,'')))<5
   OR length(trim(coalesce(p_motivo,'')))<10 THEN
   RAISE EXCEPTION 'Informe competência original, centavos, fonte, referência única, SEI e motivo.'
     USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(array_agg(DISTINCT trim(x) ORDER BY trim(x)),ARRAY[]::text[])
   INTO lista FROM unnest(COALESCE(p_aihs,ARRAY[]::text[])) x
   WHERE length(trim(x))>0;
 IF EXISTS(SELECT 1 FROM unnest(lista) x WHERE x !~ '^[0-9]{13}$') THEN
   RAISE EXCEPTION 'AIH deve conter exatamente 13 dígitos. Não use nomes/CPF.'
     USING ERRCODE='23514';
 END IF;
 chave:=md5(upper(trim(p_origem))||'|'||upper(trim(p_fonte))||
   '|'||upper(trim(p_referencia)));
 IF EXISTS(SELECT 1 FROM public.eletivas_correcoes x
   WHERE x.prestador_id=v.prestador_id AND x.fingerprint=chave
     AND x.status<>'rejeitada') THEN
   RAISE EXCEPTION 'Referência de origem já registrada neste prestador, inclusive em outro mês.'
     USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_correcoes x
   WHERE x.prestador_id=v.prestador_id AND x.competencia_origem=p_origem
     AND upper(trim(x.documento_sei))=upper(trim(p_sei))
     AND x.valor=p_valor AND x.status='aprovada') THEN
   RAISE EXCEPTION 'Possível duplicidade com correção antiga já contabilizada.'
     USING ERRCODE='23505';
 END IF;
 INSERT INTO public.eletivas_correcoes(
   competencia_id,prestador_id,competencia_origem,aihs,valor,
   fonte_origem,referencia_origem,documento_sei,motivo,
   status,fingerprint,criado_por)
 VALUES(p_comp,v.prestador_id,p_origem,lista,p_valor,trim(p_fonte),
   trim(p_referencia),trim(p_sei),trim(p_motivo),
   'em_analise',chave,auth.uid())
 RETURNING id INTO nova;
 RETURN nova;
END;$include$;
REVOKE ALL ON FUNCTION public.ec_incluir_correcao(uuid,text,text[],numeric,text,text,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_incluir_correcao(uuid,text,text[],numeric,text,text,text,text)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.ec_revisar_correcao(
 p_id uuid,p_status text,p_justificativa text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $review$
DECLARE reg public.eletivas_correcoes%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Revisão de correção restrita a ACP/Admin.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO reg FROM public.eletivas_correcoes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR reg.status NOT IN ('em_analise','duplicada') THEN
   RAISE EXCEPTION 'Correção inexistente ou já revisada.' USING ERRCODE='23514';
 END IF;
 IF p_status IS NULL OR p_status NOT IN('aprovada','rejeitada')
   OR length(trim(coalesce(p_justificativa,'')))<15 THEN
   RAISE EXCEPTION 'Informe aprovação/rejeição e justificativa de 15 caracteres.'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
   WHERE id=reg.competencia_id AND status='encerrada') THEN
   RAISE EXCEPTION 'Correção de competência encerrada é imutável.'
     USING ERRCODE='23514';
 END IF;
 IF p_status='aprovada' AND EXISTS(
   SELECT 1 FROM public.eletivas_correcoes x
   WHERE x.prestador_id=reg.prestador_id AND x.fingerprint=reg.fingerprint
     AND x.status='aprovada' AND x.id<>reg.id) THEN
   RAISE EXCEPTION 'Correção já aprovada em outra competência. Não contabilizar duas vezes.'
     USING ERRCODE='23505';
 END IF;
 UPDATE public.eletivas_correcoes
  SET status=p_status,revisado_por=auth.uid(),revisado_em=now(),
    justificativa_revisao=trim(p_justificativa)
  WHERE id=p_id;
END;$review$;
REVOKE ALL ON FUNCTION public.ec_revisar_correcao(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_revisar_correcao(uuid,text,text) TO authenticated;

-- Totais de itens/recortes derivados da mesma função ec_valor_item de fechamento.
CREATE OR REPLACE FUNCTION public.ec_valor_item(
 p_categoria text,p_situacao text,p_decisao text,p_publicado numeric,p_esperado numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $valor$
 SELECT CASE
  WHEN p_categoria='faec_fxmac' OR p_decisao='erro'
    OR p_decisao='analise' OR p_situacao='pendente' THEN 0::numeric
  WHEN p_decisao='aceito' OR p_situacao IN('ok','info') THEN p_publicado
  WHEN p_publicado<=0 THEN 0::numeric
  WHEN p_esperado>0 THEN least(p_publicado,p_esperado)
  ELSE p_publicado
 END;
$valor$;

-- Mantém todas as conferências de fechamento das fases anteriores.
-- A única mudança aqui é somar exclusivamente correções NORMALIZADAS aprovadas.
CREATE OR REPLACE FUNCTION public.ec_encerrar(p_comp uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v public.eletivas_competencias%ROWTYPE;
  v_total numeric := 0;
  v_ajustes numeric := 0;
  v_doc jsonb;
  v_corr jsonb;
  v_fiscais text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(),ARRAY['admin','acp']::public.app_role[]) THEN
    RAISE EXCEPTION 'Perfil não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
  IF NOT FOUND OR v.status='encerrada' THEN
    RAISE EXCEPTION 'Competência inexistente ou já encerrada.' USING ERRCODE='23514';
  END IF;
  IF v.ec_origem_execucao='navegador' AND (v.ec_validado_por IS NULL OR v.ec_validado_em IS NULL) THEN
    RAISE EXCEPTION 'Execução local requer validação fiscal expressa antes de encerrar.'
      USING ERRCODE='23514';
  END IF;
  IF v.ec_execucao_id IS NULL OR v.ec_fontes_snapshot IS NULL OR v.ec_motor_versao IS NULL THEN
    RAISE EXCEPTION 'É necessária execução validada do motor com manifesto das evidências antes do encerramento.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.eletivas_eventos ev
    WHERE ev.competencia_id=p_comp AND ev.tipo IN ('motor_execucao_v2','motor_execucao_local')
      AND ev.dados->>'execucao_id'=v.ec_execucao_id::text
  ) THEN
    RAISE EXCEPTION 'Não existe trilha de execução emitida pelo motor autorizado.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.eletivas_itens i
    WHERE i.competencia_id=p_comp AND i.origem='parser_validado'
      AND (i.ec_execucao_id IS DISTINCT FROM v.ec_execucao_id)
  ) THEN
    RAISE EXCEPTION 'Itens processados não correspondem à execução atual.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v.ec_fontes_snapshot) f
      LEFT JOIN public.eletivas_arquivos a ON a.id=(f->>'id')::uuid
     WHERE a.id IS NULL OR a.competencia_id IS DISTINCT FROM p_comp
       OR a.sha256 IS DISTINCT FROM f->>'sha256'
       OR a.categoria IS DISTINCT FROM f->>'categoria'
  ) THEN
    RAISE EXCEPTION 'Manifesto de arquivos da execução não coincide com as evidências atuais.' USING ERRCODE='23514';
  END IF;
  -- A presença de s_mac_ms é mandatória para competências >= 07/2026.
  IF (split_part(v.competencia,'/',2)::integer * 100
      + split_part(v.competencia,'/',1)::integer) >= 202607
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v.ec_fontes_snapshot) f
       WHERE f->>'categoria'='s_mac_ms'
     ) THEN
    RAISE EXCEPTION 'MAC múltiplas/sequenciais é obrigatório desde 07/2026.'
      USING ERRCODE='23514';
  END IF;

  IF (SELECT count(DISTINCT categoria)
      FROM public.eletivas_arquivos
      WHERE competencia_id=p_comp
        AND categoria IN ('dbf_faec','dbf_mac','s_faec','s_mac')) <> 4 THEN
    RAISE EXCEPTION 'Importe as quatro fontes obrigatórias: DBF FAEC/MAC e SES FAEC/MAC.'
      USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp
    ) OR EXISTS (
      SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp
      AND (conferido_por IS NULL
        OR (situacao IN ('pendente','div','nc','fora') AND decisao IS NULL))
    ) THEN
    RAISE EXCEPTION 'É necessário conferir os itens e tratar cada pendência.'
      USING ERRCODE='23514';
  END IF;

  v_doc := v.documentos;
  IF COALESCE(v_doc->>'rtma_numero','')=''
     OR COALESCE(v_doc->>'analise_numero','')=''
     OR COALESCE(v_doc->>'rtma_link','') !~ '^https?://'
     OR COALESCE(v_doc->>'analise_link','') !~ '^https?://' THEN
    RAISE EXCEPTION 'Registre os números e links SEI do Relatório Técnico e da Análise.'
      USING ERRCODE='23514';
  END IF;

  IF jsonb_typeof(v_doc->'fiscais_rtma') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_doc->'fiscais_rtma')<2
     OR jsonb_typeof(v_doc->'fiscais_analise') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_doc->'fiscais_analise')<1 THEN
    RAISE EXCEPTION 'Confirme dois fiscais no Relatório Técnico e um na Análise.'
      USING ERRCODE='23514';
  END IF;
  IF (
    SELECT count(DISTINCT trim(value))
    FROM jsonb_array_elements_text(v_doc->'fiscais_rtma')
  ) < 2 THEN
    RAISE EXCEPTION 'Os dois fiscais do Relatório Técnico devem ser distintos.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.eletivas_correcoes c
      WHERE c.competencia_id=p_comp AND c.status IN('em_analise','duplicada')) THEN
    RAISE EXCEPTION 'Correções pendentes ou duplicadas devem ser revisadas antes de encerrar.'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_itens i
     WHERE i.competencia_id=p_comp AND i.decisao='analise') THEN
    RAISE EXCEPTION 'Existem itens com decisão em análise ainda aberta.' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(valor),0) INTO v_ajustes
    FROM public.eletivas_correcoes
    WHERE competencia_id=p_comp AND status='aprovada';

  SELECT COALESCE(
    sum(public.ec_valor_item(categoria,situacao,decisao,valor_publicado,valor_esperado)),0
  ) INTO v_total
  FROM public.eletivas_itens WHERE competencia_id=p_comp;
  v_total := round(v_total+v_ajustes,2);
  IF v_total<0 THEN
    RAISE EXCEPTION 'Valor líquido negativo: confira correções.'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.eletivas_competencias SET
    valor_fechado=v_total,status='encerrada',fechado_em=now(),fechado_por=auth.uid()
    WHERE id=p_comp;
  RETURN v_total;
END;
$$;



REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_encerrar(uuid) TO authenticated;

-- Correções em análise e decisões de aguardar documentação impedem
-- validação e encerramento, sem ignorar conferência individual prévia.
CREATE OR REPLACE FUNCTION public.ec_validar_pendencias_fase4()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $valid$
BEGIN
 IF (NEW.status='encerrada' AND NEW.status IS DISTINCT FROM OLD.status)
   OR (NEW.ec_validado_em IS NOT NULL
      AND NEW.ec_validado_em IS DISTINCT FROM OLD.ec_validado_em) THEN
   IF EXISTS(SELECT 1 FROM public.eletivas_itens i
     WHERE i.competencia_id=NEW.id AND i.decisao='analise') THEN
     RAISE EXCEPTION 'Há itens ainda em análise, sem solução fiscal final.'
       USING ERRCODE='23514';
   END IF;
   IF EXISTS(SELECT 1 FROM public.eletivas_correcoes c
     WHERE c.competencia_id=NEW.id AND c.status IN('em_analise','duplicada')) THEN
     RAISE EXCEPTION 'Há correções pendentes ou duplicadas; revise antes de validar.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;$valid$;
DROP TRIGGER IF EXISTS ec_validar_pendencias_fase4_guard ON public.eletivas_competencias;
CREATE TRIGGER ec_validar_pendencias_fase4_guard BEFORE UPDATE
 ON public.eletivas_competencias FOR EACH ROW
 EXECUTE FUNCTION public.ec_validar_pendencias_fase4();

CREATE OR REPLACE FUNCTION public.ec_resumo_financeiro(p_comp uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $resumo$
WITH base AS(
 SELECT i.categoria,i.situacao,i.decisao,i.conferido_em,
    i.valor_publicado publicado,i.valor_esperado esperado,
    public.ec_valor_item(i.categoria,i.situacao,i.decisao,
      i.valor_publicado,i.valor_esperado) admitido,
    (i.categoria='faec_fxmac') controle
 FROM public.eletivas_itens i WHERE i.competencia_id=p_comp
), por_categoria AS (
 SELECT categoria,count(*) itens,
   round(sum(publicado),2) publicado,round(sum(esperado),2) esperado,
   round(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),2) admitido
 FROM base GROUP BY categoria
), totais AS (
 SELECT count(*) itens,
  count(*) FILTER(WHERE conferido_em IS NULL) sem_conferencia,
  count(*) FILTER(WHERE situacao IN('div','nc','fora','pendente')
    AND decisao IS NULL) pendencias_sem_decisao,
  count(*) FILTER(WHERE decisao='analise') em_analise,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE publicado END),0),2) publicado,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE esperado END),0),2) esperado,
  round(coalesce(sum(CASE WHEN controle THEN 0::numeric ELSE admitido END),0),2) admitido,
  round(coalesce(sum(CASE WHEN controle THEN publicado ELSE 0::numeric END),0),2) controles,
  round(coalesce(sum(CASE WHEN NOT controle AND situacao='pendente'
    THEN esperado ELSE 0::numeric END),0),2) pendente_valor,
  round(coalesce(sum(CASE WHEN NOT controle AND (
    decisao='oficio' OR (situacao IN('div','nc') AND decisao IS NULL))
    THEN greatest(esperado-publicado,0) ELSE 0::numeric END),0),2) em_discussao
 FROM base
), correcoes AS (
 SELECT round(coalesce(sum(valor) FILTER(WHERE status='aprovada'),0),2) valor,
  count(*) FILTER(WHERE status IN('em_analise','duplicada')) pendentes
 FROM public.eletivas_correcoes WHERE competencia_id=p_comp
)
SELECT jsonb_build_object(
 'competencia_id',p_comp,
 'itens',totais.itens,'sem_conferencia',totais.sem_conferencia,
 'pendencias_sem_decisao',totais.pendencias_sem_decisao,
 'em_analise',totais.em_analise,
 'publicado',totais.publicado,'esperado',totais.esperado,
 'fiscalmente_admitido',totais.admitido,
 'controle_faec_fxmac_nao_somado',totais.controles,
 'pendente_valor',totais.pendente_valor,'em_discussao',totais.em_discussao,
 'correcoes',correcoes.valor,'correcoes_pendentes',correcoes.pendentes,
 'total_com_correcoes',round(totais.admitido+correcoes.valor,2),
 'categorias',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'categoria',categoria,'itens',itens,'publicado',publicado,
    'esperado',esperado,'fiscalmente_admitido',admitido)
    ORDER BY categoria) FROM por_categoria),'[]'::jsonb)
)
FROM totais CROSS JOIN correcoes;
$resumo$;
REVOKE ALL ON FUNCTION public.ec_resumo_financeiro(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_resumo_financeiro(uuid) TO authenticated;
COMMIT;
