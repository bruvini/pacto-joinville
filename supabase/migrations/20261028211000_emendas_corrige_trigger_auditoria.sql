-- PACTO Joinville | Correção pontual da auditoria de Emendas (Fase 1/2).
-- Corrige PostgreSQL 42703: record "new" has no field "emenda_id".
-- A tabela public.emendas possui "id"; suas tabelas filhas possuem "emenda_id".
-- Preserva todos os registros, triggers e políticas RLS existentes.
-- Pode ser reexecutada: CREATE OR REPLACE FUNCTION + REVOKE são idempotentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.emenda_registrar_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_anterior jsonb;
  v_novo jsonb;
  v_registro jsonb;
  v_registro_id uuid;
  v_emenda_id uuid;
BEGIN
  -- NEW não existe para DELETE; OLD não existe para INSERT.
  -- Converter antes para JSONB evita acessar campos ausentes em RECORDs
  -- de tabelas diferentes (emendas.id versus filhos.emenda_id).
  IF TG_OP = 'INSERT' THEN
    v_anterior := NULL;
    v_novo := to_jsonb(NEW);
    v_registro := v_novo;
  ELSIF TG_OP = 'UPDATE' THEN
    v_anterior := to_jsonb(OLD);
    v_novo := to_jsonb(NEW);
    v_registro := v_novo;
  ELSIF TG_OP = 'DELETE' THEN
    v_anterior := to_jsonb(OLD);
    v_novo := NULL;
    v_registro := v_anterior;
  ELSE
    RAISE EXCEPTION 'Evento de auditoria não suportado: %', TG_OP;
  END IF;

  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN (
       'emendas',
       'emenda_documentos',
       'emenda_fontes',
       'emenda_ajustes_valor',
       'emenda_competencias',
       'emenda_solicitacoes',
       'emenda_competencias_filhas'
     )
  THEN
    RAISE EXCEPTION 'Origem de auditoria não autorizada: %.%',
      TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  v_registro_id := NULLIF(v_registro ->> 'id', '')::uuid;

  IF TG_TABLE_NAME = 'emendas' THEN
    v_emenda_id := v_registro_id;
  ELSE
    v_emenda_id := NULLIF(v_registro ->> 'emenda_id', '')::uuid;
  END IF;

  IF v_registro_id IS NULL OR v_emenda_id IS NULL THEN
    RAISE EXCEPTION 'Auditoria de %.% sem identificação de registro/emenda.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  INSERT INTO public.emenda_historico
    (emenda_id, tabela, registro_id, acao, anterior, novo, usuario_id)
  VALUES
    (v_emenda_id, TG_TABLE_NAME, v_registro_id, TG_OP,
     v_anterior, v_novo, auth.uid());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Não amplia permissões de acesso à função SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.emenda_registrar_historico()
  FROM PUBLIC, anon, authenticated;

COMMIT;
