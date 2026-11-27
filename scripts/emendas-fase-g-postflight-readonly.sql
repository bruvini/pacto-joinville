-- PACTO · Emendas · Fase G · conferência gerencial somente leitura.
-- Não é migration e não modifica nenhuma tabela. Recomenda-se após F1–F3.
-- Valores refletem a visão do usuário SQL; testar RLS com perfis da aplicação.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'coletado_em',to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
 'fontes',jsonb_build_object(
  'resumo_emendas',to_regclass('public.emendas_resumo') IS NOT NULL,
  'ne_financeira',to_regclass('public.emenda_f_ne_painel') IS NOT NULL,
  'competencias',to_regclass('public.emenda_f_competencias_painel') IS NOT NULL,
  'subempenhos',to_regclass('public.emenda_subempenhos') IS NOT NULL,
  'avisos_documentais',to_regclass('public.emenda_subempenho_documentos_painel') IS NOT NULL,
  'pagamentos',to_regclass('public.emenda_pagamento_subempenhos_painel') IS NOT NULL,
  'parcelas',to_regclass('public.emenda_pagamento_parcelas_painel') IS NOT NULL,
  'seguranca_visoes',(
   SELECT count(*)=4 FROM pg_class c
   WHERE c.oid IN('public.emenda_f_ne_painel'::regclass,
    'public.emenda_f_competencias_painel'::regclass,
    'public.emenda_pagamento_subempenhos_painel'::regclass,
    'public.emenda_pagamento_parcelas_painel'::regclass)
    AND 'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[]))
  )
 ),
 'volume',jsonb_build_object(
  'emendas',(SELECT count(*) FROM public.emendas),
  'nes',(SELECT count(*) FROM public.emenda_f_ne_painel),
  'competencias',(SELECT count(*) FROM public.emenda_f_competencias_painel),
  'subempenhos',(SELECT count(*) FROM public.emenda_subempenhos),
  'parcelas',(SELECT count(*) FROM public.emenda_pagamento_parcelas_painel),
  'evidencias_aviso',(SELECT count(*) FROM public.emenda_subempenho_documentos_painel
    WHERE tipo='aviso_subempenho')
 ),
 'ocorrencias',jsonb_build_object(
  'nes_sem_utilizacao',(
   SELECT count(*) FROM public.emenda_f_ne_painel f
   WHERE f.valor_ne_emitida>0 AND NOT f.conciliada
    AND coalesce(f.compromissos_novos,0)=0 AND coalesce(f.liberacoes_legadas,0)=0
    AND coalesce(f.pago_liquido_novo,0)=0 AND coalesce(f.pago_legado,0)=0
  ),
  'solicitacoes_sem_aviso_concluido',(
   SELECT count(*) FROM public.emenda_subempenhos s
   WHERE s.status<>'cancelado' AND NOT EXISTS(
    SELECT 1 FROM public.emenda_subempenho_documentos_painel d
    WHERE d.subempenho_id=s.id AND d.tipo='aviso_subempenho'
     AND d.conclusao_id IS NOT NULL)
  ),
  'subempenhos_aguardando_pagamento',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel p
   WHERE p.status_subempenho='subempenhado'
    AND p.saldo_a_pagar>0 AND coalesce(p.valor_pago_liquido,0)=0
  ),
  'subempenhos_com_pagamento_parcial',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel p
   WHERE p.status_subempenho='subempenhado'
    AND p.saldo_a_pagar>0 AND coalesce(p.valor_pago_liquido,0)>0
  ),
  'subempenhos_pago_sem_conciliacao',(
   SELECT count(*) FROM public.emenda_pagamento_subempenhos_painel p
   WHERE p.status_subempenho='subempenhado' AND p.saldo_a_pagar=0
    AND NOT coalesce(p.conciliado,false)
  ),
  'nes_com_saldo_anulavel',(
   SELECT count(*) FROM public.emenda_f_ne_painel f
   WHERE NOT f.conciliada AND f.saldo_disponivel_anular>0
  ),
  'valor_total_livre_para_anulacao',(
   SELECT coalesce(sum(f.saldo_disponivel_anular),0) FROM public.emenda_f_ne_painel f
   WHERE NOT f.conciliada AND f.saldo_disponivel_anular>0
  ),
  'nes_com_distribuicao_a_rever',(
   SELECT count(*) FROM public.emenda_f_ne_painel f
   WHERE NOT f.conciliada AND f.saldo_a_anular_fechamento>f.saldo_disponivel_anular
  ),
  'competencias_pendentes_sem_movimentacao',(
   SELECT count(*) FROM public.emenda_f_competencias_painel c
   WHERE c.situacao_competencia='pendente' AND coalesce(c.valor_distribuido,0)=0
    AND coalesce(c.subempenhos_ativos,0)=0 AND coalesce(c.liberado_legado,0)=0
    AND coalesce(c.pago_legado,0)=0 AND coalesce(c.documentos_legados,0)=0
  ),
  'modelos_financeiros_conflitantes',(
   SELECT count(*) FROM public.emenda_f_ne_painel f
   WHERE f.modelo_financeiro='conflito_entre_modelos'
  )
 )
) AS auditoria_fase_g;
COMMIT;
