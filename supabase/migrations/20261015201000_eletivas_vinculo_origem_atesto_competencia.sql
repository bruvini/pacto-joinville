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
   AND l.valor_atestado_automatico IS NULL;
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
 SELECT l.id,l.prestador_id,p.nome_instituicao,l.convenio_id,cv.objeto,
   l.competencia,l.parcela,l.descricao,l.valor_atestado,
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

