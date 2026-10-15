-- Encontro de Contas HMSJ — Fase 6. Dependências: Fases 0–5 (até Fase 4 SQL).
-- Operação atômica. Fechamento não modifica convênio. Integração exige duas RPCs.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL
  OR to_regclass('public.eletivas_correcoes') IS NULL
  OR to_regprocedure('public.ec_encerrar(uuid)') IS NULL
  OR to_regprocedure('public.ec_resumo_financeiro(uuid)') IS NULL
  OR to_regtype('public.app_role') IS NULL THEN
   RAISE EXCEPTION 'Fase 6 exige migrations Eletivas até Fase 4.' USING ERRCODE='23514';
 END IF;
END;$pre$;

-- Fechamentos versionados são somente anexados; revisões nunca apagadas.
CREATE TABLE IF NOT EXISTS public.eletivas_fechamentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 revisao integer NOT NULL CHECK(revisao>0),
 execucao_id uuid NOT NULL,
 motor_versao text NOT NULL,
 fontes_snapshot jsonb NOT NULL,
 valor_fechado numeric(16,2) NOT NULL,
 dados_snapshot jsonb NOT NULL,
 conteudo_md5 text NOT NULL CHECK(length(conteudo_md5)=32),
 fechamento_autor uuid NOT NULL REFERENCES auth.users(id),
 fechamento_em timestamptz NOT NULL DEFAULT now(),
 sei_conferencia text NOT NULL,
 justificativa text NOT NULL,
 UNIQUE(competencia_id,revisao)
);
CREATE INDEX IF NOT EXISTS ec_fechamentos_comp_idx
 ON public.eletivas_fechamentos(competencia_id,revisao DESC);
ALTER TABLE public.eletivas_fechamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_fechamentos_leitura ON public.eletivas_fechamentos;
CREATE POLICY ec_fechamentos_leitura ON public.eletivas_fechamentos
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND
 public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_fechamentos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_fechamentos TO authenticated;

CREATE TABLE IF NOT EXISTS public.eletivas_integracoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 fechamento_id uuid NOT NULL REFERENCES public.eletivas_fechamentos(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE RESTRICT,
 convenio_id uuid NOT NULL REFERENCES public.convenios(id) ON DELETE RESTRICT,
 prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 competencia text NOT NULL,
 valor_anterior numeric(16,2),
 valor_novo numeric(16,2) NOT NULL,
 diferenca numeric(16,2) NOT NULL,
 sei_autorizacao text NOT NULL,
 justificativa text NOT NULL,
 status text NOT NULL DEFAULT 'proposta' CHECK(status IN('proposta','aplicada','cancelada')),
 proposto_por uuid NOT NULL REFERENCES auth.users(id),
 proposto_em timestamptz NOT NULL DEFAULT now(),
 confirmado_por uuid REFERENCES auth.users(id),
 confirmado_em timestamptz,
 cancelado_por uuid REFERENCES auth.users(id),
 cancelado_em timestamptz,
 motivo_cancelamento text,
 CHECK (diferenca=valor_novo-COALESCE(valor_anterior,0))
);
CREATE UNIQUE INDEX IF NOT EXISTS ec_integracao_comp_ativa
 ON public.eletivas_integracoes(competencia_id) WHERE status IN('proposta','aplicada');
CREATE UNIQUE INDEX IF NOT EXISTS ec_integracao_lanc_ativo
 ON public.eletivas_integracoes(lancamento_id) WHERE status IN('proposta','aplicada');
CREATE INDEX IF NOT EXISTS ec_integracao_historico
 ON public.eletivas_integracoes(competencia_id,proposto_em DESC);
ALTER TABLE public.eletivas_integracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_integracoes_leitura ON public.eletivas_integracoes;
CREATE POLICY ec_integracoes_leitura ON public.eletivas_integracoes
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND
 public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_integracoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_integracoes TO authenticated;

