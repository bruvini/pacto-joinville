-- PACTO · Emendas · D3: status por documento e cadeias independentes.
-- Visões com permissões do usuário invocador e sem multiplicação de assinaturas.
BEGIN;
CREATE VIEW public.emenda_subempenho_documentos_painel
WITH (security_invoker=true) AS
SELECT
 d.id,d.emenda_id,d.subempenho_id,d.tipo,d.numero_sei,d.link_sei,d.data_documento,
 d.valor_documentado,d.registrado_em,d.politica_id,
 m.versao AS matriz_versao,m.grupos_obrigatorios,m.exige_encaminhamento,
 m.destino_encaminhamento,m.referencia_sei,
 coalesce(a.total_assinaturas,0)::integer AS assinaturas_conferidas,
 coalesce(f.grupos_pendentes,ARRAY[]::text[]) AS grupos_pendentes,
 e.id AS encaminhamento_id,e.data_encaminhamento,e.numero_sei AS encaminhamento_numero_sei,
 e.link_sei AS encaminhamento_link_sei,e.confirmado_em,
 c.id AS conclusao_id,c.concluido_em,c.status_resultante,
 CASE
  WHEN c.id IS NOT NULL THEN 'concluido'
  WHEN coalesce(cardinality(f.grupos_pendentes),0)>0 THEN 'aguardando_assinaturas'
  WHEN m.exige_encaminhamento AND e.id IS NULL THEN 'aguardando_encaminhamento'
  ELSE 'pronto_concluir'
 END AS status_documental
FROM public.emenda_subempenho_documentos d
LEFT JOIN public.emenda_subempenho_matrizes m ON m.id=d.politica_id
LEFT JOIN LATERAL (
 SELECT count(*) AS total_assinaturas
 FROM public.emenda_subempenho_assinaturas x WHERE x.documento_id=d.id
) a ON true
LEFT JOIN LATERAL (
 SELECT array_agg(g.grupo ORDER BY g.pos) AS grupos_pendentes
 FROM unnest(coalesce(m.grupos_obrigatorios,ARRAY[]::text[]))
 WITH ORDINALITY AS g(grupo,pos)
 WHERE NOT EXISTS (
  SELECT 1 FROM public.emenda_subempenho_assinaturas x
  WHERE x.documento_id=d.id AND x.grupo=g.grupo
 )
) f ON true
LEFT JOIN public.emenda_subempenho_encaminhamentos e ON e.documento_id=d.id
LEFT JOIN public.emenda_subempenho_conclusoes c ON c.documento_id=d.id;

REVOKE ALL ON public.emenda_subempenho_documentos_painel FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_subempenho_documentos_painel TO authenticated;
COMMIT;
