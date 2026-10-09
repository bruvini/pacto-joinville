-- Datas administrativas do PVH representam eventos distintos.
-- O pagamento efetivo pode ocorrer antes da formalização da programação.
-- Mantém obrigatoriedade documental e conciliação financeira na RPC da Etapa 5.
BEGIN;
ALTER TABLE public.pvh_pagamentos
  DROP CONSTRAINT IF EXISTS pvh_pagamentos_datas_check;
COMMIT;
