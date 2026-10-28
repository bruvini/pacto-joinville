-- Emendas: endurece o trigger de validação das tabelas filhas.
-- Não altera registros nem recria tabelas.
-- A função é idempotente e mantém as verificações de vínculo/imutabilidade.
BEGIN;

CREATE OR REPLACE FUNCTION public.emenda_validar_filho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_atual jsonb;
  v_anterior jsonb;
BEGIN
  -- Cada tabela filha possui emenda_id; JSONB impede referência RECORD inválida
  -- caso a função venha a ser vinculada a uma estrutura diferente.
  IF TG_OP = 'UPDATE' THEN
    v_atual := to_jsonb(NEW);
    v_anterior := to_jsonb(OLD);
    IF v_atual ->> 'emenda_id' IS DISTINCT FROM v_anterior ->> 'emenda_id'
       OR v_atual ->> 'id' IS DISTINCT FROM v_anterior ->> 'id'
       OR v_atual ->> 'created_by' IS DISTINCT FROM v_anterior ->> 'created_by'
       OR v_atual ->> 'created_at' IS DISTINCT FROM v_anterior ->> 'created_at'
    THEN
      RAISE EXCEPTION 'Não é permitido mover ou reatribuir documentos/fontes entre emendas.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- Função exclusiva de trigger, sem execução pública pela Data API.
REVOKE ALL ON FUNCTION public.emenda_validar_filho()
FROM PUBLIC, anon, authenticated;

COMMIT;
