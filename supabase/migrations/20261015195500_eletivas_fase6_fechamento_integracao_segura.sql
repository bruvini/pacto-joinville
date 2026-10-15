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
     AND cv.modelo_fluxo='fluxo_1'
 ) THEN
   RAISE EXCEPTION 'Vínculo inválido: lançamento único, prestador, convênio e competência devem coincidir no Fluxo 1.'
     USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.lancamento_id IS NOT NULL THEN
     RAISE EXCEPTION 'Crie a competência sem vínculo. Selecione lançamento via ec_vincular_lancamento.'
       USING ERRCODE='42501';
   END IF;
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
 IF NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id AND
   current_setting('app.ec_vinculo_comp',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'O vínculo só pode ser alterado pela confirmação explícita do fiscal.'
      USING ERRCODE='42501';
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
      OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
      OR NEW.observacao IS DISTINCT FROM OLD.observacao
      OR NEW.ec_execucao_id IS DISTINCT FROM OLD.ec_execucao_id
      OR NEW.ec_fontes_snapshot IS DISTINCT FROM OLD.ec_fontes_snapshot
      OR NEW.ec_motor_versao IS DISTINCT FROM OLD.ec_motor_versao THEN
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
    l.parent_id IS NOT NULL OR cv.modelo_fluxo IS DISTINCT FROM 'fluxo_1' THEN
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

-- As propostas só podem ser criadas mediante ação humana em um fechamento
-- versionado. Não há efeito financeiro ao PROPOR.
CREATE OR REPLACE FUNCTION public.ec_propor_integracao(
 p_comp uuid,p_lancamento uuid,p_valor_anterior numeric,
 p_sei text,p_justificativa text,p_confirmo boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $proposal$
DECLARE c public.eletivas_competencias%ROWTYPE;
 f public.eletivas_fechamentos%ROWTYPE;
 l public.lancamentos_pagamento%ROWTYPE;
 conv public.convenios%ROWTYPE; novo uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Proposta restrita a fiscal ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF p_confirmo IS DISTINCT FROM true OR length(trim(coalesce(p_sei,'')))<5
   OR length(trim(coalesce(p_justificativa,'')))<20 THEN
   RAISE EXCEPTION 'Para propor, confirme intenção, SEI e justificativa (20 caracteres).'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status<>'encerrada' OR c.lancamento_id IS DISTINCT FROM p_lancamento THEN
   RAISE EXCEPTION 'Fechamento e vínculo explícito obrigatórios antes de propor.'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO f FROM public.eletivas_fechamentos
   WHERE competencia_id=p_comp ORDER BY revisao DESC LIMIT 1;
 IF NOT FOUND OR f.valor_fechado IS DISTINCT FROM c.valor_fechado OR
   f.execucao_id IS DISTINCT FROM c.ec_execucao_id OR
   f.dados_snapshot->>'lancamento_id' IS DISTINCT FROM p_lancamento::text THEN
   RAISE EXCEPTION 'Snapshot de fechamento divergente ou indisponível.'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lancamento FOR UPDATE;
 SELECT * INTO conv FROM public.convenios WHERE id=l.convenio_id;
 IF l.id IS NULL OR conv.id IS NULL OR l.prestador_id IS DISTINCT FROM c.prestador_id
   OR conv.prestador_id IS DISTINCT FROM c.prestador_id
   OR l.competencia IS DISTINCT FROM c.competencia
   OR l.convenio_id IS NULL OR conv.modelo_fluxo IS DISTINCT FROM 'fluxo_1'
   OR l.parent_id IS NOT NULL OR l.concluido=true
   OR l.data_pagamento IS NOT NULL THEN
   RAISE EXCEPTION 'Lançamento não elegível: identidade, Fluxo 1, competência ou execução posterior.'
     USING ERRCODE='23514';
 END IF;
 IF l.valor_atestado IS DISTINCT FROM p_valor_anterior THEN
   RAISE EXCEPTION 'Valor anterior mudou; atualize a prévia antes de propor.'
     USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes e
  WHERE e.competencia_id=p_comp AND e.status IN('proposta','aplicada')
    OR e.lancamento_id=p_lancamento AND e.status IN('proposta','aplicada')) THEN
   RAISE EXCEPTION 'Esta competência ou lançamento já possui proposta/atesto ativo.'
     USING ERRCODE='23505';
 END IF;
 INSERT INTO public.eletivas_integracoes(
  competencia_id,fechamento_id,lancamento_id,convenio_id,prestador_id,competencia,
  valor_anterior,valor_novo,diferenca,sei_autorizacao,justificativa,proposto_por)
 VALUES(c.id,f.id,l.id,conv.id,c.prestador_id,c.competencia,
   l.valor_atestado,f.valor_fechado,
   f.valor_fechado-COALESCE(l.valor_atestado,0),trim(p_sei),
   trim(p_justificativa),auth.uid())
 RETURNING id INTO novo;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'proposta_etapa6_criada',jsonb_build_object(
   'proposta_id',novo,'fechamento',f.id,'convenio',conv.id,
   'lancamento',l.id,'valor_anterior',l.valor_atestado,
   'valor_novo',f.valor_fechado,'sei',trim(p_sei)),auth.uid());
 RETURN novo;
