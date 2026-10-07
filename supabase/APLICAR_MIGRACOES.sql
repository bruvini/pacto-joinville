-- ============================================================================
-- ARQUIVO DESCONTINUADO — NÃO USE PARA ATUALIZAR O BANCO
-- ============================================================================
-- Fonte de verdade: arquivos timestampados em supabase/migrations/.
-- Leia supabase/MIGRACOES.md.
--
-- Este arquivo falha deliberadamente para impedir que um snapshot histórico e
-- incompleto seja executado por engano.
-- ============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'APLICAR_MIGRACOES.sql foi descontinuado. Aplique somente as migrations timestampadas em supabase/migrations/. Consulte supabase/MIGRACOES.md.';
END;
$$;
