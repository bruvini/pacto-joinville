-- Complemento Fase 6: abertura por lançamento, edição/exclusão controlada,
-- e manual+automático na Etapa 6. Executar depois de 20261015195500.
BEGIN;
DO $pre$
BEGIN
 IF to_regprocedure('public.ec_aplicar_integracao(uuid,numeric,boolean)') IS NULL
    OR to_regclass('public.eletivas_fechamentos') IS NULL THEN
  RAISE EXCEPTION 'Execute a Fase 6 anterior antes desta migration.' USING ERRCODE='23514';
 END IF;
END;$pre$;

ALTER TABLE public.lancamentos_pagamento
 ADD COLUMN IF NOT EXISTS valor_atestado_manual numeric(16,2),
 ADD COLUMN IF NOT EXISTS valor_atestado_automatico numeric(16,2),
 ADD COLUMN IF NOT EXISTS origem_valor_atestado text NOT NULL DEFAULT 'manual'
   CHECK (origem_valor_atestado IN('manual','automatico')),
 ADD COLUMN IF NOT EXISTS ec_escolha_pendente boolean NOT NULL DEFAULT false;
-- Preserva integralmente a situação pré-existente, inclusive integração já aplicada.
UPDATE public.lancamentos_pagamento l
 SET valor_atestado_manual=CASE WHEN i.id IS NULL THEN l.valor_atestado
                               ELSE i.valor_anterior END,
     valor_atestado_automatico=CASE WHEN i.id IS NULL THEN NULL ELSE i.valor_novo END,
     origem_valor_atestado=CASE WHEN i.id IS NULL THEN 'manual' ELSE 'automatico' END,
     ec_escolha_pendente=false
 FROM (SELECT lp.id AS lanc_id,i.id,i.valor_anterior,i.valor_novo
       FROM public.lancamentos_pagamento lp
       LEFT JOIN public.eletivas_integracoes i ON i.lancamento_id=lp.id
         AND i.status='aplicada') i
 WHERE l.id=i.lanc_id AND l.valor_atestado_manual IS NULL
   AND l.valor_atestado_automatico IS NULL
   AND (l.valor_atestado IS NOT NULL OR i.id IS NOT NULL);
-- Sem UPDATEs automáticos futuros; os valores em fontes só mudam em atos explícitos.
ALTER TABLE public.lancamentos_pagamento ADD CONSTRAINT ec_atesto_fontes_nao_negativos
 CHECK ((valor_atestado_manual IS NULL OR valor_atestado_manual>=0)
    AND (valor_atestado_automatico IS NULL OR valor_atestado_automatico>=0))
 NOT VALID;
ALTER TABLE public.lancamentos_pagamento VALIDATE CONSTRAINT ec_atesto_fontes_nao_negativos;

