-- ============================================================
-- Migração: Adicionar coluna parent_id para relacionamento pai-filho
-- Rodar no SQL Editor do Lovable / Supabase
-- Data: 2026-07-05
-- ============================================================

-- Adiciona a coluna parent_id apontando para si mesma
ALTER TABLE lancamentos_pagamento
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES lancamentos_pagamento(id) ON DELETE CASCADE DEFAULT NULL;

-- Cria índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_lancamentos_parent_id ON lancamentos_pagamento(parent_id);

COMMENT ON COLUMN lancamentos_pagamento.parent_id IS
  'Para sublançamentos: aponta para o lançamento pai (multi-competência). NULL = lançamento raiz.';
