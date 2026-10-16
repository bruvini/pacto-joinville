-- ELETIVAS · Exclusão definitiva de competências de teste (16/10/2026)
-- Não apaga nem modifica lancamentos_pagamento, convênios, empenhos ou atestos.
-- Migração de permissões, função transacional e limpeza do Storage via API.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('public.eletivas_exclusoes') IS NULL OR
    to_regclass('public.eletivas_atesto_escolhas') IS NULL OR
    to_regclass('public.eletivas_decisoes_revisoes') IS NULL OR
    to_regclass('public.eletivas_fechamentos') IS NULL OR
    to_regclass('public.eletivas_arquivos') IS NULL THEN
    RAISE EXCEPTION 'Migrations Eletivas de 15-16/10 necessárias.'
      USING ERRCODE='23514';
 END IF;
END;
$pre$;

ALTER TABLE public.eletivas_exclusoes
 ADD COLUMN IF NOT EXISTS caminhos_storage text[] NOT NULL DEFAULT ARRAY[]::text[],
 ADD COLUMN IF NOT EXISTS resumo_exclusao jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS limpeza_storage_em timestamptz,
 ADD COLUMN IF NOT EXISTS limpeza_storage_por uuid REFERENCES auth.users(id);
COMMENT ON COLUMN public.eletivas_exclusoes.caminhos_storage IS
 'Objetos privados pendentes de exclusão via Storage API, sem conteúdo clínico.';
-- A tabela preexistente mantém RLS: select ACP/Admin/ACO; não conceder UPDATE/DELETE.

CREATE OR REPLACE FUNCTION public.ec_excluir_competencia_teste(
 p_comp uuid,p_motivo text,p_confirmacao text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $purge$
DECLARE
 v public.eletivas_competencias%ROWTYPE;
 l public.lancamentos_pagamento%ROWTYPE;
 caminhos text[]:=ARRAY[]::text[];
 itens_count bigint;
 fontes_count bigint;
 retorno jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Exclusão definitiva restrita a ACP/Admin.'
    USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_motivo,'')))<20 THEN
  RAISE EXCEPTION 'Justificativa obrigatória: mínimo de 20 caracteres.'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO v FROM public.eletivas_competencias
  WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Encontro inexistente ou já excluído.' USING ERRCODE='23514'; END IF;
 IF p_confirmacao IS DISTINCT FROM 'EXCLUIR '||v.competencia THEN
  RAISE EXCEPTION 'Confirmação incorreta. Digite EXCLUIR %.',v.competencia
   USING ERRCODE='23514';
 END IF;
 IF v.status='encerrada' OR v.fechado_em IS NOT NULL
  OR v.valor_fechado IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.eletivas_fechamentos WHERE competencia_id=p_comp)
  OR EXISTS(SELECT 1 FROM public.eletivas_integracoes WHERE competencia_id=p_comp)
  OR EXISTS(SELECT 1 FROM public.eletivas_atesto_escolhas e
    WHERE e.competencia_id=p_comp OR
      (v.lancamento_id IS NOT NULL AND e.lancamento_id=v.lancamento_id)) THEN
  RAISE EXCEPTION 'A competência já possui fechamento, integração ou escolha fiscal de atesto. Exclusão definitiva bloqueada.'
    USING ERRCODE='23514';
 END IF;
 IF v.lancamento_id IS NULL THEN
  RAISE EXCEPTION 'Competência sem origem vinculada; revisão administrativa necessária.'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento
   WHERE id=v.lancamento_id FOR UPDATE;
 IF NOT FOUND OR l.prestador_id IS DISTINCT FROM v.prestador_id
    OR l.competencia IS DISTINCT FROM v.competencia
    OR l.concluido OR l.data_pagamento IS NOT NULL
    OR l.link_comprovante_pagamento_sei IS NOT NULL
    OR l.ec_escolha_pendente IS TRUE
    OR coalesce(l.valor_atestado_automatico,0)<>0
    OR l.origem_valor_atestado='automatico' THEN
  RAISE EXCEPTION 'Lançamento já concluído, pago, com atesto automático ou identidade inconsistente.'
   USING ERRCODE='23514';
 END IF;
 SELECT count(*),coalesce(array_agg(storage_path ORDER BY storage_path),ARRAY[]::text[])
  INTO fontes_count,caminhos
  FROM public.eletivas_arquivos WHERE competencia_id=p_comp;
 IF EXISTS(
  SELECT 1 FROM unnest(caminhos) p
  WHERE left(p,length(v.id::text)+1)<>v.id::text||'/'
 ) THEN
  RAISE EXCEPTION 'Caminho de evidência fora da pasta da competência. Revisão necessária.'
   USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO itens_count FROM public.eletivas_itens
  WHERE competencia_id=p_comp;
 -- Registro independente e mínimo da exclusão. NÃO replica dossiês,
 -- decisões nominativas, AIHs ou o histórico completo para o tombstone.
 INSERT INTO public.eletivas_exclusoes(
  competencia_id_original,prestador_id,lancamento_id,competencia,cnes,
  observacao,eventos_json,motivo,excluido_por,
  caminhos_storage,resumo_exclusao,limpeza_storage_em)
 VALUES(
  v.id,v.prestador_id,v.lancamento_id,v.competencia,v.cnes,NULL,
  jsonb_build_array(jsonb_build_object('evento','exclusao_definitiva_de_teste')),
  btrim(p_motivo),auth.uid(),caminhos,
  jsonb_build_object('arquivos',fontes_count,'itens',itens_count,
    'status_anterior',v.status,'era_arquivada',v.arquivada_em IS NOT NULL,
    'origem_lancamento_preservada',v.lancamento_id),
  CASE WHEN cardinality(caminhos)=0 THEN now() ELSE NULL END);
 -- Em uma transação única, desfaz a marca de arquivamento apenas
 -- para executar o DELETE: se algum FK/trigger bloquear, tudo é revertido.
 IF v.arquivada_em IS NOT NULL THEN
  PERFORM pg_catalog.set_config('app.ec_restaurar_competencia',v.id::text,true);
  UPDATE public.eletivas_competencias SET arquivada_em=NULL,
   arquivada_por=NULL,arquivada_motivo=NULL WHERE id=p_comp;
  PERFORM pg_catalog.set_config('app.ec_restaurar_competencia','',true);
 END IF;
 -- Respeitar FKs RESTRICT: decisão antes de item, ato antes de arquivo.
 DELETE FROM public.eletivas_decisoes_revisoes WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_atos_especiais WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_publicacoes_aih WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_fpo_programacoes WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_correcoes WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_itens WHERE competencia_id=p_comp;
 DELETE FROM public.eletivas_arquivos WHERE competencia_id=p_comp;
 -- Eventos sem uso financeiro referenciam a competência com ON DELETE CASCADE.
 DELETE FROM public.eletivas_competencias WHERE id=p_comp;
 retorno:=jsonb_build_object('competencia',v.competencia,'id',v.id,
    'arquivos',to_jsonb(caminhos),'fontes',fontes_count,'itens',itens_count,
    'banco_excluido',true,'limpeza_pendente',cardinality(caminhos)>0);
 RETURN retorno;
