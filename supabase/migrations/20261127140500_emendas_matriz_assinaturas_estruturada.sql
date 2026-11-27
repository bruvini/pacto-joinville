-- PACTO · Emendas · Matriz de subempenho estruturada, com referência operacional do PVH.
-- NÃO homologa automaticamente as Emendas; depende de ato expresso do administrador.
-- Nenhuma assinatura, documento ou pagamento histórico é criado ou alterado.
BEGIN;

ALTER TABLE public.emenda_subempenho_matrizes
 ADD COLUMN IF NOT EXISTS grupos_opcionais text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Uma matriz distingue signatários obrigatórios de opcionais.
ALTER TABLE public.emenda_subempenho_matrizes
 ADD CONSTRAINT emenda_sub_matriz_opcionais_sem_duplicidade
 CHECK (
  cardinality(grupos_opcionais)<=10
  AND NOT (grupos_opcionais && grupos_obrigatorios)
 );

-- Homologação atômica de três etapas, com uma referência SEI validada pelo administrador.
-- Comissão obrigatória nos documentos 1 e 2, Fiscal opcional; etapa 3 sem assinaturas.
-- A matriz trata papéis, não atribui ou simula assinaturas reais.
CREATE FUNCTION public.emenda_sub_matriz_padrao_homologar(
 p_emenda uuid,p_numero_sei text,p_link_sei text,p_justificativa text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE
 ator uuid:=auth.uid();
 passo record;
 versao_atual integer;
 modelo_obrigatorios text[];
 modelo_opcionais text[];
 destino text;
 exige boolean;
 corrente public.emenda_subempenho_matrizes%ROWTYPE;
 alteracoes integer:=0;
 comissao constant text:='Membro da Comissão de Gestão e Controle de Despesa';
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role]) THEN
  RAISE EXCEPTION 'A matriz estruturada de Emendas só pode ser homologada por administrador.'
  USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL
    OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
    OR length(btrim(coalesce(p_justificativa,'')))<10 THEN
  RAISE EXCEPTION 'Informe número, link HTTPS do SEI e justificativa formal (mínimo 10 caracteres).'
  USING ERRCODE='23514';
 END IF;

 PERFORM 1 FROM public.emendas WHERE id=p_emenda FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda não localizada.' USING ERRCODE='23514'; END IF;

 FOR passo IN SELECT t.tipo FROM
  (VALUES ('solicitacao_liquidacao'),('movimento_liquidacao'),('aviso_subempenho')) AS t(tipo)
 LOOP
  IF passo.tipo='aviso_subempenho' THEN
   modelo_obrigatorios:=ARRAY[]::text[];
   modelo_opcionais:=ARRAY[]::text[];
   exige:=false; destino:=NULL;
  ELSE
   modelo_obrigatorios:=ARRAY[comissao]::text[];
   modelo_opcionais:=ARRAY['Fiscal']::text[];
   exige:=passo.tipo='movimento_liquidacao';
   destino:=CASE WHEN exige THEN 'SEFAZ.UAF.ADE' ELSE NULL END;
  END IF;

  SELECT * INTO corrente FROM public.emenda_subempenho_matrizes
   WHERE emenda_id=p_emenda AND tipo=passo.tipo AND ativa
   FOR UPDATE;

  -- Reexecução idempotente com a mesma deliberação, sem apagar o histórico.
  IF FOUND
    AND corrente.grupos_obrigatorios=modelo_obrigatorios
    AND corrente.grupos_opcionais=modelo_opcionais
    AND corrente.exige_encaminhamento=exige
    AND corrente.destino_encaminhamento IS NOT DISTINCT FROM destino
    AND corrente.referencia_sei=btrim(p_numero_sei)
    AND corrente.referencia_link_sei=btrim(p_link_sei)
    AND corrente.justificativa=btrim(p_justificativa)
  THEN
   CONTINUE;
  END IF;

  SELECT coalesce(max(versao),0)+1 INTO versao_atual
  FROM public.emenda_subempenho_matrizes
  WHERE emenda_id=p_emenda AND tipo=passo.tipo;

  UPDATE public.emenda_subempenho_matrizes SET ativa=false
  WHERE emenda_id=p_emenda AND tipo=passo.tipo AND ativa;

  INSERT INTO public.emenda_subempenho_matrizes
   (emenda_id,tipo,versao,grupos_obrigatorios,grupos_opcionais,
    exige_encaminhamento,destino_encaminhamento,referencia_sei,
    referencia_link_sei,justificativa,homologada_por)
  VALUES
   (p_emenda,passo.tipo,versao_atual,modelo_obrigatorios,modelo_opcionais,
    exige,destino,btrim(p_numero_sei),btrim(p_link_sei),
    btrim(p_justificativa),ator);
  alteracoes:=alteracoes+1;
 END LOOP;
 RETURN alteracoes;
