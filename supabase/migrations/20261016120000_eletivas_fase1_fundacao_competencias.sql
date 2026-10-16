-- Eletivas Fase 1: preservar identidade, vínculo e documentos (HTML 2.42.2).
-- Migration incremental: não cria tabelas e não toca em lancamentos_pagamento.
BEGIN;
DO $pre$ BEGIN
 IF to_regprocedure('public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text)') IS NULL
 OR to_regprocedure('public.ec_vincular_lancamento(uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.ec_excluir_competencia(uuid,text)') IS NULL
 OR to_regclass('public.ec_cnes_instituicoes') IS NULL THEN
  RAISE EXCEPTION 'Aplique antes a fundação Eletivas e os complementos de 15/10/2026.'
   USING ERRCODE='23514';
 END IF;
END;$pre$;

-- Depois de documentos, revisões, fontes ou programação, só observação pode mudar.
-- O CNES vem do cadastro; p_cnes é conservado exclusivamente por compatibilidade.
CREATE OR REPLACE FUNCTION public.ec_editar_competencia(
 p_comp uuid,p_prest uuid,p_convenio uuid,p_lanc uuid,
 p_cnes text,p_observacao text,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $edit$
DECLARE c public.eletivas_competencias%ROWTYPE;comp text; cnes_oficial text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Edição requer ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(trim(coalesce(p_motivo,'')))<15 THEN
   RAISE EXCEPTION 'Informe motivo da edição (15 caracteres).' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status<>'preparacao' OR c.ec_execucao_id IS NOT NULL
    OR c.ec_fontes_snapshot IS NOT NULL
    OR c.documentos IS DISTINCT FROM '{}'::jsonb
    OR c.correcoes IS DISTINCT FROM '[]'::jsonb
    OR EXISTS(SELECT 1 FROM public.eletivas_correcoes WHERE competencia_id=p_comp)
    OR EXISTS(SELECT 1 FROM public.eletivas_decisoes_revisoes WHERE competencia_id=p_comp)
    OR EXISTS(SELECT 1 FROM public.eletivas_fpo_programacoes WHERE competencia_id=p_comp)
    OR EXISTS(SELECT 1 FROM public.eletivas_atos_especiais WHERE competencia_id=p_comp)
    OR EXISTS(SELECT 1 FROM public.eletivas_publicacoes_aih WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_arquivos WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_fechamentos WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_integracoes WHERE competencia_id=p_comp) THEN
   RAISE EXCEPTION 'Edição do lançamento só antes de upload/conciliação ou qualquer atesto.'
     USING ERRCODE='23514';
 END IF;
 PERFORM 1 FROM public.lancamentos_pagamento WHERE id=p_lanc FOR UPDATE;
 comp:=public.ec_validar_lancamento_elegivel(p_lanc,p_prest,p_convenio);
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
    WHERE id<>p_comp AND (lancamento_id=p_lanc OR
      (prestador_id=p_prest AND competencia=comp))) THEN
    RAISE EXCEPTION 'Já existe encontro para este lançamento/competência.'
      USING ERRCODE='23505';
 END IF;
 SELECT r.cnes INTO cnes_oficial FROM public.ec_cnes_instituicoes r
   WHERE r.prestador_id=p_prest;
  IF cnes_oficial IS NULL THEN
    RAISE EXCEPTION 'Prestador sem CNES institucional cadastrado.' USING ERRCODE='23514';
  END IF;
  IF nullif(btrim(coalesce(p_cnes,'')),'') IS NOT NULL
     AND btrim(p_cnes) IS DISTINCT FROM cnes_oficial THEN
    RAISE EXCEPTION 'CNES divergente do cadastro institucional; recarregue a seleção.'
     USING ERRCODE='23514';
  END IF;
 PERFORM pg_catalog.set_config('app.ec_editar_competencia',p_comp::text,true);
 UPDATE public.eletivas_competencias
 SET prestador_id=p_prest,competencia=comp,cnes=cnes_oficial,
    lancamento_id=p_lanc,observacao=left(nullif(trim(coalesce(p_observacao,'')),''),1000)
 WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'encontro_editado',jsonb_build_object(
   'lancamento_antigo',c.lancamento_id,'lancamento_novo',p_lanc,
   'competencia_antiga',c.competencia,'competencia_nova',comp,
   'prestador_antigo',c.prestador_id,'prestador_novo',p_prest,
   'motivo',trim(p_motivo)),auth.uid());
END;$edit$;
REVOKE ALL ON FUNCTION public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text) TO authenticated;

