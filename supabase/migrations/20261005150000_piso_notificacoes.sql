-- Notificações do fluxo exclusivo do Piso da Enfermagem.
-- O sino existente usa a tabela public.notificacoes e recebe estes eventos em tempo real.
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS piso_competencia_id uuid REFERENCES public.piso_competencias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notificacoes_piso_competencia
  ON public.notificacoes (piso_competencia_id, created_at DESC)
  WHERE piso_competencia_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notificar_movimento_piso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  destinatario uuid;
  titulo text;
  mensagem text;
  etapa int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.etapas_concluidas IS NOT DISTINCT FROM OLD.etapas_concluidas THEN
    RETURN NEW;
  END IF;

  etapa := COALESCE((SELECT MIN(k::int) FROM jsonb_object_keys(NEW.etapas_concluidas) k WHERE NEW.etapas_concluidas ->> k = 'false'), 8);
  titulo := 'Piso da Enfermagem · ' || NEW.competencia;
  mensagem := CASE
    WHEN NEW.status = 'encerrada' THEN 'Competência encerrada.'
    WHEN NEW.status = 'aberta' THEN 'Competência reaberta.'
    ELSE 'Andamento atualizado na esteira da competência.'
  END;

  FOR destinatario IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'acp', 'aco')
  LOOP
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, piso_competencia_id)
    VALUES (destinatario, titulo, mensagem, 'piso_etapa', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_movimento_piso ON public.piso_competencias;
CREATE TRIGGER trg_notificar_movimento_piso
  AFTER UPDATE OF status, etapas_concluidas ON public.piso_competencias
  FOR EACH ROW EXECUTE FUNCTION public.notificar_movimento_piso();
