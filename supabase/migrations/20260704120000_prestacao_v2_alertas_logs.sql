-- =====================================================================
-- PRESTAÇÃO DE CONTAS V2 + ALERTAS DE PRAZO + LOG DE ACESSOS (LGPD)
-- 1) lancamentos.data_pagamento: a contagem do prazo de prestação de
--    contas passa a começar na DATA DO PAGAMENTO (Etapa 6).
-- 2) prestacoes_contas: valores da análise (padrão Transferegov) —
--    valor aprovado (comprovado) × valor glosado.
-- 3) Avisos automáticos D-7 / D-3 / vencimento para o setor APC —
--    inserem em `notificacoes` (o webhook + Resend transformam em e-mail).
-- 4) logs_acesso: trilha de acessos imutável (LGPD Art. 46 / ISO 27001).
-- =====================================================================

-- 1) Data do pagamento (Etapa 6 — junto do comprovante)
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS data_pagamento DATE;

-- 2) Valores da análise da prestação de contas
ALTER TABLE public.prestacoes_contas
  ADD COLUMN IF NOT EXISTS valor_aprovado NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_glosado NUMERIC;

-- ---------------------------------------------------------------------
-- 3) Avisos de prazo da prestação de contas (D-7, D-3, vencimento)
-- ---------------------------------------------------------------------
-- Dedupe: cada lançamento recebe no máximo 1 aviso por marco.
CREATE TABLE IF NOT EXISTS public.prestacao_prazo_avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE CASCADE,
  marco TEXT NOT NULL CHECK (marco IN ('d7', 'd3', 'd0')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lancamento_id, marco)
);
GRANT SELECT ON public.prestacao_prazo_avisos TO authenticated;
GRANT ALL ON public.prestacao_prazo_avisos TO service_role;
ALTER TABLE public.prestacao_prazo_avisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read avisos" ON public.prestacao_prazo_avisos
  FOR SELECT TO authenticated USING (true);

-- Verifica os prazos e notifica o setor APC (fallback: admins).
-- Idempotente (marcos deduplicados) — pode rodar via pg_cron E via RPC do app.
CREATE OR REPLACE FUNCTION public.verificar_prazos_prestacao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  comp TEXT; mes INT; ano INT;
  base DATE; prazo DATE; dias INT;
  marco TEXT; titulo TEXT; msg TEXT;
  destinatarios INT; enviados INT := 0;
BEGIN
  FOR r IN
    SELECT l.id, l.competencia, l.data_pagamento,
           c.prazo_prestacao_contas_dias AS dias_prazo,
           p.nome_instituicao AS prestador_nome
    FROM public.lancamentos_pagamento l
    JOIN public.convenios c ON c.id = l.convenio_id
    LEFT JOIN public.prestadores p ON p.id = l.prestador_id
    LEFT JOIN public.prestacoes_contas pc ON pc.lancamento_id = l.id
    WHERE c.prazo_prestacao_contas_dias > 0
      AND (l.concluido OR COALESCE(l.link_comprovante_pagamento_sei, '') <> '')
      AND COALESCE(pc.status, 'aguardando') = 'aguardando'
  LOOP
    comp := substring(r.competencia from '\d{2}/\d{4}');
    -- Base da contagem: data do pagamento; fallback: fim do mês da competência.
    IF r.data_pagamento IS NOT NULL THEN
      base := r.data_pagamento;
    ELSIF comp IS NOT NULL THEN
      mes := split_part(comp, '/', 1)::int;
      ano := split_part(comp, '/', 2)::int;
      base := (make_date(ano, mes, 1) + interval '1 month' - interval '1 day')::date;
    ELSE
      CONTINUE;
    END IF;
    prazo := base + r.dias_prazo;
    dias := prazo - current_date;

    IF dias <= 0 THEN marco := 'd0';
    ELSIF dias <= 3 THEN marco := 'd3';
    ELSIF dias <= 7 THEN marco := 'd7';
    ELSE CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.prestacao_prazo_avisos a WHERE a.lancamento_id = r.id AND a.marco = marco) THEN
      CONTINUE;
    END IF;

    IF marco = 'd0' THEN
      titulo := 'Prestação de contas: prazo VENCIDO';
      msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
             ' — o prazo (' || to_char(prazo, 'DD/MM/YYYY') || ') venceu e a prestação de contas não foi recebida.';
    ELSE
      titulo := 'Prestação de contas: vence em ' || dias || ' dia(s)';
      msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
             ' — a prestação de contas vence em ' || to_char(prazo, 'DD/MM/YYYY') || '.';
    END IF;

    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT pr.id, titulo, msg, 'prazo_prestacao', r.id
      FROM public.profiles pr WHERE pr.setor ILIKE 'APC%';
    GET DIAGNOSTICS destinatarios = ROW_COUNT;
    IF destinatarios = 0 THEN
      INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
        SELECT DISTINCT ur.user_id, titulo, msg, 'prazo_prestacao', r.id
        FROM public.user_roles ur WHERE ur.role = 'admin';
    END IF;

    INSERT INTO public.prestacao_prazo_avisos (lancamento_id, marco) VALUES (r.id, marco);
    enviados := enviados + 1;
  END LOOP;
  RETURN enviados;
END; $$;

-- RPC do app (idempotente): rede de segurança caso o pg_cron não exista.
GRANT EXECUTE ON FUNCTION public.verificar_prazos_prestacao() TO authenticated;

-- Agenda diária (9h de Brasília = 12h UTC) — se o pg_cron estiver disponível.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('verificar-prazos-prestacao', '0 12 * * *', 'SELECT public.verificar_prazos_prestacao()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — a verificação rodará via app (RPC) ao abrir o painel.';
END $$;

-- ---------------------------------------------------------------------
-- 4) Log de acessos (LGPD) — trilha imutável, leitura restrita a admins
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logs_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  usuario_email TEXT,
  acao TEXT NOT NULL,     -- 'login' | 'logout' | 'navegacao' | 'relatorio' | ...
  detalhe TEXT,
  rota TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sem UPDATE/DELETE nem para authenticated: trilha de auditoria imutável.
GRANT SELECT, INSERT ON public.logs_acesso TO authenticated;
GRANT ALL ON public.logs_acesso TO service_role;
ALTER TABLE public.logs_acesso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inserir proprio acesso" ON public.logs_acesso
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin le acessos" ON public.logs_acesso
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_logs_acesso_user ON public.logs_acesso(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_data ON public.logs_acesso(created_at DESC);
