-- Emendas | Revisão visual e transacional: decisão reversível, assinaturas do cadastro compartilhado.
-- Pré-requisito: migrations até 20261029012000; sem atos SEFAZ.
BEGIN;
ALTER TABLE public.emenda_pareceres_financeiros DROP CONSTRAINT IF EXISTS emenda_pareceres_financeiros_desfecho_check;
ALTER TABLE public.emenda_pareceres_financeiros ADD CONSTRAINT emenda_pareceres_financeiros_desfecho_check
 CHECK(desfecho IN ('aprovado','recusado','reaberto'));

ALTER TABLE public.emenda_assinaturas_conferidas
 ALTER COLUMN numero_sei DROP NOT NULL,
 ALTER COLUMN link_sei DROP NOT NULL;
ALTER TABLE public.emenda_assinaturas_conferidas
 ADD COLUMN IF NOT EXISTS signatario_config_id uuid REFERENCES public.assinaturas_config(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS cargo_signatario text;

-- Reverter sem apagar o parecer original. Qualquer solicitação ou assinatura editável
-- anterior fica invalidada, mas os eventos de auditoria continuam consultáveis.
CREATE FUNCTION public.emenda_reabrir_aprovacao(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
        ultimo text; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não localizado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL OR l.solicitacao_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Aprovação já formalizada ou lançamento indisponível; reversão bloqueada.'; END IF;
 SELECT desfecho INTO ultimo FROM public.emenda_pareceres_financeiros
  WHERE lancamento_id=l.id ORDER BY ocorrido_em DESC,id DESC LIMIT 1;
 IF ultimo IS DISTINCT FROM 'aprovado' THEN RAISE EXCEPTION 'Não há aprovação vigente para reverter.'; END IF;
 INSERT INTO public.emenda_pareceres_financeiros(emenda_id,lancamento_id,desfecho,comentario)
 VALUES(l.emenda_id,l.id,'reaberto','Aprovação revertida para nova análise financeira.')
 RETURNING id INTO r;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao';
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_reabrir_aprovacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_reabrir_aprovacao(uuid) TO authenticated;

-- Apenas os nomes ATIVOS no pool de Signatários do PACTO podem preencher a matriz.
-- "Gerente/Coordenador" e "Financeira/Secretária" são slots OU (uma seleção por slot).
CREATE FUNCTION public.emenda_selecionar_signatario(p_lancamento uuid,p_papel text,p_signatario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
        pessoa public.assinaturas_config%ROWTYPE; aceito boolean:=false; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não localizado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL OR l.solicitacao_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Matriz já encerrada ou não editável.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_etapas_documentais
  WHERE lancamento_id=l.id AND etapa='solicitacao')
  OR NOT EXISTS(SELECT 1 FROM (
    SELECT desfecho FROM public.emenda_pareceres_financeiros
    WHERE lancamento_id=l.id ORDER BY ocorrido_em DESC,id DESC LIMIT 1
  ) x WHERE x.desfecho='aprovado')
 THEN RAISE EXCEPTION 'A solicitação validada e a aprovação financeira são obrigatórias.'; END IF;
 SELECT * INTO pessoa FROM public.assinaturas_config WHERE id=p_signatario AND ativo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Signatário inexistente ou inativo em Configurações.'; END IF;
 aceito:=CASE p_papel
  WHEN 'orcamentos' THEN pessoa.cargo='Coordenador de Orçamentos'
  WHEN 'fiscal' THEN pessoa.cargo='Fiscal'
  WHEN 'gerencia_acp' THEN pessoa.cargo IN ('Gerente','Coordenador ACP','Coordenador')
  WHEN 'diretor_servicos' THEN pessoa.cargo='Diretor de Serviços Complementares'
  WHEN 'diretoria_financeira' THEN pessoa.cargo IN ('Diretoria Financeira','Secretária de Saúde')
  ELSE false END;
 IF NOT aceito THEN RAISE EXCEPTION 'Cargo não habilitado para este papel de assinatura.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id
   AND papel<>p_papel AND signatario_config_id=p_signatario)
 THEN RAISE EXCEPTION 'Signatário já selecionado em outro papel deste lançamento.'; END IF;
 INSERT INTO public.emenda_assinaturas_conferidas
  (emenda_id,lancamento_id,papel,nome_signatario,cargo_signatario,signatario_config_id,numero_sei,link_sei)
 VALUES(l.emenda_id,l.id,p_papel,pessoa.nome_servidor,pessoa.cargo,pessoa.id,NULL,NULL)
 ON CONFLICT(lancamento_id,papel) DO UPDATE SET
  nome_signatario=excluded.nome_signatario,cargo_signatario=excluded.cargo_signatario,
  signatario_config_id=excluded.signatario_config_id,numero_sei=NULL,link_sei=NULL,
  conferido_por=ator,conferido_em=now()
 RETURNING id INTO r;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_selecionar_signatario(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_selecionar_signatario(uuid,text,uuid) TO authenticated;
-- Impede uso da antiga RPC de texto livre para contornar a validação pelo pool.
REVOKE ALL ON FUNCTION public.emenda_conferir_assinatura(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
