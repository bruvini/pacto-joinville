-- PACTO | Emendas Fase 5: pareceres, matriz, envio, exclusão auditável, anulação e conciliação.
-- Requer migrations Fase 1–4 já aplicadas; não efetua operações na SEFAZ.
BEGIN;
ALTER TABLE public.emendas ADD COLUMN IF NOT EXISTS excluida_em timestamptz,
 ADD COLUMN IF NOT EXISTS excluida_por uuid REFERENCES auth.users(id);
ALTER TABLE public.emenda_lancamentos ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
 ADD COLUMN IF NOT EXISTS excluido_por uuid REFERENCES auth.users(id);
ALTER TABLE public.emenda_assinaturas_conferidas DROP CONSTRAINT IF EXISTS emenda_assinaturas_conferidas_papel_check;
ALTER TABLE public.emenda_assinaturas_conferidas ADD CONSTRAINT emenda_assinaturas_papeis_v2
 CHECK (papel IN ('orcamentos','fiscal','gerencia_acp','diretor_servicos','diretoria_financeira',
                  'gerencia','diretoria'));

CREATE TABLE public.emenda_pareceres_financeiros (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 desfecho text NOT NULL CHECK(desfecho IN ('aprovado','recusado')),
 comentario text NOT NULL CHECK(length(btrim(comentario))>=5),
 usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 ocorrido_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id)
);
CREATE INDEX emenda_pareceres_tempo ON public.emenda_pareceres_financeiros(lancamento_id,ocorrido_em DESC,id DESC);
CREATE TABLE public.emenda_envios_sefaz (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL UNIQUE,
 destino text NOT NULL DEFAULT 'SEFAZ.UCG.AEO' CHECK(destino='SEFAZ.UCG.AEO'),
 confirmado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 confirmado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id)
);
CREATE TABLE public.emenda_anulacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 solicitacao_id uuid NOT NULL REFERENCES public.emenda_solicitacoes(id) ON DELETE RESTRICT,
 valor numeric(16,2) NOT NULL CHECK(valor>0),
 motivo text NOT NULL CHECK(length(btrim(motivo))>=10),
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 processo_principal text NOT NULL,
 usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 ocorrido_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id)
);
CREATE INDEX emenda_anulacoes_ne ON public.emenda_anulacoes(solicitacao_id,ocorrido_em);
CREATE TABLE public.emenda_conciliacoes_ne (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL UNIQUE,
 solicitacao_id uuid NOT NULL UNIQUE REFERENCES public.emenda_solicitacoes(id) ON DELETE RESTRICT,
 valor_ne numeric(16,2) NOT NULL,
 total_anulado numeric(16,2) NOT NULL,
 total_liberado numeric(16,2) NOT NULL,
 total_pago numeric(16,2) NOT NULL,
 competencia_total integer NOT NULL,
 numero_sei text NOT NULL,
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 conferido_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 conferido_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id)
);

ALTER TABLE public.emenda_pareceres_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_envios_sefaz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_anulacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_conciliacoes_ne ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emenda_pareceres_financeiros,public.emenda_envios_sefaz,
 public.emenda_anulacoes,public.emenda_conciliacoes_ne FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_pareceres_financeiros,public.emenda_envios_sefaz,
 public.emenda_anulacoes,public.emenda_conciliacoes_ne TO authenticated;
