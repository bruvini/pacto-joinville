CREATE POLICY "piso arquivos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'piso-arquivos' AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "piso arquivos insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'piso-arquivos' AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));
CREATE POLICY "piso arquivos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'piso-arquivos' AND public.has_role(auth.uid(), 'admin'));