END;$proposal$;
REVOKE ALL ON FUNCTION public.ec_propor_integracao(uuid,uuid,numeric,text,text,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_propor_integracao(uuid,uuid,numeric,text,text,boolean)
 TO authenticated;

-- Aplica apenas o campo valor_atestado da Etapa 6. Não conclui etapa,
-- não simula assinatura, não gera liquidação, pagamento, ofício ou NE.
CREATE OR REPLACE FUNCTION public.ec_aplicar_integracao(
 p_proposta uuid,p_valor_anterior numeric,p_confirmo boolean
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $apply$
DECLARE e public.eletivas_integracoes%ROWTYPE;
 c public.eletivas_competencias%ROWTYPE;
 l public.lancamentos_pagamento%ROWTYPE;
 f public.eletivas_fechamentos%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Aplicação permitida somente a fiscal ACP/Admin.'
    USING ERRCODE='42501';
 END IF;
 IF p_confirmo IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Confirmação expressa obrigatória para alterar o convênio.'
    USING ERRCODE='23514';
 END IF;
 -- Lock por competência primeiro, compatível com fechamento e reabertura.
 SELECT * INTO c FROM public.eletivas_competencias
   WHERE id=(SELECT competencia_id FROM public.eletivas_integracoes WHERE id=p_proposta)
   FOR UPDATE;
 IF NOT FOUND OR c.status<>'encerrada' THEN
  RAISE EXCEPTION 'Competência não fechada ou proposta inexistente.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento
   WHERE id=(SELECT lancamento_id FROM public.eletivas_integracoes WHERE id=p_proposta)
   FOR UPDATE;
 SELECT * INTO e FROM public.eletivas_integracoes WHERE id=p_proposta FOR UPDATE;
 SELECT * INTO f FROM public.eletivas_fechamentos WHERE id=e.fechamento_id;
 IF e.id IS NULL OR e.status<>'proposta' OR l.id IS NULL OR f.id IS NULL
   OR e.competencia_id IS DISTINCT FROM c.id OR
   e.lancamento_id IS DISTINCT FROM c.lancamento_id OR
   e.valor_novo IS DISTINCT FROM c.valor_fechado OR
   e.valor_novo IS DISTINCT FROM f.valor_fechado OR
   e.competencia IS DISTINCT FROM l.competencia OR
   e.prestador_id IS DISTINCT FROM l.prestador_id OR
   e.convenio_id IS DISTINCT FROM l.convenio_id THEN
   RAISE EXCEPTION 'Proposta obsoleta, duplicada ou incompatível com o fechamento.'
     USING ERRCODE='23514';
 END IF;
 IF l.valor_atestado IS DISTINCT FROM e.valor_anterior
  OR l.valor_atestado IS DISTINCT FROM p_valor_anterior THEN
   RAISE EXCEPTION 'O valor na Etapa 6 mudou desde a proposta; aplicação cancelada.'
     USING ERRCODE='40001';
 END IF;
 -- O valor preexistente não pode ser silenciosamente substituído.
 -- Deve ser tratado em revisão específica da Etapa 6, fora desta RPC.
 IF COALESCE(l.valor_atestado,0)<>0 THEN
   RAISE EXCEPTION 'Lançamento já possui valor atestado. Revise-o na Etapa 6; integração não sobrescreve atesto existente.'
     USING ERRCODE='23514';
 END IF;
 IF l.concluido OR l.data_pagamento IS NOT NULL
   OR l.link_comprovante_pagamento_sei IS NOT NULL THEN
   RAISE EXCEPTION 'Lançamento pago/concluído. Integração bloqueada.'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes outra
   WHERE outra.id<>e.id AND outra.status='aplicada'
     AND (outra.competencia_id=c.id OR outra.lancamento_id=l.id)) THEN
   RAISE EXCEPTION 'Duplo atesto detectado. Não aplicar.' USING ERRCODE='23505';
 END IF;
 IF e.valor_novo<=0 THEN
   RAISE EXCEPTION 'Valor zero/negativo não deve ser lançado na Etapa 6.'
     USING ERRCODE='23514';
 END IF;
 UPDATE public.lancamentos_pagamento
   SET valor_atestado=e.valor_novo WHERE id=l.id;
 PERFORM pg_catalog.set_config('app.ec_integracao_confirmada',e.id::text,true);
 UPDATE public.eletivas_integracoes SET status='aplicada',
   confirmado_por=auth.uid(),confirmado_em=now()
 WHERE id=e.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'etapa6_valor_aplicado',jsonb_build_object(
  'proposta_id',e.id,'fechamento_id',f.id,'convenio_id',e.convenio_id,
  'lancamento_id',l.id,'valor_anterior',l.valor_atestado,
  'valor_novo',e.valor_novo,'diferenca',e.diferenca,
  'sei_autorizacao',e.sei_autorizacao),auth.uid());
 RETURN e.valor_novo;
