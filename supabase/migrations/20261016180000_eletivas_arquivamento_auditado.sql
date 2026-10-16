-- Eletivas · Ajustes antes da Fase 3 (2026-10-16).
-- Arquivamento reversível de testes/auditorias: não perde evidências e NÃO
-- libera outro encontro para o mesmo prestador/competência (UNIQUE original).
-- Não altera lançamentos, atestos, fontes, itens ou valores.
BEGIN;
DO $pre$ BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL
  OR to_regclass('public.eletivas_eventos') IS NULL
  OR to_regclass('public.eletivas_integracoes') IS NULL
  OR to_regclass('public.eletivas_atesto_escolhas') IS NULL
  OR to_regprocedure('public.ec_listar_parcelas_encontro()') IS NULL THEN
   RAISE EXCEPTION 'Aplique previamente todas as migrations institucionais Eletivas.'
    USING ERRCODE='23514';
 END IF;
END;$pre$;

ALTER TABLE public.eletivas_competencias
 ADD COLUMN IF NOT EXISTS arquivada_em timestamptz,
 ADD COLUMN IF NOT EXISTS arquivada_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS arquivada_motivo text;
ALTER TABLE public.eletivas_competencias
 DROP CONSTRAINT IF EXISTS ec_arquivamento_campos_coerentes;
ALTER TABLE public.eletivas_competencias
 ADD CONSTRAINT ec_arquivamento_campos_coerentes CHECK(
   (arquivada_em IS NULL AND arquivada_por IS NULL AND arquivada_motivo IS NULL)
   OR
   (arquivada_em IS NOT NULL AND arquivada_por IS NOT NULL
    AND length(btrim(arquivada_motivo)) >= 20)
 );
COMMENT ON COLUMN public.eletivas_competencias.arquivada_em IS
 'Retirada da lista ativa SEM destruir fontes, itens, decisões ou histórico fiscal.';
CREATE INDEX IF NOT EXISTS ec_comp_arquivadas_idx
 ON public.eletivas_competencias(arquivada_em) WHERE arquivada_em IS NOT NULL;

-- Bloqueia atualização da competência arquivada e arquivamento direto pelo
-- navegador. Somente as RPCs autenticadas autorizam a transição de estado.
CREATE OR REPLACE FUNCTION public.ec_proteger_competencia_arquivada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
DECLARE igual boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.arquivada_em IS NOT NULL OR NEW.arquivada_por IS NOT NULL
    OR NEW.arquivada_motivo IS NOT NULL THEN
   RAISE EXCEPTION 'Criação de encontro arquivado não permitida.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 igual := (to_jsonb(NEW)-'arquivada_em'-'arquivada_por'-'arquivada_motivo'-'atualizado_em')
   IS NOT DISTINCT FROM
   (to_jsonb(OLD)-'arquivada_em'-'arquivada_por'-'arquivada_motivo'-'atualizado_em');
 IF OLD.arquivada_em IS NULL THEN
  IF NEW.arquivada_em IS NULL THEN
   IF NEW.arquivada_por IS NOT NULL OR NEW.arquivada_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'Metadados de arquivamento sem data.' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
  END IF;
  IF current_setting('app.ec_arquivar_competencia',true) IS DISTINCT FROM OLD.id::text
     OR NOT igual THEN
   RAISE EXCEPTION 'Arquivamento somente via procedimento fiscal; demais dados imutáveis.'
    USING ERRCODE='42501';
  END IF;
 ELSE
  IF current_setting('app.ec_restaurar_competencia',true) IS DISTINCT FROM OLD.id::text
     OR NEW.arquivada_em IS NOT NULL OR NEW.arquivada_por IS NOT NULL
     OR NEW.arquivada_motivo IS NOT NULL OR NOT igual THEN
   RAISE EXCEPTION 'Competência arquivada: somente restauração auditada pode alterá-la.'
    USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS ec_comp_arquivada_guard ON public.eletivas_competencias;
CREATE TRIGGER ec_comp_arquivada_guard BEFORE INSERT OR UPDATE
 ON public.eletivas_competencias FOR EACH ROW
 EXECUTE FUNCTION public.ec_proteger_competencia_arquivada();

-- Impossibilita novos uploads, decisões ou alterações de itens de encontros
-- arquivados. Tabelas já imutáveis mantêm suas próprias regras adicionais.
CREATE OR REPLACE FUNCTION public.ec_proteger_evidencia_arquivada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $block$
DECLARE v_comp uuid;
BEGIN
 v_comp := CASE WHEN TG_OP='DELETE' THEN OLD.competencia_id ELSE NEW.competencia_id END;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
    WHERE id=v_comp AND arquivada_em IS NOT NULL) THEN
  RAISE EXCEPTION 'Competência arquivada: restaure antes de registrar ou alterar evidências.'
   USING ERRCODE='23514';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$block$;
DO $trig$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
   'eletivas_arquivos','eletivas_itens','eletivas_correcoes',
   'eletivas_decisoes_revisoes','eletivas_fpo_programacoes',
   'eletivas_atos_especiais','eletivas_publicacoes_aih',
   'eletivas_fechamentos','eletivas_integracoes'
 ] LOOP
   IF to_regclass('public.'||t) IS NULL THEN
    RAISE EXCEPTION 'Tabela de evidência ausente: %',t USING ERRCODE='23514';
   END IF;
   EXECUTE format('DROP TRIGGER IF EXISTS ec_arquivado_block ON public.%I',t);
   EXECUTE format('CREATE TRIGGER ec_arquivado_block BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ec_proteger_evidencia_arquivada()',t);
 END LOOP;
