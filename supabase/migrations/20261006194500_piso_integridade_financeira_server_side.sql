-- ============================================================================
-- PISO DA ENFERMAGEM — integridade financeira server-side
-- Fecha o último finding crítico do Lovable ("caller supplies the answer").
--
-- Princípios:
-- 1) resultados derivados de XLSX/PDF só podem ser gravados por service_role;
-- 2) valor devido da instituição é derivado do InvestSUS processado no servidor;
-- 3) valor a liquidar nasce automaticamente do valor devido e não é escolhido
--    pelo navegador;
-- 4) SQL Editor/postgres continua podendo fazer manutenção administrativa.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.piso_bloquear_resultados_derivados_competencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  papel text := COALESCE(auth.role(), '');
  manutencao boolean := current_user IN ('postgres', 'supabase_admin');
BEGIN
  IF manutencao OR papel = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.investsus_resumo IS NOT NULL
       OR COALESCE(NEW.investsus_auditoria, '{}'::jsonb) <> '{}'::jsonb
       OR NEW.valor_apurado_investsus IS NOT NULL
       OR NEW.total_publicado_municipal IS NOT NULL
       OR NEW.valor_homologado IS NOT NULL
       OR NEW.desconto_saldo IS NOT NULL
       OR NEW.acerto_contas IS NOT NULL
       OR NEW.valor_transferido IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Resultados financeiros derivados não podem ser definidos pelo cliente.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.investsus_resumo IS DISTINCT FROM OLD.investsus_resumo
     OR NEW.investsus_auditoria IS DISTINCT FROM OLD.investsus_auditoria
     OR NEW.valor_apurado_investsus IS DISTINCT FROM OLD.valor_apurado_investsus
     OR NEW.total_publicado_municipal IS DISTINCT FROM OLD.total_publicado_municipal
     OR NEW.valor_homologado IS DISTINCT FROM OLD.valor_homologado
     OR NEW.desconto_saldo IS DISTINCT FROM OLD.desconto_saldo
     OR NEW.acerto_contas IS DISTINCT FROM OLD.acerto_contas
     OR NEW.valor_transferido IS DISTINCT FROM OLD.valor_transferido
  THEN
    RAISE EXCEPTION
      'Resultados financeiros derivados só podem ser atualizados pelo processamento server-side das evidências.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_bloquear_resultados_derivados_competencia()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_comp_resultados_derivados
  ON public.piso_competencias;

CREATE TRIGGER trg_piso_comp_resultados_derivados
BEFORE INSERT OR UPDATE
ON public.piso_competencias
FOR EACH ROW
EXECUTE FUNCTION public.piso_bloquear_resultados_derivados_competencia();


CREATE OR REPLACE FUNCTION public.piso_bloquear_valores_derivados_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  papel text := COALESCE(auth.role(), '');
  manutencao boolean := current_user IN ('postgres', 'supabase_admin');
BEGIN
  IF manutencao OR papel = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.auditoria_resumo IS NOT NULL
       OR NEW.valor_devido IS NOT NULL
       OR NEW.valor_recurso_atual IS NOT NULL
       OR NEW.valor_saldo_afc IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Valores financeiros derivados do participante não podem ser definidos pelo cliente.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.auditoria_resumo IS DISTINCT FROM OLD.auditoria_resumo
     OR NEW.valor_devido IS DISTINCT FROM OLD.valor_devido
     OR NEW.valor_recurso_atual IS DISTINCT FROM OLD.valor_recurso_atual
     OR NEW.valor_saldo_afc IS DISTINCT FROM OLD.valor_saldo_afc
  THEN
    RAISE EXCEPTION
      'Auditoria e valores derivados do participante só podem ser atualizados pelo processamento server-side.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_bloquear_valores_derivados_participante()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_part_valores_derivados
  ON public.piso_participantes;

CREATE TRIGGER trg_piso_part_valores_derivados
BEFORE INSERT OR UPDATE
ON public.piso_participantes
FOR EACH ROW
EXECUTE FUNCTION public.piso_bloquear_valores_derivados_participante();


CREATE OR REPLACE FUNCTION public.piso_derivar_valor_obrigacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  devido numeric(14,2);
  papel text := COALESCE(auth.role(), '');
  manutencao boolean := current_user IN ('postgres', 'supabase_admin');
BEGIN
  SELECT p.valor_devido
    INTO devido
    FROM public.piso_participantes p
   WHERE p.id = NEW.participante_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante da obrigação não encontrado.'
      USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A obrigação sempre nasce do valor devido já calculado no servidor.
    NEW.valor_a_liquidar := devido;
    RETURN NEW;
  END IF;

  IF NOT manutencao
     AND papel <> 'service_role'
     AND NEW.valor_a_liquidar IS DISTINCT FROM OLD.valor_a_liquidar
  THEN
    RAISE EXCEPTION
      'O valor a liquidar é derivado do valor devido e não pode ser alterado diretamente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_derivar_valor_obrigacao()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_obr_derivar_valor
  ON public.piso_obrigacoes;

CREATE TRIGGER trg_piso_obr_derivar_valor
BEFORE INSERT OR UPDATE OF participante_id, valor_a_liquidar
ON public.piso_obrigacoes
FOR EACH ROW
EXECUTE FUNCTION public.piso_derivar_valor_obrigacao();


-- Reconciliar obrigações já existentes com o valor devido autoritativo.
UPDATE public.piso_obrigacoes o
SET valor_a_liquidar = p.valor_devido
FROM public.piso_participantes p
WHERE p.id = o.participante_id
  AND p.valor_devido IS NOT NULL
  AND o.valor_a_liquidar IS DISTINCT FROM p.valor_devido;


-- Ocorrências de auditoria também são derivadas das evidências e não podem ser
-- fabricadas, editadas ou apagadas pelo navegador.
DROP POLICY IF EXISTS "piso insert" ON public.piso_ocorrencias;
DROP POLICY IF EXISTS "piso update" ON public.piso_ocorrencias;
DROP POLICY IF EXISTS "piso delete" ON public.piso_ocorrencias;
REVOKE INSERT, UPDATE, DELETE ON public.piso_ocorrencias FROM authenticated;


-- Evidências originais são imutáveis para usuários operacionais.
-- ACP/ACO podem anexar novos arquivos; alteração/remoção do registro original
-- fica restrita ao Admin, preservando hash, trilha e vínculo da evidência.
DROP POLICY IF EXISTS "piso update" ON public.piso_arquivos;
DROP POLICY IF EXISTS "piso delete" ON public.piso_arquivos;

CREATE POLICY "piso arquivos admin update" ON public.piso_arquivos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "piso arquivos admin delete" ON public.piso_arquivos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
