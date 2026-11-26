-- PACTO Joinville · Emendas · E3: dois painéis de leitura, sem confundir
-- programação vigente com comprovante efetivo ou quitação homologada.
BEGIN;

CREATE VIEW public.emenda_pagamento_parcelas_painel
WITH (security_invoker=true) AS
SELECT
 p.id,p.emenda_id,p.subempenho_id,p.sequencia,p.registrado_em,
 sub.lancamento_id,sub.competencia_id,sub.solicitacao_id,
 sub.valor_subempenhado,
 prog.id AS programacao_id,prog.sequencia AS versao_programacao,
 prog.tipo AS tipo_programacao,
 coalesce(prog.valor_programado,0)::numeric(16,2) AS valor_programado,
 prog.data_prevista,
 prog.numero_sei AS programacao_numero_sei_original,
 prog.link_sei AS programacao_link_sei_original,
 coalesce(ret_prog.novo_numero_sei,prog.numero_sei) AS programacao_numero_sei,
 coalesce(ret_prog.novo_link_sei,prog.link_sei) AS programacao_link_sei,
 coalesce(ret_prog.nova_data_documento,prog.data_documento) AS programacao_data_documento,
 prog.registrado_em AS programacao_registrada_em,
 comp.id AS comprovante_id,
 coalesce(comp.valor_pago,0)::numeric(16,2) AS valor_pago_bruto,
 comp.data_pagamento,
 comp.numero_sei AS comprovante_numero_sei_original,
 comp.link_sei AS comprovante_link_sei_original,
 coalesce(ret_comp.novo_numero_sei,comp.numero_sei) AS comprovante_numero_sei,
 coalesce(ret_comp.novo_link_sei,comp.link_sei) AS comprovante_link_sei,
 coalesce(ret_comp.nova_data_documento,comp.data_documento) AS comprovante_data_documento,
 comp.registrado_em AS comprovante_registrado_em,
 coalesce(aj.devolvido,0)::numeric(16,2) AS valor_devolvido,
 coalesce(aj.estornado,0)::numeric(16,2) AS valor_estornado,
 (coalesce(comp.valor_pago,0)-coalesce(aj.devolvido,0)-coalesce(aj.estornado,0))
  ::numeric(16,2) AS valor_pago_liquido,
 (coalesce(prog.valor_programado,0)-coalesce(comp.valor_pago,0)+
  coalesce(aj.devolvido,0)+coalesce(aj.estornado,0))
  ::numeric(16,2) AS saldo_programacao_pendente,
 coalesce(ret.contagem,0)::bigint AS retificacoes_documentais,
 CASE
  WHEN prog.id IS NULL THEN 'sem_programacao'
  WHEN prog.valor_programado=0 THEN 'programacao_cancelada'
  WHEN comp.id IS NULL THEN 'programada_aguardando_pagamento'
  WHEN (comp.valor_pago-coalesce(aj.devolvido,0)-coalesce(aj.estornado,0))
   <prog.valor_programado THEN 'pagamento_parcial_ou_ajustado'
  ELSE 'pagamento_conforme_programacao'
 END AS situacao_parcela
FROM public.emenda_pagamento_parcelas p
JOIN public.emenda_subempenhos sub ON sub.id=p.subempenho_id
LEFT JOIN LATERAL(
 SELECT g.* FROM public.emenda_pagamento_programacoes g
 WHERE g.parcela_id=p.id ORDER BY g.sequencia DESC LIMIT 1
) prog ON true
LEFT JOIN public.emenda_pagamento_comprovantes comp ON comp.parcela_id=p.id
LEFT JOIN LATERAL (
 SELECT sum(CASE WHEN a.tipo='devolucao' THEN a.valor ELSE 0 END) AS devolvido,
        sum(CASE WHEN a.tipo='estorno' THEN a.valor ELSE 0 END) AS estornado
 FROM public.emenda_pagamento_ajustes a WHERE a.parcela_id=p.id
) aj ON true
LEFT JOIN LATERAL(
 SELECT r.* FROM public.emenda_pagamento_retificacoes r
 WHERE r.programacao_id=prog.id ORDER BY r.registrado_em DESC,r.id DESC LIMIT 1
) ret_prog ON true
LEFT JOIN LATERAL(
 SELECT r.* FROM public.emenda_pagamento_retificacoes r
 WHERE r.comprovante_id=comp.id ORDER BY r.registrado_em DESC,r.id DESC LIMIT 1
) ret_comp ON true
LEFT JOIN LATERAL(
 SELECT count(*) AS contagem FROM public.emenda_pagamento_retificacoes r
 WHERE r.parcela_id=p.id
) ret ON true;

