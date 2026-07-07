-- Adiciona a coluna pagamento_pontual na tabela public.convenios
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS pagamento_pontual BOOLEAN NOT NULL DEFAULT FALSE;

-- Função para reordenar parcelas de convênios de pagamento pontual
CREATE OR REPLACE FUNCTION public.reordenar_parcelas_pontuais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_pontual BOOLEAN;
  target_convenio_id UUID;
  r RECORD;
  idx INT;
BEGIN
  -- Identifica o convenio_id envolvido na operacao
  IF TG_OP = 'DELETE' THEN
    target_convenio_id := OLD.convenio_id;
  ELSE
    target_convenio_id := NEW.convenio_id;
  END IF;

  IF target_convenio_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Verifica se o convenio e do tipo pagamento pontual
  SELECT COALESCE(pagamento_pontual, FALSE) INTO conv_pontual
  FROM public.convenios
  WHERE id = target_convenio_id;

  IF conv_pontual THEN
    idx := 1;
    -- Reordena todas as parcelas (apenas parent_id IS NULL) cronologicamente
    FOR r IN (
      SELECT id 
      FROM public.lancamentos_pagamento
      WHERE convenio_id = target_convenio_id AND parent_id IS NULL
      ORDER BY 
        -- Ordenação cronológica segura do formato MM/YYYY
        SUBSTRING(competencia FROM 4 FOR 4)::integer ASC, -- Ano
        SUBSTRING(competencia FROM 1 FOR 2)::integer ASC, -- Mês
        created_at ASC
    ) LOOP
      UPDATE public.lancamentos_pagamento
      SET parcela = idx
      WHERE id = r.id;
      idx := idx + 1;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger para Insert, Update ou Delete em lancamentos_pagamento
DROP TRIGGER IF EXISTS trg_reordenar_parcelas_pontuais ON public.lancamentos_pagamento;
CREATE TRIGGER trg_reordenar_parcelas_pontuais
AFTER INSERT OR UPDATE OF competencia, convenio_id OR DELETE ON public.lancamentos_pagamento
FOR EACH ROW
EXECUTE FUNCTION public.reordenar_parcelas_pontuais();

-- Função para reordenar parcelas de convênios imediatamente ao alterar para pagamento pontual
CREATE OR REPLACE FUNCTION public.reordenar_parcelas_ao_atualizar_convenio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  idx INT;
BEGIN
  IF NEW.pagamento_pontual = TRUE AND (OLD.pagamento_pontual IS DISTINCT FROM NEW.pagamento_pontual) THEN
    idx := 1;
    FOR r IN (
      SELECT id 
      FROM public.lancamentos_pagamento
      WHERE convenio_id = NEW.id AND parent_id IS NULL
      ORDER BY 
        SUBSTRING(competencia FROM 4 FOR 4)::integer ASC,
        SUBSTRING(competencia FROM 1 FOR 2)::integer ASC,
        created_at ASC
    ) LOOP
      UPDATE public.lancamentos_pagamento
      SET parcela = idx
      WHERE id = r.id;
      idx := idx + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para Update em convenios
DROP TRIGGER IF EXISTS trg_reordenar_parcelas_ao_atualizar_convenio ON public.convenios;
CREATE TRIGGER trg_reordenar_parcelas_ao_atualizar_convenio
AFTER UPDATE OF pagamento_pontual ON public.convenios
FOR EACH ROW
EXECUTE FUNCTION public.reordenar_parcelas_ao_atualizar_convenio();
