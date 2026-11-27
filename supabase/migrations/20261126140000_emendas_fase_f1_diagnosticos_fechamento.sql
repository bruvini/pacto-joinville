-- PACTO · Emendas · Fase F1 — Reconciliação financeira baseada em fatos.
-- Leitura por invocador; nenhuma movimentação ou migração de registros.
BEGIN;

CREATE VIEW public.emenda_f_competencias_painel
WITH (security_invoker=true) AS
SELECT m.emenda_id,m.lancamento_id,m.competencia_id,
 c.competencia,m.parcela_convenio,
 (sem.id IS NOT NULL) AS declarada_sem_execucao,
 sem.numero_sei AS encerramento_numero_sei,
 sem.link_sei AS encerramento_link_sei,
 coalesce(alc.alocado,0)::numeric(16,2) AS valor_distribuido,
 coalesce(sub.ativos,0)::bigint AS subempenhos_ativos,
 coalesce(sub.pendentes,0)::bigint AS subempenhos_pendentes,
 coalesce(sub.confirmados,0)::bigint AS subempenhos_confirmados,
 coalesce(sub.nao_conciliados,0)::bigint AS subempenhos_nao_conciliados,
 coalesce(sub.valor_comprometido,0)::numeric(16,2) AS compromissos_novos,
 coalesce(sub.pago_liquido,0)::numeric(16,2) AS pago_liquido_novo,
 coalesce(sub.documentos_pendentes,0)::bigint AS documentos_novos_pendentes,
 coalesce(lib.valor_liberado,0)::numeric(16,2) AS liberado_legado,
 coalesce(pag.valor_pago,0)::numeric(16,2) AS pago_legado,
 coalesce(doc.total,0)::bigint AS documentos_legados,
 coalesce(doc.pendentes,0)::bigint AS documentos_legados_pendentes,
 CASE
  WHEN sem.id IS NOT NULL THEN
   CASE WHEN coalesce(alc.alocado,0)=0 AND coalesce(sub.ativos,0)=0
      AND coalesce(lib.valor_liberado,0)=0
      AND coalesce(pag.valor_pago,0)=0 AND coalesce(doc.total,0)=0
    THEN 'sem_execucao' ELSE 'inconsistente' END
  WHEN coalesce(lib.valor_liberado,0)>0 OR coalesce(pag.valor_pago,0)>0
    OR coalesce(doc.total,0)>0 THEN
   CASE WHEN coalesce(lib.valor_liberado,0)>0
     AND lib.valor_liberado=coalesce(pag.valor_pago,0)
     AND coalesce(sub.ativos,0)=0 AND coalesce(doc.pendentes,0)=0
    THEN 'executada_legado' ELSE 'pendente' END
  WHEN coalesce(sub.ativos,0)>0 THEN
   CASE WHEN sub.confirmados=sub.ativos AND coalesce(sub.pendentes,0)=0
     AND coalesce(sub.nao_conciliados,0)=0 AND coalesce(sub.documentos_pendentes,0)=0
     AND sub.valor_comprometido=coalesce(sub.pago_liquido,0)
    THEN 'executada_novo' ELSE 'pendente' END
  ELSE 'pendente' END AS situacao_competencia
FROM public.emenda_lancamento_meses m
JOIN public.emenda_competencias c ON c.id=m.competencia_id
LEFT JOIN public.emenda_encerramentos_sem_execucao sem
 ON sem.lancamento_id=m.lancamento_id AND sem.competencia_id=m.competencia_id
