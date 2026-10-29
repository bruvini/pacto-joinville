-- PACTO / Emendas: EXCLUSÃO DEFINITIVA de lançamento e suas competências no controle interno.
-- O registro administrativo/financeiro externo no SEI ou na SEFAZ não é alterado.
-- A auditoria integral fica em emenda_historico (que referencia apenas a emenda).
-- Nenhuma competência é excluída pela aplicação desta migration: somente chamada autenticada da RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento(p_lancamento uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE
 v_ator uuid := auth.uid();
 v_lanc public.emenda_lancamentos%ROWTYPE;
 v_solicitacao uuid;
 v_competencias uuid[];
 v_tabela text;
 v_registros jsonb;
 v_vinculados jsonb := '{}'::jsonb;
 v_snapshot jsonb;
BEGIN
 IF v_ator IS NULL OR NOT public.has_any_role(
  v_ator,ARRAY['admin'::public.app_role,'acp'::public.app_role]
 ) THEN
  RAISE EXCEPTION 'Sem permissão para excluir lançamentos de emendas.' USING ERRCODE='42501';
 END IF;

 SELECT * INTO v_lanc FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado (pode já ter sido excluído).'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=v_lanc.emenda_id FOR UPDATE;
 SELECT * INTO v_lanc FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento já excluído.'; END IF;
 v_solicitacao := v_lanc.solicitacao_id;

 -- A mesma solicitação nunca pode ser apagada quando pertence a outro lançamento.
 IF v_solicitacao IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.emenda_lancamentos outro
  WHERE outro.solicitacao_id=v_solicitacao AND outro.id<>p_lancamento
 ) THEN
  RAISE EXCEPTION 'Solicitação compartilhada por outro lançamento. Exclusão interrompida para proteger os registros externos a esta competência.';
 END IF;
 SELECT array_agg(DISTINCT competencia_id) INTO v_competencias
 FROM public.emenda_lancamento_meses WHERE lancamento_id=p_lancamento;

 -- Captura forense dos dados antes da exclusão, inclusive os que não possuem trigger DELETE.
 FOR v_tabela IN SELECT unnest(ARRAY[
  'emenda_lancamento_meses','emenda_etapas_documentais',
  'emenda_assinaturas_conferidas','emenda_pareceres_financeiros',
  'emenda_envios_sefaz','emenda_comprovantes','emenda_liberacoes',
  'emenda_blocos_pagamento','emenda_encerramentos_sem_execucao',
  'emenda_anulacoes','emenda_conciliacoes_ne','emenda_fluxo_documentos'
 ]) LOOP
  EXECUTE format(
   'SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM public.%I t WHERE t.lancamento_id=$1',
   v_tabela
  ) INTO v_registros USING p_lancamento;
  v_vinculados := v_vinculados || jsonb_build_object(v_tabela,v_registros);
 END LOOP;

 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO v_registros
 FROM public.emenda_fluxo_assinaturas a
 JOIN public.emenda_fluxo_documentos d ON d.id=a.documento_id
 WHERE d.lancamento_id=p_lancamento;
 v_vinculados:=v_vinculados||jsonb_build_object('emenda_fluxo_assinaturas',v_registros);

 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) INTO v_registros
 FROM public.emenda_competencias_filhas f WHERE f.solicitacao_id=v_solicitacao;
 v_vinculados:=v_vinculados||jsonb_build_object('emenda_competencias_filhas',v_registros);

 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) INTO v_registros
 FROM public.emenda_competencias c WHERE c.id=ANY(coalesce(v_competencias,ARRAY[]::uuid[]));
 v_vinculados:=v_vinculados||jsonb_build_object('emenda_competencias',v_registros);

 v_snapshot := jsonb_build_object(
  'lancamento',to_jsonb(v_lanc),
  'solicitacao',(
   SELECT to_jsonb(s) FROM public.emenda_solicitacoes s WHERE s.id=v_solicitacao
  ),
  'registros_operacionais',v_vinculados
 );

 -- O único dado sobrevivente sobre este lançamento será sua trilha em emenda_historico.
 -- "DELETE" é ação existente e permitida no CHECK de auditoria.
 INSERT INTO public.emenda_historico(
  emenda_id,tabela,registro_id,acao,anterior,novo,usuario_id
 ) VALUES(
  v_lanc.emenda_id,'emenda_lancamentos',p_lancamento,'DELETE',
  v_snapshot,NULL,v_ator
 );

 -- Primeiro removemos as dependências mais profundas, sem usar CASCADE generalizado.
 DELETE FROM public.emenda_fluxo_assinaturas a USING public.emenda_fluxo_documentos d
  WHERE a.documento_id=d.id AND d.lancamento_id=p_lancamento;
 DELETE FROM public.emenda_fluxo_documentos WHERE lancamento_id=p_lancamento;

 DELETE FROM public.emenda_blocos_pagamento WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_comprovantes WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_encerramentos_sem_execucao WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_anulacoes WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_liberacoes WHERE lancamento_id=p_lancamento;

 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_envios_sefaz WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_pareceres_financeiros WHERE lancamento_id=p_lancamento;

 IF v_solicitacao IS NOT NULL THEN
  DELETE FROM public.emenda_competencias_filhas WHERE solicitacao_id=v_solicitacao;
 END IF;

 DELETE FROM public.emenda_lancamento_meses WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_lancamentos WHERE id=p_lancamento;

 IF v_solicitacao IS NOT NULL THEN
  DELETE FROM public.emenda_solicitacoes WHERE id=v_solicitacao;
 END IF;

 -- Uma competência-base só sai se ficou sem referências de OUTROS lançamentos.
 DELETE FROM public.emenda_competencias c
 WHERE c.id=ANY(coalesce(v_competencias,ARRAY[]::uuid[]))
  AND NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses m WHERE m.competencia_id=c.id)
  AND NOT EXISTS(SELECT 1 FROM public.emenda_competencias_filhas f WHERE f.competencia_id=c.id)
  AND NOT EXISTS(SELECT 1 FROM public.emenda_solicitacoes s WHERE s.competencia_origem_id=c.id);

 RETURN p_lancamento;
END;
$func$;

REVOKE ALL ON FUNCTION public.emenda_excluir_lancamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_excluir_lancamento(uuid) TO authenticated;
COMMIT;
