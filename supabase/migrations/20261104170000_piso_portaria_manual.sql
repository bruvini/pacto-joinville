-- Permite valor homologado manual por admin/ACP
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

  -- Preenchimento manual da Portaria GM/MS (quando o PDF não traz o valor):
  -- somente admin/ACP podem informar o valor homologado.
  IF TG_OP = 'UPDATE'
     AND NEW.valor_homologado IS DISTINCT FROM OLD.valor_homologado
     AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'acp')) THEN
    OLD.valor_homologado := NEW.valor_homologado;
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
