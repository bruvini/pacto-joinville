-- Fases 7/8: trilha de homologação e autorização de substituição.
-- Não modifica conciliação, valores, fechamento ou integração existentes.
-- A autorização é administrativa; NÃO ativa o módulo em produção automaticamente.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL
 OR to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL THEN
  RAISE EXCEPTION 'Aplique primeiro as migrations institucionais de Eletivas.'
   USING ERRCODE='23514';
 END IF;
END $preflight$;

CREATE TABLE public.eletivas_fase8_validacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 perfil text NOT NULL CHECK(perfil IN('abril_2026','julho_2026','agosto_ou_posterior')),
 execucao_id uuid NOT NULL,
 hash_html text NOT NULL CHECK(hash_html~'^[0-9a-f]{64}$'),
 hash_react text NOT NULL CHECK(hash_react~'^[0-9a-f]{64}$'),
 hash_manifesto text NOT NULL CHECK(hash_manifesto~'^[0-9a-f]{64}$'),
 divergencias_financeiras integer NOT NULL CHECK(divergencias_financeiras>=0),
 divergencias_funcionais integer NOT NULL CHECK(divergencias_funcionais>=0),
 verificacoes jsonb NOT NULL,
 documento_sei text NOT NULL CHECK(length(btrim(documento_sei))>=7),
 justificativa text NOT NULL CHECK(length(btrim(justificativa))>=30),
 validacao_fiscal_declarada boolean NOT NULL DEFAULT false,
 responsavel uuid NOT NULL REFERENCES auth.users(id),
 validado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(prestador_id,perfil),UNIQUE(competencia_id)
);

CREATE TABLE public.eletivas_fase8_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 validacao_id uuid REFERENCES public.eletivas_fase8_validacoes(id) ON DELETE RESTRICT,
 prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 acao text NOT NULL CHECK(acao IN('validacao','atualizacao','autorizacao','revogacao')),
 dados jsonb NOT NULL DEFAULT '{}'::jsonb,
 responsavel uuid NOT NULL REFERENCES auth.users(id),
 ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.eletivas_fase8_autorizacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prestador_id uuid NOT NULL UNIQUE REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 autorizado_em timestamptz NOT NULL DEFAULT now(),
 autorizado_por uuid NOT NULL REFERENCES auth.users(id),
 justificativa text NOT NULL CHECK(length(btrim(justificativa))>=30),
 documento_sei text NOT NULL CHECK(length(btrim(documento_sei))>=7),
 revogado_em timestamptz,
 revogado_por uuid REFERENCES auth.users(id),
 motivo_revogacao text,
 CHECK((revogado_em IS NULL AND revogado_por IS NULL)
  OR (revogado_em IS NOT NULL AND revogado_por IS NOT NULL))
);

DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'eletivas_fase8_validacoes','eletivas_fase8_eventos','eletivas_fase8_autorizacoes'
 ] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY ec_fase8_leitura ON public.%I FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(),
  ARRAY[''admin'',''acp'']::public.app_role[]))',t);
 END LOOP;
END $rls$;

