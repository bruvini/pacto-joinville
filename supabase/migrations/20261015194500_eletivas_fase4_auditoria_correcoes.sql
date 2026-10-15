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
