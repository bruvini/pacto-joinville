-- Ajustes do módulo Emendas: dupla assinatura alternativa, remoção auditável,
-- correção do erro 42702 (coluna "etapa" ambígua) e desbloqueio do envio à SEFAZ.
-- Executar integralmente após 20261029015000. Nenhuma operação real na SEFAZ.
BEGIN;

ALTER TABLE public.emenda_assinaturas_conferidas
 DROP CONSTRAINT IF EXISTS emenda_assinaturas_papeis_v2;
ALTER TABLE public.emenda_assinaturas_conferidas
 ADD CONSTRAINT emenda_assinaturas_papeis_v3
 CHECK(papel IN ('orcamentos','fiscal','gerencia_acp','gerencia_acp_coord',
                'diretor_servicos','diretoria_financeira','diretoria_financeira_secretaria',
                'gerencia','diretoria'));

-- Normaliza apenas o papel da assinatura existente, sem mudar id, autor nem data.
UPDATE public.emenda_assinaturas_conferidas AS a
 SET papel='gerencia_acp_coord'
 WHERE a.papel='gerencia_acp' AND a.cargo_signatario IN ('Coordenador ACP','Coordenador');
UPDATE public.emenda_assinaturas_conferidas AS a
 SET papel='diretoria_financeira_secretaria'
 WHERE a.papel='diretoria_financeira' AND a.cargo_signatario='Secretária de Saúde';

CREATE OR REPLACE FUNCTION public.emenda_selecionar_signatario(p_lancamento uuid,p_papel text,p_signatario uuid)
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
  WHEN 'gerencia_acp' THEN pessoa.cargo='Gerente'
  WHEN 'gerencia_acp_coord' THEN pessoa.cargo IN ('Coordenador ACP','Coordenador')
  WHEN 'diretor_servicos' THEN pessoa.cargo='Diretor de Serviços Complementares'
  WHEN 'diretoria_financeira' THEN pessoa.cargo='Diretoria Financeira'
  WHEN 'diretoria_financeira_secretaria' THEN pessoa.cargo='Secretária de Saúde'
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

-- Retirada de registro incorreto com histórico preservado pelo trigger de auditoria.
-- Não representa revogação da assinatura digital no SEI.
CREATE FUNCTION public.emenda_remover_assinatura(p_assinatura uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); ass public.emenda_assinaturas_conferidas%ROWTYPE;
        lanc public.emenda_lancamentos%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para remover a conferência.' USING ERRCODE='42501'; END IF;
 SELECT * INTO ass FROM public.emenda_assinaturas_conferidas WHERE id=p_assinatura;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=ass.emenda_id FOR UPDATE;
 SELECT * INTO lanc FROM public.emenda_lancamentos WHERE id=ass.lancamento_id FOR UPDATE;
 IF lanc.id IS NULL OR lanc.status<>'rascunho' OR lanc.solicitacao_id IS NOT NULL
    OR lanc.excluido_em IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=lanc.id)
 THEN RAISE EXCEPTION 'Conferência já formalizada; retirada não permitida neste fluxo.'; END IF;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE id=p_assinatura;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_remover_assinatura(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_remover_assinatura(uuid) TO authenticated;

-- A contagem exige 5 grupos, podendo existir 7 signatários.
-- Ao contrário da versão antiga, a variável de registro não chama mais "etapa".
CREATE OR REPLACE FUNCTION public.emenda_formalizar_lancamento(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 documento_solicitacao public.emenda_etapas_documentais%ROWTYPE; req uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.solicitacao_id IS NOT NULL THEN RETURN l.solicitacao_id; END IF;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL
 THEN RAISE EXCEPTION 'Lançamento indisponível.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_etapas_documentais
  WHERE lancamento_id=l.id AND etapa='dotacao' AND coord_orcamentos_confirmada)
  OR NOT EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao')
  OR (SELECT count(DISTINCT CASE
    WHEN a.papel IN ('gerencia_acp','gerencia_acp_coord') THEN 'gerencia_acp'
    WHEN a.papel IN ('diretoria_financeira','diretoria_financeira_secretaria') THEN 'diretoria_financeira'
    ELSE a.papel END)
   FROM public.emenda_assinaturas_conferidas AS a
   WHERE a.lancamento_id=l.id
    AND a.papel IN ('orcamentos','fiscal','gerencia_acp','gerencia_acp_coord',
                    'diretor_servicos','diretoria_financeira','diretoria_financeira_secretaria'))<>5
  OR NOT EXISTS(SELECT 1 FROM (SELECT desfecho FROM public.emenda_pareceres_financeiros
      WHERE lancamento_id=l.id
      AND ocorrido_em >= (SELECT conferido_em FROM public.emenda_etapas_documentais
        WHERE lancamento_id=l.id AND etapa='dotacao')
      ORDER BY ocorrido_em DESC,id DESC LIMIT 1) p WHERE p.desfecho='aprovado')
  OR NOT EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Parecer, solicitação, cinco assinaturas e confirmação de envio são obrigatórios.'; END IF;
 SELECT d.* INTO documento_solicitacao FROM public.emenda_etapas_documentais AS d WHERE d.lancamento_id=l.id AND d.etapa='solicitacao';
 req:=public.emenda_formalizar_solicitacao(
  l.emenda_id,to_char(l.competencia_inicial,'MM/YYYY'),l.periodicidade,
  documento_solicitacao.valor_solicitado,documento_solicitacao.numero_sei,documento_solicitacao.link_sei,l.chave_idempotencia);
 UPDATE public.emenda_competencias_filhas f SET parcela_convenio=m.parcela_convenio
 FROM public.emenda_lancamento_meses m
 WHERE f.solicitacao_id=req AND m.lancamento_id=l.id AND f.competencia_id=m.competencia_id;
 UPDATE public.emenda_lancamentos SET solicitacao_id=req,status='formalizado',updated_at=now() WHERE id=l.id;
 RETURN req;
END;$f$;

CREATE OR REPLACE FUNCTION public.emenda_confirmar_envio_sefaz(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Envio indisponível.'; END IF;
 IF (SELECT count(DISTINCT CASE
    WHEN a.papel IN ('gerencia_acp','gerencia_acp_coord') THEN 'gerencia_acp'
    WHEN a.papel IN ('diretoria_financeira','diretoria_financeira_secretaria') THEN 'diretoria_financeira'
    ELSE a.papel END)
   FROM public.emenda_assinaturas_conferidas AS a
   WHERE a.lancamento_id=l.id
    AND a.papel IN ('orcamentos','fiscal','gerencia_acp','gerencia_acp_coord',
                    'diretor_servicos','diretoria_financeira','diretoria_financeira_secretaria'))<>5
 THEN RAISE EXCEPTION 'Confira as cinco assinaturas primeiro.'; END IF;
 INSERT INTO public.emenda_envios_sefaz(emenda_id,lancamento_id)
 VALUES(l.emenda_id,l.id) ON CONFLICT(lancamento_id) DO NOTHING RETURNING id INTO r;
 PERFORM public.emenda_formalizar_lancamento(l.id);
 RETURN coalesce(r,(SELECT id FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id));
END;$f$;
COMMIT;
