-- Fase 5 · Ciclo de auditoria operacional, comunicações e regularização FPO.
-- HTML v2.42.2: Central para faixa, GEMAS apenas após produção aprovada;
-- mensagens preparadas, NUNCA enviadas automaticamente.
-- Não altera o cálculo financeiro, os atestos nem lancamentos_pagamento.
BEGIN;
DO $pre$ BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL
 OR to_regclass('public.eletivas_itens') IS NULL
 OR to_regclass('public.eletivas_correcoes') IS NULL
 OR to_regclass('public.eletivas_decisoes_revisoes') IS NULL
 OR to_regprocedure('public.ec_decidir_item(uuid,text,text,integer,text)') IS NULL THEN
  RAISE EXCEPTION 'Fase 5 exige as migrations de Eletivas 0–4.'
   USING ERRCODE='23514';
 END IF;
END $pre$;

CREATE TABLE public.eletivas_fpo_fluxos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
 item_id uuid REFERENCES public.eletivas_itens(id) ON DELETE SET NULL,
 aih text NOT NULL CHECK(aih ~ '^[0-9]{13}$'),
 etapa smallint NOT NULL DEFAULT 1 CHECK(etapa BETWEEN 1 AND 8),
 situacao text NOT NULL DEFAULT 'ativo' CHECK(situacao IN('ativo','cancelado')),
 valor_estimado numeric(16,2) NOT NULL DEFAULT 0 CHECK(valor_estimado>=0),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 documento_sei text,
 observacao text,
 criado_por uuid NOT NULL REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX ec_fpo_fluxo_aih_ativo
 ON public.eletivas_fpo_fluxos(competencia_id,aih) WHERE situacao='ativo';
CREATE INDEX ec_fpo_fluxo_comp ON public.eletivas_fpo_fluxos(competencia_id,etapa);

CREATE TABLE public.eletivas_fpo_fluxos_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 fluxo_id uuid NOT NULL REFERENCES public.eletivas_fpo_fluxos(id) ON DELETE CASCADE,
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
 etapa_anterior smallint,etapa_nova smallint,
 acao text NOT NULL CHECK(acao IN('inicio','avanco','reabertura','cancelamento','correcao_parcial','correcao_recebida')),
 documento_sei text,justificativa text NOT NULL,
 autor uuid NOT NULL REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ec_fpo_fluxo_eventos_comp ON public.eletivas_fpo_fluxos_eventos(competencia_id,criado_em DESC);

-- O vínculo usa uma tabela própria: não altera nem soma a correção original.
CREATE TABLE public.eletivas_fpo_vinculos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fluxo_id uuid NOT NULL REFERENCES public.eletivas_fpo_fluxos(id) ON DELETE CASCADE,
 correcao_id uuid NOT NULL UNIQUE REFERENCES public.eletivas_correcoes(id) ON DELETE RESTRICT,
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
 justificativa text NOT NULL CHECK(length(btrim(justificativa))>=15),
 vinculado_por uuid NOT NULL REFERENCES auth.users(id),
 vinculado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.eletivas_comunicacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
 tipo text NOT NULL CHECK(tipo IN('aih','regflow','ec_gemas')),
 referencia text NOT NULL,
 item_id uuid REFERENCES public.eletivas_itens(id) ON DELETE SET NULL,
 aih text CHECK(aih IS NULL OR aih ~ '^[0-9]{13}$'),
 fluxo_id uuid REFERENCES public.eletivas_fpo_fluxos(id) ON DELETE SET NULL,
 destino text NOT NULL CHECK(destino IN('regulacao','gemas','interno','none')),
 situacao text NOT NULL CHECK(situacao IN('fila','interno','nenhuma','enviada')),
 assinatura text NOT NULL CHECK(assinatura ~ '^[0-9a-f]{32}$'),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 enviada_em timestamptz,enviada_por uuid REFERENCES auth.users(id),
 protocolo text,assunto text,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(competencia_id,tipo,referencia),
 CONSTRAINT ec_com_situacao_coerente CHECK(
  (situacao='fila' AND destino IN('regulacao','gemas')) OR
  (situacao='enviada' AND destino IN('regulacao','gemas')
    AND enviada_em IS NOT NULL AND enviada_por IS NOT NULL AND protocolo IS NOT NULL) OR
  (situacao='interno' AND destino='interno') OR
  (situacao='nenhuma' AND destino='none')
 )
);
CREATE INDEX ec_com_destino_idx ON public.eletivas_comunicacoes(competencia_id,destino,situacao);
-- Uma AIH somente uma vez por competência, mesmo presente em vários componentes.
CREATE UNIQUE INDEX ec_com_aih_comp_unico ON public.eletivas_comunicacoes(competencia_id,aih)
 WHERE tipo='aih' AND aih IS NOT NULL;

