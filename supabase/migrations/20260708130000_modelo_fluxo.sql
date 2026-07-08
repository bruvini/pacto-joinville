-- Modelos de Fluxo (Workflow Engines): permite múltiplos caminhos de processo
-- conforme a natureza do convênio.
--   fluxo_1 = Fluxo Padrão Hospitalar (7 etapas + anulação de empenho) — atual.
--   fluxo_2 = Fluxo de Liquidação Direta (sem anulação; liquidação via comissões/portarias).

ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS modelo_fluxo TEXT NOT NULL DEFAULT 'fluxo_1';

DO $$ BEGIN
  ALTER TABLE public.convenios
    ADD CONSTRAINT convenios_modelo_fluxo_check CHECK (modelo_fluxo IN ('fluxo_1', 'fluxo_2'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.convenios.modelo_fluxo IS
  'Motor de fluxo do processo: fluxo_1 (padrão hospitalar) ou fluxo_2 (liquidação direta).';

-- Campos específicos da Etapa 6 do Fluxo 2 (Liquidação de Despesa).
-- Os subpassos 6/7/8 reutilizam link_subempenho_sei, link_programacao_pagamento_sei,
-- link_comprovante_pagamento_sei e data_pagamento (já existentes).
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS link_minuta_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_memorando_sei TEXT,
  ADD COLUMN IF NOT EXISTS minuta_enc_ses BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_portaria_sei TEXT,
  ADD COLUMN IF NOT EXISTS link_solicitacao_liquidacao_sei TEXT,
  ADD COLUMN IF NOT EXISTS valor_liquidado NUMERIC,
  ADD COLUMN IF NOT EXISTS link_aviso_liquidacao_sei TEXT,
  ADD COLUMN IF NOT EXISTS aviso_enc_sefaz BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lancamentos_pagamento.link_minuta_sei IS 'Fluxo 2 · subpasso 1: Minuta no SEI (Gerente ACP + Diretor de Serviços Complementares).';
COMMENT ON COLUMN public.lancamentos_pagamento.link_memorando_sei IS 'Fluxo 2 · subpasso 2: Memorando no SEI (Fiscal + Gerente/Coordenador ACP).';
COMMENT ON COLUMN public.lancamentos_pagamento.minuta_enc_ses IS 'Fluxo 2 · subpasso 2: Minuta encaminhada para SES.UPA e SES.UPA.APA.';
COMMENT ON COLUMN public.lancamentos_pagamento.link_portaria_sei IS 'Fluxo 2 · subpasso 3: Portaria de Divulgação de Recursos no SEI.';
COMMENT ON COLUMN public.lancamentos_pagamento.link_solicitacao_liquidacao_sei IS 'Fluxo 2 · subpasso 4: Solicitação de Subempenho/Liquidação (Fiscal + Comissão).';
COMMENT ON COLUMN public.lancamentos_pagamento.valor_liquidado IS 'Fluxo 2 · subpasso 4: Valor Liquidado.';
COMMENT ON COLUMN public.lancamentos_pagamento.link_aviso_liquidacao_sei IS 'Fluxo 2 · subpasso 5: Aviso de Movimento — Empenho em Liquidação (Fiscal + Comissão).';
COMMENT ON COLUMN public.lancamentos_pagamento.aviso_enc_sefaz IS 'Fluxo 2 · subpasso 5: Aviso enviado para SEFAZ.UAF.ADE.';
