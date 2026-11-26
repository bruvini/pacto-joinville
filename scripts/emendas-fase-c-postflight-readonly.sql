-- PACTO · Emendas · Fase C: pós-implantação SOMENTE LEITURA.
-- Executar após C1, C2 e C3 em homologação; retorna UMA linha JSON consolidada.
-- Não altera empenhos, alocações nem documentos.
BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
 'coletado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'instalacao',jsonb_build_object(
  'tabela',to_regclass('public.emenda_ne_competencias') IS NOT NULL,
  'painel_ne',to_regclass('public.emenda_ne_painel') IS NOT NULL,
  'painel_competencias',to_regclass('public.emenda_ne_competencias_painel') IS NOT NULL,
  'rpc_distribuir',to_regprocedure('public.emenda_ne_competencia_definir(uuid,uuid,numeric,text)') IS NOT NULL,
  'rpc_cancelar',to_regprocedure('public.emenda_ne_competencia_cancelar(uuid,text)') IS NOT NULL,
  'rls_alocacoes',coalesce((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid='public.emenda_ne_competencias'::regclass),false),
  'views_security_invoker',(
    SELECT count(*)=2 FROM pg_class c WHERE c.oid IN
      ('public.emenda_ne_painel'::regclass,'public.emenda_ne_competencias_painel'::regclass)
      AND 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
  ),
  'triggers_financeiros',(
    SELECT count(DISTINCT t.tgname) FROM pg_trigger t WHERE NOT t.tgisinternal
     AND t.tgname IN (
      'guard_emenda_ne_competencias',
      'guard_emenda_c_subempenho_distribuicao',
      'guard_emenda_c_anulacao_distribuicao',
      'guard_emenda_c_liberacao_legada',
      'guard_emenda_c_ne_distribuida'
     )
  )
 ),
 'registro',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'solicitacoes_ne',(SELECT count(*) FROM public.emenda_solicitacoes),
  'nes_emitidas',(SELECT count(*) FROM public.emenda_solicitacoes WHERE numero_ne IS NOT NULL),
  'competencias',(SELECT count(*) FROM public.emenda_competencias),
  'distribuicoes_ativas',(SELECT count(*) FROM public.emenda_ne_competencias WHERE status='ativa'),
  'distribuicoes_canceladas',(SELECT count(*) FROM public.emenda_ne_competencias WHERE status='cancelada'),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'liberacoes_legadas',(SELECT count(*) FROM public.emenda_liberacoes),
  'pagamentos',(SELECT count(*) FROM public.emenda_blocos_pagamento)
 ),
 'integridade',jsonb_build_object(
  'ne_com_distribuicao_superior_liquida',(
   SELECT count(*) FROM public.emenda_ne_painel
   WHERE saldo_a_distribuir<0),
  'competencia_com_saldo_negativo',(
   SELECT count(*) FROM public.emenda_ne_competencias_painel
   WHERE status='ativa' AND saldo_competencia<0),
  'nes_com_conflito_legado_novo',(
   SELECT count(*) FROM public.emenda_ne_painel
   WHERE modelo_financeiro='conflito_entre_modelos'),
  'distribuicao_fora_do_lancamento',(
   SELECT count(*) FROM public.emenda_ne_competencias a
   LEFT JOIN public.emenda_lancamentos l ON l.id=a.lancamento_id
   LEFT JOIN public.emenda_solicitacoes s ON s.id=a.solicitacao_id
   LEFT JOIN public.emenda_lancamento_meses m ON
    m.lancamento_id=a.lancamento_id AND m.competencia_id=a.competencia_id
   WHERE l.id IS NULL OR s.id IS NULL OR m.id IS NULL
    OR a.emenda_id<>l.emenda_id OR a.emenda_id<>s.emenda_id
    OR l.solicitacao_id IS DISTINCT FROM s.id)
 ),
 'cenarios',jsonb_build_object(
  'nes_sem_distribuicao_manual',(
   SELECT count(*) FROM public.emenda_ne_painel
    WHERE status_ne='emitida' AND competencias_distribuidas=0),
  'competencias_atendidas_por_multiplas_nes',(
   SELECT count(*) FROM (
    SELECT emenda_id,competencia_id FROM public.emenda_ne_competencias
    WHERE status='ativa' GROUP BY emenda_id,competencia_id
    HAVING count(DISTINCT solicitacao_id)>1
   ) t),
  'lancamentos_com_virada_de_exercicio',(
   SELECT count(*) FROM (
    SELECT l.id FROM public.emenda_lancamentos l
    JOIN public.emenda_lancamento_meses m ON m.lancamento_id=l.id
    JOIN public.emenda_competencias c ON c.id=m.competencia_id
    GROUP BY l.id HAVING min(extract(year FROM c.competencia))
                    <>max(extract(year FROM c.competencia))
   ) t)
 )
) AS auditoria_fase_c;

COMMIT;
