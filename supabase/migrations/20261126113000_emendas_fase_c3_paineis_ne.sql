-- PACTO · Emendas · Fase C3: leituras executivas da NE e da distribuição.
-- LATERAL por entidade financeira: evita multiplicar valores com joins 1:N.
BEGIN;

CREATE VIEW public.emenda_ne_painel
WITH (security_invoker=true) AS
SELECT
 l.emenda_id,l.id AS lancamento_id,l.periodicidade,
 s.id AS solicitacao_id,s.numero_ne,s.exercicio_ne,s.status AS status_ne,
 s.valor_solicitado,s.valor_ne AS valor_ne_emitida,
 coalesce(a.total_anulado,0)::numeric(16,2) AS total_anulado,
 CASE WHEN s.valor_ne IS NULL THEN NULL ELSE
  (s.valor_ne-coalesce(a.total_anulado,0))::numeric(16,2) END AS ne_liquida,
 coalesce(d.valor_distribuido,0)::numeric(16,2) AS valor_distribuido,
 coalesce(d.competencias,0)::bigint AS competencias_distribuidas,
 coalesce(mes.qtd,0)::bigint AS competencias_previstas,
 CASE WHEN s.valor_ne IS NULL THEN NULL ELSE
  (s.valor_ne-coalesce(a.total_anulado,0)-coalesce(d.valor_distribuido,0))::numeric(16,2)
 END AS saldo_a_distribuir,
 coalesce(b.total_solicitado_pendente,0)::numeric(16,2) AS total_solicitado_pendente,
 coalesce(b.total_subempenhado_confirmado,0)::numeric(16,2) AS total_subempenhado,
 coalesce(b.total_comprometido_novo,0)::numeric(16,2) AS compromissos_novos,
 coalesce(b.total_liberado_legado,0)::numeric(16,2) AS liberacoes_legadas,
 coalesce(b.total_pago_vinculado,0)::numeric(16,2) AS pagamentos_vinculados,
 b.modelo_financeiro,b.saldo_ne_a_comprometer
FROM public.emenda_lancamentos l
JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
LEFT JOIN LATERAL (
 SELECT sum(x.valor) AS total_anulado
 FROM public.emenda_anulacoes x WHERE x.lancamento_id=l.id
) a ON true
LEFT JOIN LATERAL (
 SELECT sum(x.valor_alocado) AS valor_distribuido,count(*) AS competencias
 FROM public.emenda_ne_competencias x
 WHERE x.solicitacao_id=s.id AND x.status='ativa'
) d ON true
LEFT JOIN LATERAL (
 SELECT count(*) AS qtd
 FROM public.emenda_lancamento_meses x WHERE x.lancamento_id=l.id
) mes ON true
LEFT JOIN public.emenda_subempenho_resumo b ON b.solicitacao_id=s.id;

CREATE VIEW public.emenda_ne_competencias_painel
WITH (security_invoker=true) AS
SELECT
 a.id,a.emenda_id,a.lancamento_id,a.solicitacao_id,a.competencia_id,
 c.competencia, m.parcela_convenio,m.ordem,
 a.status,a.valor_alocado,
 a.motivo_revisao,a.registrado_em,a.atualizado_em,
 s.numero_ne,s.exercicio_ne,
 coalesce(x.solicitado_pendente,0)::numeric(16,2) AS solicitado_pendente,
 coalesce(x.subempenhado_confirmado,0)::numeric(16,2) AS subempenhado_confirmado,
 coalesce(x.total_reservado,0)::numeric(16,2) AS comprometido_competencia,
 CASE WHEN a.status='ativa' THEN
  (a.valor_alocado-coalesce(x.total_reservado,0))::numeric(16,2)
 ELSE NULL END AS saldo_competencia
FROM public.emenda_ne_competencias a
JOIN public.emenda_solicitacoes s ON s.id=a.solicitacao_id
JOIN public.emenda_competencias c ON c.id=a.competencia_id
JOIN public.emenda_lancamento_meses m ON
 m.lancamento_id=a.lancamento_id AND m.competencia_id=a.competencia_id
LEFT JOIN LATERAL (
 SELECT
  sum(CASE WHEN e.status IN ('rascunho','solicitado','em_liquidacao')
           THEN e.valor_solicitado ELSE 0 END) AS solicitado_pendente,
  sum(CASE WHEN e.status='subempenhado' THEN e.valor_subempenhado ELSE 0 END) AS subempenhado_confirmado,
  sum(CASE WHEN e.status='subempenhado' THEN e.valor_subempenhado
           ELSE e.valor_solicitado END) AS total_reservado
 FROM public.emenda_subempenhos e
 WHERE e.solicitacao_id=a.solicitacao_id
  AND e.competencia_id=a.competencia_id AND e.status<>'cancelado'
) x ON true;

REVOKE ALL ON public.emenda_ne_painel,public.emenda_ne_competencias_painel
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_ne_painel,public.emenda_ne_competencias_painel
 TO authenticated;
COMMIT;
