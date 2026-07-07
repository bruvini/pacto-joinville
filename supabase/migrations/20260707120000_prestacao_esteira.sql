-- =====================================================================
-- PRESTAÇÃO DE CONTAS — ESTEIRA COMPLETA (accountability governamental)
--
-- Traz para o sistema a lógica que a equipe de PC opera na planilha manual:
-- um pipeline de ~7 marcos (Recebimento → Análise → Diligências à Entidade →
-- Parecer Técnico SES → Encaminhamento/Manifestação CGM → Baixa Contábil →
-- Encerramento), com RESPONSÁVEL (analista), rastreabilidade (trilha imutável
-- em historico_logs via trigger) e alertas de prazo de retorno (Entidade/CGM).
--
-- Não quebra o MVP: mantém status/valor_aprovado/valor_glosado/parecer/decidido_*
-- e apenas ACRESCENTA colunas + trigger de auditoria + SLAs configuráveis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Novas colunas da esteira em prestacoes_contas
-- ---------------------------------------------------------------------
ALTER TABLE public.prestacoes_contas
  -- Identificação / gestão
  ADD COLUMN IF NOT EXISTS numero_processo_pc TEXT,                 -- Nº Processo SEI próprio da PC (distinto do empenho)
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redistribuir BOOLEAN NOT NULL DEFAULT false, -- "Outro" da planilha: fila de redistribuição
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  -- Diligências (Relatório de Análise / Ofício à Entidade)
  ADD COLUMN IF NOT EXISTS link_relatorio_analise_sei TEXT,
  ADD COLUMN IF NOT EXISTS data_envio_entidade DATE,
  ADD COLUMN IF NOT EXISTS data_retorno_entidade DATE,
  -- Parecer Técnico Fundamentado — SES
  ADD COLUMN IF NOT EXISTS link_parecer_ses_sei TEXT,
  ADD COLUMN IF NOT EXISTS data_parecer_ses DATE,
  -- CGM (Controladoria Geral do Município)
  ADD COLUMN IF NOT EXISTS data_enc_cgm DATE,
  ADD COLUMN IF NOT EXISTS data_retorno_cgm DATE,
  ADD COLUMN IF NOT EXISTS link_manifestacao_cgm_sei TEXT,
  ADD COLUMN IF NOT EXISTS status_cgm TEXT,
  -- Baixa contábil (encerramento do ciclo por exercício)
  ADD COLUMN IF NOT EXISTS data_baixa_contabil DATE,
  ADD COLUMN IF NOT EXISTS situacao_baixa TEXT,
  ADD COLUMN IF NOT EXISTS exercicio_baixa INTEGER;

