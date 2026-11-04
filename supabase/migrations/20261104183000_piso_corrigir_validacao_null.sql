-- Piso da Enfermagem: uma etapa ausente do JSON produz NULL, não FALSE.
-- No trigger de validação, IF NOT NULL não executa CONTINUE; isso
-- validava indevidamente a Etapa 4 enquanto a Etapa 2 era concluída.
-- Correção restrita a essa expressão; preserva todas as dependências.
BEGIN;

DO $patch$
DECLARE
  codigo text;
  trecho_antigo constant text := 'IF NOT precisa_validar THEN CONTINUE; END IF;';
  trecho_novo constant text := 'IF precisa_validar IS NOT TRUE THEN CONTINUE; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.piso_validar_dependencias_conclusao()'::regprocedure)
    INTO codigo;

  IF position(trecho_novo IN codigo) > 0 THEN
    RAISE NOTICE 'Validação de etapas já corrigida.';
  ELSIF position(trecho_antigo IN codigo) = 0 THEN
    RAISE EXCEPTION 'Trecho original da função de validação não encontrado; abortando migração.';
  ELSE
    EXECUTE replace(codigo, trecho_antigo, trecho_novo);
  END IF;
END;
$patch$;

COMMIT;
