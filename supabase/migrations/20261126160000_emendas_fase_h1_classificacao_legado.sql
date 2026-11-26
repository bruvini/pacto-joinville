-- PACTO Joinville · Emendas · H1 — Classificação NÃO destrutiva do legado.
-- Não cria subempenhos, avisos, comprovantes ou pagamentos fictícios.
-- Aplicar somente após backup verificável e homologação; exige Fases A–G.
BEGIN;

CREATE VIEW public.emenda_h_legado_conferencia
WITH (security_invoker = true) AS
WITH fontes AS (
 SELECT l.emenda_id,l.lancamento_id,l.competencia_id,
  l.id AS origem_id,'emenda_liberacoes'::text AS origem,l.tipo AS contexto,
  l.valor AS valor_referencia,l.numero_sei,l.link_sei,
  true AS tem_ato_financeiro,true AS tem_relacao_original
 FROM public.emenda_liberacoes l

 UNION ALL
 SELECT p.emenda_id,p.lancamento_id,p.competencia_id,
  p.id,'emenda_blocos_pagamento',p.identificacao,
  p.valor,p.numero_sei,p.link_sei,
  true,(l.id IS NOT NULL)
 FROM public.emenda_blocos_pagamento p
 LEFT JOIN public.emenda_liberacoes l ON l.id=p.liberacao_id
  AND l.emenda_id=p.emenda_id
  AND l.lancamento_id=p.lancamento_id
  AND l.competencia_id=p.competencia_id

 UNION ALL
 SELECT c.emenda_id,c.lancamento_id,c.competencia_id,
  c.id,'emenda_comprovantes',c.tipo,
  NULL::numeric,c.numero_sei,c.link_sei,
  false,true
 FROM public.emenda_comprovantes c

 UNION ALL
 SELECT d.emenda_id,d.lancamento_id,d.competencia_id,
  d.id,'emenda_fluxo_documentos',d.contexto,
  NULL::numeric,
  coalesce(nullif(btrim(d.dados->>'comprovante_numero'),''),
    nullif(btrim(d.dados->>'pagamento_numero'),''),
    nullif(btrim(d.dados->>'aviso_numero'),'')),
  coalesce(nullif(btrim(d.dados->>'comprovante_link'),''),
    nullif(btrim(d.dados->>'pagamento_link'),''),
    nullif(btrim(d.dados->>'aviso_link'),'')),
  false,
  (d.liberacao_id IS NOT NULL OR d.pagamento_id IS NOT NULL
    OR d.anulacao_id IS NOT NULL)
 FROM public.emenda_fluxo_documentos d
 WHERE d.contexto LIKE 'lib:%'
    OR d.contexto LIKE 'pag:%'
    OR d.contexto='anulacao'
)
SELECT f.emenda_id,f.lancamento_id,f.competencia_id,
 f.origem_id,f.origem,f.contexto,f.valor_referencia,f.numero_sei,f.link_sei,
 f.tem_ato_financeiro,f.tem_relacao_original,
 CASE
  WHEN NOT f.tem_relacao_original THEN 'pendente_conferencia'
  WHEN f.tem_ato_financeiro AND
   (f.valor_referencia IS NULL OR f.valor_referencia<=0
    OR f.valor_referencia<>round(f.valor_referencia,2)) THEN 'pendente_conferencia'
  WHEN nullif(btrim(coalesce(f.numero_sei,'')),'') IS NULL
    OR coalesce(f.link_sei,'') !~* '^https://[^[:space:]]+$'
   THEN 'pendente_conferencia'
  ELSE 'evidencia_documental_presente'
 END AS situacao_evidencia,
 CASE
  WHEN NOT f.tem_relacao_original
   THEN 'Documento ou pagamento sem vínculo comprovado ao ato financeiro original; conferência necessária.'
  WHEN f.tem_ato_financeiro AND
   (f.valor_referencia IS NULL OR f.valor_referencia<=0
    OR f.valor_referencia<>round(f.valor_referencia,2))
   THEN 'Valor financeiro ausente ou inconsistente na origem.'
  WHEN nullif(btrim(coalesce(f.numero_sei,'')),'') IS NULL
   OR coalesce(f.link_sei,'') !~* '^https://[^[:space:]]+$'
   THEN 'Referência SEI ou link HTTPS insuficiente para homologar a evidência.'
  WHEN f.origem='emenda_comprovantes'
   THEN 'Documento SEI presente; o registro não comprova, isoladamente, pagamento financeiro.'
  WHEN f.origem='emenda_fluxo_documentos'
   THEN 'Documento do fluxo original vinculado; não é automaticamente Aviso de Subempenho.'
  ELSE 'Ato do livro legado com evidência vinculada; manter no livro original, sem duplicar execução.'
 END AS orientacao,
 false AS elegivel_conversao_automatica
FROM fontes f;

-- A view usa RLS das tabelas de origem, inclusive para ACO (somente leitura).
REVOKE ALL ON public.emenda_h_legado_conferencia FROM PUBLIC,anon;
GRANT SELECT ON public.emenda_h_legado_conferencia TO authenticated;

COMMENT ON VIEW public.emenda_h_legado_conferencia IS
 'Fase H: classificação de fatos do livro legado; não substitui origem, não valida autenticação de SEI e não autoriza migração financeira automática.';

COMMIT;
