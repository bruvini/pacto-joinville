-- Conferência após a migration da auditoria documental assistida.
-- APENAS SELECT; não altera registros nem arquivos.
SELECT to_regclass('public.auditoria_pagamento_documentos') IS NOT NULL AS tabela_disponivel;
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id='auditoria-pagamentos';
SELECT
  has_table_privilege('authenticated','public.auditoria_pagamento_documentos','SELECT') AS leitura_permitida_por_rls,
  has_table_privilege('authenticated','public.auditoria_pagamento_documentos','INSERT') AS insercao_com_rls,
  has_table_privilege('authenticated','public.auditoria_pagamento_documentos','UPDATE') AS alteracao_direta_bloqueada;
-- Esperado: TRUE, TRUE, FALSE (RLS limita efetivamente por papel).
SELECT count(*) AS documentos_registrados FROM public.auditoria_pagamento_documentos;
