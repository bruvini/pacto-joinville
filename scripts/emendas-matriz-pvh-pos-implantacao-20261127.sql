-- Auditoria somente leitura: matriz estruturada de Emendas.
-- Rodar após a migration 20261127140500...; não cria nem modifica dados.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'coletado_em',now(),
 'instalacao',jsonb_build_object(
  'coluna_grupos_opcionais',EXISTS(
   SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='emenda_subempenho_matrizes'
    AND column_name='grupos_opcionais'),
  'rpc_homologacao_estruturada',EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='emenda_sub_matriz_padrao_homologar'),
  'rpc_assinatura_suporta_opcional',coalesce((
   SELECT pg_get_functiondef(p.oid) LIKE '%p_grupo=ANY(politica.grupos_opcionais)%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='emenda_subempenho_assinar'
   LIMIT 1),false),
  'guard_rascunho_antigo_removido',NOT EXISTS(
   SELECT 1 FROM pg_trigger WHERE tgrelid='public.emenda_subempenhos'::regclass
   AND tgname='guard_emenda_d_matriz_criar_sub' AND NOT tgisinternal),
  'guard_documentos_exige_homologacao',coalesce((
   SELECT pg_get_functiondef(p.oid) LIKE '%Matriz de assinatura e encaminhamento não homologada%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='emenda_subempenho_documentar'
   LIMIT 1),false),
  'exec_anon_negado',coalesce((
   SELECT NOT has_function_privilege('anon',p.oid,'EXECUTE')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='emenda_sub_matriz_padrao_homologar'
   LIMIT 1),false)
 ),
 'financeiro',jsonb_build_object(
  'valor_ne_emitida',(SELECT coalesce(sum(valor_ne),0) FROM public.emenda_solicitacoes WHERE status='emitida'),
  'limite_vinculado',(SELECT coalesce(sum(valor_alocado),0) FROM public.emenda_ne_competencias WHERE status='ativa'),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'documentos',(SELECT count(*) FROM public.emenda_subempenho_documentos),
  'assinaturas',(SELECT count(*) FROM public.emenda_subempenho_assinaturas),
  'parcelas',(SELECT count(*) FROM public.emenda_pagamento_parcelas)
 ),
 'governanca',jsonb_build_object(
  'matrizes_ativas',(SELECT count(*) FROM public.emenda_subempenho_matrizes WHERE ativa),
  'registros_historico',(SELECT count(*) FROM public.emenda_historico),
  'matrizes_com_papeis_sobrepostos',(SELECT count(*) FROM public.emenda_subempenho_matrizes
   WHERE grupos_obrigatorios&&grupos_opcionais)
 )
) AS auditoria_matriz_subempenho;
COMMIT;
