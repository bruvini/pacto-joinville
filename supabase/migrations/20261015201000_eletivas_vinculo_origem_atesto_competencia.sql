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
