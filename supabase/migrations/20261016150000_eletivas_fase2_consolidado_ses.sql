-- Fase 2: acrescenta APENAS a categoria de evidência ec_consolidado.
-- Não altera dados, vínculos, valores, permissões ou motor financeiro.
BEGIN;
DO $check$
BEGIN
 IF to_regclass('public.eletivas_arquivos') IS NULL THEN
  RAISE EXCEPTION 'Aplique primeiro as migrations de fundação Eletivas.' USING ERRCODE='23514';
 END IF;
END;
$check$;
ALTER TABLE public.eletivas_arquivos
 DROP CONSTRAINT IF EXISTS eletivas_arquivos_categoria_check;
ALTER TABLE public.eletivas_arquivos
 ADD CONSTRAINT eletivas_arquivos_categoria_check CHECK(categoria IN (
    'dbf_faec','dbf_mac','dbf_sia','s_faec','s_faec_ms','s_faec_est',
    's_mac_faec','s_mac','s_mac_ms','s_mac_fed','sia_faec','sia_faec_p',
    'sia_mac','ec_delib','ec_consolidado','fpo_official','wb_aih','rtma','ra','outros'
 ));
COMMENT ON CONSTRAINT eletivas_arquivos_categoria_check ON public.eletivas_arquivos IS
 'Catálogo de fontes HTML v2.42.2, incluindo consolidado geral SES usado somente na conferência.';
COMMIT;