-- Legado pode ser vinculado pela primeira vez; encontro já vinculado não troca parcela.
CREATE OR REPLACE FUNCTION public.ec_vincular_lancamento(
 p_comp uuid,p_convenio uuid,p_lancamento uuid,p_justificativa text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $vinc$
DECLARE c public.eletivas_competencias%ROWTYPE;
 l public.lancamentos_pagamento%ROWTYPE; cv public.convenios%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Vínculo restrito a fiscal ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(trim(coalesce(p_justificativa,'')))<15 THEN
   RAISE EXCEPTION 'Justifique a identificação deste lançamento (15 caracteres).'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status='encerrada' THEN
   RAISE EXCEPTION 'Vincule antes do fechamento, em competência aberta.' USING ERRCODE='23514';
 END IF;
 -- Não trocar vínculo já estabelecido, mesmo antes de fechar o encontro.
  IF c.lancamento_id IS NOT NULL THEN
    IF c.lancamento_id=p_lancamento THEN RETURN; END IF;
    RAISE EXCEPTION 'Encontro já vinculado. Não é permitido substituir o lançamento de origem.'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO cv FROM public.convenios WHERE id=p_convenio;
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lancamento FOR UPDATE;
 IF cv.id IS NULL OR l.id IS NULL OR
    cv.id IS DISTINCT FROM l.convenio_id OR
    cv.prestador_id IS DISTINCT FROM c.prestador_id OR
    l.prestador_id IS DISTINCT FROM c.prestador_id OR
    l.competencia IS DISTINCT FROM c.competencia OR
    l.concluido OR l.data_pagamento IS NOT NULL OR
    l.link_comprovante_pagamento_sei IS NOT NULL OR
    cv.modelo_fluxo IS DISTINCT FROM 'fluxo_1' THEN
   RAISE EXCEPTION 'Vínculo rejeitado: IDs, prestador, Fluxo 1 e competência exata não conferem.'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias e
    WHERE e.lancamento_id=l.id AND e.id<>c.id) THEN
   RAISE EXCEPTION 'Lançamento já está associado a outra competência.'
     USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes
    WHERE competencia_id=c.id OR lancamento_id=l.id) THEN
   RAISE EXCEPTION 'Vínculo já possui histórico de proposta/aplicação; não pode ser redefinido.'
     USING ERRCODE='23514';
 END IF;
 IF c.lancamento_id IS NOT DISTINCT FROM l.id THEN RETURN; END IF;
 PERFORM pg_catalog.set_config('app.ec_vinculo_comp',c.id::text,true);
 UPDATE public.eletivas_competencias SET lancamento_id=l.id WHERE id=c.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'vinculo_convenio_confirmado',jsonb_build_object(
   'anterior',c.lancamento_id,'lancamento',l.id,'convenio',cv.id,
   'competencia',c.competencia,'justificativa',p_justificativa),auth.uid());
END;$vinc$;
REVOKE ALL ON FUNCTION public.ec_vincular_lancamento(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_vincular_lancamento(uuid,uuid,uuid,text) TO authenticated;

-- Mesmo documento preenchido no JSON da competência impede exclusão.
CREATE OR REPLACE FUNCTION public.ec_excluir_competencia(
 p_comp uuid,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $del$
DECLARE c public.eletivas_competencias%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Exclusão só por ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(trim(coalesce(p_motivo,'')))<20 THEN
   RAISE EXCEPTION 'Exclusão exige justificativa de pelo menos 20 caracteres.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status<>'preparacao' OR c.lancamento_id IS NULL
   OR c.ec_execucao_id IS NOT NULL
    OR c.ec_fontes_snapshot IS NOT NULL
    OR c.documentos IS DISTINCT FROM '{}'::jsonb
    OR c.correcoes IS DISTINCT FROM '[]'::jsonb
   OR EXISTS(SELECT 1 FROM public.eletivas_arquivos WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_itens WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_fechamentos WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_integracoes WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_correcoes WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_fpo_programacoes WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_atos_especiais WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_publicacoes_aih WHERE competencia_id=p_comp)
   OR EXISTS(SELECT 1 FROM public.eletivas_decisoes_revisoes WHERE competencia_id=p_comp) THEN
   RAISE EXCEPTION 'Encontro com evidências/decisões/fechamento não pode ser excluído. Preserve a trilha fiscal.'
     USING ERRCODE='23514';
 END IF;
 INSERT INTO public.eletivas_exclusoes(competencia_id_original,prestador_id,
    lancamento_id,competencia,cnes,observacao,eventos_json,motivo,excluido_por)
 VALUES(c.id,c.prestador_id,c.lancamento_id,c.competencia,c.cnes,c.observacao,
   COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.ocorrido_em,e.id)
     FROM public.eletivas_eventos e WHERE e.competencia_id=p_comp),'[]'::jsonb),
   trim(p_motivo),auth.uid());
 -- Apenas rascunho sem evidências. Eventos simples ficam preservados no
 -- registro independente de exclusão; a FK dos eventos permite CASCADE.
 DELETE FROM public.eletivas_competencias WHERE id=p_comp;
END;$del$;
REVOKE ALL ON FUNCTION public.ec_excluir_competencia(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_excluir_competencia(uuid,text) TO authenticated;
COMMIT;
