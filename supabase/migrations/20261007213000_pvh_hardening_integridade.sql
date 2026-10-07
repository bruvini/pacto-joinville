-- PVH — hardening de integridade histórica e permissões
-- Migration aditiva: não reescreve fatos históricos nem remove campos legados.

-- 1) Processo SEI anual utilizado é evidência histórica e não pode perder o vínculo.
ALTER TABLE public.pvh_empenhos
  DROP CONSTRAINT IF EXISTS pvh_empenhos_processo_anual_id_fkey;
ALTER TABLE public.pvh_empenhos
  ADD CONSTRAINT pvh_empenhos_processo_anual_id_fkey
  FOREIGN KEY (processo_anual_id)
  REFERENCES public.pvh_processos_anuais(id)
  ON DELETE RESTRICT;

ALTER TABLE public.pvh_subempenhos
  DROP CONSTRAINT IF EXISTS pvh_subempenhos_processo_anual_id_fkey;
ALTER TABLE public.pvh_subempenhos
  ADD CONSTRAINT pvh_subempenhos_processo_anual_id_fkey
  FOREIGN KEY (processo_anual_id)
  REFERENCES public.pvh_processos_anuais(id)
  ON DELETE RESTRICT;

-- 2) Não permite duas vigências ATIVAS sobrepostas para a mesma instituição.
-- Registros inativos/históricos podem coexistir; a validação vale para novas gravações/edições.
CREATE OR REPLACE FUNCTION public.pvh_validar_vigencia_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.ativo IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_prestador_config cfg
     WHERE cfg.prestador_id = NEW.prestador_id
       AND cfg.ativo = true
       AND cfg.id <> NEW.id
       AND cfg.vigencia_inicio <= COALESCE(NEW.vigencia_fim, DATE '9999-12-31')
       AND COALESCE(cfg.vigencia_fim, DATE '9999-12-31') >= NEW.vigencia_inicio
  ) THEN
    RAISE EXCEPTION
      'Já existe uma vigência PVH ativa para esta instituição que cobre esse período. Encerre a vigência anterior antes de criar ou ampliar outra regra.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_validar_vigencia_config()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_validar_vigencia_config
  ON public.pvh_prestador_config;
CREATE TRIGGER trg_pvh_validar_vigencia_config
  BEFORE INSERT OR UPDATE OF prestador_id, vigencia_inicio, vigencia_fim, ativo
  ON public.pvh_prestador_config
  FOR EACH ROW EXECUTE FUNCTION public.pvh_validar_vigencia_config();

-- 3) Snapshot da competência só existe se houver configuração institucional vigente.
CREATE OR REPLACE FUNCTION public.pvh_snapshot_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_comp text;
  v_ref date;
  v_cfg public.pvh_prestador_config%ROWTYPE;
BEGIN
  SELECT competencia
    INTO v_comp
    FROM public.pvh_competencias
   WHERE id = NEW.competencia_id;

  IF v_comp IS NULL THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.' USING ERRCODE = '23503';
  END IF;

  v_ref := to_date('01/' || v_comp, 'DD/MM/YYYY');

  SELECT *
    INTO v_cfg
    FROM public.pvh_prestador_config
   WHERE prestador_id = NEW.prestador_id
     AND ativo = true
     AND vigencia_inicio <= v_ref
     AND (vigencia_fim IS NULL OR vigencia_fim >= v_ref)
   ORDER BY vigencia_inicio DESC, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Não existe configuração PVH ativa e vigente para esta instituição na competência %. Configure a vigência antes de incluir o participante.',
      v_comp
      USING ERRCODE = '23514';
  END IF;

  NEW.config_origem_id := v_cfg.id;
  NEW.notificar_email := v_cfg.notificar_email;
  NEW.exige_prestacao_contas := v_cfg.exige_prestacao_contas;
  NEW.prazo_prestacao_contas_dias := v_cfg.prazo_prestacao_contas_dias;

  -- Campos legados permanecem no schema para preservar compatibilidade/histórico,
  -- mas não representam regra fixa da instituição e não entram no novo snapshot.
  NEW.cr_dotacao := NULL;
  NEW.natureza_despesa := NULL;
  NEW.fonte_recurso := NULL;
  NEW.processo_empenho_sei := NULL;
  NEW.processo_subempenho_sei := NULL;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_snapshot_participante()
  FROM PUBLIC, anon, authenticated;

-- 4) Processos anuais são configuração institucional: leitura para os três papéis,
-- manutenção somente para Admin/ACP. As tabelas financeiras operacionais não mudam.
DROP POLICY IF EXISTS "pvh pvh_processos_anuais read" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh pvh_processos_anuais insert" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh pvh_processos_anuais update" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh pvh_processos_anuais delete" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh processos anuais read" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh processos anuais insert" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh processos anuais update" ON public.pvh_processos_anuais;
DROP POLICY IF EXISTS "pvh processos anuais delete" ON public.pvh_processos_anuais;

CREATE POLICY "pvh processos anuais read"
  ON public.pvh_processos_anuais FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));

CREATE POLICY "pvh processos anuais insert"
  ON public.pvh_processos_anuais FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

CREATE POLICY "pvh processos anuais update"
  ON public.pvh_processos_anuais FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));

CREATE POLICY "pvh processos anuais delete"
  ON public.pvh_processos_anuais FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[]));