LEFT JOIN LATERAL(
 SELECT sum(a.valor_alocado) AS alocado
 FROM public.emenda_ne_competencias a
 WHERE a.lancamento_id=m.lancamento_id AND a.competencia_id=m.competencia_id
  AND a.status='ativa'
) alc ON true
LEFT JOIN LATERAL(
 SELECT count(*) FILTER(WHERE s.status<>'cancelado') AS ativos,
  count(*) FILTER(WHERE s.status IN ('rascunho','solicitado','em_liquidacao')) AS pendentes,
  count(*) FILTER(WHERE s.status='subempenhado') AS confirmados,
  count(*) FILTER(WHERE s.status='subempenhado' AND NOT coalesce(p.conciliado,false))
   AS nao_conciliados,
  sum(CASE WHEN s.status='cancelado' THEN 0
    WHEN s.status='subempenhado' THEN s.valor_subempenhado
    ELSE s.valor_solicitado END) AS valor_comprometido,
  sum(CASE WHEN s.status='subempenhado' THEN coalesce(p.valor_pago_liquido,0)
   ELSE 0 END) AS pago_liquido,
  (
    SELECT count(*) FROM public.emenda_subempenho_documentos_painel d
    JOIN public.emenda_subempenhos s2 ON s2.id=d.subempenho_id
    WHERE s2.lancamento_id=m.lancamento_id
      AND s2.competencia_id=m.competencia_id
      AND s2.status<>'cancelado' AND d.status_documental<>'concluido'
  ) AS documentos_pendentes
 FROM public.emenda_subempenhos s
 LEFT JOIN public.emenda_pagamento_subempenhos_painel p ON p.subempenho_id=s.id
 WHERE s.lancamento_id=m.lancamento_id AND s.competencia_id=m.competencia_id
) sub ON true
LEFT JOIN LATERAL(
 SELECT sum(l.valor) AS valor_liberado FROM public.emenda_liberacoes l
 WHERE l.lancamento_id=m.lancamento_id AND l.competencia_id=m.competencia_id
) lib ON true
LEFT JOIN LATERAL(
 SELECT sum(p.valor) AS valor_pago FROM public.emenda_blocos_pagamento p
 WHERE p.lancamento_id=m.lancamento_id AND p.competencia_id=m.competencia_id
) pag ON true
LEFT JOIN LATERAL(
 SELECT count(*) AS total,
  count(*) FILTER(WHERE d.pagamento_id IS NULL OR d.enviado_em IS NULL) AS pendentes
 FROM public.emenda_fluxo_documentos d
 WHERE d.lancamento_id=m.lancamento_id
  AND d.contexto='lib:'||m.competencia_id::text
) doc ON true;

