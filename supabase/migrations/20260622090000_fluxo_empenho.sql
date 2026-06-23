-- =====================================================================
-- Reengenharia do Processo de Empenho (etapas) — schema
-- Cole no SQL editor e rode (idempotente). Ver PLANO_FLUXO_EMPENHO.md
-- =====================================================================

-- Convênio: nº de parcelas (meses de vigência) e dias de execução
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS total_parcelas INTEGER;
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS dia_inicio_execucao INTEGER;
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS dia_fim_execucao INTEGER;

-- Termo aditivo: valor_total passa a ser o TETO MENSAL; + objeto e extrato SEI
ALTER TABLE public.termos_aditivos ADD COLUMN IF NOT EXISTS objeto TEXT;
ALTER TABLE public.termos_aditivos ADD COLUMN IF NOT EXISTS link_extrato_sei TEXT;
COMMENT ON COLUMN public.termos_aditivos.valor_total IS 'Teto MENSAL do aditivo';

-- Assinaturas: código SEI deixa de ser obrigatório (só nome + cargo)
ALTER TABLE public.assinaturas_config ALTER COLUMN codigo_sei DROP NOT NULL;
ALTER TABLE public.assinaturas_lancamento ALTER COLUMN codigo_sei DROP NOT NULL;

-- Lançamento: campos das etapas 4 (liberação de recurso) e revisão
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS revisao_aprovada BOOLEAN,
  ADD COLUMN IF NOT EXISTS revisao_obs TEXT,
  ADD COLUMN IF NOT EXISTS link_solicitacao_liberacao_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_subempenho_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_programacao_pagamento_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_comprovante_pagamento_sei TEXT,
  ADD COLUMN IF NOT EXISTS relatorio_tecnico_ok BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relatorio_analise_ok BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certidoes_ok BOOLEAN NOT NULL DEFAULT false;

-- Saldo: com teto MENSAL, cada parcela (lançamento) não pode passar do teto do mês.
CREATE OR REPLACE FUNCTION public.checar_saldo_empenho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  teto_mensal NUMERIC(14,2);
  rotulo TEXT;
BEGIN
  IF NEW.valor_solicitado IS NULL OR NEW.valor_solicitado = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.termo_aditivo_id IS NOT NULL THEN
    SELECT valor_total, identificador INTO teto_mensal, rotulo
      FROM public.termos_aditivos WHERE id = NEW.termo_aditivo_id;
    IF teto_mensal IS NOT NULL AND NEW.valor_solicitado > teto_mensal THEN
      RAISE EXCEPTION 'Valor da parcela (%) excede o teto mensal do % (%).',
        NEW.valor_solicitado, rotulo, teto_mensal USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
