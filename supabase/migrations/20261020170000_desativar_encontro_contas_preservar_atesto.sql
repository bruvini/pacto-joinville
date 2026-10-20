-- Desativação segura do Encontro de Contas — Eletivas.
-- Preserva a produção histórica, os atestos efetivos e todas as evidências.
-- Não executa DROP TABLE nem DELETE de informações históricas.
-- Aplicar uma vez no SQL Editor do Supabase/Lovable, após as migrations antigas.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.lancamentos_pagamento') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='lancamentos_pagamento'
       AND column_name='valor_atestado_manual'
     ) THEN
    RAISE EXCEPTION 'A estrutura de atesto do lançamento não está disponível. Confira as migrations anteriores.';
  END IF;
END;
$preflight$;

-- Fotografia imutável da situação fiscal ANTES da desvinculação.
-- Não altera valores já usados em prestação de contas, anulação ou pagamento.
CREATE TABLE IF NOT EXISTS public.lancamentos_atesto_origem_historica (
  lancamento_id uuid PRIMARY KEY,
  valor_efetivo_original numeric(16,2),
  valor_manual_original numeric(16,2),
  valor_automatico_original numeric(16,2),
  origem_original text,
  escolha_pendente_original boolean,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lancamentos_atesto_origem_historica ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lancamentos_atesto_origem_historica FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.lancamentos_atesto_origem_historica TO authenticated;
DROP POLICY IF EXISTS "leitura atesto historico" ON public.lancamentos_atesto_origem_historica;
CREATE POLICY "leitura atesto historico" ON public.lancamentos_atesto_origem_historica
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::app_role[]));

INSERT INTO public.lancamentos_atesto_origem_historica (
  lancamento_id,valor_efetivo_original,valor_manual_original,
  valor_automatico_original,origem_original,escolha_pendente_original
)
SELECT id,valor_atestado,valor_atestado_manual,valor_atestado_automatico,
       origem_valor_atestado,ec_escolha_pendente
FROM public.lancamentos_pagamento
WHERE valor_atestado_automatico IS NOT NULL
   OR origem_valor_atestado IS DISTINCT FROM 'manual'
   OR ec_escolha_pendente IS TRUE
   OR valor_atestado_manual IS DISTINCT FROM valor_atestado
ON CONFLICT (lancamento_id) DO NOTHING;

-- Estes três triggers vinculavam o atesto e a liberação de recurso ao EC.
-- São removidos ANTES de criar a regra nova. Os dados não são modificados.
DROP TRIGGER IF EXISTS ec_integracao_valor_guard ON public.lancamentos_pagamento;
DROP TRIGGER IF EXISTS ec_fontes_atesto_guard ON public.lancamentos_pagamento;
DROP TRIGGER IF EXISTS ec_fontes_atesto_insert_guard ON public.lancamentos_pagamento;
DROP TRIGGER IF EXISTS zz_ec_atesto_origem_etapa6_guard ON public.lancamentos_pagamento;

-- O campo de produção efetiva 'valor_atestado' permanece a referência para
-- anulação, prestação de contas, relatório e liberação. O campo manual é
-- atualizado junto com ele nas próximas edições. O histórico anterior fica intacto.
CREATE OR REPLACE FUNCTION public.lancamentos_sincronizar_atesto_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $sync$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.valor_atestado := COALESCE(NEW.valor_atestado, NEW.valor_atestado_manual);
    NEW.valor_atestado_manual := NEW.valor_atestado;
    NEW.valor_atestado_automatico := NULL;
    NEW.origem_valor_atestado := 'manual';
    NEW.ec_escolha_pendente := FALSE;
    RETURN NEW;
  END IF;

  -- Campos legados não podem voltar a receber origem automática.
  IF NEW.valor_atestado_automatico IS DISTINCT FROM OLD.valor_atestado_automatico
     OR NEW.origem_valor_atestado IS DISTINCT FROM OLD.origem_valor_atestado
     OR NEW.ec_escolha_pendente IS DISTINCT FROM OLD.ec_escolha_pendente THEN
    RAISE EXCEPTION 'A origem automática do atesto está desativada.'
      USING ERRCODE='42501';
  END IF;

  IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado
     OR NEW.valor_atestado_manual IS DISTINCT FROM OLD.valor_atestado_manual THEN
    IF OLD.concluido OR OLD.data_pagamento IS NOT NULL THEN
      RAISE EXCEPTION 'Lançamento concluído ou pago não aceita mudança do atesto.'
        USING ERRCODE='23514';
    END IF;
    IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado
       AND NEW.valor_atestado_manual IS DISTINCT FROM OLD.valor_atestado_manual
       AND NEW.valor_atestado IS DISTINCT FROM NEW.valor_atestado_manual THEN
      RAISE EXCEPTION 'Valor atestado e valor manual divergentes.'
        USING ERRCODE='23514';
    END IF;
    IF NEW.valor_atestado IS DISTINCT FROM OLD.valor_atestado THEN
      NEW.valor_atestado_manual := NEW.valor_atestado;
    ELSE
      NEW.valor_atestado := NEW.valor_atestado_manual;
    END IF;
  END IF;
  RETURN NEW;
END;
$sync$;
REVOKE ALL ON FUNCTION public.lancamentos_sincronizar_atesto_manual() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS lancamentos_atesto_manual_sync ON public.lancamentos_pagamento;
CREATE TRIGGER lancamentos_atesto_manual_sync
BEFORE INSERT OR UPDATE OF valor_atestado,valor_atestado_manual,
  valor_atestado_automatico,origem_valor_atestado,ec_escolha_pendente
ON public.lancamentos_pagamento
FOR EACH ROW EXECUTE FUNCTION public.lancamentos_sincronizar_atesto_manual();

-- Arquivo fiscal do EC segue preservado, mas sem acesso operacional via API.
-- Inclui service_role, pois uma Edge Function antiga pode continuar implantada
-- mesmo após seu código ser removido do repositório.
-- Impede criação, processamento ou aplicação de novos encontros por chamadas RPC
-- antigas; a revogação também protege o período entre SQL e publicação frontend.
DO $desativar$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT table_schema, table_name
      FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
       AND table_name LIKE 'eletivas_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC,anon,authenticated,service_role',
      item.table_schema,item.table_name);
  END LOOP;
  FOR item IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND left(p.proname,3)='ec_'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',
      item.assinatura);
  END LOOP;
END;
$desativar$;

DROP POLICY IF EXISTS "ec storage read" ON storage.objects;
DROP POLICY IF EXISTS "ec storage insert" ON storage.objects;
DROP POLICY IF EXISTS "ec storage delete" ON storage.objects;

COMMENT ON TABLE public.lancamentos_atesto_origem_historica IS
  'Fotografia da origem do atesto antes de desativar EC; preservada para auditoria.';
COMMENT ON FUNCTION public.lancamentos_sincronizar_atesto_manual() IS
  'Sincroniza atesto manual e efetivo; nunca consulta a base do Encontro de Contas.';

COMMIT;
