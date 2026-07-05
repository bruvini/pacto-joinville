-- ============================================================
-- Migração: Adicionar coluna parcelas_competencia à lancamentos_pagamento
-- Rodar no SQL Editor do Lovable / Supabase
-- Data: 2026-07-05
-- ============================================================

-- Coluna JSONB para armazenar o detalhamento de parcelas quando há
-- múltiplas competências. Estrutura esperada:
-- [
--   { "competencia": "01/2026", "parcela": "1", "mes_pagamento": "02/2026", "valor": 50000 },
--   { "competencia": "02/2026", "parcela": "2", "mes_pagamento": "03/2026", "valor": 50000 }
-- ]
ALTER TABLE lancamentos_pagamento
ADD COLUMN IF NOT EXISTS parcelas_competencia JSONB DEFAULT NULL;

COMMENT ON COLUMN lancamentos_pagamento.parcelas_competencia IS
  'Detalhamento de parcelas quando há múltiplas competências. Array de objetos com competencia, parcela, mes_pagamento e valor.';