-- Nem clientes autenticados nem RPCs genéricas podem sobrescrever o livro fiscal.
CREATE OR REPLACE FUNCTION public.ec_guardar_livro_fiscal()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $immutable$
BEGIN
 IF TG_TABLE_NAME='eletivas_fechamentos' THEN
   RAISE EXCEPTION 'Snapshot de fechamento imutável.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Proposta fiscal não pode ser apagada.' USING ERRCODE='42501';
 END IF;
 IF OLD.status='aplicada' OR OLD.status='cancelada'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.competencia_id IS DISTINCT FROM OLD.competencia_id
    OR NEW.fechamento_id IS DISTINCT FROM OLD.fechamento_id
    OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
    OR NEW.convenio_id IS DISTINCT FROM OLD.convenio_id
    OR NEW.prestador_id IS DISTINCT FROM OLD.prestador_id
    OR NEW.valor_anterior IS DISTINCT FROM OLD.valor_anterior
    OR NEW.valor_novo IS DISTINCT FROM OLD.valor_novo
    OR NEW.diferenca IS DISTINCT FROM OLD.diferenca
    OR NEW.sei_autorizacao IS DISTINCT FROM OLD.sei_autorizacao
    OR NEW.justificativa IS DISTINCT FROM OLD.justificativa
    OR NEW.proposto_por IS DISTINCT FROM OLD.proposto_por
    OR NEW.proposto_em IS DISTINCT FROM OLD.proposto_em
    OR NEW.status NOT IN('aplicada','cancelada')
    OR current_setting('app.ec_integracao_confirmada',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'Livro fiscal só pode transitar por RPC autorizada.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;$immutable$;
DROP TRIGGER IF EXISTS ec_fechamentos_immutable ON public.eletivas_fechamentos;
CREATE TRIGGER ec_fechamentos_immutable BEFORE UPDATE OR DELETE
 ON public.eletivas_fechamentos FOR EACH ROW
 EXECUTE FUNCTION public.ec_guardar_livro_fiscal();
DROP TRIGGER IF EXISTS ec_integracoes_immutable ON public.eletivas_integracoes;
CREATE TRIGGER ec_integracoes_immutable BEFORE UPDATE OR DELETE
 ON public.eletivas_integracoes FOR EACH ROW
 EXECUTE FUNCTION public.ec_guardar_livro_fiscal();

-- Verificação legível pela tela. O fechamento também mantém TODAS as travas
-- ec_encerrar das fases anteriores (execução, hash, conferência, FPO etc).
CREATE OR REPLACE FUNCTION public.ec_checklist_fechamento(p_comp uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $check$
DECLARE c public.eletivas_competencias%ROWTYPE;
 docs jsonb; valid_manifest boolean; valid_events boolean; valid_doc boolean;
 qtd bigint; sem_conferencia bigint; pendencias bigint; pend_corr bigint;
 fonte_qtd integer; divergencias integer;
 checks jsonb:='[]'::jsonb; bom boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp','aco']::public.app_role[]) THEN
   RAISE EXCEPTION 'Consulta fiscal não autorizada.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp;
 IF NOT FOUND THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE='23514'; END IF;
 docs:=c.documentos;
 SELECT count(*) INTO qtd FROM public.eletivas_itens WHERE competencia_id=p_comp;
 SELECT count(*) INTO sem_conferencia FROM public.eletivas_itens
   WHERE competencia_id=p_comp AND (conferido_por IS NULL OR conferido_em IS NULL);
 SELECT count(*) INTO pendencias FROM public.eletivas_itens
   WHERE competencia_id=p_comp AND
    (decisao='analise' OR (situacao IN('pendente','div','nc','fora') AND decisao IS NULL));
 SELECT count(*) INTO pend_corr FROM public.eletivas_correcoes
   WHERE competencia_id=p_comp AND status IN('em_analise','duplicada');
 SELECT count(DISTINCT categoria) INTO fonte_qtd FROM public.eletivas_arquivos
   WHERE competencia_id=p_comp AND categoria IN('dbf_faec','dbf_mac','s_faec','s_mac');
 valid_manifest:=c.ec_fontes_snapshot IS NOT NULL
   AND jsonb_typeof(c.ec_fontes_snapshot)='array'
   AND jsonb_array_length(c.ec_fontes_snapshot)>0
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.ec_fontes_snapshot)='array' THEN c.ec_fontes_snapshot ELSE '[]'::jsonb END) f
    LEFT JOIN public.eletivas_arquivos a ON a.id=(f->>'id')::uuid
    WHERE a.id IS NULL OR a.competencia_id IS DISTINCT FROM p_comp
      OR a.sha256 IS DISTINCT FROM f->>'sha256'
      OR a.categoria IS DISTINCT FROM f->>'categoria');
 valid_events:=EXISTS(SELECT 1 FROM public.eletivas_eventos e
  WHERE e.competencia_id=p_comp AND e.tipo IN('motor_execucao_v2','motor_execucao_local')
   AND e.dados->>'execucao_id'=c.ec_execucao_id::text);
 valid_doc:=COALESCE(docs->>'rtma_numero','')<>''
   AND COALESCE(docs->>'analise_numero','')<>''
   AND COALESCE(docs->>'rtma_link','') ~ '^https?://'
   AND COALESCE(docs->>'analise_link','') ~ '^https?://'
   AND COALESCE(docs->>'portaria_comissao','')<>''
   AND COALESCE(docs->>'amparo','')<>''
   AND COALESCE(docs->>'parecer','') IN ('validacao_total','validacao_parcial','nao_validado')
   AND jsonb_typeof(docs->'fiscais_rtma')='array'
   AND jsonb_typeof(docs->'fiscais_analise')='array'
   AND CASE WHEN jsonb_typeof(docs->'fiscais_rtma')='array'
     THEN jsonb_array_length(docs->'fiscais_rtma')>=2 ELSE false END
   AND CASE WHEN jsonb_typeof(docs->'fiscais_analise')='array'
     THEN jsonb_array_length(docs->'fiscais_analise')>=1 ELSE false END;
 SELECT count(*) INTO divergencias FROM public.eletivas_itens i
  WHERE i.competencia_id=p_comp AND
  ((i.origem='parser_validado' AND i.ec_execucao_id IS DISTINCT FROM c.ec_execucao_id)
   OR (i.categoria='faec_mult' AND i.decisao='aceito'
      AND i.detalhe->>'publicacao_independente' IS DISTINCT FROM 'true'));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','motor','ok',
   c.ec_execucao_id IS NOT NULL AND COALESCE(length(c.ec_motor_versao),0)>0
   AND valid_events,'detalhe','Versão, execução e evento do motor'));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','fontes','ok',
   fonte_qtd=4 AND valid_manifest
   AND (split_part(c.competencia,'/',2)::int*100+split_part(c.competencia,'/',1)::int)<202607
     OR fonte_qtd=4 AND valid_manifest AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(c.ec_fontes_snapshot) f WHERE f->>'categoria'='s_mac_ms'),
   'detalhe','Manifesto, SHA, 4 fontes obrigatórias e MAC MS desde julho/2026'));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','itens','ok',qtd>0,
   'detalhe','Itens existentes: '||qtd));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','conferencia','ok',
   sem_conferencia=0,'detalhe','Itens sem conferência: '||sem_conferencia));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','decisoes','ok',
   pendencias=0,'detalhe','Pendências sem decisão/aná lise: '||pendencias));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','correcoes','ok',
   pend_corr=0,'detalhe','Correções sem revisão: '||pend_corr));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','proveniencia','ok',
   divergencias=0,'detalhe','Itens sem execução/prova coerente: '||divergencias));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','validacao','ok',
   c.ec_origem_execucao IS DISTINCT FROM 'navegador' OR
   (c.ec_validado_em IS NOT NULL AND c.ec_validado_por IS NOT NULL),
   'detalhe','Validação fiscal expressa do processamento local'));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','documentos','ok',
   valid_doc,'detalhe','Nº/link SEI, parecer, amparo, portaria e fiscais declarados'));
 checks:=checks||jsonb_build_array(jsonb_build_object('id','status','ok',
   c.status<>'encerrada','detalhe','Competência não encerrada'));
 SELECT bool_and((value->>'ok')::boolean) INTO bom FROM jsonb_array_elements(checks);
 RETURN jsonb_build_object('apto',COALESCE(bom,false),'itens',checks,
   'competencia',c.competencia,'motor_versao',c.ec_motor_versao,
   'execucao_id',c.ec_execucao_id,'observacao',
   'Validação declaratória; conferir assinaturas e autenticidade diretamente no SEI.');
