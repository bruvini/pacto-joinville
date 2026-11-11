-- Proteção emergencial da Etapa 1 PVH.
-- Evita que clientes antigos regravem a Portaria Estadual vazia em massa
-- depois de a etapa já estar concluída.
-- A mudança legítima de número/data/link por outro valor continua permitida.
-- Remoção integral exige procedimento explícito de reabertura em vez de autosave.
BEGIN;

CREATE OR REPLACE FUNCTION public.pvh_impedir_limpeza_massa_portaria_estadual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((OLD.etapas_concluidas->>'1')::boolean,false)
     AND NULLIF(pg_catalog.btrim(COALESCE(OLD.portaria_estadual_numero,'')),'') IS NOT NULL
     AND OLD.portaria_estadual_data IS NOT NULL
     AND NULLIF(pg_catalog.btrim(COALESCE(OLD.portaria_estadual_url,'')),'') IS NOT NULL
     AND NULLIF(pg_catalog.btrim(COALESCE(NEW.portaria_estadual_numero,'')),'') IS NULL
     AND NEW.portaria_estadual_data IS NULL
     AND NULLIF(pg_catalog.btrim(COALESCE(NEW.portaria_estadual_url,'')),'') IS NULL
  THEN
    RAISE EXCEPTION
      'Proteção PVH: não é permitido apagar integralmente a Portaria Estadual concluída por autossalvamento. Reabra formalmente a Etapa 1 para correção.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pvh_impedir_limpeza_massa_portaria_estadual
ON public.pvh_competencias;

CREATE TRIGGER trg_pvh_impedir_limpeza_massa_portaria_estadual
BEFORE UPDATE OF portaria_estadual_numero,portaria_estadual_data,portaria_estadual_url
ON public.pvh_competencias
FOR EACH ROW
EXECUTE FUNCTION public.pvh_impedir_limpeza_massa_portaria_estadual();

COMMIT;
