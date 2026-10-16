-- Reparo: encontro legado de 07/2026 pode não ter lancamento_id.
-- Exige ausência de qualquer fechamento/atesto automático no mesmo prestador e mês.
-- Banco não altera lançamentos e exige confirmação EXCLUIR MM/AAAA.
BEGIN;
ALTER TABLE public.eletivas_exclusoes
 ALTER COLUMN lancamento_id DROP NOT NULL;
COMMENT ON COLUMN public.eletivas_exclusoes.lancamento_id IS
 'ID da parcela, NULL somente para encontro legado sem vínculo original. Exclusão nunca altera o lançamento.';
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
      e.lancamento_id IN (
        SELECT l2.id FROM public.lancamentos_pagamento l2
        JOIN public.convenios cv2 ON cv2.id=l2.convenio_id
        WHERE l2.prestador_id=v.prestador_id AND l2.competencia=v.competencia
         AND cv2.modelo_fluxo='fluxo_1' AND cv2.objeto ILIKE '%eletiv%'
      )) THEN
  RAISE EXCEPTION 'A competência já possui fechamento, integração ou escolha fiscal de atesto. Exclusão definitiva bloqueada.'
    USING ERRCODE='23514';
 END IF;
 -- Competência legada pode não ter lancamento_id, mas a identidade
 -- institucional, mês e eventuais vínculos financeiros precisam ser examinados.
 -- Nunca escolher nem escrever em um lançamento apenas porque o mês coincide.
 IF v.lancamento_id IS NOT NULL THEN
  SELECT * INTO l FROM public.lancamentos_pagamento
    WHERE id=v.lancamento_id FOR UPDATE;
  IF NOT FOUND OR l.prestador_id IS DISTINCT FROM v.prestador_id
     OR l.competencia IS DISTINCT FROM v.competencia THEN
   RAISE EXCEPTION 'Vínculo de origem inconsistente. Revisão administrativa necessária.'
     USING ERRCODE='23514';
  END IF;
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.lancamentos_pagamento l2
  JOIN public.convenios cv2 ON cv2.id=l2.convenio_id
  WHERE l2.prestador_id=v.prestador_id
    AND l2.competencia=v.competencia
    AND cv2.modelo_fluxo='fluxo_1' AND cv2.objeto ILIKE '%eletiv%'
    AND (l2.concluido OR l2.data_pagamento IS NOT NULL
      OR l2.link_comprovante_pagamento_sei IS NOT NULL
      OR l2.ec_escolha_pendente IS TRUE
      OR coalesce(l2.valor_atestado_automatico,0)<>0
      OR l2.origem_valor_atestado='automatico')
 ) THEN
  RAISE EXCEPTION 'Já existe lançamento encerrado, pago ou com atesto automático nesta instituição/competência.'
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
    'origem_lancamento_preservada',v.lancamento_id,
    'origem_legada_sem_vinculo',v.lancamento_id IS NULL),
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
REVOKE ALL ON FUNCTION public.ec_excluir_competencia_teste(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_excluir_competencia_teste(uuid,text,text) TO authenticated;
COMMIT;