END;$check$;
REVOKE ALL ON FUNCTION public.ec_checklist_fechamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_checklist_fechamento(uuid) TO authenticated;

-- A guarda antiga só verificava o texto objeto do convênio ("eletiv").
-- Exigir identidade, vínculo e competência exata, sem inferência textual.
CREATE OR REPLACE FUNCTION public.ec_competencia_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF NEW.lancamento_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.lancamentos_pagamento l
   JOIN public.convenios cv ON cv.id=l.convenio_id
   WHERE l.id=NEW.lancamento_id AND l.competencia=NEW.competencia
     AND l.prestador_id=NEW.prestador_id AND cv.prestador_id=NEW.prestador_id
     AND cv.id=l.convenio_id AND l.parent_id IS NULL
     AND cv.modelo_fluxo='fluxo1'
 ) THEN
   RAISE EXCEPTION 'Vínculo inválido: lançamento único, prestador, convênio e competência devem coincidir no Fluxo 1.'
     USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status='encerrada' OR NEW.valor_fechado IS NOT NULL
      OR NEW.fechado_em IS NOT NULL THEN
     RAISE EXCEPTION 'Competência nova deve iniciar aberta e sem valor fechado.'
       USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.criado_por IS DISTINCT FROM OLD.criado_por
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
   RAISE EXCEPTION 'Criação/autoria imutáveis.' USING ERRCODE='23514';
 END IF;
 IF NEW.competencia IS DISTINCT FROM OLD.competencia
   OR NEW.prestador_id IS DISTINCT FROM OLD.prestador_id
   OR NEW.cnes IS DISTINCT FROM OLD.cnes THEN
   RAISE EXCEPTION 'Identidade da competência imutável.' USING ERRCODE='23514';
 END IF;
 IF OLD.status='encerrada' THEN
   IF NEW.status<>'encerrada' THEN
     IF current_setting('app.ec_reabrir_id',true) IS DISTINCT FROM OLD.id::text
        OR NEW.status<>'auditoria' OR NEW.valor_fechado IS NOT NULL
        OR NEW.fechado_em IS NOT NULL OR NEW.fechado_por IS NOT NULL
        OR NEW.documentos IS DISTINCT FROM OLD.documentos
        OR NEW.correcoes IS DISTINCT FROM OLD.correcoes
        OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id THEN
       RAISE EXCEPTION 'Reabertura só via procedimento formal, preservando as evidências.'
         USING ERRCODE='42501';
     END IF;
   ELSIF NEW.valor_fechado IS DISTINCT FROM OLD.valor_fechado
      OR NEW.fechado_em IS DISTINCT FROM OLD.fechado_em
      OR NEW.fechado_por IS DISTINCT FROM OLD.fechado_por
      OR NEW.documentos IS DISTINCT FROM OLD.documentos
      OR NEW.correcoes IS DISTINCT FROM OLD.correcoes
      OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id THEN
     RAISE EXCEPTION 'Fechamento imutável. Abra revisão formal se permitido.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 IF NEW.status='encerrada' AND OLD.status<>'encerrada'
    AND current_setting('app.ec_fechamento_id',true) IS DISTINCT FROM NEW.id::text THEN
   RAISE EXCEPTION 'Encerramento exclusivamente pela validação segura.'
     USING ERRCODE='42501';
 END IF;
 NEW.atualizado_em:=now();
 RETURN NEW;
