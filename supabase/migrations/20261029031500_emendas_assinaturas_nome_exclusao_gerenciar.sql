-- Emendas: correção de colisão PL/pgSQL na matriz de assinaturas
-- e exclusão lógica auditável de competências em preparação/sem NE.
BEGIN;

CREATE OR REPLACE FUNCTION public.emenda_fluxo_assinar(
 p_documento uuid,p_papel text,p_signatario uuid DEFAULT NULL,p_manual text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 d public.emenda_fluxo_documentos%ROWTYPE;
 cfg public.assinaturas_config%ROWTYPE;
 v_nome text;
 v_cargo text;
 v_permitido boolean;
 v_registro uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.enviado_em IS NOT NULL OR d.pagamento_id IS NOT NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'Assinaturas já consolidadas.'; END IF;

 IF d.contexto='ne' THEN
  v_permitido:=p_papel IN ('sefaz','financeira','secretaria');
 ELSE
  v_permitido:=p_papel IN ('fiscal','gerente','coordenador','diretor','financeira','secretaria');
 END IF;
 IF NOT v_permitido THEN RAISE EXCEPTION 'Papel inválido para o documento.'; END IF;

 IF p_papel='sefaz' THEN
  v_nome:=btrim(coalesce(p_manual,''));
  v_cargo:='Membro da SEFAZ';
  IF length(v_nome)<3 OR length(v_nome)>160
  THEN RAISE EXCEPTION 'Informe o nome do membro da SEFAZ (3 a 160 caracteres).'; END IF;
 ELSE
  SELECT * INTO cfg FROM public.assinaturas_config sc
   WHERE sc.id=p_signatario AND sc.ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signatário não cadastrado ou inativo.'; END IF;
  v_nome:=cfg.nome_servidor;
  v_cargo:=cfg.cargo;
  v_permitido:=CASE p_papel
   WHEN 'fiscal' THEN v_cargo='Fiscal'
   WHEN 'gerente' THEN v_cargo='Gerente'
   WHEN 'coordenador' THEN v_cargo IN ('Coordenador ACP','Coordenador')
   WHEN 'diretor' THEN v_cargo='Diretor de Serviços Complementares'
   WHEN 'financeira' THEN v_cargo='Diretoria Financeira'
   WHEN 'secretaria' THEN v_cargo='Secretária de Saúde'
   ELSE false END;
  IF NOT v_permitido THEN RAISE EXCEPTION 'Cargo não habilitado para este campo.'; END IF;
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.emenda_fluxo_assinaturas efa
  WHERE efa.documento_id=d.id AND efa.nome=v_nome AND efa.papel<>p_papel
 ) THEN RAISE EXCEPTION 'O mesmo signatário não pode ocupar dois campos.'; END IF;

 INSERT INTO public.emenda_fluxo_assinaturas(
  emenda_id,documento_id,papel,nome,cargo,signatario_config_id
 ) VALUES(d.emenda_id,d.id,p_papel,v_nome,v_cargo,p_signatario)
 ON CONFLICT(documento_id,papel) DO UPDATE SET
  nome=EXCLUDED.nome,
  cargo=EXCLUDED.cargo,
  signatario_config_id=EXCLUDED.signatario_config_id,
  confirmado_por=auth.uid(),
  confirmado_em=now()
 RETURNING id INTO v_registro;
 RETURN v_registro;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_assinar(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_assinar(uuid,text,uuid,text) TO authenticated;

-- Registro é preservado no histórico: nunca apagar física ou ocultamente uma NE emitida.
CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 v_ator uuid:=auth.uid();
 v_lancamento public.emenda_lancamentos%ROWTYPE;
 v_status_solicitacao text;
BEGIN
 IF v_ator IS NULL OR NOT public.has_any_role(
    v_ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para excluir competência.' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_lancamento FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Competência não encontrada.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=v_lancamento.emenda_id FOR UPDATE;
 SELECT * INTO v_lancamento FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;

 IF v_lancamento.excluido_em IS NOT NULL OR v_lancamento.status='cancelado'
 THEN RAISE EXCEPTION 'Competência já excluída/cancelada.'; END IF;
 IF v_lancamento.status NOT IN ('rascunho','formalizado')
 THEN RAISE EXCEPTION 'Competência com Nota de Empenho emitida: não é permitida exclusão. Regularize o empenho oficialmente antes de qualquer alteração cadastral.'; END IF;

 IF EXISTS(SELECT 1 FROM public.emenda_liberacoes WHERE lancamento_id=p_lancamento)
 OR EXISTS(SELECT 1 FROM public.emenda_blocos_pagamento WHERE lancamento_id=p_lancamento)
 OR EXISTS(SELECT 1 FROM public.emenda_anulacoes WHERE lancamento_id=p_lancamento)
 OR EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento)
 OR EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao WHERE lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'Há movimentações de execução, pagamento, conciliação ou encerramento vinculadas. Exclusão bloqueada.'; END IF;

 IF v_lancamento.solicitacao_id IS NOT NULL THEN
  SELECT s.status INTO v_status_solicitacao FROM public.emenda_solicitacoes s
   WHERE s.id=v_lancamento.solicitacao_id FOR UPDATE;
  IF v_status_solicitacao='aguardando_ne' THEN
   -- Reverte a reserva do PACTO por cancelamento formal, sem excluir documentos SEI.
   PERFORM public.emenda_cancelar_solicitacao(
    v_lancamento.solicitacao_id,
    'Solicitação cancelada pela exclusão lógica da competência no Gerenciar.'
   );
  ELSIF v_status_solicitacao IS DISTINCT FROM 'cancelada' THEN
   RAISE EXCEPTION 'Solicitação com NE emitida ou status incompatível: exclusão bloqueada.';
  END IF;
 END IF;

 UPDATE public.emenda_lancamentos SET
  status='cancelado',excluido_em=now(),excluido_por=v_ator,updated_at=now()
 WHERE id=p_lancamento;
 RETURN p_lancamento;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_excluir_lancamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_excluir_lancamento(uuid) TO authenticated;

COMMIT;
