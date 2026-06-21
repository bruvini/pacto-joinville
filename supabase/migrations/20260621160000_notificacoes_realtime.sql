-- =====================================================================
-- Notificações automáticas (centro de notificações in-app, tempo real)
-- ---------------------------------------------------------------------
-- Tabela por destinatário (com estado de leitura) + fanout por trigger
-- (SECURITY DEFINER) quando um processo muda de etapa/responsável ou é
-- concluído. Realtime habilitado para entrega instantânea no sino.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  tipo TEXT,                           -- 'etapa' | 'conclusao' | 'sistema'
  lancamento_id UUID REFERENCES public.lancamentos_pagamento(id) ON DELETE SET NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Cada usuário só enxerga e gerencia as suas notificações.
CREATE POLICY "ver proprias notificacoes" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "marcar propria notificacao" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "apagar propria notificacao" ON public.notificacoes
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "inserir propria notificacao" ON public.notificacoes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notificacoes(user_id, lida, created_at DESC);

-- ---------------------------------------------------------------------
-- Fanout: gera notificações por destinatário ao avançar etapa / concluir.
-- SECURITY DEFINER -> pode inserir para outros usuários (ignora RLS).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fanout_notificacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  presta TEXT;
  titulo TEXT;
  msg TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  SELECT nome_instituicao INTO presta FROM public.prestadores WHERE id = NEW.prestador_id;
  presta := COALESCE(presta, 'Prestador');

  -- Conclusão do processo
  IF NEW.concluido AND NOT OLD.concluido THEN
    titulo := 'Processo concluído';
    msg := presta || ' · ' || COALESCE(NEW.descricao, 'processo') || ' foi concluído.';
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT DISTINCT ur.user_id, titulo, msg, 'conclusao', NEW.id
      FROM public.user_roles ur WHERE ur.role IN ('acp','aco');
    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      VALUES (NEW.created_by, titulo, msg, 'conclusao', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- Mudança de etapa / responsável -> avisa o setor responsável agora
  IF NEW.responsavel_atual IS DISTINCT FROM OLD.responsavel_atual
     OR NEW.etapa_atual IS DISTINCT FROM OLD.etapa_atual THEN
    titulo := 'Processo aguardando sua ação';
    msg := presta || ' · ' || COALESCE(NEW.descricao, 'processo') ||
           ' está sob responsabilidade da ' || upper(NEW.responsavel_atual) || '.';
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT ur.user_id, titulo, msg, 'etapa', NEW.id
      FROM public.user_roles ur
      WHERE ur.role = NEW.responsavel_atual::app_role;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fanout_notificacoes ON public.lancamentos_pagamento;
CREATE TRIGGER trg_fanout_notificacoes
  AFTER UPDATE ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.fanout_notificacoes();

-- ---------------------------------------------------------------------
-- Realtime: entrega instantânea no sino.
-- ---------------------------------------------------------------------
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