END;
$trig$;

-- Arquivamento apenas de competência não encerrada e sem qualquer histórico
-- de fechamento, integração ou escolha formal de atesto. Não elimina o vínculo
-- nem libera criação duplicada da mesma competência.
CREATE OR REPLACE FUNCTION public.ec_arquivar_competencia(
 p_comp uuid,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $archive$
DECLARE c public.eletivas_competencias%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(
  auth.uid(),ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Arquivamento restrito a ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_motivo,'')))<20 THEN
  RAISE EXCEPTION 'Justificativa obrigatória: mínimo 20 caracteres.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.arquivada_em IS NOT NULL THEN
  RAISE EXCEPTION 'Encontro inexistente ou já arquivado.' USING ERRCODE='23514';
 END IF;
 IF c.status='encerrada'
   OR EXISTS(SELECT 1 FROM public.eletivas_fechamentos f WHERE f.competencia_id=c.id)
   OR EXISTS(SELECT 1 FROM public.eletivas_integracoes i WHERE i.competencia_id=c.id)
   OR EXISTS(SELECT 1 FROM public.eletivas_atesto_escolhas e
      WHERE e.competencia_id=c.id
         OR (c.lancamento_id IS NOT NULL AND e.lancamento_id=c.lancamento_id)) THEN
  RAISE EXCEPTION 'Encontro com fechamento, integração ou escolha fiscal: arquivamento bloqueado.'
   USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_arquivar_competencia',c.id::text,true);
 UPDATE public.eletivas_competencias SET
  arquivada_em=now(),arquivada_por=auth.uid(),arquivada_motivo=btrim(p_motivo)
  WHERE id=c.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'encontro_arquivado',jsonb_build_object(
  'motivo',btrim(p_motivo),'status_anterior',c.status,
  'lancamento_preservado',c.lancamento_id,
  'documentos_preservados',true,'itens_preservados',true),auth.uid());
END;
$archive$;
REVOKE ALL ON FUNCTION public.ec_arquivar_competencia(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_arquivar_competencia(uuid,text) TO authenticated;

-- Recuperação auditada da MESMA competência, seus arquivos e decisões.
CREATE OR REPLACE FUNCTION public.ec_restaurar_competencia(
 p_comp uuid,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $restore$
DECLARE c public.eletivas_competencias%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(
  auth.uid(),ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Restauração restrita a ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_motivo,'')))<20 THEN
  RAISE EXCEPTION 'Justificativa obrigatória: mínimo 20 caracteres.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.arquivada_em IS NULL THEN
  RAISE EXCEPTION 'Encontro inexistente ou não arquivado.' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_restaurar_competencia',c.id::text,true);
 UPDATE public.eletivas_competencias SET
  arquivada_em=NULL,arquivada_por=NULL,arquivada_motivo=NULL
  WHERE id=c.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'encontro_restaurado',jsonb_build_object(
  'motivo',btrim(p_motivo),'arquivado_em_anterior',c.arquivada_em,
  'motivo_arquivamento_anterior',c.arquivada_motivo),auth.uid());
END;
$restore$;
REVOKE ALL ON FUNCTION public.ec_restaurar_competencia(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_restaurar_competencia(uuid,text) TO authenticated;

-- A parcela já vinculada deve apontar para o registro original mesmo arquivado;
-- portanto ela NÃO fica disponível para criação de nova auditoria.
CREATE OR REPLACE FUNCTION public.ec_listar_parcelas_encontro()
RETURNS TABLE(
 lancamento_id uuid,prestador_id uuid,nome_instituicao text,
 convenio_id uuid,objeto text,competencia text,parcela text,descricao text,
 valor_atestado numeric,cnes_institucional text,
 encontro_id uuid,encontro_lancamento_id uuid,encontro_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $lista$
 SELECT l.id,l.prestador_id,p.nome_instituicao::text,l.convenio_id,cv.objeto::text,
  l.competencia::text,l.parcela::text,l.descricao::text,l.valor_atestado,
  COALESCE(reg.cnes,e.cnes)::text,e.id,e.lancamento_id,
  CASE WHEN e.arquivada_em IS NOT NULL THEN 'arquivada' ELSE e.status::text END
 FROM public.lancamentos_pagamento l
 JOIN public.prestadores p ON p.id=l.prestador_id
 JOIN public.convenios cv ON cv.id=l.convenio_id
  AND cv.prestador_id=l.prestador_id
 LEFT JOIN public.eletivas_competencias e ON
  e.prestador_id=l.prestador_id AND e.competencia=l.competencia
 LEFT JOIN public.ec_cnes_instituicoes reg ON reg.prestador_id=l.prestador_id
 WHERE auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(),
  ARRAY['admin','acp','aco']::public.app_role[])
  AND cv.modelo_fluxo='fluxo_1'
  AND l.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  AND NOT l.concluido
  AND l.data_pagamento IS NULL
  AND l.link_comprovante_pagamento_sei IS NULL
  AND (e.id IS NULL OR e.lancamento_id=l.id OR
   (e.lancamento_id IS NULL AND e.status<>'encerrada'))
  AND COALESCE(reg.cnes,e.cnes) IS NOT NULL
 ORDER BY p.nome_instituicao,cv.objeto,l.competencia,l.parcela;
$lista$;
REVOKE ALL ON FUNCTION public.ec_listar_parcelas_encontro() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_listar_parcelas_encontro() TO authenticated;

COMMIT;