END;
$purge$;
REVOKE ALL ON FUNCTION public.ec_excluir_competencia_teste(uuid,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_excluir_competencia_teste(uuid,text,text)
 TO authenticated;

-- A API Storage remove os OBJETOS, nunca uma instrução DELETE SQL.
-- A ACP só ganha permissão para objetos EXATOS de competência já
-- definitivamente excluída por aquela pessoa.
DROP POLICY IF EXISTS ec_storage_limpeza_exclusao_teste ON storage.objects;
CREATE POLICY ec_storage_limpeza_exclusao_teste ON storage.objects
 FOR DELETE TO authenticated
 USING(bucket_id='eletivas-arquivos'
  AND auth.uid() IS NOT NULL
  AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[])
  AND EXISTS(
   SELECT 1 FROM public.eletivas_exclusoes e
   WHERE e.excluido_por=auth.uid()
    AND e.limpeza_storage_em IS NULL
    AND name=ANY(e.caminhos_storage)
  ));

-- Confirma via SQL apenas após a API Storage efetivamente remover tudo.
CREATE OR REPLACE FUNCTION public.ec_confirmar_limpeza_teste(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $done$
DECLARE e public.eletivas_exclusoes%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Permissão fiscal obrigatória.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO e FROM public.eletivas_exclusoes
  WHERE competencia_id_original=p_comp FOR UPDATE;
 IF NOT FOUND OR e.excluido_por IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Exclusão não encontrada para este usuário.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o
  WHERE o.bucket_id='eletivas-arquivos' AND o.name=ANY(e.caminhos_storage)) THEN
  RAISE EXCEPTION 'Ainda há arquivos privados pendentes de remoção pelo Storage.'
   USING ERRCODE='23514';
 END IF;
 UPDATE public.eletivas_exclusoes
  SET limpeza_storage_em=coalesce(limpeza_storage_em,now()),
      limpeza_storage_por=coalesce(limpeza_storage_por,auth.uid())
  WHERE competencia_id_original=p_comp;
END;
$done$;
REVOKE ALL ON FUNCTION public.ec_confirmar_limpeza_teste(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_confirmar_limpeza_teste(uuid)
 TO authenticated;
COMMIT;
