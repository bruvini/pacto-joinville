-- PACTO / Emendas · Fase B3 — leitura consolidada da NE.
-- Evitar join que multiplica valores ao misturar parcelas, anulações e documentos.
BEGIN;
CREATE VIEW public.emenda_subempenho_resumo
WITH (security_invoker=true)
AS
SELECT
 l.emenda_id, l.id AS lancamento_id, l.status AS status_lancamento,
 s.id AS solicitacao_id, s.numero_ne, s.exercicio_ne, s.valor_solicitado AS valor_solicitado_ne,
 s.valor_ne AS valor_ne_emitida,
 coalesce(an.total_anulado,0)::numeric(16,2) AS total_anulado,
 coalesce(leg.total_liberado,0)::numeric(16,2) AS total_liberado_legado,
 coalesce(sub.total_solicitado_pendente,0)::numeric(16,2) AS total_solicitado_pendente,
 coalesce(sub.total_subempenhado,0)::numeric(16,2) AS total_subempenhado_confirmado,
 coalesce(sub.total_reservado,0)::numeric(16,2) AS total_comprometido_novo,
 coalesce(pag.total_pago_vinculado,0)::numeric(16,2) AS total_pago_vinculado,
 coalesce(sub.quantidade_ativos,0) AS quantidade_subempenhos,
 CASE WHEN coalesce(leg.total_liberado,0)>0 AND coalesce(sub.quantidade_ativos,0)>0
      THEN 'conflito_entre_modelos'
      WHEN coalesce(leg.total_liberado,0)>0 THEN 'modelo_legado'
      WHEN coalesce(sub.quantidade_ativos,0)>0 THEN 'novo_subempenho'
      ELSE 'sem_movimentacao' END AS modelo_financeiro,
 CASE WHEN coalesce(leg.total_liberado,0)>0 AND coalesce(sub.quantidade_ativos,0)>0 THEN NULL
      WHEN s.valor_ne IS NULL THEN NULL
      ELSE (s.valor_ne-coalesce(an.total_anulado,0)-
         CASE WHEN coalesce(leg.total_liberado,0)>0
              THEN leg.total_liberado ELSE coalesce(sub.total_reservado,0) END
      )::numeric(16,2)
 END AS saldo_ne_a_comprometer
FROM public.emenda_lancamentos l
JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
LEFT JOIN LATERAL (
 SELECT sum(a.valor) AS total_anulado FROM public.emenda_anulacoes a
 WHERE a.lancamento_id=l.id
) an ON true
LEFT JOIN LATERAL (
 SELECT sum(x.valor) AS total_liberado FROM public.emenda_liberacoes x
 WHERE x.lancamento_id=l.id
) leg ON true
LEFT JOIN LATERAL (
 SELECT count(*) AS quantidade_ativos,
 sum(CASE WHEN x.status IN ('rascunho','solicitado','em_liquidacao')
          THEN x.valor_solicitado ELSE 0 END) AS total_solicitado_pendente,
 sum(CASE WHEN x.status='subempenhado'
          THEN x.valor_subempenhado ELSE 0 END) AS total_subempenhado,
 sum(CASE WHEN x.status='subempenhado'
          THEN x.valor_subempenhado ELSE x.valor_solicitado END) AS total_reservado
 FROM public.emenda_subempenhos x
 WHERE x.lancamento_id=l.id AND x.status<>'cancelado'
) sub ON true
LEFT JOIN LATERAL (
 SELECT sum(p.valor) AS total_pago_vinculado FROM public.emenda_blocos_pagamento p
 WHERE p.lancamento_id=l.id AND p.subempenho_id IS NOT NULL
) pag ON true;

REVOKE ALL ON public.emenda_subempenho_resumo FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_subempenho_resumo TO authenticated;
COMMIT;
