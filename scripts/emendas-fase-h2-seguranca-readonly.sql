-- PACTO Joinville · H2 — Inspeção estática de segurança (somente leitura).
-- Não substitui testes com usuários reais e tokens de ACP, Admin e ACO.
BEGIN TRANSACTION READ ONLY;

WITH rpcs_criticas(nome) AS (
 VALUES ('emenda_subempenho_criar'),
 ('emenda_subempenho_documentar'),('emenda_subempenho_assinar'),
 ('emenda_subempenho_encaminhar'),('emenda_subempenho_concluir_etapa'),
 ('emenda_pag_conciliar'),('emenda_anular_residual'),
 ('emenda_encerrar_competencia_sem_execucao'),('emenda_conciliar_encerrar_ne')
),
rpcs AS (
 SELECT c.nome,p.oid,p.prosecdef,p.proconfig,
  pg_get_functiondef(p.oid) AS definicao,
  CASE WHEN p.oid IS NULL THEN false
    ELSE has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_exec,
  CASE WHEN p.oid IS NULL THEN false
    ELSE has_function_privilege('authenticated',p.oid,'EXECUTE') END AS auth_exec
 FROM rpcs_criticas c
 LEFT JOIN pg_proc p ON p.proname=c.nome
  AND p.pronamespace='public'::regnamespace
),
tabelas AS (
 SELECT c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND (c.relname LIKE 'emenda_%' OR c.relname='emendas')
),
views_criticas(nome) AS (
 VALUES('emenda_f_ne_painel'),('emenda_f_competencias_painel'),
 ('emenda_f_emenda_painel'),('emenda_ne_painel'),
 ('emenda_ne_competencias_painel'),
 ('emenda_pagamento_subempenhos_painel'),
 ('emenda_pagamento_parcelas_painel'),
 ('emenda_h_legado_conferencia')
),
views AS (
 SELECT v.nome,c.oid,coalesce('security_invoker=true'=ANY(c.reloptions),false) AS invocadora
 FROM views_criticas v
 LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||v.nome)
),
financeiras(nome) AS (
 VALUES('emenda_subempenhos'),('emenda_subempenho_documentos'),
 ('emenda_subempenho_assinaturas'),('emenda_subempenho_encaminhamentos'),
 ('emenda_subempenho_conclusoes'),
 ('emenda_pagamento_parcelas'),('emenda_pagamento_programacoes'),
 ('emenda_pagamento_comprovantes'),('emenda_pagamento_ajustes'),
 ('emenda_pagamento_retificacoes'),('emenda_pagamento_conciliacoes'),
 ('emenda_ne_competencias'),('emenda_liberacoes'),
 ('emenda_blocos_pagamento'),('emenda_anulacoes'),
 ('emenda_conciliacoes_ne'),('emenda_encerramentos_sem_execucao')
)
SELECT jsonb_build_object(
 'capturado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'tabelas',jsonb_build_object(
  'total',(SELECT count(*) FROM tabelas),
  'sem_rls',(SELECT coalesce(jsonb_agg(relname), '[]'::jsonb)
   FROM tabelas WHERE NOT relrowsecurity),
  'financeiras_sem_rls',(
   SELECT coalesce(jsonb_agg(f.nome),'[]'::jsonb)
   FROM financeiras f LEFT JOIN tabelas t ON t.relname=f.nome
   WHERE t.relname IS NULL OR NOT coalesce(t.relrowsecurity,false))
 ),
 'visoes',jsonb_build_object(
  'inspecionadas',(SELECT count(*) FROM views),
  'ausentes',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb) FROM views WHERE oid IS NULL),
  'sem_security_invoker',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM views WHERE oid IS NOT NULL AND NOT invocadora)
 ),
 'rpcs',jsonb_build_object(
  'inspecionadas',(SELECT count(*) FROM rpcs),
  'ausentes',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb) FROM rpcs WHERE oid IS NULL),
  'anon_consegue_executar',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM rpcs WHERE anon_exec),
  'nao_definer',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM rpcs WHERE oid IS NOT NULL AND NOT prosecdef),
  'sem_search_path_restrito',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM rpcs WHERE oid IS NOT NULL
    AND NOT (coalesce(proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""']::text[])),
  'sem_verificacao_explicita_de_papel',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM rpcs WHERE oid IS NOT NULL AND
    (definicao NOT ILIKE '%auth.uid()%' OR definicao NOT ILIKE '%has_any_role%')),
  'sem_grant_authenticated',(SELECT coalesce(jsonb_agg(nome),'[]'::jsonb)
   FROM rpcs WHERE oid IS NOT NULL AND NOT auth_exec)
 ),
 'politicas',jsonb_build_object(
  'acp_admin_escrita_emenda',(SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='emendas'
    AND cmd IN ('UPDATE','INSERT') AND
    (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%acp%' AND
    (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%admin%'),
  'aco_leitura',(SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='emendas'
    AND cmd='SELECT' AND qual LIKE '%aco%'),
  'financeiras_com_politica_update_delete_direto',(
   SELECT coalesce(jsonb_agg(p.tablename||':'||p.cmd),'[]'::jsonb)
   FROM pg_policies p JOIN financeiras f ON f.nome=p.tablename
   WHERE p.schemaname='public' AND p.cmd IN ('UPDATE','DELETE')
  )
 ),
 'lembrete',
 'RLS/policies e grants sao apenas verificacoes estaticas. Teste Admin, ACP, ACO, anon e concorrencia em ambiente segregado.'
) AS auditoria_h2;

COMMIT;
