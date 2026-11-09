-- SOMENTE LEITURA. Executar em produção ANTES da migration da Fase A.
-- Guardar os resultados fora do GitHub (incluem metadados financeiros).

SELECT
  (SELECT count(*) FROM public.pvh_empenhos) AS total_ne,
  (SELECT count(*) FROM public.pvh_empenhos WHERE status='ativo') AS ne_ativas,
  (SELECT count(*) FROM public.pvh_empenho_alocacoes) AS alocacoes,
  (SELECT count(*) FROM public.pvh_subempenhos) AS subempenhos,
  (SELECT count(*) FROM public.pvh_participantes) AS participantes,
  (SELECT count(*) FROM public.pvh_competencias) AS competencias;

SELECT
  COALESCE(sum(e.valor_total) FILTER (WHERE e.status='ativo'), 0) AS valor_emitido_ativo,
  (SELECT COALESCE(sum(valor_alocado),0)
     FROM public.pvh_empenho_alocacoes) AS alocacao_total
FROM public.pvh_empenhos e;

-- Evidencia a base para migração sem escolher competências futuras.
SELECT
  (SELECT count(*) FROM (
    SELECT DISTINCT a.empenho_id, c.competencia
    FROM public.pvh_empenho_alocacoes a
    JOIN public.pvh_participantes p ON p.id=a.participante_id
    JOIN public.pvh_competencias c ON c.id=p.competencia_id
  ) q) AS meses_com_utilizacao_historica,
  (SELECT count(*) FROM public.pvh_empenhos
    WHERE solicitacao_competencia_id IS NOT NULL) AS ne_com_mes_de_origem;

-- Verificar qualquer alocação atual que exceda o total da NE antes de migrar.
SELECT e.id AS empenho_id, e.numero_ne, e.valor_total,
  SUM(a.valor_alocado) AS alocado
FROM public.pvh_empenhos e
JOIN public.pvh_empenho_alocacoes a ON a.empenho_id=e.id
GROUP BY e.id,e.numero_ne,e.valor_total
HAVING SUM(a.valor_alocado) > COALESCE(e.valor_total,0)+0.009;

-- Registro de integridade da competência de referência (leitura apenas).
SELECT c.competencia,pr.nome_instituicao,e.numero_ne,
       e.valor_total, a.valor_alocado
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_empenhos e ON e.id=a.empenho_id
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
JOIN public.prestadores pr ON pr.id=p.prestador_id
WHERE c.competencia='10/2026'
ORDER BY pr.nome_instituicao,e.numero_ne;