CREATE VIEW public.emenda_f_ne_painel
WITH (security_invoker=true) AS
SELECT l.emenda_id,l.id AS lancamento_id,s.id AS solicitacao_id,
 s.numero_ne,s.exercicio_ne,s.status AS status_ne,
 s.valor_ne AS valor_ne_emitida,
 coalesce(a.total_anulado,0)::numeric(16,2) AS total_anulado,
 (s.valor_ne-coalesce(a.total_anulado,0))::numeric(16,2) AS ne_liquida,
 coalesce(b.total_liberado_legado,0)::numeric(16,2) AS liberacoes_legadas,
 coalesce(b.total_comprometido_novo,0)::numeric(16,2) AS compromissos_novos,
 coalesce(b.total_subempenhado_confirmado,0)::numeric(16,2) AS subempenhos_confirmados_valor,
 coalesce(alc.total,0)::numeric(16,2) AS distribuido_competencias,
 coalesce(comp.valor_pago_novo,0)::numeric(16,2) AS pago_liquido_novo,
 coalesce(comp.valor_pago_legado,0)::numeric(16,2) AS pago_legado,
 coalesce(comp.total_competencias,0)::bigint AS total_competencias,
 coalesce(comp.competencias_sem_execucao,0)::bigint AS competencias_sem_execucao,
 coalesce(comp.competencias_executadas,0)::bigint AS competencias_executadas,
 coalesce(comp.competencias_pendentes,0)::bigint AS competencias_pendentes,
 coalesce(comp.documentos_pendentes,0)::bigint AS documentos_pendentes,
 coalesce(comp.subempenhos_pendentes,0)::bigint AS subempenhos_pendentes,
 coalesce(comp.subempenhos_nao_conciliados,0)::bigint AS subempenhos_nao_conciliados,
 b.modelo_financeiro,
 coalesce(conc.id IS NOT NULL,false) AS conciliada,
 conc.numero_sei AS conciliacao_numero_sei,
 conc.link_sei AS conciliacao_link_sei,
 -- Protege a maior das garantias: alocações, liberações ou subempenhos;
 -- distribuição é teto interno, não um segundo compromisso.
 (s.valor_ne-coalesce(a.total_anulado,0)
   -greatest(coalesce(alc.total,0),coalesce(b.total_liberado_legado,0),
              coalesce(b.total_comprometido_novo,0)))::numeric(16,2) AS saldo_disponivel_anular,
 (s.valor_ne-coalesce(a.total_anulado,0)
   - CASE WHEN coalesce(b.total_liberado_legado,0)>0
     THEN b.total_liberado_legado ELSE coalesce(b.total_comprometido_novo,0) END)
   ::numeric(16,2) AS saldo_a_anular_fechamento,
 (CASE WHEN coalesce(b.total_liberado_legado,0)>0
   THEN b.total_liberado_legado ELSE coalesce(b.total_comprometido_novo,0) END
   -CASE WHEN coalesce(b.total_liberado_legado,0)>0
      THEN coalesce(comp.valor_pago_legado,0) ELSE coalesce(comp.valor_pago_novo,0) END)
   ::numeric(16,2) AS saldo_de_pagamentos_pendentes,
 (coalesce(comp.total_competencias,0)>0
  AND coalesce(comp.competencias_pendentes,0)=0
  AND coalesce(comp.documentos_pendentes,0)=0
  AND coalesce(comp.subempenhos_pendentes,0)=0
  AND coalesce(comp.subempenhos_nao_conciliados,0)=0
  AND coalesce(b.modelo_financeiro,'sem_movimentacao')<>'conflito_entre_modelos'
  AND NOT coalesce(doc.ne_pendente,false)
  AND NOT coalesce(doc.anulacao_pendente,false)
  AND (s.valor_ne-coalesce(a.total_anulado,0)
   -CASE WHEN coalesce(b.total_liberado_legado,0)>0
      THEN b.total_liberado_legado ELSE coalesce(b.total_comprometido_novo,0) END)=0
  AND (CASE WHEN coalesce(b.total_liberado_legado,0)>0
       THEN b.total_liberado_legado ELSE coalesce(b.total_comprometido_novo,0) END
     -CASE WHEN coalesce(b.total_liberado_legado,0)>0
       THEN coalesce(comp.valor_pago_legado,0) ELSE coalesce(comp.valor_pago_novo,0) END)=0
  AND coalesce(alc.total,0)<=
   CASE WHEN coalesce(b.total_liberado_legado,0)>0
    THEN b.total_liberado_legado ELSE coalesce(b.total_comprometido_novo,0) END
 ) AS pronta_conciliar,
 coalesce(doc.ne_pendente,false) AS ne_documental_pendente,
 coalesce(doc.anulacao_pendente,false) AS anulacao_documental_pendente
FROM public.emenda_lancamentos l
JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
LEFT JOIN public.emenda_subempenho_resumo b ON b.solicitacao_id=s.id
LEFT JOIN public.emenda_conciliacoes_ne conc ON conc.lancamento_id=l.id
LEFT JOIN LATERAL(
 SELECT sum(x.valor) AS total_anulado FROM public.emenda_anulacoes x
 WHERE x.lancamento_id=l.id
) a ON true
LEFT JOIN LATERAL(
 SELECT sum(x.valor_alocado) AS total FROM public.emenda_ne_competencias x
 WHERE x.lancamento_id=l.id AND x.status='ativa'
) alc ON true
LEFT JOIN LATERAL(
 SELECT count(*) AS total_competencias,
  count(*) FILTER(WHERE x.situacao_competencia='sem_execucao') AS competencias_sem_execucao,
  count(*) FILTER(WHERE x.situacao_competencia IN ('executada_novo','executada_legado'))
   AS competencias_executadas,
  count(*) FILTER(WHERE x.situacao_competencia IN ('pendente','inconsistente'))
   AS competencias_pendentes,
  sum(x.documentos_novos_pendentes+x.documentos_legados_pendentes) AS documentos_pendentes,
  sum(x.subempenhos_pendentes) AS subempenhos_pendentes,
  sum(x.subempenhos_nao_conciliados) AS subempenhos_nao_conciliados,
  sum(x.pago_liquido_novo) AS valor_pago_novo,
  sum(x.pago_legado) AS valor_pago_legado
 FROM public.emenda_f_competencias_painel x WHERE x.lancamento_id=l.id
) comp ON true
LEFT JOIN LATERAL(
 SELECT bool_or(d.contexto='ne' AND d.reaberto_em IS NOT NULL) AS ne_pendente,
  bool_or(d.contexto='anulacao' AND d.enviado_em IS NOT NULL AND d.anulacao_id IS NULL)
   AS anulacao_pendente
 FROM public.emenda_fluxo_documentos d WHERE d.lancamento_id=l.id
) doc ON true;

