-- PVH Fase C — auditoria somente leitura, executar APÓS a migration.
-- Salvar resultados com timestamp em repositório institucional seguro.
SELECT
 (SELECT count(*) FROM public.pvh_empenhos) AS notas,
 (SELECT count(*) FROM public.pvh_empenho_alocacoes) AS alocacoes,
 (SELECT COALESCE(SUM(valor_alocado),0) FROM public.pvh_empenho_alocacoes) AS cobertura_alocada,
 (SELECT count(*) FROM public.pvh_subempenhos) AS cadeias_subempenho,
 (SELECT count(*) FROM public.pvh_empenho_competencias) AS meses_de_abrangencia,
 (SELECT count(*) FROM public.pvh_empenho_anulacoes) AS anulacoes;

-- A consulta de saldos não presume que registros legados estejam íntegros.
SELECT e.id, e.numero_ne, e.ano, e.valor_total AS emitido,
 COALESCE(a.total,0) AS alocado,
 COALESCE(n.total,0) AS anulado,
 COALESCE(e.valor_total,0)-COALESCE(a.total,0)-COALESCE(n.total,0) AS saldo_real
FROM public.pvh_empenhos e
LEFT JOIN (SELECT empenho_id,SUM(valor_alocado) total
           FROM public.pvh_empenho_alocacoes GROUP BY empenho_id) a ON a.empenho_id=e.id
LEFT JOIN (SELECT empenho_id,SUM(valor_anulado) total
           FROM public.pvh_empenho_anulacoes GROUP BY empenho_id) n ON n.empenho_id=e.id
WHERE e.status='ativo'
ORDER BY e.ano,e.numero_ne;

-- 0 esperados; se houver registros, ANTES da migração exigir análise.
SELECT e.id,e.numero_ne,e.valor_total,
 COALESCE(a.total,0) + COALESCE(n.total,0) AS comprometido_e_anulado
FROM public.pvh_empenhos e
LEFT JOIN (SELECT empenho_id,SUM(valor_alocado) total
           FROM public.pvh_empenho_alocacoes GROUP BY empenho_id) a ON a.empenho_id=e.id
LEFT JOIN (SELECT empenho_id,SUM(valor_anulado) total
           FROM public.pvh_empenho_anulacoes GROUP BY empenho_id) n ON n.empenho_id=e.id
WHERE COALESCE(a.total,0)+COALESCE(n.total,0)>COALESCE(e.valor_total,0)+0.009;

-- 0 esperados; preserva todos os vínculos já documentados.
SELECT a.id AS alocacao, e.numero_ne,c.competencia
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_empenhos e ON e.id=a.empenho_id
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
WHERE NOT public.pvh_ne_competencia_elegivel(e.id,c.competencia);
-- Requer migration C: esta consulta não deve ser executada antes.

-- Outubro/2026 deve continuar com os valores históricos.
SELECT c.competencia,pr.nome_instituicao,e.numero_ne,e.nota_empenho_sei_numero,
       a.valor_alocado,(SELECT COUNT(*) FROM public.pvh_subempenhos s
                         WHERE s.alocacao_id=a.id) AS cadeias
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_empenhos e ON e.id=a.empenho_id
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
JOIN public.prestadores pr ON pr.id=p.prestador_id
WHERE c.competencia='10/2026'
ORDER BY pr.nome_instituicao,e.numero_ne;

-- Pós-migration somente leitura:
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN (
   'pvh_sincronizar_cobertura_competencia',
   'pvh_ne_competencia_elegivel','pvh_ne_guard_alocacao',
   'pvh_ne_guard_emissao','pvh_registrar_nota_empenho',
   'pvh_preparar_etapa4','pvh_alocar_saldo_empenho',
   'pvh_rebalancear_alocacoes_origem')
ORDER BY proname;

SELECT relname,tgname,tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE t.tgname IN ('trg_pvh_ne_guard_alocacao','trg_pvh_ne_guard_emissao');
