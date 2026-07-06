
CREATE OR REPLACE FUNCTION public.notificar_prestacao_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cv RECORD;
  presta TEXT;
  titulo TEXT;
  msg TEXT;
  destinatarios INT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NOT (NEW.concluido = true AND COALESCE(OLD.concluido, false) = false) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exige_prestacao_contas, true) AS exige,
         COALESCE(prazo_prestacao_contas_dias, 0) AS prazo
  INTO cv
  FROM public.convenios WHERE id = NEW.convenio_id;

  IF NOT COALESCE(cv.exige, true) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notificacoes
    WHERE lancamento_id = NEW.id AND tipo = 'prestacao_pendente'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nome_instituicao INTO presta FROM public.prestadores WHERE id = NEW.prestador_id;
  presta := COALESCE(presta, 'Prestador');

  titulo := 'Nova prestação de contas pendente';
  msg := presta || ' · competência ' || COALESCE(NEW.competencia, '—') ||
         ' — o processo foi concluído e aguarda a prestação de contas.';

  INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
    SELECT pr.id, titulo, msg, 'prestacao_pendente', NEW.id
    FROM public.profiles pr WHERE pr.setor ILIKE 'APC%';
  GET DIAGNOSTICS destinatarios = ROW_COUNT;

  IF destinatarios = 0 THEN
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT DISTINCT ur.user_id, titulo, msg, 'prestacao_pendente', NEW.id
      FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_prestacao_pendente ON public.lancamentos_pagamento;
CREATE TRIGGER trg_notificar_prestacao_pendente
AFTER UPDATE OF concluido ON public.lancamentos_pagamento
FOR EACH ROW
EXECUTE FUNCTION public.notificar_prestacao_pendente();
