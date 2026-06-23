-- =====================================================================
-- Ajustes do fluxo: teto no convênio, links SEI, relatórios
-- Rode no SQL editor (idempotente).
-- =====================================================================

-- Convênio: link do processo SEI + teto MENSAL no convênio (base do cálculo)
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS link_processo_sei TEXT;
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS teto_mensal NUMERIC(14,2);

-- Termo aditivo: link do documento do TA no SEI; valor_total = teto mensal
-- OPCIONAL (sobrescreve o do convênio quando informado)
ALTER TABLE public.termos_aditivos ADD COLUMN IF NOT EXISTS link_termo_sei TEXT;

-- Lançamento: links SEI dos relatórios/certidões (etapa 4)
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS link_relatorio_tecnico_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_relatorio_analise_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_certidoes_sei TEXT;

-- Saldo: teto efetivo = teto do aditivo (se houver) senão teto do convênio.
CREATE OR REPLACE FUNCTION public.checar_saldo_empenho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  teto NUMERIC(14,2);
BEGIN
  IF NEW.valor_solicitado IS NULL OR NEW.valor_solicitado = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.termo_aditivo_id IS NOT NULL THEN
    SELECT valor_total INTO teto FROM public.termos_aditivos WHERE id = NEW.termo_aditivo_id;
  END IF;
  IF teto IS NULL AND NEW.convenio_id IS NOT NULL THEN
    SELECT teto_mensal INTO teto FROM public.convenios WHERE id = NEW.convenio_id;
  END IF;
  IF teto IS NOT NULL AND NEW.valor_solicitado > teto THEN
    RAISE EXCEPTION 'Valor da parcela (%) excede o teto mensal (%).', NEW.valor_solicitado, teto USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
