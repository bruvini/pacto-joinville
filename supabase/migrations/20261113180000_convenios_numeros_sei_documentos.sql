-- Convênios: dados documentais SEI (número + link) em todos os documentos.
-- Migration aditiva: campos opcionais preservam o histórico e não alteram a esteira.
-- O id_documento na URL NÃO é o número SEI; sem preenchimento automático.
BEGIN;

ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS numero_sei_solicitacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_empenho text,
  ADD COLUMN IF NOT EXISTS numero_sei_relatorio_tecnico text,
  ADD COLUMN IF NOT EXISTS numero_sei_relatorio_analise text,
  ADD COLUMN IF NOT EXISTS numero_sei_certidoes text,
  ADD COLUMN IF NOT EXISTS numero_sei_solicitacao_liberacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_subempenho text,
  ADD COLUMN IF NOT EXISTS numero_sei_programacao_pagamento text,
  ADD COLUMN IF NOT EXISTS numero_sei_comprovante_pagamento text,
  ADD COLUMN IF NOT EXISTS numero_sei_solicitacao_anulacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_anulacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_minuta text,
  ADD COLUMN IF NOT EXISTS numero_sei_memorando text,
  ADD COLUMN IF NOT EXISTS numero_sei_portaria text,
  ADD COLUMN IF NOT EXISTS numero_sei_solicitacao_liquidacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_aviso_liquidacao text;

-- O número do processo SEI mãe já existe em convenios.numero_processo_sei_mae.
-- O termo aditivo já tem numero_sei; acrescenta número específico do extrato.
ALTER TABLE public.termos_aditivos
  ADD COLUMN IF NOT EXISTS numero_sei_extrato text;

COMMENT ON COLUMN public.termos_aditivos.numero_sei_extrato
  IS 'Número SEI do extrato de publicação do termo aditivo; distinto de termos_aditivos.numero_sei (termo).';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_solicitacao IS 'Número SEI do documento solicitacao vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_empenho IS 'Número SEI do documento empenho vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_relatorio_tecnico IS 'Número SEI do documento relatorio tecnico vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_relatorio_analise IS 'Número SEI do documento relatorio analise vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_certidoes IS 'Número SEI do documento certidoes vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_solicitacao_liberacao IS 'Número SEI do documento solicitacao liberacao vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_subempenho IS 'Número SEI do documento subempenho vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_programacao_pagamento IS 'Número SEI do documento programacao pagamento vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_comprovante_pagamento IS 'Número SEI do documento comprovante pagamento vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_solicitacao_anulacao IS 'Número SEI do documento solicitacao anulacao vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_anulacao IS 'Número SEI do documento anulacao vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_minuta IS 'Número SEI do documento minuta vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_memorando IS 'Número SEI do documento memorando vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_portaria IS 'Número SEI do documento portaria vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_solicitacao_liquidacao IS 'Número SEI do documento solicitacao liquidacao vinculado a seu campo link correspondente.';
COMMENT ON COLUMN public.lancamentos_pagamento.numero_sei_aviso_liquidacao IS 'Número SEI do documento aviso liquidacao vinculado a seu campo link correspondente.';
NOTIFY pgrst, 'reload schema';
COMMIT;
