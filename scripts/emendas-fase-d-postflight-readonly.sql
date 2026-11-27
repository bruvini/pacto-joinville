-- PACTO · Emendas · D · PÓS-IMPLANTAÇÃO, SOMENTE LEITURA.
-- D1, D2 e D3 precisam ter sido instaladas nesta ordem.
-- Uma única saída JSON. Sem alterar atos, documentos ou valores.
BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
 'coletado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'instalacao',jsonb_build_object(
  'matrizes',to_regclass('public.emenda_subempenho_matrizes') IS NOT NULL,
  'assinaturas',to_regclass('public.emenda_subempenho_assinaturas') IS NOT NULL,
  'encaminhamentos',to_regclass('public.emenda_subempenho_encaminhamentos') IS NOT NULL,
  'conclusoes',to_regclass('public.emenda_subempenho_conclusoes') IS NOT NULL,
  'painel_documentos',to_regclass('public.emenda_subempenho_documentos_painel') IS NOT NULL,
  'rpc_matriz',to_regprocedure('public.emenda_sub_matriz_homologar(uuid,text,text[],boolean,text,text,text,text)') IS NOT NULL,
  'rpc_assinar',to_regprocedure('public.emenda_subempenho_assinar(uuid,text,text,text,text,text,date)') IS NOT NULL,
  'rpc_encaminhar',to_regprocedure('public.emenda_subempenho_encaminhar(uuid,text,text,date)') IS NOT NULL,
  'rpc_concluir',to_regprocedure('public.emenda_subempenho_concluir_etapa(uuid,text)') IS NOT NULL,
  'rls_quatro_tabelas',(
    SELECT count(*)=4 FROM pg_class c WHERE c.relnamespace='public'::regnamespace
     AND c.relname IN ('emenda_subempenho_matrizes','emenda_subempenho_assinaturas',
                       'emenda_subempenho_encaminhamentos','emenda_subempenho_conclusoes')
     AND c.relrowsecurity
  ),
  'view_invocadora',(
    SELECT 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
    FROM pg_class c WHERE c.oid='public.emenda_subempenho_documentos_painel'::regclass
  ),
  'triggers_protecao',(
    SELECT count(DISTINCT tgname) FROM pg_trigger
    WHERE NOT tgisinternal AND tgname IN (
     'guard_emenda_sub_matriz','guard_emenda_d_matriz_criar_sub',
     'guard_emenda_sub_ass_imutavel','guard_emenda_sub_env_imutavel',
     'guard_emenda_sub_concl_imutavel'
    )
  )
 ),
 'registro',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'nes',(SELECT count(*) FROM public.emenda_solicitacoes WHERE numero_ne IS NOT NULL),
  'distribuicoes_ativas',(SELECT count(*) FROM public.emenda_ne_competencias WHERE status='ativa'),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'matrizes_homologadas_ativas',(SELECT count(*) FROM public.emenda_subempenho_matrizes WHERE ativa),
  'documentos',(SELECT count(*) FROM public.emenda_subempenho_documentos),
  'assinaturas',(SELECT count(*) FROM public.emenda_subempenho_assinaturas),
  'encaminhamentos',(SELECT count(*) FROM public.emenda_subempenho_encaminhamentos),
  'conclusoes',(SELECT count(*) FROM public.emenda_subempenho_conclusoes),
  'pagamentos_legados',(SELECT count(*) FROM public.emenda_blocos_pagamento)
 ),
 'integridade',jsonb_build_object(
  'subetapas_sem_matriz',(
   SELECT count(*) FROM public.emenda_subempenho_documentos d
   LEFT JOIN public.emenda_subempenho_matrizes m ON m.id=d.politica_id
   WHERE m.id IS NULL OR m.emenda_id<>d.emenda_id OR m.tipo<>d.tipo
  ),
  'assinaturas_fora_da_matriz',(
   SELECT count(*) FROM public.emenda_subempenho_assinaturas a
   JOIN public.emenda_subempenho_documentos d ON d.id=a.documento_id
   JOIN public.emenda_subempenho_matrizes m ON m.id=d.politica_id
   WHERE NOT (a.grupo=ANY(m.grupos_obrigatorios))
  ),
  'encaminhamento_sem_politica',(
   SELECT count(*) FROM public.emenda_subempenho_encaminhamentos e
   JOIN public.emenda_subempenho_documentos d ON d.id=e.documento_id
   JOIN public.emenda_subempenho_matrizes m ON m.id=d.politica_id
   WHERE NOT m.exige_encaminhamento OR m.destino_encaminhamento<>e.destino
  ),
  'conclusoes_com_pendencias',(
   SELECT count(*) FROM public.emenda_subempenho_documentos_painel d
   WHERE d.conclusao_id IS NOT NULL AND
    (cardinality(d.grupos_pendentes)>0 OR
     (d.exige_encaminhamento AND d.encaminhamento_id IS NULL))
  ),
  'saldo_competencias_negativo',(
   SELECT count(*) FROM public.emenda_ne_competencias_painel
   WHERE status='ativa' AND saldo_competencia<0
  ),
  'modelos_financeiros_conflitantes',(
   SELECT count(*) FROM public.emenda_ne_painel
   WHERE modelo_financeiro='conflito_entre_modelos'
  )
 ),
 'operacao',jsonb_build_object(
  'etapas_pendentes_assinatura',(
   SELECT count(*) FROM public.emenda_subempenho_documentos_painel
   WHERE status_documental='aguardando_assinaturas'
  ),
  'etapas_pendentes_encaminhamento',(
   SELECT count(*) FROM public.emenda_subempenho_documentos_painel
   WHERE status_documental='aguardando_encaminhamento'
  ),
  'etapas_prontas_conclusao',(
   SELECT count(*) FROM public.emenda_subempenho_documentos_painel
   WHERE status_documental='pronto_concluir'
  ),
  'etapas_concluidas',(
   SELECT count(*) FROM public.emenda_subempenho_documentos_painel
   WHERE status_documental='concluido'
  )
 )
) AS auditoria_fase_d;
COMMIT;