CREATE VIEW public.emenda_f_emenda_painel
WITH (security_invoker=true) AS
SELECT e.id AS emenda_id,e.numero AS numero_emenda,
 coalesce(n.total_nes,0)::bigint AS nes_total,
 coalesce(n.nes_conciliadas,0)::bigint AS nes_conciliadas,
 coalesce(n.nes_pendentes,0)::bigint AS nes_pendentes,
 coalesce(lanc.sem_ne,0)::bigint AS lancamentos_sem_ne,
 coalesce(n.total_ne_emitida,0)::numeric(16,2) AS valor_total_ne,
 coalesce(n.total_anulado,0)::numeric(16,2) AS valor_total_anulado,
 coalesce(n.total_compromissos,0)::numeric(16,2) AS compromissos_financeiros,
 coalesce(n.total_pago_liquido,0)::numeric(16,2) AS pago_liquido,
 coalesce(n.total_saldo_a_anular,0)::numeric(16,2) AS saldo_por_anular,
 coalesce(n.total_saldo_pagamentos,0)::numeric(16,2) AS saldo_pagamentos_pendente,
 coalesce(n.competencias_pendentes,0)::bigint AS competencias_pendentes,
 coalesce(n.subempenhos_nao_conciliados,0)::bigint AS subempenhos_nao_conciliados,
 (coalesce(n.total_nes,0)>0 AND coalesce(n.nes_pendentes,0)=0
  AND coalesce(lanc.sem_ne,0)=0) AS totalmente_conciliada
FROM public.emendas e
LEFT JOIN LATERAL(
 SELECT count(*) AS sem_ne FROM public.emenda_lancamentos l
 WHERE l.emenda_id=e.id AND l.solicitacao_id IS NULL
  AND l.excluido_em IS NULL AND l.status<>'cancelado'
) lanc ON true
LEFT JOIN LATERAL(
 SELECT count(*) AS total_nes,
  count(*) FILTER(WHERE f.conciliada) AS nes_conciliadas,
  count(*) FILTER(WHERE NOT f.conciliada) AS nes_pendentes,
  sum(f.valor_ne_emitida) AS total_ne_emitida,
  sum(f.total_anulado) AS total_anulado,
  sum(CASE WHEN f.liberacoes_legadas>0 THEN f.liberacoes_legadas
    ELSE f.compromissos_novos END) AS total_compromissos,
  sum(CASE WHEN f.liberacoes_legadas>0 THEN f.pago_legado
    ELSE f.pago_liquido_novo END) AS total_pago_liquido,
  sum(f.saldo_a_anular_fechamento) AS total_saldo_a_anular,
  sum(f.saldo_de_pagamentos_pendentes) AS total_saldo_pagamentos,
  sum(f.competencias_pendentes) AS competencias_pendentes,
  sum(f.subempenhos_nao_conciliados) AS subempenhos_nao_conciliados
 FROM public.emenda_f_ne_painel f WHERE f.emenda_id=e.id
) n ON true;

REVOKE ALL ON public.emenda_f_competencias_painel,
 public.emenda_f_ne_painel,public.emenda_f_emenda_painel
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_f_competencias_painel,
 public.emenda_f_ne_painel,public.emenda_f_emenda_painel
 TO authenticated;
COMMIT;