CREATE TABLE public.eletivas_comunicacoes_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 comunicacao_id uuid NOT NULL REFERENCES public.eletivas_comunicacoes(id) ON DELETE CASCADE,
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE CASCADE,
 acao text NOT NULL CHECK(acao IN('rotear','retirar','enviar','reabrir')),
 destino_anterior text,situacao_anterior text,
 destino_novo text NOT NULL,situacao_nova text NOT NULL,
 protocolo text,assunto text,conteudo_md5 text,
 justificativa text NOT NULL,
 autor uuid NOT NULL REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ec_com_eventos_comp ON public.eletivas_comunicacoes_eventos(competencia_id,registrado_em DESC);

-- Cinco tabelas privadas, leitura para atores do módulo; qualquer escrita somente via RPC.
DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['eletivas_fpo_fluxos','eletivas_fpo_fluxos_eventos',
 'eletivas_fpo_vinculos','eletivas_comunicacoes','eletivas_comunicacoes_eventos']
 LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format(
 'CREATE POLICY ec_leitura_fase5 ON public.%I FOR SELECT TO authenticated USING
 (auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(),
 ARRAY[''admin'',''acp'',''aco'']::public.app_role[]))',t);
 END LOOP;
END $rls$;

CREATE OR REPLACE FUNCTION public.ec_fase5_autorizar(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $auth$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Ação reservada à ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.eletivas_competencias
  WHERE id=p_comp AND arquivada_em IS NULL) THEN
  RAISE EXCEPTION 'Competência inexistente ou arquivada.' USING ERRCODE='23514';
 END IF;
END $auth$;

