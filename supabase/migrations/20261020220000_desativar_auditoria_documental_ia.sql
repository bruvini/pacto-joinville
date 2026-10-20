-- Desativa a auditoria documental assistida por IA sem excluir evidências históricas.
-- Preserva o PDF e a análise já registrados para eventual auditoria.
BEGIN;
DO $check$
BEGIN
  IF to_regclass('public.auditoria_pagamento_documentos') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.auditoria_pagamento_documentos FROM authenticated, anon';
    EXECUTE 'DROP POLICY IF EXISTS "aud pag inserir" ON public.auditoria_pagamento_documentos';
    EXECUTE 'COMMENT ON TABLE public.auditoria_pagamento_documentos IS ''Funcionalidade desativada. Evidências históricas preservadas somente para consulta autorizada.''';
  END IF;
END;
$check$;
DROP POLICY IF EXISTS "aud pag storage inserir" ON storage.objects;
-- Política original de leitura continua protegendo os PDFs existentes.
COMMIT;
