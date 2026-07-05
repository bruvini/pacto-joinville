-- =====================================================================
-- UFI + MODO RETROATIVO + CONVÊNIO SEM PRESTAÇÃO DE CONTAS
-- 1) A área antes chamada de "ACO" passa a se chamar UFI (Unidade de
--    Gestão Financeira). O valor interno do papel continua 'aco' (não
--    quebra RLS/policies); apenas os textos exibidos mudam.
-- 2) Modo retroativo: chave em sistema_config que libera o preenchimento
--    de etapas sem as travas de sequência (para migrar dados históricos).
-- 3) convenios.exige_prestacao_contas: convênios que não exigem prestação
--    ficam fora da página/alertas de prestação de contas.
-- =====================================================================

-- 2) Modo retroativo (desligado por padrão; admin liga em Configurações)
INSERT INTO public.sistema_config (chave, valor, descricao) VALUES
  ('modo_retroativo', '0', 'Quando "1", libera o preenchimento retroativo dos lançamentos sem as travas de sequência de etapas (uso temporário, para migração de dados históricos).')
ON CONFLICT (chave) DO NOTHING;

-- 3) Convênio pode não exigir prestação de contas
ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS exige_prestacao_contas BOOLEAN NOT NULL DEFAULT true;

-- Alertas de prazo: ignora convênios que não exigem prestação de contas
-- (a função já exige prazo > 0; reforçamos com a flag).
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
      AND COALESCE(c.exige_prestacao_contas, true)
      AND (l.concluido OR COALESCE(l.link_comprovante_pagamento_sei, '') <> '')
      AND COALESCE(pc.status, 'aguardando') = 'aguardando'
  LOOP
    comp := substring(r.competencia from '\d{2}/\d{4}');
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

-- 1) Notificações de mudança de etapa passam a exibir "UFI" (não "ACO")
CREATE OR REPLACE FUNCTION public.fanout_notificacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  presta TEXT;
  titulo TEXT;
  msg TEXT;
  setor_nome TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  SELECT nome_instituicao INTO presta FROM public.prestadores WHERE id = NEW.prestador_id;
  presta := COALESCE(presta, 'Prestador');

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

  IF NEW.responsavel_atual IS DISTINCT FROM OLD.responsavel_atual
     OR NEW.etapa_atual IS DISTINCT FROM OLD.etapa_atual THEN
    setor_nome := CASE WHEN NEW.responsavel_atual = 'aco' THEN 'UFI' ELSE upper(NEW.responsavel_atual) END;
    titulo := 'Processo aguardando sua ação';
    msg := presta || ' · ' || COALESCE(NEW.descricao, 'processo') ||
           ' está sob responsabilidade da ' || setor_nome || '.';
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT ur.user_id, titulo, msg, 'etapa', NEW.id
      FROM public.user_roles ur
      WHERE ur.role = NEW.responsavel_atual::app_role;
  END IF;

  RETURN NEW;
END; $$;