CREATE POLICY emenda_pareceres_read ON public.emenda_pareceres_financeiros FOR SELECT TO authenticated
 USING(public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_envios_read ON public.emenda_envios_sefaz FOR SELECT TO authenticated
 USING(public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_anulacoes_read ON public.emenda_anulacoes FOR SELECT TO authenticated
 USING(public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_conciliacoes_read ON public.emenda_conciliacoes_ne FOR SELECT TO authenticated
 USING(public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE TRIGGER audit_emenda_pareceres AFTER INSERT ON public.emenda_pareceres_financeiros
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_envios AFTER INSERT ON public.emenda_envios_sefaz
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_anulacoes AFTER INSERT ON public.emenda_anulacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_conciliacoes AFTER INSERT ON public.emenda_conciliacoes_ne
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

-- Não permitir atualização direta dos pareceres, assinaturas ou eventos financeiros.
CREATE OR REPLACE FUNCTION public.emenda_parecer_financeiro(
 p_lancamento uuid,p_desfecho text,p_comentario text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL
 THEN RAISE EXCEPTION 'Lançamento não está em preparação.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='dotacao' AND coord_orcamentos_confirmada)
 THEN RAISE EXCEPTION 'Registre primeiro a dotação/fonte no bloco de Orçamentos.'; END IF;
 IF p_desfecho NOT IN ('aprovado','recusado') OR length(btrim(coalesce(p_comentario,'')))<5
 THEN RAISE EXCEPTION 'Informe o desfecho e comentário de pelo menos 5 caracteres.'; END IF;
 INSERT INTO public.emenda_pareceres_financeiros(emenda_id,lancamento_id,desfecho,comentario)
 VALUES(l.emenda_id,l.id,p_desfecho,btrim(p_comentario)) RETURNING id INTO r;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao';
 RETURN r;
END;$f$;

-- Etapa de autorização é substituída por pareceres append-only (sem SEI obrigatório).
-- A solicitação exige parecer APROVADO como decisão mais recente.
CREATE OR REPLACE FUNCTION public.emenda_salvar_etapa_documental(
 p_lancamento uuid,p_etapa text,p_numero_sei text,p_link_sei text,
 p_valor numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL OR p_etapa<>'solicitacao'
 THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM (SELECT desfecho FROM public.emenda_pareceres_financeiros
     WHERE lancamento_id=l.id AND ocorrido_em >= (SELECT conferido_em FROM public.emenda_etapas_documentais
      WHERE lancamento_id=l.id AND etapa='dotacao') ORDER BY ocorrido_em DESC,id DESC LIMIT 1) x WHERE x.desfecho='aprovado')
 THEN RAISE EXCEPTION 'Aguardando parecer financeiro favorável.'; END IF;
 IF nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
 THEN RAISE EXCEPTION 'Número SEI, link HTTPS e valor positivo são obrigatórios.'; END IF;
 IF p_valor>coalesce((SELECT saldo_disponivel FROM public.emendas_resumo WHERE id=l.emenda_id),0)
 THEN RAISE EXCEPTION 'Valor solicitado ultrapassa o disponível da emenda.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_etapas_documentais
 (emenda_id,lancamento_id,etapa,numero_sei,link_sei,valor_solicitado)
 VALUES(l.emenda_id,l.id,'solicitacao',btrim(p_numero_sei),btrim(p_link_sei),p_valor)
 ON CONFLICT(lancamento_id,etapa) DO UPDATE SET
 numero_sei=excluded.numero_sei,link_sei=excluded.link_sei,
 valor_solicitado=excluded.valor_solicitado,conferido_por=ator,conferido_em=now()
 RETURNING id INTO r;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 RETURN r;
END;$f$;
CREATE FUNCTION public.emenda_validar_solicitacao_aprovada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF NEW.etapa='solicitacao' AND NOT EXISTS (
  SELECT 1 FROM (SELECT desfecho FROM public.emenda_pareceres_financeiros
    WHERE lancamento_id=NEW.lancamento_id
      AND ocorrido_em >= (SELECT conferido_em FROM public.emenda_etapas_documentais
        WHERE lancamento_id=NEW.lancamento_id AND etapa='dotacao')
     ORDER BY ocorrido_em DESC,id DESC LIMIT 1) p
  WHERE p.desfecho='aprovado')
 THEN RAISE EXCEPTION 'A solicitação exige parecer financeiro favorável.';
 END IF;
 RETURN NEW;
END;$f$;
CREATE TRIGGER gate_emenda_solicitacao_parecer BEFORE INSERT OR UPDATE ON public.emenda_etapas_documentais
 FOR EACH ROW EXECUTE FUNCTION public.emenda_validar_solicitacao_aprovada();
REVOKE ALL ON FUNCTION public.emenda_validar_solicitacao_aprovada() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.emenda_conferir_assinatura(
 p_lancamento uuid,p_papel text,p_nome text,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Etapa bloqueada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='solicitacao')
 THEN RAISE EXCEPTION 'A solicitação de empenho deve estar registrada.'; END IF;
 IF p_papel NOT IN ('orcamentos','fiscal','gerencia_acp','diretor_servicos','diretoria_financeira')
  OR length(btrim(coalesce(p_nome,'')))<3 OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Assinante, documento e link SEI inválidos.'; END IF;
 INSERT INTO public.emenda_assinaturas_conferidas
  (emenda_id,lancamento_id,papel,nome_signatario,numero_sei,link_sei)
 VALUES(l.emenda_id,l.id,p_papel,btrim(p_nome),btrim(p_numero_sei),btrim(p_link_sei))
 ON CONFLICT(lancamento_id,papel) DO UPDATE SET
  nome_signatario=excluded.nome_signatario,numero_sei=excluded.numero_sei,
  link_sei=excluded.link_sei,conferido_por=ator,conferido_em=now()
 RETURNING id INTO r;
 RETURN r;
END;$f$;

-- Emissão da reserva somente após a confirmação do envio para SEFAZ.UCG.AEO.
CREATE OR REPLACE FUNCTION public.emenda_formalizar_lancamento(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 etapa public.emenda_etapas_documentais%ROWTYPE; req uuid;
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
  OR (SELECT count(DISTINCT papel) FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id
    AND papel IN ('orcamentos','fiscal','gerencia_acp','diretor_servicos','diretoria_financeira'))<>5
  OR NOT EXISTS(SELECT 1 FROM (SELECT desfecho FROM public.emenda_pareceres_financeiros
      WHERE lancamento_id=l.id
      AND ocorrido_em >= (SELECT conferido_em FROM public.emenda_etapas_documentais
        WHERE lancamento_id=l.id AND etapa='dotacao')
      ORDER BY ocorrido_em DESC,id DESC LIMIT 1) p WHERE p.desfecho='aprovado')
  OR NOT EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Parecer, solicitação, cinco assinaturas e confirmação de envio são obrigatórios.'; END IF;
 SELECT * INTO etapa FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao';
 req:=public.emenda_formalizar_solicitacao(
  l.emenda_id,to_char(l.competencia_inicial,'MM/YYYY'),l.periodicidade,
  etapa.valor_solicitado,etapa.numero_sei,etapa.link_sei,l.chave_idempotencia);
 UPDATE public.emenda_competencias_filhas f SET parcela_convenio=m.parcela_convenio
 FROM public.emenda_lancamento_meses m
 WHERE f.solicitacao_id=req AND m.lancamento_id=l.id AND f.competencia_id=m.competencia_id;
 UPDATE public.emenda_lancamentos SET solicitacao_id=req,status='formalizado',updated_at=now() WHERE id=l.id;
 RETURN req;
END;$f$;

CREATE FUNCTION public.emenda_confirmar_envio_sefaz(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Envio indisponível.'; END IF;
 IF (SELECT count(DISTINCT papel) FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id
     AND papel IN ('orcamentos','fiscal','gerencia_acp','diretor_servicos','diretoria_financeira'))<>5
 THEN RAISE EXCEPTION 'Confira as cinco assinaturas primeiro.'; END IF;
 INSERT INTO public.emenda_envios_sefaz(emenda_id,lancamento_id)
 VALUES(l.emenda_id,l.id) ON CONFLICT(lancamento_id) DO NOTHING RETURNING id INTO r;
 PERFORM public.emenda_formalizar_lancamento(l.id);
 RETURN coalesce(r,(SELECT id FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id));
END;$f$;

-- Impede alteração de registros financeiros após a conciliação, mesmo via RPC legada.
CREATE FUNCTION public.emenda_bloquear_movimento_conciliado()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne
  WHERE lancamento_id=(to_jsonb(NEW)->>'lancamento_id')::uuid)
 THEN RAISE EXCEPTION 'Nota conciliada e encerrada: novos movimentos proibidos.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_bloquear_movimento_conciliado() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_emenda_comprovantes BEFORE INSERT ON public.emenda_comprovantes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_bloquear_movimento_conciliado();
CREATE TRIGGER guard_emenda_liberacoes BEFORE INSERT ON public.emenda_liberacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_bloquear_movimento_conciliado();
CREATE TRIGGER guard_emenda_pagamentos BEFORE INSERT ON public.emenda_blocos_pagamento
 FOR EACH ROW EXECUTE FUNCTION public.emenda_bloquear_movimento_conciliado();
CREATE TRIGGER guard_emenda_encerramentos BEFORE INSERT ON public.emenda_encerramentos_sem_execucao
 FOR EACH ROW EXECUTE FUNCTION public.emenda_bloquear_movimento_conciliado();

-- Edição de rascunho: sem documentação; meses antigos deixam de pertencer ao lançamento,
-- mas continuam auditados e competências globais permanecem na base.
CREATE FUNCTION public.emenda_editar_lancamento(p_lancamento uuid,p_competencia text,p_periodicidade text,p_parcela integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 mes date; inicio date; n integer; i integer; competencia_id uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL OR l.solicitacao_id IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id)
   OR EXISTS(SELECT 1 FROM public.emenda_pareceres_financeiros WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Somente rascunhos sem atividade documental podem ser editados.'; END IF;
 IF p_competencia IS NULL OR p_competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
 THEN RAISE EXCEPTION 'Competência inválida.'; END IF;
 n:=CASE p_periodicidade WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 ELSE NULL END;
 IF n IS NULL OR p_parcela IS NULL OR p_parcela<1 OR p_parcela+n-1>9999
 THEN RAISE EXCEPTION 'Periodicidade/parcela inválida.'; END IF;
 inicio:=make_date(substring(p_competencia,4,4)::int,substring(p_competencia,1,2)::int,1);
 DELETE FROM public.emenda_lancamento_meses WHERE lancamento_id=l.id;
 FOR i IN 0..n-1 LOOP
  mes:=(inicio+make_interval(months=>i))::date;
  INSERT INTO public.emenda_competencias(emenda_id,competencia)
  VALUES(l.emenda_id,mes) ON CONFLICT(emenda_id,competencia) DO NOTHING;
  SELECT id INTO competencia_id FROM public.emenda_competencias WHERE emenda_id=l.emenda_id AND competencia=mes;
  INSERT INTO public.emenda_lancamento_meses(emenda_id,lancamento_id,competencia_id,ordem,parcela_convenio)
  VALUES(l.emenda_id,l.id,competencia_id,i+1,p_parcela+i);
 END LOOP;
 UPDATE public.emenda_lancamentos
  SET competencia_inicial=inicio,periodicidade=p_periodicidade,parcela_inicial=p_parcela,updated_at=now()
 WHERE id=l.id;
 RETURN l.id;
END;$f$;
CREATE FUNCTION public.emenda_excluir_lancamento(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'rascunho' OR l.solicitacao_id IS NOT NULL OR l.excluido_em IS NOT NULL
 THEN RAISE EXCEPTION 'Somente lançamento em preparação pode ser excluído.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id)
  OR EXISTS(SELECT 1 FROM public.emenda_pareceres_financeiros WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Lançamento possui histórico documental; não pode ser excluído.'; END IF;
 UPDATE public.emenda_lancamentos SET status='cancelado',excluido_em=now(),excluido_por=ator,updated_at=now()
 WHERE id=l.id;
 RETURN l.id;
END;$f$;
CREATE FUNCTION public.emenda_excluir_cadastro(p_emenda uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); em public.emendas%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO em FROM public.emendas WHERE id=p_emenda FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda não encontrada.'; END IF;
 IF em.excluida_em IS NOT NULL THEN RAISE EXCEPTION 'Emenda já excluída.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_lancamentos WHERE emenda_id=em.id AND excluido_em IS NULL)
  OR EXISTS(SELECT 1 FROM public.emenda_solicitacoes WHERE emenda_id=em.id)
 THEN RAISE EXCEPTION 'Existem lançamentos ou solicitações: conclua a gestão antes de excluir a emenda.'; END IF;
 UPDATE public.emendas SET excluida_em=now(),excluida_por=ator WHERE id=em.id;
 RETURN em.id;
END;$f$;

CREATE FUNCTION public.emenda_anular_residual(
 p_lancamento uuid,p_valor numeric,p_justificativa text,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 em public.emendas%ROWTYPE; nota numeric; anulada numeric; liberada numeric; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 SELECT * INTO em FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' OR l.solicitacao_id IS NULL OR
  EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'NE sem condições para anulação.'; END IF;
 IF nullif(btrim(coalesce(em.processo_sei_numero,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Informe o processo SEI principal no cadastro da emenda.'; END IF;
 IF p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  OR length(btrim(coalesce(p_justificativa,'')))<10
  OR nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Valor, justificativa e documento SEI são obrigatórios.'; END IF;
 SELECT valor_ne INTO nota FROM public.emenda_solicitacoes WHERE id=l.solicitacao_id AND status='emitida';
 SELECT coalesce(sum(valor),0) INTO anulada FROM public.emenda_anulacoes WHERE lancamento_id=l.id;
 SELECT coalesce(sum(valor),0) INTO liberada FROM public.emenda_liberacoes WHERE lancamento_id=l.id;
 IF nota IS NULL OR p_valor>nota-anulada-liberada
 THEN RAISE EXCEPTION 'Anulação maior que o residual não liberado da NE.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_anulacoes(emenda_id,lancamento_id,solicitacao_id,valor,motivo,
  numero_sei,link_sei,processo_principal)
 VALUES(l.emenda_id,l.id,l.solicitacao_id,p_valor,btrim(p_justificativa),btrim(p_numero_sei),
  btrim(p_link_sei),em.processo_sei_numero) RETURNING id INTO r;
 RETURN r;
END;$f$;

CREATE FUNCTION public.emenda_conciliar_encerrar_ne(
 p_lancamento uuid,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 nota numeric; anulada numeric; liberada numeric; paga numeric; meses int; pendentes int; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' OR l.solicitacao_id IS NULL OR
  EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'NE indisponível para conciliação.'; END IF;
 IF nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Documento SEI da conciliação obrigatório.'; END IF;
 SELECT valor_ne INTO nota FROM public.emenda_solicitacoes WHERE id=l.solicitacao_id AND status='emitida';
 SELECT coalesce(sum(valor),0) INTO anulada FROM public.emenda_anulacoes WHERE lancamento_id=l.id;
 SELECT coalesce(sum(valor),0) INTO liberada FROM public.emenda_liberacoes WHERE lancamento_id=l.id;
 SELECT coalesce(sum(valor),0) INTO paga FROM public.emenda_blocos_pagamento WHERE lancamento_id=l.id;
 SELECT count(*) INTO meses FROM public.emenda_lancamento_meses WHERE lancamento_id=l.id;
 SELECT count(*) INTO pendentes
 FROM public.emenda_lancamento_meses m
 WHERE m.lancamento_id=l.id AND NOT EXISTS(
  SELECT 1 FROM public.emenda_encerramentos_sem_execucao e
   WHERE e.lancamento_id=l.id AND e.competencia_id=m.competencia_id)
 AND (NOT EXISTS(SELECT 1 FROM public.emenda_liberacoes x
    WHERE x.lancamento_id=l.id AND x.competencia_id=m.competencia_id)
   OR (SELECT coalesce(sum(x.valor),0) FROM public.emenda_liberacoes x
    WHERE x.lancamento_id=l.id AND x.competencia_id=m.competencia_id)
    <>
    (SELECT coalesce(sum(p.valor),0) FROM public.emenda_blocos_pagamento p
    WHERE p.lancamento_id=l.id AND p.competencia_id=m.competencia_id));
 IF meses=0 OR pendentes>0 OR nota IS NULL OR nota-anulada<>liberada OR liberada<>paga
 THEN RAISE EXCEPTION 'Conciliação pendente: verifique todas as competências, pagamentos e anulação residual.'; END IF;
 UPDATE public.emenda_competencias_filhas f SET status='concluida'
 WHERE f.solicitacao_id=l.solicitacao_id AND EXISTS
 (SELECT 1 FROM public.emenda_lancamento_meses m WHERE m.lancamento_id=l.id
  AND m.competencia_id=f.competencia_id) AND f.status<>'sem_execucao';
 UPDATE public.emenda_solicitacoes SET status='encerrada' WHERE id=l.solicitacao_id;
 INSERT INTO public.emenda_conciliacoes_ne
 (emenda_id,lancamento_id,solicitacao_id,valor_ne,total_anulado,total_liberado,total_pago,competencia_total,numero_sei,link_sei)
 VALUES(l.emenda_id,l.id,l.solicitacao_id,nota,anulada,liberada,paga,meses,btrim(p_numero_sei),btrim(p_link_sei))
 RETURNING id INTO r;
 RETURN r;
END;$f$;

-- Emenda não excluída e parecer assinado: bloqueio por constraint/RPC.
-- As liberações da Fase 4 devem considerar a NE líquida das anulações; substitui
-- função antiga mantendo mesmo contrato, sem mexer em liberação já gravada.
CREATE OR REPLACE FUNCTION public.emenda_registrar_liberacao(
 p_lancamento uuid,p_competencia uuid,p_tipo text,p_valor numeric,
 p_data date,p_numero text,p_link text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
 nota numeric; total numeric; original_existe boolean; r uuid; anulada numeric;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' OR l.solicitacao_id IS NULL OR
   EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'NE não disponível para liberação.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses WHERE lancamento_id=l.id AND competencia_id=p_competencia)
  OR EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao WHERE lancamento_id=l.id AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência não disponível.'; END IF;
 IF p_tipo NOT IN ('original','complementar') OR p_data IS NULL OR p_data>CURRENT_DATE
  OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Dados da liberação inválidos.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.emenda_liberacoes WHERE lancamento_id=l.id AND competencia_id=p_competencia AND tipo='original')
 INTO original_existe;
 IF (p_tipo='original' AND original_existe) OR (p_tipo='complementar' AND NOT original_existe)
 THEN RAISE EXCEPTION 'Liberação original única e obrigatória antes de complementares.'; END IF;
 SELECT valor_ne INTO nota FROM public.emenda_solicitacoes WHERE id=l.solicitacao_id AND status='emitida';
 SELECT coalesce(sum(valor),0) INTO anulada FROM public.emenda_anulacoes WHERE lancamento_id=l.id;
 SELECT coalesce(sum(valor),0) INTO total FROM public.emenda_liberacoes WHERE lancamento_id=l.id;
 IF nota IS NULL OR total+p_valor>nota-anulada
 THEN RAISE EXCEPTION 'Liberação supera a NE líquida de anulações.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_liberacoes(emenda_id,lancamento_id,competencia_id,tipo,valor,data_liberacao,numero_sei,link_sei)
 VALUES(l.emenda_id,l.id,p_competencia,p_tipo,p_valor,p_data,btrim(p_numero),btrim(p_link))
 RETURNING id INTO r;
 RETURN r;
END;$f$;

CREATE OR REPLACE VIEW public.emendas_resumo WITH (security_invoker=true) AS
SELECT e.id,e.numero,e.exercicio,e.prestador_id,e.situacao,e.valor_autorizado_inicial,
  (e.valor_autorizado_inicial+e.valor_rendimento+coalesce(a.ajustes,0)) AS valor_autorizado_vigente,
  coalesce(a.total_ajustes,0)::integer AS total_ajustes,
  e.valor_rendimento,
  coalesce(s.reservado,0)::numeric(16,2) AS valor_reservado,
  coalesce(s.empenhado,0)::numeric(16,2) AS valor_empenhado,
  (e.valor_autorizado_inicial+e.valor_rendimento+coalesce(a.ajustes,0)
   -coalesce(s.reservado,0)-coalesce(s.empenhado,0))::numeric(16,2) AS saldo_disponivel
FROM public.emendas e
LEFT JOIN LATERAL (
 SELECT coalesce(sum(variacao),0) ajustes,count(*)::integer total_ajustes
 FROM public.emenda_ajustes_valor WHERE emenda_id=e.id
) a ON true
LEFT JOIN LATERAL (
 SELECT coalesce(sum(s.valor_solicitado) FILTER(WHERE s.status='aguardando_ne'),0) reservado,
        coalesce(sum(CASE WHEN s.status IN ('emitida','encerrada')
          THEN s.valor_ne - coalesce((SELECT sum(n.valor) FROM public.emenda_anulacoes n WHERE n.solicitacao_id=s.id),0)
          ELSE 0 END),0) empenhado
 FROM public.emenda_solicitacoes s WHERE s.emenda_id=e.id
) s ON true
WHERE e.excluida_em IS NULL;

-- Segurança de novas RPCs.
REVOKE ALL ON FUNCTION public.emenda_parecer_financeiro(uuid,text,text),
 public.emenda_confirmar_envio_sefaz(uuid),public.emenda_editar_lancamento(uuid,text,text,integer),
 public.emenda_excluir_lancamento(uuid),public.emenda_excluir_cadastro(uuid),
 public.emenda_anular_residual(uuid,numeric,text,text,text),
 public.emenda_conciliar_encerrar_ne(uuid,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_parecer_financeiro(uuid,text,text),
 public.emenda_confirmar_envio_sefaz(uuid),public.emenda_editar_lancamento(uuid,text,text,integer),
 public.emenda_excluir_lancamento(uuid),public.emenda_excluir_cadastro(uuid),
 public.emenda_anular_residual(uuid,numeric,text,text,text),
 public.emenda_conciliar_encerrar_ne(uuid,text,text)
 TO authenticated;
COMMIT;