CREATE OR REPLACE FUNCTION public.ec_fase8_verificacoes_ok(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $guard$
 SELECT coalesce(jsonb_typeof(p)='object' AND
  (p->>'importacao')='true' AND (p->>'permissoes')='true' AND
  (p->>'reprocessamento')='true' AND (p->>'decisoes')='true' AND
  (p->>'fechamento')='true' AND (p->>'integracao')='true' AND
  (p->>'relatorios')='true' AND (p->>'exportacoes')='true' AND
  (p->>'manifesto_sha')='true' AND (p->>'confronto_golden')='true',false);
$guard$;

CREATE OR REPLACE FUNCTION public.ec_fase8_registrar(
 p_comp uuid,p_perfil text,p_html_sha text,p_react_sha text,p_manifesto_sha text,
 p_financeiras integer,p_funcionais integer,p_verificacoes jsonb,
 p_documento_sei text,p_justificativa text,p_declaracao boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $registrar$
DECLARE c public.eletivas_competencias%ROWTYPE;v uuid;acao text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Registro fiscal exige ACP/Admin.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR SHARE;
 IF NOT FOUND OR c.arquivada_em IS NOT NULL OR c.ec_execucao_id IS NULL THEN
   RAISE EXCEPTION 'Competência inexistente, arquivada ou sem execução auditável.'
    USING ERRCODE='23514';
 END IF;
 IF NOT ((p_perfil='abril_2026' AND c.competencia='04/2026') OR
   (p_perfil='julho_2026' AND c.competencia='07/2026') OR
   (p_perfil='agosto_ou_posterior' AND
    (substring(c.competencia from 4 for 4)::int*100+
     substring(c.competencia from 1 for 2)::int)>=202608)) THEN
    RAISE EXCEPTION 'Perfil e competência divergentes.' USING ERRCODE='23514';
 END IF;
 IF p_html_sha !~ '^[0-9a-f]{64}$' OR p_react_sha !~ '^[0-9a-f]{64}$'
  OR p_manifesto_sha !~ '^[0-9a-f]{64}$' OR
  p_financeiras IS DISTINCT FROM 0 OR p_funcionais IS DISTINCT FROM 0 OR
  NOT public.ec_fase8_verificacoes_ok(p_verificacoes) OR
  p_declaracao IS DISTINCT FROM true OR
  length(btrim(coalesce(p_documento_sei,'')))<7 OR
  length(btrim(coalesce(p_justificativa,'')))<30 THEN
   RAISE EXCEPTION 'Não é possível registrar homologação: hashes, zero divergências,
    dez testes, confirmação fiscal e referência SEI são obrigatórios.'
    USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_fase8_autorizacoes
   WHERE prestador_id=c.prestador_id AND revogado_em IS NULL) THEN
   RAISE EXCEPTION 'Substituição já autorizada; revogue formalmente antes de nova validação.'
    USING ERRCODE='23514';
 END IF;
 acao:=CASE WHEN EXISTS(SELECT 1 FROM public.eletivas_fase8_validacoes
   WHERE prestador_id=c.prestador_id AND perfil=p_perfil) THEN 'atualizacao' ELSE 'validacao' END;
 INSERT INTO public.eletivas_fase8_validacoes
 (competencia_id,prestador_id,perfil,execucao_id,hash_html,hash_react,hash_manifesto,
 divergencias_financeiras,divergencias_funcionais,verificacoes,documento_sei,
 justificativa,validacao_fiscal_declarada,responsavel)
 VALUES(c.id,c.prestador_id,p_perfil,c.ec_execucao_id,p_html_sha,p_react_sha,
 p_manifesto_sha,0,0,p_verificacoes,btrim(p_documento_sei),btrim(p_justificativa),
 true,auth.uid())
 ON CONFLICT(prestador_id,perfil) DO UPDATE SET
 competencia_id=EXCLUDED.competencia_id,execucao_id=EXCLUDED.execucao_id,
 hash_html=EXCLUDED.hash_html,hash_react=EXCLUDED.hash_react,
 hash_manifesto=EXCLUDED.hash_manifesto,
 divergencias_financeiras=0,divergencias_funcionais=0,
 verificacoes=EXCLUDED.verificacoes,documento_sei=EXCLUDED.documento_sei,
 justificativa=EXCLUDED.justificativa,validacao_fiscal_declarada=true,
 responsavel=auth.uid(),validado_em=now()
 RETURNING id INTO v;
 INSERT INTO public.eletivas_fase8_eventos(validacao_id,prestador_id,
   acao,dados,responsavel)
 VALUES(v,c.prestador_id,acao,jsonb_build_object('perfil',p_perfil,
   'execucao_id',c.ec_execucao_id,'hash_html',p_html_sha,
   'hash_react',p_react_sha,'hash_manifesto',p_manifesto_sha,
   'documento_sei',p_documento_sei,'divergencias_financeiras',0,
   'divergencias_funcionais',0),auth.uid());
 RETURN v;
END $registrar$;

CREATE OR REPLACE FUNCTION public.ec_fase8_prontidao(p_prestador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $pronto$
DECLARE validos integer; faltantes text[]; autorizado boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Consulta de prontidão exclusiva ACP/Admin.' USING ERRCODE='42501';
 END IF;
 SELECT count(*),array_agg(v.perfil)
 INTO validos,faltantes FROM public.eletivas_fase8_validacoes v
 JOIN public.eletivas_competencias c ON c.id=v.competencia_id
 WHERE v.prestador_id=p_prestador AND
 c.prestador_id=p_prestador AND c.arquivada_em IS NULL AND
 c.ec_execucao_id=v.execucao_id AND
 v.divergencias_financeiras=0 AND v.divergencias_funcionais=0
 AND v.validacao_fiscal_declarada AND public.ec_fase8_verificacoes_ok(v.verificacoes);
 SELECT EXISTS(SELECT 1 FROM public.eletivas_fase8_autorizacoes
  WHERE prestador_id=p_prestador AND revogado_em IS NULL) INTO autorizado;
 RETURN jsonb_build_object('perfis_validos',validos,
 'abril',coalesce('abril_2026'=ANY(faltantes),false),
 'julho',coalesce('julho_2026'=ANY(faltantes),false),
 'agosto_ou_posterior',coalesce('agosto_ou_posterior'=ANY(faltantes),false),
 'apto_a_solicitar_autorizacao',validos=3,
 'autorizacao_administrativa',autorizado AND validos=3,
 'autorizacao_stale',autorizado AND validos<>3,
 'implantacao_automatica',false);
END $pronto$;

CREATE OR REPLACE FUNCTION public.ec_fase8_autorizar(
 p_prestador uuid,p_documento_sei text,p_justificativa text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $autorizar$
DECLARE estado jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin']::public.app_role[]) THEN
   RAISE EXCEPTION 'Autorização de substituição exclusiva de Admin.'
    USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ec-fase8-'||p_prestador::text));
 estado:=public.ec_fase8_prontidao(p_prestador);
 IF (estado->>'apto_a_solicitar_autorizacao')<>'true'
 OR length(btrim(coalesce(p_documento_sei,'')))<7 OR
 length(btrim(coalesce(p_justificativa,'')))<30 THEN
   RAISE EXCEPTION 'Não existe autorização: faltam três perfis válidos
    ou os documentos administrativos.' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.eletivas_fase8_autorizacoes(prestador_id,documento_sei,
 justificativa,autorizado_por)
 VALUES(p_prestador,btrim(p_documento_sei),btrim(p_justificativa),auth.uid())
 ON CONFLICT(prestador_id) DO UPDATE SET autorizado_em=now(),
 autorizado_por=auth.uid(),justificativa=EXCLUDED.justificativa,
 documento_sei=EXCLUDED.documento_sei,revogado_em=NULL,revogado_por=NULL,
 motivo_revogacao=NULL;
 INSERT INTO public.eletivas_fase8_eventos(prestador_id,acao,dados,responsavel)
 VALUES(p_prestador,'autorizacao',jsonb_build_object('documento_sei',p_documento_sei,
  'substituicao_automatica',false),auth.uid());
END $autorizar$;

CREATE OR REPLACE FUNCTION public.ec_fase8_revogar(
 p_prestador uuid,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $revogar$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Revogação exclusiva Admin.' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_motivo,'')))<30 THEN
  RAISE EXCEPTION 'Informe motivo formal de 30 caracteres.' USING ERRCODE='23514';
 END IF;
 UPDATE public.eletivas_fase8_autorizacoes
 SET revogado_em=now(),revogado_por=auth.uid(),motivo_revogacao=btrim(p_motivo)
 WHERE prestador_id=p_prestador AND revogado_em IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Não há autorização ativa.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.eletivas_fase8_eventos(prestador_id,acao,dados,responsavel)
 VALUES(p_prestador,'revogacao',jsonb_build_object('motivo',p_motivo),auth.uid());
END $revogar$;

REVOKE ALL ON FUNCTION public.ec_fase8_verificacoes_ok(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_fase8_verificacoes_ok(jsonb) TO authenticated;
DO $acesso$
DECLARE p text;
BEGIN
 FOREACH p IN ARRAY ARRAY[
 'public.ec_fase8_registrar(uuid,text,text,text,text,integer,integer,jsonb,text,text,boolean)',
 'public.ec_fase8_prontidao(uuid)',
 'public.ec_fase8_autorizar(uuid,text,text)',
 'public.ec_fase8_revogar(uuid,text)'
 ] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||p||' FROM PUBLIC,anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||p||' TO authenticated';
 END LOOP;
END $acesso$;
COMMIT;
