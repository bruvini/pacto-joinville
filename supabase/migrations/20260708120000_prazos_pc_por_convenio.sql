-- Prazos de análise da Prestação de Contas: de globais (sistema_config) para
-- individuais por convênio. Cada contrato passa a definir seus próprios prazos
-- de retorno da Entidade e de manifestação da CGM.

ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS prazo_retorno_entidade_dias INTEGER,
  ADD COLUMN IF NOT EXISTS prazo_retorno_cgm_dias INTEGER;

COMMENT ON COLUMN public.convenios.prazo_retorno_entidade_dias IS
  'Dias corridos para a Entidade responder as diligências antes de o prazo ser considerado vencido.';
COMMENT ON COLUMN public.convenios.prazo_retorno_cgm_dias IS
  'Dias corridos para a CGM se manifestar após o encaminhamento. NULO desativa os alertas de atraso desta fase.';

-- Backfill: convênios existentes herdam os antigos valores globais (ou 30) para o
-- prazo da Entidade, mantendo o comportamento de alertas que já existia.
UPDATE public.convenios
SET prazo_retorno_entidade_dias = COALESCE(
  (SELECT GREATEST(valor::int, 1) FROM public.sistema_config WHERE chave = 'prazo_retorno_entidade_dias'),
  30)
WHERE prazo_retorno_entidade_dias IS NULL
  AND COALESCE(exige_prestacao_contas, true);

UPDATE public.convenios
SET prazo_retorno_cgm_dias = COALESCE(
  (SELECT GREATEST(valor::int, 1) FROM public.sistema_config WHERE chave = 'prazo_retorno_cgm_dias'),
  30)
WHERE prazo_retorno_cgm_dias IS NULL
  AND COALESCE(exige_prestacao_contas, true);

-- verificar_prazos_prestacao(): passa a ler os prazos de análise de cada convênio.
-- O prazo da CGM é opcional: quando o convênio não o define (NULL), nenhum alerta
-- de atraso da fase de controle é gerado para aquele contrato.
CREATE OR REPLACE FUNCTION public.verificar_prazos_prestacao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  comp TEXT; mes INT; ano INT;
  base DATE; prazo DATE; dias INT;
  marco TEXT; titulo TEXT; msg TEXT;
  enviados INT := 0;
  prazo_ent INT;
BEGIN
  FOR r IN
    SELECT l.id, l.competencia, l.data_pagamento,
           c.prazo_prestacao_contas_dias AS dias_prazo,
           c.prazo_retorno_entidade_dias AS prazo_ret_ent,
           c.prazo_retorno_cgm_dias AS prazo_ret_cgm,
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
    -- Prazo do próprio convênio; fallback 30 dias se não configurado.
    IF r.data_envio_entidade IS NOT NULL AND r.data_retorno_entidade IS NULL THEN
      prazo_ent := GREATEST(COALESCE(r.prazo_ret_ent, 30), 1);
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
    -- Opcional: sem prazo configurado no convênio, não gera alerta desta fase.
    IF r.data_enc_cgm IS NOT NULL AND r.data_retorno_cgm IS NULL AND r.prazo_ret_cgm IS NOT NULL THEN
      prazo := r.data_enc_cgm + GREATEST(r.prazo_ret_cgm, 1);
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

-- As chaves globais deixam de ser usadas pela esteira (agora são por convênio).
DELETE FROM public.sistema_config WHERE chave IN ('prazo_retorno_entidade_dias', 'prazo_retorno_cgm_dias');
