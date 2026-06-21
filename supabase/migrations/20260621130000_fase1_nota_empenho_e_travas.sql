-- =====================================================================
-- FASE 1 — Renomeação de etapa + travas de valor no banco
-- ---------------------------------------------------------------------
-- 1) "Nota Técnica" -> "Nota de Empenho": rotina real da ACP é
--    solicitar empenho -> Financeiro emite a NOTA DE EMPENHO -> (se
--    preciso) solicitar anulação -> Financeiro emite a nota de anulação.
-- 2) Trava não-burlável: empenho líquido nunca pode exceder o solicitado
--    (defesa em profundidade: o frontend valida em tempo real para UX,
--     o banco garante a verdade — OWASP A01/A04).
-- =====================================================================

-- Renomeia o valor do enum (atualiza todas as linhas que o referenciam).
ALTER TYPE public.etapa_processo RENAME VALUE 'nota_tecnica' TO 'nota_empenho';

-- Trava: valor_empenho_liquido <= valor_solicitado (quando ambos existem).
ALTER TABLE public.lancamentos_pagamento
  DROP CONSTRAINT IF EXISTS chk_empenho_nao_excede_solicitado;
ALTER TABLE public.lancamentos_pagamento
  ADD CONSTRAINT chk_empenho_nao_excede_solicitado
  CHECK (
    valor_empenho_liquido IS NULL
    OR valor_solicitado IS NULL
    OR valor_empenho_liquido <= valor_solicitado
  );