CREATE TABLE IF NOT EXISTS public.eletivas_atesto_escolhas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lancamento_id uuid NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE RESTRICT,
 competencia_id uuid REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 origem_anterior text,
 origem_nova text NOT NULL CHECK(origem_nova IN('manual','automatico')),
 valor_anterior numeric(16,2),
 valor_novo numeric(16,2),
 manual_no_ato numeric(16,2),
 automatico_no_ato numeric(16,2),
 sei text NOT NULL,
 motivo text NOT NULL,
 escolhido_por uuid NOT NULL REFERENCES auth.users(id),
 escolhido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eletivas_atesto_escolhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_atesto_escolhas_read ON public.eletivas_atesto_escolhas FOR SELECT
 TO authenticated USING(auth.uid() IS NOT NULL AND
 public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_atesto_escolhas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_atesto_escolhas TO authenticated;

-- Preserva ambas as fontes. Valor efetivo só reflete a fonte explicitamente
-- escolhida. Não permite injetar valores automáticos por UPDATE do navegador.
DROP TRIGGER IF EXISTS ec_integracao_valor_guard ON public.lancamentos_pagamento;
CREATE OR REPLACE FUNCTION public.ec_guardar_fontes_atesto()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
DECLARE modo text:=current_setting('app.ec_atesto_rpc',true);
BEGIN
 IF NEW.valor_atestado_automatico IS DISTINCT FROM OLD.valor_atestado_automatico
   AND modo IS DISTINCT FROM 'aplicar:'||OLD.id::text THEN
    RAISE EXCEPTION 'Valor automático somente por integração fiscal autenticada.' USING ERRCODE='42501';
 END IF;
 IF NEW.origem_valor_atestado IS DISTINCT FROM OLD.origem_valor_atestado
    AND modo IS DISTINCT FROM 'aplicar:'||OLD.id::text
    AND modo IS DISTINCT FROM 'escolher:'||OLD.id::text THEN
    RAISE EXCEPTION 'Fonte do atesto só pode ser selecionada por fiscal autorizado.' USING ERRCODE='42501';
 END IF;
 IF NEW.ec_escolha_pendente IS DISTINCT FROM OLD.ec_escolha_pendente
   AND modo IS DISTINCT FROM 'aplicar:'||OLD.id::text
   AND modo IS DISTINCT FROM 'escolher:'||OLD.id::text
   AND modo IS DISTINCT FROM 'manual:'||OLD.id::text THEN
    RAISE EXCEPTION 'Pendência de escolha protegida.' USING ERRCODE='42501';
 END IF;
 IF NEW.valor_atestado_manual IS DISTINCT FROM OLD.valor_atestado_manual THEN
    IF OLD.concluido OR OLD.data_pagamento IS NOT NULL THEN
     RAISE EXCEPTION 'Lançamento concluído ou pago não aceita edição do valor manual.' USING ERRCODE='23514';
    END IF;
    IF OLD.valor_atestado_automatico IS NOT NULL AND modo IS DISTINCT FROM 'escolher:'||OLD.id::text
      AND modo IS DISTINCT FROM 'aplicar:'||OLD.id::text THEN
      NEW.ec_escolha_pendente:=true;
    END IF;
 END IF;
 IF modo LIKE 'aplicar:%' OR modo LIKE 'escolher:%' THEN
    NEW.valor_atestado:=CASE WHEN NEW.origem_valor_atestado='automatico'
       THEN NEW.valor_atestado_automatico ELSE NEW.valor_atestado_manual END;
 ELSE
    IF NEW.origem_valor_atestado='automatico' THEN
      IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado THEN
        RAISE EXCEPTION 'Valor efetivo automático não é editável manualmente.' USING ERRCODE='42501';
      END IF;
    ELSE
      IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado
          AND NEW.valor_atestado_manual IS NOT DISTINCT FROM OLD.valor_atestado_manual THEN
        -- Compatibilidade com formulários antigos que gravam somente valor_atestado.
        IF OLD.valor_atestado_automatico IS NOT NULL THEN
          RAISE EXCEPTION 'Edite o valor manual separado e selecione a fonte do atesto.' USING ERRCODE='42501';
        END IF;
        NEW.valor_atestado_manual:=NEW.valor_atestado;
      ELSE
        NEW.valor_atestado:=NEW.valor_atestado_manual;
      END IF;
    END IF;
 END IF;
 RETURN NEW;
END;$guard$;
DROP TRIGGER IF EXISTS ec_fontes_atesto_guard ON public.lancamentos_pagamento;
CREATE TRIGGER ec_fontes_atesto_guard BEFORE UPDATE OF
 valor_atestado,valor_atestado_manual,valor_atestado_automatico,origem_valor_atestado,ec_escolha_pendente
 ON public.lancamentos_pagamento FOR EACH ROW
 EXECUTE FUNCTION public.ec_guardar_fontes_atesto();

-- O lançamento não pode ter outra origem aplicada. Nenhuma competência
-- é criada por INSERT do frontend: a autorização e elegibilidade são atômicas.
CREATE OR REPLACE FUNCTION public.ec_validar_lancamento_elegivel(
 p_lanc uuid,p_prest uuid,p_convenio uuid
) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $eligible$
DECLARE l public.lancamentos_pagamento%ROWTYPE; cv public.convenios%ROWTYPE;
BEGIN
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lanc;
 SELECT * INTO cv FROM public.convenios WHERE id=p_convenio;
 IF l.id IS NULL OR cv.id IS NULL OR
   l.prestador_id IS DISTINCT FROM p_prest OR cv.prestador_id IS DISTINCT FROM p_prest OR
   l.convenio_id IS DISTINCT FROM p_convenio OR cv.modelo_fluxo IS DISTINCT FROM 'fluxo_1' OR
   l.concluido OR l.data_pagamento IS NOT NULL OR l.link_comprovante_pagamento_sei IS NOT NULL OR
   l.competencia IS NULL OR l.competencia !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' OR
   (l.parent_id IS NULL AND l.competencia LIKE '%,%') THEN
   RAISE EXCEPTION 'Lançamento não elegível: instituição, convênio, parcela ou status incompatível.'
    USING ERRCODE='23514';
 END IF;
 -- Filhos são permitidos: representam a parcela individual do processo multicompetência.
 RETURN l.competencia;
END;$eligible$;
REVOKE ALL ON FUNCTION public.ec_validar_lancamento_elegivel(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ec_criar_competencia_vinculada(
 p_prest uuid,p_convenio uuid,p_lanc uuid,p_cnes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE l public.lancamentos_pagamento%ROWTYPE;
 nome text; comp text; novo uuid; cnes text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
  ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Fiscal ACP/Admin obrigatório.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lanc FOR UPDATE;
 comp:=public.ec_validar_lancamento_elegivel(p_lanc,p_prest,p_convenio);
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
   WHERE lancamento_id=p_lanc OR (prestador_id=p_prest AND competencia=comp)) THEN
   RAISE EXCEPTION 'Já existe encontro para este lançamento ou competência.' USING ERRCODE='23505';
 END IF;
 SELECT nome_instituicao INTO nome FROM public.prestadores WHERE id=p_prest;
 cnes:=nullif(trim(coalesce(p_cnes,'')),'');
 IF cnes IS NULL AND nome ~* '(s[aã]o jos[eé]|HMSJ)' THEN cnes:='2436469'; END IF;
 IF cnes IS NULL OR cnes !~ '^[0-9]{7}$' THEN
   RAISE EXCEPTION 'Instituição sem CNES conhecido: informe o CNES oficial de 7 dígitos.'
    USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_criacao_vinculada',p_lanc::text,true);
 INSERT INTO public.eletivas_competencias(competencia,prestador_id,cnes,lancamento_id,criado_por)
 VALUES(comp,p_prest,cnes,p_lanc,auth.uid()) RETURNING id INTO novo;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(novo,'encontro_criado_via_lancamento',jsonb_build_object(
   'lancamento_id',p_lanc,'convenio_id',p_convenio,'prestador_id',p_prest,
   'competencia',comp),auth.uid());
 RETURN novo;
END;$create$;
REVOKE ALL ON FUNCTION public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text) TO authenticated;
-- Usuários autenticados não podem contornar a seleção criada pela RPC.
REVOKE INSERT ON public.eletivas_competencias FROM authenticated;

-- O texto do convênio não define elegibilidade. Mantém proteção das
-- revisões da Fase 6 e abre exceções exclusivamente para RPCs autenticadas.
CREATE OR REPLACE FUNCTION public.ec_competencia_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $comp$
BEGIN
 IF NEW.lancamento_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.lancamentos_pagamento l
  JOIN public.convenios cv ON cv.id=l.convenio_id
  WHERE l.id=NEW.lancamento_id
    AND l.prestador_id=NEW.prestador_id AND cv.prestador_id=NEW.prestador_id
    AND cv.modelo_fluxo='fluxo_1' AND l.competencia=NEW.competencia
    AND NOT l.concluido AND l.data_pagamento IS NULL
    AND l.link_comprovante_pagamento_sei IS NULL
    AND l.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
 ) THEN
   RAISE EXCEPTION 'Vínculo inválido: instituição, convênio, competência ou status.'
   USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.lancamento_id IS NULL OR
    current_setting('app.ec_criacao_vinculada',true) IS DISTINCT FROM NEW.lancamento_id::text THEN
    RAISE EXCEPTION 'Criação apenas a partir de um lançamento válido, pela RPC.'
      USING ERRCODE='42501';
  END IF;
  IF NEW.status='encerrada' OR NEW.valor_fechado IS NOT NULL OR NEW.fechado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Novo encontro começa sem fechamento.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.criado_por IS DISTINCT FROM OLD.criado_por
   OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'Autoria de criação imutável.' USING ERRCODE='23514';
 END IF;
 IF (NEW.competencia IS DISTINCT FROM OLD.competencia
   OR NEW.prestador_id IS DISTINCT FROM OLD.prestador_id
   OR NEW.cnes IS DISTINCT FROM OLD.cnes) AND
   current_setting('app.ec_editar_competencia',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'Identidade só editável antes da auditoria por procedimento fiscal.'
      USING ERRCODE='42501';
 END IF;
 IF NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id AND
   current_setting('app.ec_editar_competencia',true) IS DISTINCT FROM OLD.id::text AND
   current_setting('app.ec_vinculo_comp',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'Vínculo só por seleção fiscal autenticada.' USING ERRCODE='42501';
 END IF;
 IF OLD.status='encerrada' THEN
  IF NEW.status<>'encerrada' THEN
   IF current_setting('app.ec_reabrir_id',true) IS DISTINCT FROM OLD.id::text
     OR NEW.status<>'auditoria' OR NEW.valor_fechado IS NOT NULL
     OR NEW.fechado_em IS NOT NULL OR NEW.fechado_por IS NOT NULL
     OR NEW.documentos IS DISTINCT FROM OLD.documentos
     OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id THEN
     RAISE EXCEPTION 'Reabertura só por procedimento formal.' USING ERRCODE='42501';
   END IF;
  ELSIF NEW.valor_fechado IS DISTINCT FROM OLD.valor_fechado
    OR NEW.fechado_em IS DISTINCT FROM OLD.fechado_em
    OR NEW.fechado_por IS DISTINCT FROM OLD.fechado_por
    OR NEW.documentos IS DISTINCT FROM OLD.documentos
    OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
    OR NEW.observacao IS DISTINCT FROM OLD.observacao
    OR NEW.ec_execucao_id IS DISTINCT FROM OLD.ec_execucao_id
    OR NEW.ec_fontes_snapshot IS DISTINCT FROM OLD.ec_fontes_snapshot THEN
    RAISE EXCEPTION 'Fechamento imutável.' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status='encerrada' AND OLD.status<>'encerrada' AND
    current_setting('app.ec_fechamento_id',true) IS DISTINCT FROM NEW.id::text THEN
  RAISE EXCEPTION 'Fechamento só por RPC fiscal segura.' USING ERRCODE='42501';
 END IF;
 NEW.atualizado_em:=now();
 RETURN NEW;
END;$comp$;

-- A fila mostra somente lançamentos não concluídos, sem encontro existente.
-- Filhos de processos multicompetência são elegíveis (após criados no Fluxo 1).
CREATE OR REPLACE FUNCTION public.ec_listar_lancamentos_disponiveis()
RETURNS TABLE(lancamento_id uuid,prestador_id uuid,nome_instituicao text,
  convenio_id uuid,objeto text,competencia text,parcela text,
  descricao text,valor_atestado numeric,cnes_sugerido text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $list$
 SELECT l.id,l.prestador_id,p.nome_instituicao::text,l.convenio_id,cv.objeto::text,
   l.competencia::text,l.parcela::text,l.descricao::text,l.valor_atestado,
   CASE WHEN p.nome_instituicao ~* '(s[aã]o jos[eé]|HMSJ)'
     THEN '2436469' ELSE NULL END
 FROM public.lancamentos_pagamento l
 JOIN public.prestadores p ON p.id=l.prestador_id
 JOIN public.convenios cv ON cv.id=l.convenio_id AND cv.prestador_id=l.prestador_id
 WHERE auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(),
  ARRAY['admin','acp','aco']::public.app_role[])
  AND cv.modelo_fluxo='fluxo_1'
  AND NOT l.concluido AND l.data_pagamento IS NULL
  AND l.link_comprovante_pagamento_sei IS NULL
  AND l.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  AND NOT EXISTS(SELECT 1 FROM public.eletivas_competencias e
    WHERE e.lancamento_id=l.id OR (e.competencia=l.competencia
      AND e.prestador_id=l.prestador_id))
 ORDER BY p.nome_instituicao,cv.objeto,l.competencia,l.parcela;
$list$;
REVOKE ALL ON FUNCTION public.ec_listar_lancamentos_disponiveis() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_listar_lancamentos_disponiveis() TO authenticated;

-- Edição permitida apenas em preparação sem evidências; inclui correção
-- da parcela vinculada, se ainda aberta. Histórico registrado em eventos.
CREATE OR REPLACE FUNCTION public.ec_editar_competencia(
 p_comp uuid,p_prest uuid,p_convenio uuid,p_lanc uuid,
 p_cnes text,p_observacao text,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $edit$
DECLARE c public.eletivas_competencias%ROWTYPE;comp text;
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
 IF trim(coalesce(p_cnes,'')) !~ '^[0-9]{7}$' THEN
    RAISE EXCEPTION 'CNES deve conter 7 dígitos.' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_editar_competencia',p_comp::text,true);
 UPDATE public.eletivas_competencias
 SET prestador_id=p_prest,competencia=comp,cnes=p_cnes,
    lancamento_id=p_lanc,observacao=left(nullif(trim(coalesce(p_observacao,'')),''),1000)
 WHERE id=p_comp;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(p_comp,'encontro_editado',jsonb_build_object(
   'lancamento_antigo',c.lancamento_id,'lancamento_novo',p_lanc,
   'competencia_antiga',c.competencia,'competencia_nova',comp,
   'prestador_antigo',c.prestador_id,'prestador_novo',p_prest,
   'motivo',trim(p_motivo)),auth.uid());
END;$edit$;
REVOKE ALL ON FUNCTION public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_editar_competencia(uuid,uuid,uuid,uuid,text,text,text)
 TO authenticated;

CREATE TABLE IF NOT EXISTS public.eletivas_exclusoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id_original uuid NOT NULL UNIQUE,
 prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE RESTRICT,
 competencia text NOT NULL,
 cnes text NOT NULL,
 observacao text,
 eventos_json jsonb NOT NULL,
 motivo text NOT NULL,
 excluido_por uuid NOT NULL REFERENCES auth.users(id),
 excluido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eletivas_exclusoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_exclusoes_read ON public.eletivas_exclusoes FOR SELECT TO authenticated
 USING(auth.uid() IS NOT NULL AND
 public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.eletivas_exclusoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.eletivas_exclusoes TO authenticated;

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
REVOKE DELETE ON public.eletivas_competencias FROM authenticated;


-- A fonte escolhida tem registro imutável e não é alterável pelo formulário.
CREATE OR REPLACE FUNCTION public.ec_atesto_escolher_fonte(
 p_lanc uuid,p_origem text,p_valor_anterior numeric,p_sei text,p_motivo text
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $pick$
DECLARE l public.lancamentos_pagamento%ROWTYPE;
 v_comp uuid; v_valor numeric; v_old numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
   ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Escolha de fonte reservada a fiscal ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF p_origem NOT IN('manual','automatico') OR
   length(trim(coalesce(p_sei,'')))<5 OR
   length(trim(coalesce(p_motivo,'')))<20 THEN
   RAISE EXCEPTION 'Selecione origem e informe SEI e justificativa (20 caracteres).'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lanc FOR UPDATE;
 IF NOT FOUND OR l.concluido OR l.data_pagamento IS NOT NULL OR
    l.link_comprovante_pagamento_sei IS NOT NULL THEN
   RAISE EXCEPTION 'Lançamento inexistente, concluído ou pago.' USING ERRCODE='23514';
 END IF;
 IF l.valor_atestado IS DISTINCT FROM p_valor_anterior THEN
   RAISE EXCEPTION 'Valor efetivo foi alterado por outro fiscal. Atualize a tela.'
    USING ERRCODE='40001';
 END IF;
 IF p_origem='automatico' THEN
  SELECT e.competencia_id INTO v_comp FROM public.eletivas_integracoes e
   JOIN public.eletivas_competencias c ON c.id=e.competencia_id
   WHERE e.lancamento_id=p_lanc AND e.status='aplicada'
     AND c.status='encerrada' AND c.valor_fechado=e.valor_novo
     AND e.valor_novo=l.valor_atestado_automatico;
  IF v_comp IS NULL OR l.valor_atestado_automatico IS NULL THEN
   RAISE EXCEPTION 'Cálculo automático não aplicado ou sem fechamento validado.'
    USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT e.competencia_id INTO v_comp FROM public.eletivas_integracoes e
    WHERE e.lancamento_id=p_lanc AND e.status='aplicada';
  IF l.valor_atestado_manual IS NULL THEN
   RAISE EXCEPTION 'Informe primeiro um valor manual para selecioná-lo.'
    USING ERRCODE='23514';
  END IF;
 END IF;
 v_valor:=CASE WHEN p_origem='automatico'
   THEN l.valor_atestado_automatico ELSE l.valor_atestado_manual END;
 v_old:=l.valor_atestado;
 PERFORM pg_catalog.set_config('app.ec_atesto_rpc','escolher:'||p_lanc::text,true);
 UPDATE public.lancamentos_pagamento
 SET origem_valor_atestado=p_origem,valor_atestado=v_valor,ec_escolha_pendente=false
 WHERE id=p_lanc;
 INSERT INTO public.eletivas_atesto_escolhas(
 lancamento_id,competencia_id,origem_anterior,origem_nova,
 valor_anterior,valor_novo,manual_no_ato,automatico_no_ato,sei,motivo,escolhido_por)
 VALUES(p_lanc,v_comp,l.origem_valor_atestado,p_origem,v_old,v_valor,
   l.valor_atestado_manual,l.valor_atestado_automatico,trim(p_sei),
   trim(p_motivo),auth.uid());
 IF v_comp IS NOT NULL THEN
  INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
  VALUES(v_comp,'origem_atesto_selecionada',jsonb_build_object(
   'lancamento_id',p_lanc,'origem_anterior',l.origem_valor_atestado,
   'origem_nova',p_origem,'valor_anterior',v_old,'valor_novo',v_valor,
   'documento_sei',trim(p_sei)),auth.uid());
 END IF;
 RETURN v_valor;
END;$pick$;
REVOKE ALL ON FUNCTION public.ec_atesto_escolher_fonte(uuid,text,numeric,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_atesto_escolher_fonte(uuid,text,numeric,text,text)
 TO authenticated;

-- Substitui a Fase 6: o número automático fica guardado na sua própria
-- coluna e não apaga o manual. Se ambos existirem, aguarda escolha fiscal.
CREATE OR REPLACE FUNCTION public.ec_aplicar_integracao(
 p_proposta uuid,p_valor_anterior numeric,p_confirmo boolean
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $apply$
DECLARE e public.eletivas_integracoes%ROWTYPE;
 c public.eletivas_competencias%ROWTYPE;
 l public.lancamentos_pagamento%ROWTYPE;
 f public.eletivas_fechamentos%ROWTYPE;
 exigir_escolha boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
 ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Aplicação reservada a fiscal ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF p_confirmo IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'A aplicação exige confirmação expressa.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias
  WHERE id=(SELECT competencia_id FROM public.eletivas_integracoes WHERE id=p_proposta)
  FOR UPDATE;
 IF NOT FOUND OR c.status<>'encerrada' THEN
  RAISE EXCEPTION 'Competência ainda não fechada ou sem proposta.'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO l FROM public.lancamentos_pagamento
  WHERE id=(SELECT lancamento_id FROM public.eletivas_integracoes WHERE id=p_proposta)
  FOR UPDATE;
 SELECT * INTO e FROM public.eletivas_integracoes WHERE id=p_proposta FOR UPDATE;
 SELECT * INTO f FROM public.eletivas_fechamentos WHERE id=e.fechamento_id;
 IF e.id IS NULL OR e.status<>'proposta' OR l.id IS NULL OR f.id IS NULL
   OR e.competencia_id IS DISTINCT FROM c.id
   OR e.lancamento_id IS DISTINCT FROM c.lancamento_id
   OR e.valor_novo IS DISTINCT FROM c.valor_fechado
   OR e.valor_novo IS DISTINCT FROM f.valor_fechado
   OR e.competencia IS DISTINCT FROM l.competencia
   OR e.prestador_id IS DISTINCT FROM l.prestador_id
   OR e.convenio_id IS DISTINCT FROM l.convenio_id THEN
  RAISE EXCEPTION 'Proposta incompatível ou já aplicada.' USING ERRCODE='23514';
 END IF;
 IF l.valor_atestado IS DISTINCT FROM e.valor_anterior OR
   l.valor_atestado IS DISTINCT FROM p_valor_anterior THEN
  RAISE EXCEPTION 'Valor atual mudou desde a proposta. Atualize a prévia.'
   USING ERRCODE='40001';
 END IF;
 IF l.concluido OR l.data_pagamento IS NOT NULL
   OR l.link_comprovante_pagamento_sei IS NOT NULL THEN
  RAISE EXCEPTION 'Lançamento concluído/pago: não integrar.' USING ERRCODE='23514';
 END IF;
 IF l.valor_atestado_automatico IS NOT NULL OR
   EXISTS(SELECT 1 FROM public.eletivas_integracoes o
     WHERE o.id<>e.id AND o.status='aplicada'
       AND (o.competencia_id=c.id OR o.lancamento_id=l.id)) THEN
  RAISE EXCEPTION 'Cálculo automático já aplicado a este lançamento.'
    USING ERRCODE='23505';
 END IF;
 IF e.valor_novo<=0 THEN
  RAISE EXCEPTION 'Valor automático deve ser positivo.' USING ERRCODE='23514';
 END IF;
 exigir_escolha:=coalesce(l.valor_atestado_manual,0)>0;
 PERFORM pg_catalog.set_config('app.ec_atesto_rpc','aplicar:'||l.id::text,true);
 UPDATE public.lancamentos_pagamento
 SET valor_atestado_automatico=e.valor_novo,
     origem_valor_atestado=CASE WHEN exigir_escolha THEN l.origem_valor_atestado
                               ELSE 'automatico' END,
     valor_atestado=CASE WHEN exigir_escolha THEN l.valor_atestado
                        ELSE e.valor_novo END,
     ec_escolha_pendente=exigir_escolha
 WHERE id=l.id;
 PERFORM pg_catalog.set_config('app.ec_integracao_confirmada',e.id::text,true);
 UPDATE public.eletivas_integracoes SET status='aplicada',
   confirmado_por=auth.uid(),confirmado_em=now() WHERE id=e.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'etapa6_automatico_disponivel',jsonb_build_object(
  'proposta',e.id,'lancamento',l.id,'valor_manual_preservado',l.valor_atestado_manual,
  'valor_automatico',e.valor_novo,'selecao_obrigatoria',exigir_escolha,
  'sei',e.sei_autorizacao),auth.uid());
 RETURN e.valor_novo;
END;$apply$;
REVOKE ALL ON FUNCTION public.ec_aplicar_integracao(uuid,numeric,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_aplicar_integracao(uuid,numeric,boolean)
 TO authenticated;

-- Em edições manuais, não permitir finalizar/avançar pagamentos com as duas
-- fontes ainda sem escolha. Também não autoriza alterações após pagamento.
CREATE OR REPLACE FUNCTION public.ec_bloquear_avanco_sem_origem()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $block$
BEGIN
 IF NEW.ec_escolha_pendente AND (
   (NEW.concluido AND NOT OLD.concluido)
   OR NEW.sefaz_etapa4_em IS DISTINCT FROM OLD.sefaz_etapa4_em
   OR NEW.link_solicitacao_liberacao_sei IS DISTINCT FROM OLD.link_solicitacao_liberacao_sei
   OR NEW.link_subempenho_sei IS DISTINCT FROM OLD.link_subempenho_sei
   OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
 ) THEN
  RAISE EXCEPTION 'Selecione o valor manual ou automático antes de avançar a Etapa 6.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$block$;
DROP TRIGGER IF EXISTS zz_ec_atesto_origem_etapa6_guard ON public.lancamentos_pagamento;
CREATE TRIGGER zz_ec_atesto_origem_etapa6_guard BEFORE UPDATE
 ON public.lancamentos_pagamento FOR EACH ROW
 EXECUTE FUNCTION public.ec_bloquear_avanco_sem_origem();

-- Bloqueio de apagamento do livro fiscal de escolhas.
CREATE OR REPLACE FUNCTION public.ec_impedir_alterar_escolhas()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $immutable$
BEGIN
 RAISE EXCEPTION 'Histórico de escolha do atesto é imutável.'
  USING ERRCODE='42501';
END;$immutable$;
CREATE TRIGGER ec_escolhas_imutaveis BEFORE UPDATE OR DELETE
 ON public.eletivas_atesto_escolhas FOR EACH ROW
 EXECUTE FUNCTION public.ec_impedir_alterar_escolhas();

-- Sublançamentos filhos são parcelas individuais válidas do Fluxo 1.
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
   OR l.concluido=true
   OR l.data_pagamento IS NOT NULL
   OR l.link_comprovante_pagamento_sei IS NOT NULL
   OR l.competencia !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' THEN
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

COMMIT;