-- CHECKs (adicionados de forma idempotente; permitem NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestacoes_contas_status_cgm_chk') THEN
    ALTER TABLE public.prestacoes_contas
      ADD CONSTRAINT prestacoes_contas_status_cgm_chk
      CHECK (status_cgm IS NULL OR status_cgm IN ('regular', 'regular_ressalvas', 'diligencias', 'irregular'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestacoes_contas_situacao_baixa_chk') THEN
    ALTER TABLE public.prestacoes_contas
      ADD CONSTRAINT prestacoes_contas_situacao_baixa_chk
      CHECK (situacao_baixa IS NULL OR situacao_baixa IN ('com_baixa', 'sem_baixa'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pc_responsavel ON public.prestacoes_contas(responsavel_id);

-- ---------------------------------------------------------------------
-- 2) Trilha de auditoria imutável da PC (espelha log_lancamento_audit)
--    Grava em historico_logs usando o lancamento_id da PC, de modo que as
--    mudanças da prestação aparecem na MESMA linha do tempo do processo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_prestacao_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  old_j jsonb;
  new_j jsonb;
  k text;
  diffs jsonb := '{}'::jsonb;
  ignore_cols text[] := ARRAY['id','lancamento_id','updated_at','created_at'];
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao)
    VALUES (NEW.lancamento_id, uid, uname, 'Prestação de contas iniciada');
    RETURN NEW;
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(new_j) LOOP
    IF k = ANY(ignore_cols) THEN CONTINUE; END IF;
    IF (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
      diffs := diffs || jsonb_build_object(
        'pc_' || k, jsonb_build_object('de', old_j -> k, 'para', new_j -> k));
    END IF;
  END LOOP;

  IF diffs <> '{}'::jsonb THEN
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (NEW.lancamento_id, uid, uname, 'Prestação de contas atualizada', diffs);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pc_audit ON public.prestacoes_contas;
CREATE TRIGGER trg_pc_audit
  AFTER INSERT OR UPDATE ON public.prestacoes_contas
  FOR EACH ROW EXECUTE FUNCTION public.log_prestacao_audit();

-- Auditoria das interações (ofícios/respostas): registra na trilha do processo.
CREATE OR REPLACE FUNCTION public.log_pc_interacao_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  lanc uuid;
  rotulo text;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  SELECT lancamento_id INTO lanc FROM public.prestacoes_contas WHERE id = NEW.prestacao_id;
  rotulo := CASE NEW.tipo WHEN 'oficio' THEN 'Ofício registrado'
                          WHEN 'resposta' THEN 'Resposta do prestador registrada'
                          ELSE 'Interação registrada' END;
  IF lanc IS NOT NULL THEN
    INSERT INTO public.historico_logs(lancamento_id, usuario_id, usuario_nome, acao, detalhes)
    VALUES (lanc, uid, COALESCE(uname, NEW.autor_nome), 'PC · ' || rotulo,
            jsonb_build_object('descricao', NEW.descricao, 'link_sei', NEW.link_sei));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pci_audit ON public.prestacoes_contas_interacoes;
CREATE TRIGGER trg_pci_audit
  AFTER INSERT ON public.prestacoes_contas_interacoes
  FOR EACH ROW EXECUTE FUNCTION public.log_pc_interacao_audit();

-- ---------------------------------------------------------------------
-- 3) SLAs configuráveis dos prazos de retorno (Entidade / CGM)
-- ---------------------------------------------------------------------
INSERT INTO public.sistema_config (chave, valor, descricao) VALUES
  ('prazo_retorno_entidade_dias', '30', 'Dias corridos para a Entidade responder as diligências (ofício/relatório de análise) antes de o prazo ser considerado vencido.'),
  ('prazo_retorno_cgm_dias', '30', 'Dias corridos para a CGM se manifestar após o encaminhamento antes de o prazo ser considerado vencido.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Alertas de prazo — recebimento (D-7/D-3/D-0) + retorno Entidade/CGM,
--    roteados ao RESPONSÁVEL (fallback: setor APC → admins).
--    Idempotente (marcos deduplicados). Estende a função existente.
-- ---------------------------------------------------------------------
-- Novos marcos de dedupe: retorno da Entidade e da CGM vencidos.
ALTER TABLE public.prestacao_prazo_avisos DROP CONSTRAINT IF EXISTS prestacao_prazo_avisos_marco_check;
ALTER TABLE public.prestacao_prazo_avisos
  ADD CONSTRAINT prestacao_prazo_avisos_marco_check
  CHECK (marco IN ('d7', 'd3', 'd0', 'entidade_vencido', 'cgm_vencido'));

-- Helper de destino: responsável (se houver) → setor APC → admins.
CREATE OR REPLACE FUNCTION public.notificar_prestacao(
  p_lancamento uuid, p_responsavel uuid, p_titulo text, p_msg text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE destinatarios INT;
BEGIN
  IF p_responsavel IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      VALUES (p_responsavel, p_titulo, p_msg, 'prazo_prestacao', p_lancamento);
    RETURN;
  END IF;

  INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
    SELECT pr.id, p_titulo, p_msg, 'prazo_prestacao', p_lancamento
    FROM public.profiles pr WHERE pr.setor ILIKE 'APC%';
  GET DIAGNOSTICS destinatarios = ROW_COUNT;
  IF destinatarios = 0 THEN
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
      SELECT DISTINCT ur.user_id, p_titulo, p_msg, 'prazo_prestacao', p_lancamento
      FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.verificar_prazos_prestacao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  comp TEXT; mes INT; ano INT;
  base DATE; prazo DATE; dias INT;
  marco TEXT; titulo TEXT; msg TEXT;
  enviados INT := 0;
  prazo_ent INT; prazo_cgm INT;
BEGIN
  SELECT GREATEST(COALESCE(valor::int, 30), 1) INTO prazo_ent
    FROM public.sistema_config WHERE chave = 'prazo_retorno_entidade_dias';
  prazo_ent := COALESCE(prazo_ent, 30);
  SELECT GREATEST(COALESCE(valor::int, 30), 1) INTO prazo_cgm
    FROM public.sistema_config WHERE chave = 'prazo_retorno_cgm_dias';
  prazo_cgm := COALESCE(prazo_cgm, 30);

  FOR r IN
    SELECT l.id, l.competencia, l.data_pagamento,
           c.prazo_prestacao_contas_dias AS dias_prazo,
           p.nome_instituicao AS prestador_nome,
           pc.status AS pc_status,
           pc.responsavel_id,
           pc.data_envio_entidade, pc.data_retorno_entidade,
           pc.data_enc_cgm, pc.data_retorno_cgm
    FROM public.lancamentos_pagamento l
    JOIN public.convenios c ON c.id = l.convenio_id
    LEFT JOIN public.prestadores p ON p.id = l.prestador_id
    LEFT JOIN public.prestacoes_contas pc ON pc.lancamento_id = l.id
    WHERE COALESCE(c.exige_prestacao_contas, true)
      AND (l.concluido OR COALESCE(l.link_comprovante_pagamento_sei, '') <> '')
      AND COALESCE(pc.status, 'aguardando') NOT IN ('aprovada', 'reprovada')
  LOOP
    comp := substring(r.competencia from '\d{2}/\d{4}');

    -- (a) Prazo de RECEBIMENTO da prestação (só enquanto aguardando).
    IF COALESCE(r.pc_status, 'aguardando') = 'aguardando' AND r.dias_prazo > 0 THEN
      IF r.data_pagamento IS NOT NULL THEN
        base := r.data_pagamento;
      ELSIF comp IS NOT NULL THEN
        mes := split_part(comp, '/', 1)::int;
        ano := split_part(comp, '/', 2)::int;
        base := (make_date(ano, mes, 1) + interval '1 month' - interval '1 day')::date;
      ELSE
        base := NULL;
      END IF;

      IF base IS NOT NULL THEN
        prazo := base + r.dias_prazo;
        dias := prazo - current_date;
        marco := NULL;
        IF dias <= 0 THEN marco := 'd0';
        ELSIF dias <= 3 THEN marco := 'd3';
        ELSIF dias <= 7 THEN marco := 'd7';
        END IF;

        IF marco IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.prestacao_prazo_avisos a WHERE a.lancamento_id = r.id AND a.marco = marco) THEN
          IF marco = 'd0' THEN
            titulo := 'Prestação de contas: prazo VENCIDO';
            msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
                   ' — o prazo (' || to_char(prazo, 'DD/MM/YYYY') || ') venceu e a prestação de contas não foi recebida.';
          ELSE
            titulo := 'Prestação de contas: vence em ' || dias || ' dia(s)';
            msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
                   ' — a prestação de contas vence em ' || to_char(prazo, 'DD/MM/YYYY') || '.';
          END IF;
          PERFORM public.notificar_prestacao(r.id, r.responsavel_id, titulo, msg);
          INSERT INTO public.prestacao_prazo_avisos (lancamento_id, marco) VALUES (r.id, marco);
          enviados := enviados + 1;
        END IF;
      END IF;
    END IF;

    -- (b) Retorno da ENTIDADE vencido (diligência enviada, sem retorno).
    IF r.data_envio_entidade IS NOT NULL AND r.data_retorno_entidade IS NULL THEN
      prazo := r.data_envio_entidade + prazo_ent;
      IF prazo < current_date
         AND NOT EXISTS (SELECT 1 FROM public.prestacao_prazo_avisos a WHERE a.lancamento_id = r.id AND a.marco = 'entidade_vencido') THEN
        titulo := 'Prestação de contas: retorno da Entidade VENCIDO';
        msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
               ' — a Entidade não respondeu as diligências no prazo (' || to_char(prazo, 'DD/MM/YYYY') || ').';
        PERFORM public.notificar_prestacao(r.id, r.responsavel_id, titulo, msg);
        INSERT INTO public.prestacao_prazo_avisos (lancamento_id, marco) VALUES (r.id, 'entidade_vencido');
        enviados := enviados + 1;
      END IF;
    END IF;

    -- (c) Retorno da CGM vencido (encaminhado, sem manifestação).
    IF r.data_enc_cgm IS NOT NULL AND r.data_retorno_cgm IS NULL THEN
      prazo := r.data_enc_cgm + prazo_cgm;
      IF prazo < current_date
         AND NOT EXISTS (SELECT 1 FROM public.prestacao_prazo_avisos a WHERE a.lancamento_id = r.id AND a.marco = 'cgm_vencido') THEN
        titulo := 'Prestação de contas: manifestação da CGM VENCIDA';
        msg := COALESCE(r.prestador_nome, 'Prestador') || ' · competência ' || COALESCE(comp, '—') ||
               ' — a CGM não se manifestou no prazo (' || to_char(prazo, 'DD/MM/YYYY') || ').';
        PERFORM public.notificar_prestacao(r.id, r.responsavel_id, titulo, msg);
        INSERT INTO public.prestacao_prazo_avisos (lancamento_id, marco) VALUES (r.id, 'cgm_vencido');
        enviados := enviados + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN enviados;
END; $$;

GRANT EXECUTE ON FUNCTION public.verificar_prazos_prestacao() TO authenticated;

-- Notificar o responsável ao ser atribuído a uma prestação de contas.
CREATE OR REPLACE FUNCTION public.notificar_atribuicao_pc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE presta TEXT; comp TEXT;
BEGIN
  IF NEW.responsavel_id IS NOT NULL
     AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    SELECT p.nome_instituicao, l.competencia INTO presta, comp
      FROM public.lancamentos_pagamento l
      LEFT JOIN public.prestadores p ON p.id = l.prestador_id
      WHERE l.id = NEW.lancamento_id;
    INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lancamento_id)
    VALUES (NEW.responsavel_id, 'Prestação de contas atribuída a você',
            COALESCE(presta, 'Prestador') || ' · competência ' || COALESCE(substring(comp from '\d{2}/\d{4}'), '—') ||
            ' — você é o responsável pela análise desta prestação de contas.',
            'prazo_prestacao', NEW.lancamento_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pc_atribuicao ON public.prestacoes_contas;
CREATE TRIGGER trg_pc_atribuicao
  AFTER UPDATE OF responsavel_id ON public.prestacoes_contas
  FOR EACH ROW EXECUTE FUNCTION public.notificar_atribuicao_pc();