END;$apply$;
REVOKE ALL ON FUNCTION public.ec_aplicar_integracao(uuid,numeric,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_aplicar_integracao(uuid,numeric,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.ec_cancelar_proposta(
 p_proposta uuid,p_justificativa text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cancel$
DECLARE e public.eletivas_integracoes%ROWTYPE;c public.eletivas_competencias%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
 ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Fiscal ACP/Admin obrigatório.' USING ERRCODE='42501';
 END IF;
 IF length(trim(COALESCE(p_justificativa,'')))<20 THEN
  RAISE EXCEPTION 'Cancelamento exige justificativa formal de 20 caracteres.'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias
 WHERE id=(SELECT competencia_id FROM public.eletivas_integracoes WHERE id=p_proposta)
 FOR UPDATE;
 SELECT * INTO e FROM public.eletivas_integracoes WHERE id=p_proposta FOR UPDATE;
 IF e.id IS NULL OR e.status<>'proposta' THEN
  RAISE EXCEPTION 'Somente propostas ainda não aplicadas podem ser canceladas.'
    USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_integracao_confirmada',e.id::text,true);
 UPDATE public.eletivas_integracoes SET status='cancelada',
  cancelado_por=auth.uid(),cancelado_em=now(),motivo_cancelamento=trim(p_justificativa)
 WHERE id=e.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'proposta_etapa6_cancelada',jsonb_build_object(
 'proposta_id',e.id,'justificativa',trim(p_justificativa)),auth.uid());
END;$cancel$;
REVOKE ALL ON FUNCTION public.ec_cancelar_proposta(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_cancelar_proposta(uuid,text) TO authenticated;

-- Não deixar alterações manuais posteriores sobrescreverem valor aplicado.
CREATE OR REPLACE FUNCTION public.ec_proteger_atesto_integrado()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $locked$
BEGIN
 IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado
   AND EXISTS(SELECT 1 FROM public.eletivas_integracoes e
     WHERE e.lancamento_id=OLD.id AND e.status='aplicada') THEN
   RAISE EXCEPTION 'Valor Etapa 6 já integrado pelo Encontro de Contas. Revisão requer procedimento específico, não edição direta.'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$locked$;
DROP TRIGGER IF EXISTS ec_integracao_valor_guard ON public.lancamentos_pagamento;
CREATE TRIGGER ec_integracao_valor_guard BEFORE UPDATE OF valor_atestado
 ON public.lancamentos_pagamento FOR EACH ROW
 EXECUTE FUNCTION public.ec_proteger_atesto_integrado();

-- Reabertura NÃO desfaz atesto transferido. Registra motivo + SEI; última
-- memória fechada continua em eletivas_fechamentos para sempre.
CREATE OR REPLACE FUNCTION public.ec_reabrir_controlado(
 p_comp uuid,p_sei text,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $reopen$
DECLARE c public.eletivas_competencias%ROWTYPE; snap uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin']::public.app_role[]) THEN
   RAISE EXCEPTION 'Somente Admin pode reabrir fechamento fiscal.' USING ERRCODE='42501';
 END IF;
 IF length(trim(coalesce(p_sei,'')))<5 OR
   length(trim(coalesce(p_motivo,'')))<25 THEN
   RAISE EXCEPTION 'Reabertura exige SEI e fundamentação de pelo menos 25 caracteres.'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND OR c.status<>'encerrada' THEN
   RAISE EXCEPTION 'Somente competência encerrada pode ser reaberta.'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes
    WHERE competencia_id=p_comp AND status IN('proposta','aplicada')) THEN
   RAISE EXCEPTION 'Cancele proposta antes de reabrir. Integração aplicada é irreversível neste módulo.'
     USING ERRCODE='23514';
 END IF;
 SELECT id INTO snap FROM public.eletivas_fechamentos
 WHERE competencia_id=p_comp ORDER BY revisao DESC LIMIT 1;
 IF snap IS NULL THEN
   RAISE EXCEPTION 'Não há snapshot imutável para proteger a reabertura.'
     USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_reabrir_id',p_comp::text,true);
 PERFORM pg_catalog.set_config('app.ec_escrita_local','permitida',true);
 UPDATE public.eletivas_competencias
   SET status='auditoria',valor_fechado=NULL,fechado_por=NULL,fechado_em=NULL,
       ec_validado_em=NULL,ec_validado_por=NULL
 WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'reabertura_formal',jsonb_build_object(
    'snapshot_preservado',snap,'valor_fechado_anterior',c.valor_fechado,
    'motivo',trim(p_motivo),'documento_sei',trim(p_sei)),auth.uid());
END;$reopen$;
REVOKE ALL ON FUNCTION public.ec_reabrir_controlado(uuid,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_reabrir_controlado(uuid,text,text)
 TO authenticated;

COMMIT;