END;
$body$;

REVOKE ALL ON FUNCTION public.emenda_sub_matriz_padrao_homologar(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emenda_sub_matriz_padrao_homologar(uuid,text,text,text)
 TO authenticated;

-- Aceita assinaturas opcionais apenas se previstas expressamente na matriz
-- vinculada ao documento. Elas não bloqueiam a conclusão da etapa.
CREATE OR REPLACE FUNCTION public.emenda_subempenho_assinar(
 p_documento uuid,p_grupo text,p_signatario text,p_cargo text,
 p_numero_sei text,p_link_sei text,p_data date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); doc public.emenda_subempenho_documentos%ROWTYPE;
 politica public.emenda_subempenho_matrizes%ROWTYPE;
 anterior public.emenda_subempenho_assinaturas%ROWTYPE; novo uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para conferir assinaturas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento não localizado.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=doc.emenda_id FOR UPDATE;
 SELECT * INTO doc FROM public.emenda_subempenho_documentos WHERE id=p_documento FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.emenda_subempenho_conclusoes WHERE documento_id=doc.id)
 THEN RAISE EXCEPTION 'Etapa já concluída: assinatura adicional exige revisão formal.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO politica FROM public.emenda_subempenho_matrizes WHERE id=doc.politica_id;
 IF politica.id IS NULL
  OR NOT (p_grupo=ANY(politica.grupos_obrigatorios)
          OR p_grupo=ANY(politica.grupos_opcionais))
  OR length(btrim(coalesce(p_signatario,'')))<3
  OR length(btrim(coalesce(p_cargo,'')))<3
  OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR p_data IS NULL OR p_data>CURRENT_DATE OR p_data<doc.data_documento
 THEN RAISE EXCEPTION 'Grupo, signatário ou evidência de assinatura inválidos.'
  USING ERRCODE='23514'; END IF;
 SELECT * INTO anterior FROM public.emenda_subempenho_assinaturas
 WHERE documento_id=doc.id AND grupo=p_grupo;
 IF FOUND THEN
  IF anterior.signatario_nome=btrim(p_signatario) AND anterior.cargo_signatario=btrim(p_cargo)
   AND anterior.numero_sei=btrim(p_numero_sei) AND anterior.link_sei=btrim(p_link_sei)
   AND anterior.data_assinatura=p_data THEN RETURN anterior.id; END IF;
  RAISE EXCEPTION 'Assinatura deste grupo já conferida. Retificação formal necessária.'
   USING ERRCODE='23514';
 END IF;
 INSERT INTO public.emenda_subempenho_assinaturas
 (emenda_id,subempenho_id,documento_id,grupo,signatario_nome,cargo_signatario,
  numero_sei,link_sei,data_assinatura,registrado_por)
 VALUES(doc.emenda_id,doc.subempenho_id,doc.id,p_grupo,btrim(p_signatario),
  btrim(p_cargo),btrim(p_numero_sei),btrim(p_link_sei),p_data,ator)
 RETURNING id INTO novo;
 RETURN novo;
END;
$body$;

COMMENT ON FUNCTION public.emenda_sub_matriz_padrao_homologar(uuid,text,text,text)
 IS 'Homologa por decisão explícita do admin estrutura de assinaturas baseada no fluxo do PVH, com referência SEI própria das Emendas';
COMMENT ON COLUMN public.emenda_subempenho_matrizes.grupos_opcionais
 IS 'Grupos autorizados a assinar, mas não exigidos para concluir a subetapa';
COMMIT;