CREATE OR REPLACE FUNCTION public.ec_fpo_iniciar(
 p_item uuid,p_aih text,p_valor numeric,p_justificativa text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $start$
DECLARE i public.eletivas_itens%ROWTYPE;
 c public.eletivas_competencias%ROWTYPE;
 v uuid;
BEGIN
 SELECT * INTO i FROM public.eletivas_itens WHERE id=p_item;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
 PERFORM public.ec_fase5_autorizar(i.competencia_id);
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=i.competencia_id FOR UPDATE;
 IF p_aih !~ '^[0-9]{13}$' OR length(btrim(coalesce(p_justificativa,'')))<15
  OR p_valor<0 OR p_valor IS NULL THEN
  RAISE EXCEPTION 'AIH de 13 dígitos, valor estimado e justificativa (15 caracteres) obrigatórios.'
   USING ERRCODE='23514';
 END IF;
 IF i.categoria NOT IN('faec_mult','mac_mult','mac_fxfed','mac_fxfaec') THEN
  RAISE EXCEPTION 'A regularização FPO deve se referir a uma linha de múltiplas/faixa.'
   USING ERRCODE='23514';
 END IF;
 IF c.status='encerrada' THEN
  RAISE EXCEPTION 'Abertura de novo fluxo em competência encerrada exige revisão formal.'
   USING ERRCODE='23514';
 END IF;
 SELECT id INTO v FROM public.eletivas_fpo_fluxos
  WHERE competencia_id=c.id AND aih=p_aih AND situacao='ativo';
 IF FOUND THEN RETURN v; END IF;
 INSERT INTO public.eletivas_fpo_fluxos(competencia_id,item_id,aih,
  valor_estimado,observacao,criado_por,atualizado_por)
 VALUES(c.id,i.id,p_aih,round(p_valor,2),btrim(p_justificativa),auth.uid(),auth.uid())
 RETURNING id INTO v;
 INSERT INTO public.eletivas_fpo_fluxos_eventos(fluxo_id,competencia_id,etapa_anterior,
  etapa_nova,acao,justificativa,autor)
 VALUES(v,c.id,0,1,'inicio',btrim(p_justificativa),auth.uid());
 RETURN v;
END $start$;

CREATE OR REPLACE FUNCTION public.ec_fpo_mudar_etapa(
 p_fluxo uuid,p_etapa integer,p_versao integer,p_documento_sei text,p_justificativa text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $step$
DECLARE f public.eletivas_fpo_fluxos%ROWTYPE;
 acao text;
BEGIN
 SELECT * INTO f FROM public.eletivas_fpo_fluxos WHERE id=p_fluxo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fluxo FPO não encontrado.'; END IF;
 PERFORM public.ec_fase5_autorizar(f.competencia_id);
 IF f.situacao<>'ativo' OR f.versao<>p_versao THEN
  RAISE EXCEPTION 'Fluxo cancelado ou atualizado por outro fiscal.' USING ERRCODE='40001';
 END IF;
 IF p_etapa NOT BETWEEN 1 AND 7 OR p_etapa=f.etapa OR p_etapa>f.etapa+1
   OR length(btrim(coalesce(p_justificativa,'')))<15 THEN
  RAISE EXCEPTION 'Etapa inválida ou justificativa insuficiente; avance uma etapa por vez.'
   USING ERRCODE='23514';
 END IF;
 IF p_etapa>1 AND length(btrim(coalesce(p_documento_sei,'')))<5 THEN
  RAISE EXCEPTION 'A partir da FPO corrigida, informe comprovação documental/SEI.'
   USING ERRCODE='23514';
 END IF;
 IF f.etapa=8 THEN
  RAISE EXCEPTION 'Fluxo concluído pela correção recebida. Consulte o vínculo.'
   USING ERRCODE='23514';
 END IF;
 acao:=CASE WHEN p_etapa<f.etapa THEN 'reabertura' ELSE 'avanco' END;
 UPDATE public.eletivas_fpo_fluxos
 SET etapa=p_etapa,versao=versao+1,documento_sei=nullif(btrim(p_documento_sei),''),
 observacao=btrim(p_justificativa),atualizado_em=now(),atualizado_por=auth.uid()
 WHERE id=f.id;
 INSERT INTO public.eletivas_fpo_fluxos_eventos(fluxo_id,competencia_id,etapa_anterior,
  etapa_nova,acao,documento_sei,justificativa,autor)
 VALUES(f.id,f.competencia_id,f.etapa,p_etapa,acao,
  nullif(btrim(p_documento_sei),''),btrim(p_justificativa),auth.uid());
 RETURN f.versao+1;
END $step$;

-- Correção aprovada em competência seguinte: relação 1:1, não duplica no atesto.
CREATE OR REPLACE FUNCTION public.ec_fpo_vincular_correcao(
 p_fluxo uuid,p_correcao uuid,p_justificativa text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $link$
DECLARE f public.eletivas_fpo_fluxos%ROWTYPE;c public.eletivas_correcoes%ROWTYPE;
 recebido numeric;proxima integer;anterior integer;
BEGIN
 SELECT * INTO f FROM public.eletivas_fpo_fluxos WHERE id=p_fluxo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fluxo inexistente.'; END IF;
 PERFORM public.ec_fase5_autorizar(f.competencia_id);
 SELECT * INTO c FROM public.eletivas_correcoes WHERE id=p_correcao FOR UPDATE;
 IF NOT FOUND OR f.situacao<>'ativo' OR f.etapa<5 OR c.status<>'aprovada'
  OR c.competencia_origem IS DISTINCT FROM
    (SELECT competencia FROM public.eletivas_competencias WHERE id=f.competencia_id)
  OR c.prestador_id IS DISTINCT FROM
    (SELECT prestador_id FROM public.eletivas_competencias WHERE id=f.competencia_id)
  OR length(btrim(coalesce(p_justificativa,'')))<15 THEN
  RAISE EXCEPTION 'Correção precisa estar aprovada, corresponder à origem e ter justificativa.'
   USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_fpo_vinculos WHERE correcao_id=p_correcao) THEN
  RAISE EXCEPTION 'Correção já vinculada a um fluxo. Duplicação bloqueada.'
   USING ERRCODE='23505';
 END IF;
 INSERT INTO public.eletivas_fpo_vinculos(fluxo_id,correcao_id,competencia_id,
  justificativa,vinculado_por)
 VALUES(f.id,c.id,f.competencia_id,btrim(p_justificativa),auth.uid());
 SELECT coalesce(sum(c2.valor),0) INTO recebido
 FROM public.eletivas_fpo_vinculos v
 JOIN public.eletivas_correcoes c2 ON c2.id=v.correcao_id
 WHERE v.fluxo_id=f.id AND c2.status='aprovada';
 anterior:=f.etapa;
 proxima:=CASE WHEN f.valor_estimado>0 AND recebido>=f.valor_estimado-0.02
   THEN 8 ELSE greatest(f.etapa,7) END;
 UPDATE public.eletivas_fpo_fluxos
  SET etapa=proxima,versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid()
 WHERE id=f.id;
 INSERT INTO public.eletivas_fpo_fluxos_eventos(fluxo_id,competencia_id,
  etapa_anterior,etapa_nova,acao,justificativa,autor)
 VALUES(f.id,f.competencia_id,anterior,proxima,
  CASE WHEN proxima=8 THEN 'correcao_recebida' ELSE 'correcao_parcial' END,
  btrim(p_justificativa),auth.uid());
END $link$;

-- Assinatura gerada a partir da base atual, não calculada pelo navegador.
CREATE OR REPLACE FUNCTION public.ec_com_assinatura(
 p_comp uuid,p_tipo text,p_ref text
) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $sig$
DECLARE f public.eletivas_fpo_fluxos%ROWTYPE;i public.eletivas_itens%ROWTYPE; valor text;
BEGIN
 IF p_tipo='aih' THEN
  SELECT * INTO i FROM public.eletivas_itens
  WHERE id=p_ref::uuid AND competencia_id=p_comp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item de AIH não pertence à competência.'; END IF;
  RETURN md5(i.id::text||coalesce(i.detalhe::text,'')||
   coalesce(i.decisao_versao,0)::text||coalesce(i.justificativa,''));
 ELSIF p_tipo='regflow' THEN
  SELECT * INTO f FROM public.eletivas_fpo_fluxos
  WHERE id=p_ref::uuid AND competencia_id=p_comp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fluxo de regularização não encontrado.'; END IF;
  RETURN md5(f.id::text||f.versao::text||f.etapa::text||coalesce(f.documento_sei,''));
 ELSIF p_tipo='ec_gemas' THEN
  SELECT string_agg(i.id::text||':'||i.decisao_versao::text||':'||i.decisao||':'||
   coalesce(i.justificativa,''),'|' ORDER BY i.id::text)
  INTO valor FROM public.eletivas_itens i
  WHERE i.competencia_id=p_comp AND i.decisao IN('oficio','analise');
  IF valor IS NULL THEN RAISE EXCEPTION 'Sem decisões de ofício/análise para GEMAS.'; END IF;
  RETURN md5(valor);
 END IF;
 RAISE EXCEPTION 'Tipo de comunicação inválido.' USING ERRCODE='23514';
END $sig$;

CREATE OR REPLACE FUNCTION public.ec_com_rotear(
 p_comp uuid,p_tipo text,p_ref text,p_destino text,p_motivo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $route$
DECLARE i public.eletivas_itens%ROWTYPE;f public.eletivas_fpo_fluxos%ROWTYPE;
 rec public.eletivas_comunicacoes%ROWTYPE;estado text;
 classificacao text;chave text;hash text;ident_aih text;
BEGIN
 PERFORM public.ec_fase5_autorizar(p_comp);
 IF length(btrim(coalesce(p_motivo,'')))<10 THEN
  RAISE EXCEPTION 'Registre o motivo do encaminhamento (10 caracteres).' USING ERRCODE='23514';
 END IF;
 IF p_destino NOT IN('regulacao','gemas','interno','none') THEN
  RAISE EXCEPTION 'Destino não reconhecido.' USING ERRCODE='23514';
 END IF;
 IF p_tipo='aih' THEN
  SELECT * INTO i FROM public.eletivas_itens
  WHERE id=p_ref::uuid AND competencia_id=p_comp;
  IF NOT FOUND OR i.categoria NOT IN('faec_mult','mac_mult') THEN
   RAISE EXCEPTION 'Comunicação de faixa exige item de múltiplas da competência.'
    USING ERRCODE='23514';
  END IF;
  classificacao:=coalesce(i.detalhe->>'classificacao_auditor',
    i.detalhe->'perfil'->>'estado','review');
  IF NOT ((classificacao IN('bad','review') AND p_destino IN('regulacao','interno','none'))
    OR (classificacao='fpo' AND p_destino IN('interno','none'))) THEN
   RAISE EXCEPTION 'Destino incompatível com a faixa. Central trata faixa; FPO inicia internamente.'
    USING ERRCODE='23514';
  END IF;
  ident_aih:=coalesce(nullif(btrim(i.aih),''),
    nullif(btrim(i.detalhe->'perfil'->>'aih'),''),
    nullif(btrim(i.detalhe->>'aih'),''));
  IF ident_aih IS NULL OR ident_aih !~ '^[0-9]{13}$' THEN
    RAISE EXCEPTION 'Identifique uma AIH individual de 13 dígitos no dossiê antes de comunicar à Central.'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eletivas_comunicacoes outra
    WHERE outra.competencia_id=p_comp AND outra.tipo='aih'
      AND outra.aih=ident_aih AND outra.referencia<>p_ref) THEN
    RAISE EXCEPTION 'Esta AIH já possui encaminhamento nesta competência. Consulte o registro existente.'
      USING ERRCODE='23505';
  END IF;
  chave:=p_ref;
 ELSIF p_tipo='regflow' THEN
  SELECT * INTO f FROM public.eletivas_fpo_fluxos
  WHERE id=p_ref::uuid AND competencia_id=p_comp;
  IF NOT FOUND OR f.situacao<>'ativo' THEN RAISE EXCEPTION 'Fluxo FPO inválido.'; END IF;
  IF p_destino='gemas' AND f.etapa NOT BETWEEN 5 AND 7 THEN
   RAISE EXCEPTION 'GEMAS somente após produção aprovada (etapas 5–7).'
    USING ERRCODE='23514';
  END IF;
  IF p_destino NOT IN('gemas','interno','none') THEN
   RAISE EXCEPTION 'Fluxos de regularização não são enviados à Central.'
    USING ERRCODE='23514';
  END IF;
  chave:=p_ref;
 ELSIF p_tipo='ec_gemas' THEN
  IF p_ref<>'consolidado' OR p_destino NOT IN('gemas','none') THEN
   RAISE EXCEPTION 'O EC consolidado comunica somente à GEMAS.' USING ERRCODE='23514';
  END IF;
  chave:='consolidado';
 ELSE
  RAISE EXCEPTION 'Tipo de comunicação não reconhecido.' USING ERRCODE='23514';
 END IF;
 hash:=public.ec_com_assinatura(p_comp,p_tipo,chave);
 estado:=CASE p_destino WHEN 'interno' THEN 'interno'
   WHEN 'none' THEN 'nenhuma' ELSE 'fila' END;
 SELECT * INTO rec FROM public.eletivas_comunicacoes
 WHERE competencia_id=p_comp AND tipo=p_tipo AND referencia=chave FOR UPDATE;
 IF FOUND AND rec.situacao='enviada' THEN
  RAISE EXCEPTION 'Comunicação já enviada. Use reabertura justificada para reenviar.'
    USING ERRCODE='23514';
 END IF;
 IF FOUND THEN
  IF rec.destino=p_destino AND rec.assinatura=hash AND rec.situacao=estado THEN
   RETURN rec.id; -- idempotente: uma única entrada por caso.
  END IF;
  UPDATE public.eletivas_comunicacoes SET destino=p_destino,situacao=estado,
    assinatura=hash,versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid()
  WHERE id=rec.id;
 ELSE
  INSERT INTO public.eletivas_comunicacoes(competencia_id,tipo,referencia,
    item_id,aih,fluxo_id,destino,situacao,assinatura,atualizado_por)
  VALUES(p_comp,p_tipo,chave,CASE WHEN p_tipo='aih' THEN i.id ELSE NULL END,
    ident_aih,CASE WHEN p_tipo='regflow' THEN f.id ELSE NULL END,
    p_destino,estado,hash,auth.uid())
  RETURNING * INTO rec;
 END IF;
 INSERT INTO public.eletivas_comunicacoes_eventos(
  comunicacao_id,competencia_id,acao,destino_anterior,situacao_anterior,
  destino_novo,situacao_nova,justificativa,autor)
 VALUES(rec.id,p_comp,CASE WHEN p_destino='none' THEN 'retirar' ELSE 'rotear' END,
  CASE WHEN rec.versao=1 THEN NULL ELSE rec.destino END,
  CASE WHEN rec.versao=1 THEN NULL ELSE rec.situacao END,
  p_destino,estado,btrim(p_motivo),auth.uid());
 RETURN rec.id;
END $route$;

CREATE OR REPLACE FUNCTION public.ec_com_marcar_envio(
 p_ids uuid[],p_assunto text,p_corpo text,p_protocolo text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $send$
DECLARE r public.eletivas_comunicacoes%ROWTYPE;
 primeira_comp uuid;primeiro_dest text;total integer:=0;
BEGIN
 IF coalesce(array_length(p_ids,1),0)<1 OR
  length(btrim(coalesce(p_assunto,'')))<10 OR
  length(btrim(coalesce(p_corpo,'')))<30 OR
  length(btrim(coalesce(p_protocolo,'')))<5 THEN
  RAISE EXCEPTION 'Selecione itens; informe assunto, texto e comprovante/protocolo de envio.'
   USING ERRCODE='23514';
 END IF;
 IF (SELECT count(DISTINCT x.id) FROM unnest(p_ids) AS x(id))<>array_length(p_ids,1) THEN
  RAISE EXCEPTION 'Não repita itens no lote de envio.' USING ERRCODE='23514';
 END IF;
 FOR r IN SELECT * FROM public.eletivas_comunicacoes
  WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE
 LOOP
  PERFORM public.ec_fase5_autorizar(r.competencia_id);
  IF r.situacao<>'fila' OR r.assinatura IS DISTINCT FROM
    public.ec_com_assinatura(r.competencia_id,r.tipo,r.referencia) THEN
   RAISE EXCEPTION 'Fila já enviada ou evidências alteradas. Refaça a minuta.'
    USING ERRCODE='23514';
  END IF;
  IF primeira_comp IS NULL THEN
    primeira_comp:=r.competencia_id;primeiro_dest:=r.destino;
  ELSIF primeira_comp IS DISTINCT FROM r.competencia_id
     OR primeiro_dest IS DISTINCT FROM r.destino THEN
    RAISE EXCEPTION 'O envio deve conter somente mesmo destino e competência.'
     USING ERRCODE='23514';
  END IF;
  IF r.tipo='regflow' AND NOT EXISTS(
   SELECT 1 FROM public.eletivas_fpo_fluxos
   WHERE id=r.fluxo_id AND situacao='ativo' AND etapa BETWEEN 5 AND 7) THEN
   RAISE EXCEPTION 'Regularização não está apta para encaminhamento GEMAS.'
    USING ERRCODE='23514';
  END IF;
  UPDATE public.eletivas_comunicacoes SET situacao='enviada',versao=versao+1,
    enviada_em=now(),enviada_por=auth.uid(),protocolo=btrim(p_protocolo),
    assunto=btrim(p_assunto),atualizado_em=now(),atualizado_por=auth.uid()
  WHERE id=r.id;
  INSERT INTO public.eletivas_comunicacoes_eventos(
    comunicacao_id,competencia_id,acao,destino_anterior,situacao_anterior,
    destino_novo,situacao_nova,protocolo,assunto,conteudo_md5,
    justificativa,autor)
  VALUES(r.id,r.competencia_id,'enviar',r.destino,r.situacao,
    r.destino,'enviada',btrim(p_protocolo),btrim(p_assunto),
    md5(p_assunto||E'\n'||p_corpo),
    'Envio institucional informado e confirmado pelo fiscal.',auth.uid());
  total:=total+1;
 END LOOP;
 IF total<>array_length(p_ids,1) THEN
  RAISE EXCEPTION 'Um dos itens selecionados não existe; nenhum envio foi registrado.'
   USING ERRCODE='23514';
 END IF;
 RETURN total;
END $send$;

CREATE OR REPLACE FUNCTION public.ec_com_reabrir(
 p_id uuid,p_motivo text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $reopen$
DECLARE r public.eletivas_comunicacoes%ROWTYPE;atual text;
BEGIN
 SELECT * INTO r FROM public.eletivas_comunicacoes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comunicação não encontrada.'; END IF;
 PERFORM public.ec_fase5_autorizar(r.competencia_id);
 IF r.situacao<>'enviada' OR length(btrim(coalesce(p_motivo,'')))<15 THEN
  RAISE EXCEPTION 'Somente comunicações enviadas podem ser reabertas, com justificativa de 15 caracteres.'
   USING ERRCODE='23514';
 END IF;
 atual:=public.ec_com_assinatura(r.competencia_id,r.tipo,r.referencia);
 UPDATE public.eletivas_comunicacoes SET situacao='fila',
  assinatura=atual,versao=versao+1,enviada_em=NULL,enviada_por=NULL,
  protocolo=NULL,assunto=NULL,atualizado_em=now(),atualizado_por=auth.uid()
 WHERE id=p_id;
 INSERT INTO public.eletivas_comunicacoes_eventos(
  comunicacao_id,competencia_id,acao,destino_anterior,situacao_anterior,
  destino_novo,situacao_nova,justificativa,autor)
 VALUES(r.id,r.competencia_id,'reabrir',r.destino,'enviada',r.destino,
  'fila',btrim(p_motivo),auth.uid());
 RETURN r.versao+1;
END $reopen$;

-- Menor privilégio: RPCs autenticadas fazem as operações auditáveis.
REVOKE ALL ON FUNCTION public.ec_fase5_autorizar(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ec_com_assinatura(uuid,text,text) FROM PUBLIC,anon,authenticated;
DO $perms$
DECLARE spec text;
BEGIN
 FOREACH spec IN ARRAY ARRAY[
 'public.ec_fpo_iniciar(uuid,text,numeric,text)',
 'public.ec_fpo_mudar_etapa(uuid,integer,integer,text,text)',
 'public.ec_fpo_vincular_correcao(uuid,uuid,text)',
 'public.ec_com_rotear(uuid,text,text,text,text)',
 'public.ec_com_marcar_envio(uuid[],text,text,text)',
 'public.ec_com_reabrir(uuid,text)'
 ] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||spec||' FROM PUBLIC,anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||spec||' TO authenticated';
 END LOOP;
END $perms$;
COMMIT;
