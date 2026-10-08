-- PVH — exclusão controlada de competência + reconferência material da Etapa 1
--
-- Objetivos:
-- 1) permitir excluir uma competência com cadeia documental/subempenhos já preenchidos,
--    sem enfraquecer os FKs RESTRICT usados na operação normal;
-- 2) impedir reconferência fantasma da Etapa 1 por autosave, remount ou UPDATE idêntico;
-- 3) preservar auditoria: exclusões continuam gerando logs, mas a operação é ordenada
--    explicitamente antes de remover a competência-mãe.

-- ---------------------------------------------------------------------------
-- 1. Exclusão controlada
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pvh_excluir_competencia(
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_competencia text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Somente administradores podem excluir competências do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT competencia
    INTO v_competencia
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  -- Assinaturas documentais usam RESTRICT para evitar perda acidental durante
  -- a rotina normal. Na exclusão explícita da competência, removemos primeiro
  -- os filhos pertencentes aos documentos daquela competência.
  DELETE FROM public.pvh_documento_assinaturas a
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_documentos d
      WHERE d.id = a.documento_id
        AND d.competencia_id = p_comp
   );

  -- O mesmo vale para subempenhos: a relação com a alocação é RESTRICT para
  -- proteger a cadeia financeira em uso. A exclusão administrativa da
  -- competência remove primeiro os subempenhos exclusivamente vinculados às
  -- alocações dos participantes daquela competência.
  DELETE FROM public.pvh_subempenhos s
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_empenho_alocacoes a
       JOIN public.pvh_participantes p
         ON p.id = a.participante_id
      WHERE a.id = s.alocacao_id
        AND p.competencia_id = p_comp
   );

  -- A partir daqui os cascades já definidos no schema podem remover documentos,
  -- participantes e alocações da competência. Notas de Empenho permanecem
  -- preservadas, pois são entidades N:N e podem atender outras competências.
  DELETE FROM public.pvh_competencias
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Reconferência da Etapa 1 baseada somente em alteração material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pvh_reconferir_etapa1_competencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
       OLD.portaria_estadual_numero IS DISTINCT FROM NEW.portaria_estadual_numero
       OR OLD.portaria_estadual_data IS DISTINCT FROM NEW.portaria_estadual_data
       OR OLD.portaria_estadual_url IS DISTINCT FROM NEW.portaria_estadual_url
     )
     AND COALESCE(
       (OLD.etapas_concluidas ->> '1')::boolean,
       false
     ) = true
  THEN
    PERFORM public.pvh_marcar_reconferencia(NEW.id, 1);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_etapa1_competencia()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_competencias_reconferir_etapa1
  ON public.pvh_competencias;

CREATE TRIGGER trg_pvh_competencias_reconferir_etapa1
  AFTER UPDATE OF
    portaria_estadual_numero,
    portaria_estadual_data,
    portaria_estadual_url
  ON public.pvh_competencias
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_etapa1_competencia();


CREATE OR REPLACE FUNCTION public.pvh_reconferir_valor_estadual_etapa1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_etapa1_concluida boolean;
BEGIN
  IF OLD.valor_estadual IS NOT DISTINCT FROM NEW.valor_estadual THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
           (c.etapas_concluidas ->> '1')::boolean,
           false
         )
    INTO v_etapa1_concluida
    FROM public.pvh_competencias c
   WHERE c.id = NEW.competencia_id;

  IF v_etapa1_concluida THEN
    PERFORM public.pvh_marcar_reconferencia(
      NEW.competencia_id,
      1
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_valor_estadual_etapa1()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_participantes_reconferir_etapa1
  ON public.pvh_participantes;

CREATE TRIGGER trg_pvh_participantes_reconferir_etapa1
  AFTER UPDATE OF valor_estadual
  ON public.pvh_participantes
  FOR EACH ROW
  EXECUTE FUNCTION public.pvh_reconferir_valor_estadual_etapa1();