CREATE VIEW public.emenda_pagamento_subempenhos_painel
WITH (security_invoker=true) AS
SELECT
 s.id AS subempenho_id,s.emenda_id,s.lancamento_id,s.competencia_id,s.solicitacao_id,
 s.sequencia AS sequencia_subempenho,s.status AS status_subempenho,
 s.valor_solicitado,s.valor_subempenhado,
 coalesce(t.parcelas,0)::bigint AS quantidade_parcelas,
 coalesce(t.valor_programado,0)::numeric(16,2) AS valor_programado,
 coalesce(t.pago_bruto,0)::numeric(16,2) AS valor_pago_bruto,
 coalesce(t.devolvido,0)::numeric(16,2) AS valor_devolvido,
 coalesce(t.estornado,0)::numeric(16,2) AS valor_estornado,
 coalesce(t.pago_liquido,0)::numeric(16,2) AS valor_pago_liquido,
 CASE WHEN s.valor_subempenhado IS NULL THEN NULL
  ELSE (s.valor_subempenhado-coalesce(t.valor_programado,0))::numeric(16,2)
 END AS saldo_a_programar,
 CASE WHEN s.valor_subempenhado IS NULL THEN NULL
  ELSE (s.valor_subempenhado-coalesce(t.pago_liquido,0))::numeric(16,2)
 END AS saldo_a_pagar,
 coalesce(t.programado_pendente,0)::numeric(16,2) AS programado_nao_pago,
 ult.evento AS ultimo_evento_conciliacao,
 ult.numero_sei AS conciliacao_numero_sei,
 ult.link_sei AS conciliacao_link_sei,
 ult.registrado_em AS conciliacao_registrada_em,
 (ult.evento='conciliado') IS TRUE AS conciliado,
 CASE
  WHEN ult.evento='conciliado' THEN 'conciliado'
  WHEN s.status<>'subempenhado' THEN 'subempenho_pendente'
  WHEN coalesce(t.pago_liquido,0)=0 THEN 'sem_pagamentos'
  WHEN coalesce(t.pago_liquido,0)=s.valor_subempenhado THEN 'saldo_zerado_aguardando_conciliacao'
  ELSE 'pagamento_parcial'
 END AS situacao_pagamento
FROM public.emenda_subempenhos s
LEFT JOIN LATERAL (
 SELECT count(*) AS parcelas,sum(p.valor_programado) AS valor_programado,
  sum(p.valor_pago_bruto) AS pago_bruto,
  sum(p.valor_devolvido) AS devolvido,
  sum(p.valor_estornado) AS estornado,
  sum(p.valor_pago_liquido) AS pago_liquido,
  sum(p.saldo_programacao_pendente) AS programado_pendente
 FROM public.emenda_pagamento_parcelas_painel p WHERE p.subempenho_id=s.id
) t ON true
LEFT JOIN LATERAL (
 SELECT c.evento,c.numero_sei,c.link_sei,c.registrado_em
 FROM public.emenda_pagamento_conciliacoes c
 WHERE c.subempenho_id=s.id ORDER BY c.sequencia DESC LIMIT 1
) ult ON true;

REVOKE ALL ON public.emenda_pagamento_parcelas_painel,
 public.emenda_pagamento_subempenhos_painel FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_pagamento_parcelas_painel,
 public.emenda_pagamento_subempenhos_painel TO authenticated;

COMMIT;
