-- PACTO · Emendas · Parecer favorável sem comentário e invalidação de dotação.
-- Dependência: migrations anteriores até a Fase 5.
BEGIN;

-- O comentário é obrigatório apenas na recusa. Parecer aprovado pode não ter texto.
ALTER TABLE public.emenda_pareceres_financeiros
 DROP CONSTRAINT IF EXISTS emenda_pareceres_financeiros_comentario_check;
ALTER TABLE public.emenda_pareceres_financeiros
 ADD CONSTRAINT emenda_pareceres_comentario_por_desfecho
 CHECK (desfecho='aprovado' OR length(btrim(comentario)) >= 5);

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
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL
 THEN RAISE EXCEPTION 'Lançamento não está em preparação.'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.emenda_etapas_documentais
  WHERE lancamento_id=p_lancamento AND etapa='dotacao' AND coord_orcamentos_confirmada
   AND nullif(btrim(coalesce(dotacao,'')),'') IS NOT NULL
   AND nullif(btrim(coalesce(fonte,'')),'') IS NOT NULL
 ) THEN RAISE EXCEPTION 'Confirme a dotação e fonte antes da autorização.'; END IF;
 IF p_desfecho IS NULL OR p_desfecho NOT IN ('aprovado','recusado') OR
   (p_desfecho='recusado' AND length(btrim(coalesce(p_comentario,'')))<5)
 THEN RAISE EXCEPTION 'A recusa exige uma justificativa de pelo menos 5 caracteres.'; END IF;
 INSERT INTO public.emenda_pareceres_financeiros(emenda_id,lancamento_id,desfecho,comentario)
 VALUES(l.emenda_id,l.id,p_desfecho,
    CASE WHEN p_desfecho='aprovado' THEN '' ELSE btrim(p_comentario) END)
 RETURNING id INTO r;
 -- A nova decisão invalida solicitação e assinaturas anteriores,
 -- mas não apaga a trilha histórica dos pareceres.
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao';
 RETURN r;
END;$f$;

-- Quando o usuário retira a confirmação, o rascunho perde a etapa 1.
-- Não mexer em NE emitida, pedido formalizado ou lançamentos fora de rascunho.
CREATE FUNCTION public.emenda_invalidar_dotacao(p_lancamento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para alterar a dotação.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR l.excluido_em IS NOT NULL OR l.solicitacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'Somente dotação de lançamento em preparação pode ser invalidada.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Lançamento possui envio confirmado.'; END IF;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_etapas_documentais
  WHERE lancamento_id=l.id AND etapa IN ('solicitacao','autorizacao','dotacao');
 -- Pareceres permanecem auditáveis; um novo parecer deverá seguir a próxima confirmação.
 RETURN true;
END;$f$;

REVOKE ALL ON FUNCTION public.emenda_invalidar_dotacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_invalidar_dotacao(uuid) TO authenticated;
-- Reabrir cadastro ou excluir rascunho com somente dotação é permitido.
-- Alteração de competências invalida a dotação, sem remover pareceres ou atos financeiros
-- (esses casos permanecem bloqueados). A exclusão lógica mantém o histórico.
CREATE OR REPLACE FUNCTION public.emenda_editar_lancamento(p_lancamento uuid,p_competencia text,p_periodicidade text,p_parcela integer)
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
   OR EXISTS(SELECT 1 FROM public.emenda_etapas_documentais
      WHERE lancamento_id=l.id AND etapa<>'dotacao')
   OR EXISTS(SELECT 1 FROM public.emenda_pareceres_financeiros WHERE lancamento_id=l.id)
   OR EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
   OR EXISTS(SELECT 1 FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Somente rascunhos sem pareceres, solicitações ou outros atos podem ser editados.'; END IF;
 IF p_competencia IS NULL OR p_competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
 THEN RAISE EXCEPTION 'Competência inválida.'; END IF;
 n:=CASE p_periodicidade WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 ELSE NULL END;
 IF n IS NULL OR p_parcela IS NULL OR p_parcela<1 OR p_parcela+n-1>9999
 THEN RAISE EXCEPTION 'Periodicidade/parcela inválida.'; END IF;
 inicio:=make_date(substring(p_competencia,4,4)::int,substring(p_competencia,1,2)::int,1);
 -- Uma dotação isolada pode ser reaberta, com invalidação auditável.
 IF EXISTS(SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='dotacao')
 THEN PERFORM public.emenda_invalidar_dotacao(l.id); END IF;
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

CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento(p_lancamento uuid)
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
 IF EXISTS(SELECT 1 FROM public.emenda_etapas_documentais
      WHERE lancamento_id=l.id AND etapa<>'dotacao')
  OR EXISTS(SELECT 1 FROM public.emenda_pareceres_financeiros WHERE lancamento_id=l.id)
  OR EXISTS(SELECT 1 FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id)
  OR EXISTS(SELECT 1 FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Lançamento possui atos financeiros ou assinaturas; não pode ser excluído.'; END IF;
 UPDATE public.emenda_lancamentos SET status='cancelado',excluido_em=now(),excluido_por=ator,updated_at=now()
 WHERE id=l.id;
 RETURN l.id;
END;$f$;

COMMIT;
