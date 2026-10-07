-- Permite que os mesmos papéis que operam o Piso consigam desfazer
-- uploads processáveis que falharam antes da auditoria da Edge Function.
DROP POLICY IF EXISTS "piso arquivos delete" ON storage.objects;

CREATE POLICY "piso arquivos delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'piso-arquivos'
  AND public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::app_role[]
  )
);
