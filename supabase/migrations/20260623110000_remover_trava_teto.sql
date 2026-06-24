-- Fase 2: remove a trava que bloqueava valor solicitado > teto mensal
-- (era a causa da perda de dados) e adiciona justificativa do excedente.
DROP TRIGGER IF EXISTS trg_checar_saldo ON public.lancamentos_pagamento;

ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS justificativa_teto TEXT;
