-- Ajustes complementares do fluxo do Piso:
-- 1) Memorando municipal também exige assinatura do Diretor de Serviços Complementares.
-- 2) Alteração do link da Informação SEI do crédito reabre a Etapa 4 para reconferência.

INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'memorando',
    'diretor',
    'Diretor de Serviços Complementares',
    ARRAY['Diretor de Serviços Complementares'],
    false,
    false,
    false,
    3
  )
ON CONFLICT (tipo_documento, slot_key) DO UPDATE
SET label = EXCLUDED.label,
    cargos = EXCLUDED.cargos,
    manual = EXCLUDED.manual,
    qualquer = EXCLUDED.qualquer,
    opcional = EXCLUDED.opcional,
    ordem = EXCLUDED.ordem;

CREATE OR REPLACE FUNCTION public.piso_reconferir_credito_fms_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.credito_fms_link IS DISTINCT FROM OLD.credito_fms_link THEN
    PERFORM public.piso_marcar_reconferencia(NEW.id, 4);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_reconferir_credito_fms_link()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_credito_fms_link_reconferencia
  ON public.piso_competencias;

CREATE TRIGGER trg_piso_credito_fms_link_reconferencia
AFTER UPDATE OF credito_fms_link
ON public.piso_competencias
FOR EACH ROW
EXECUTE FUNCTION public.piso_reconferir_credito_fms_link();