END;$guard$;

-- Escolha expressa e auditável; não atualiza nenhum lançamento financeiro.
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
 SELECT * INTO cv FROM public.convenios WHERE id=p_convenio;
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lancamento FOR UPDATE;
 IF cv.id IS NULL OR l.id IS NULL OR
    cv.id IS DISTINCT FROM l.convenio_id OR
    cv.prestador_id IS DISTINCT FROM c.prestador_id OR
    l.prestador_id IS DISTINCT FROM c.prestador_id OR
    l.competencia IS DISTINCT FROM c.competencia OR
    l.parent_id IS NOT NULL OR cv.modelo_fluxo IS DISTINCT FROM 'fluxo1' THEN
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
 UPDATE public.eletivas_competencias SET lancamento_id=l.id WHERE id=c.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'vinculo_convenio_confirmado',jsonb_build_object(
   'anterior',c.lancamento_id,'lancamento',l.id,'convenio',cv.id,
   'competencia',c.competencia,'justificativa',p_justificativa),auth.uid());
END;$vinc$;
REVOKE ALL ON FUNCTION public.ec_vincular_lancamento(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_vincular_lancamento(uuid,uuid,uuid,text) TO authenticated;

-- O snapshot guarda decisões, valores, proveniência, correções, documentos e
-- manifesto ANTES de qualquer possível reabertura. RLS limita a visualização.
CREATE OR REPLACE FUNCTION public.ec_gerar_snapshot_fechamento(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $snap$
DECLARE c public.eletivas_competencias%ROWTYPE; payload jsonb;
 rev integer; sei text; motivo text;
BEGIN
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp;
 IF NOT FOUND OR c.status<>'encerrada' THEN
   RAISE EXCEPTION 'Snapshot requer fechamento efetivo.' USING ERRCODE='23514';
 END IF;
 sei:=coalesce(current_setting('app.ec_fechamento_sei',true),'');
 motivo:=coalesce(current_setting('app.ec_fechamento_justificativa',true),'');
 IF length(sei)<5 OR length(motivo)<20 THEN
   RAISE EXCEPTION 'Confirmacão de fechamento sem documento/motivo fiscal.'
     USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(max(revisao),0)+1 INTO rev
 FROM public.eletivas_fechamentos WHERE competencia_id=p_comp;
 payload:=jsonb_build_object(
  'competencia',c.competencia,'prestador_id',c.prestador_id,'cnes',c.cnes,
  'lancamento_id',c.lancamento_id,'execucao_id',c.ec_execucao_id,
  'motor_versao',c.ec_motor_versao,'fontes',c.ec_fontes_snapshot,
  'documentos',c.documentos,'valor_fechado',c.valor_fechado,
  'itens',COALESCE((SELECT jsonb_agg(
    jsonb_build_object('id',i.id,'chave',i.chave,'categoria',i.categoria,
     'aih',i.aih,'procedimento',i.procedimento,'valor_publicado',i.valor_publicado,
     'valor_esperado',i.valor_esperado,'situacao',i.situacao,'decisao',i.decisao,
     'versao_decisao',i.decisao_versao,'conferido_por',i.conferido_por,
     'conferido_em',i.conferido_em,'justificativa',i.justificativa,
     'detalhe',i.detalhe) ORDER BY i.chave,i.id)
    FROM public.eletivas_itens i WHERE i.competencia_id=p_comp),'[]'::jsonb),
  'correcoes',COALESCE((SELECT jsonb_agg(to_jsonb(corr) ORDER BY corr.id)
    FROM public.eletivas_correcoes corr WHERE corr.competencia_id=p_comp),'[]'::jsonb)
 );
 INSERT INTO public.eletivas_fechamentos(
   competencia_id,revisao,execucao_id,motor_versao,fontes_snapshot,
   valor_fechado,dados_snapshot,conteudo_md5,fechamento_autor,sei_conferencia,justificativa)
 VALUES(p_comp,rev,c.ec_execucao_id,c.ec_motor_versao,c.ec_fontes_snapshot,
   c.valor_fechado,payload,md5(payload::text),auth.uid(),sei,motivo);
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'fechamento_snapshot',jsonb_build_object(
   'revisao',rev,'valor',c.valor_fechado,'conteudo_md5',md5(payload::text),
   'execucao_id',c.ec_execucao_id),auth.uid());
END;$snap$;
REVOKE ALL ON FUNCTION public.ec_gerar_snapshot_fechamento(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ec_snapshot_apos_fechamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $as$
BEGIN
 IF NEW.status='encerrada' AND OLD.status IS DISTINCT FROM NEW.status THEN
   IF current_setting('app.ec_fechamento_id',true) IS DISTINCT FROM NEW.id::text THEN
     RAISE EXCEPTION 'Fechamento não autorizado para gerar snapshot.' USING ERRCODE='42501';
   END IF;
   PERFORM public.ec_gerar_snapshot_fechamento(NEW.id);
 END IF;
 RETURN NEW;
END;$as$;
DROP TRIGGER IF EXISTS ec_snapshot_final ON public.eletivas_competencias;
CREATE TRIGGER ec_snapshot_final AFTER UPDATE OF status
 ON public.eletivas_competencias FOR EACH ROW
 EXECUTE FUNCTION public.ec_snapshot_apos_fechamento();

-- A RPC existente continua intacta para validar as regras 0–4, mas deixa
-- de ser chamada diretamente pelo cliente. A única porta é ec_encerrar_seguro.
REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ec_encerrar_seguro(
 p_comp uuid,p_execucao uuid,p_sei text,p_justificativa text,p_confirmo boolean
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $close$
DECLARE c public.eletivas_competencias%ROWTYPE; checklist jsonb;
 valor numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Fechamento permitido apenas a fiscal ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF p_confirmo IS DISTINCT FROM true OR length(trim(coalesce(p_sei,'')))<5
  OR length(trim(coalesce(p_justificativa,'')))<20 THEN
   RAISE EXCEPTION 'Confirmação expressa, documento SEI e justificativa (20 caracteres) obrigatórios.'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status='encerrada' THEN
   RAISE EXCEPTION 'Encontro inexistente ou já encerrado.' USING ERRCODE='23514';
 END IF;
 IF c.ec_execucao_id IS DISTINCT FROM p_execucao THEN
   RAISE EXCEPTION 'Execução do motor mudou desde a conferência. Recarregue o checklist.'
     USING ERRCODE='40001';
 END IF;
 checklist:=public.ec_checklist_fechamento(p_comp);
 IF checklist->>'apto' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Checklist fiscal incompleto. Resolva os impedimentos antes do fechamento.'
     USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_fechamento_id',p_comp::text,true);
 PERFORM pg_catalog.set_config('app.ec_fechamento_sei',trim(p_sei),true);
 PERFORM pg_catalog.set_config('app.ec_fechamento_justificativa',trim(p_justificativa),true);
 valor:=public.ec_encerrar(p_comp);
 RETURN valor;
END;$close$;
REVOKE ALL ON FUNCTION public.ec_encerrar_seguro(uuid,uuid,text,text,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_encerrar_seguro(uuid,uuid,text,text,boolean)
 TO authenticated;
