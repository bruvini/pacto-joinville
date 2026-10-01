ALTER FUNCTION public.piso_etapa_doc(text) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.piso_marcar_reconferencia(uuid,int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.piso_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.piso_guarda_competencia() FROM PUBLIC, anon, authenticated;