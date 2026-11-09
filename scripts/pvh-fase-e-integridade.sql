-- PVH Fase E · roteiro de integridade SOMENTE LEITURA.
-- Rodar em homologação e registrar os resultados antes/depois da migration.
-- Execução em produção SOMENTE após backup recuperável e autorização.

-- 1. Presença das funções das Fases C/D/E.
SELECT to_regprocedure('public.pvh_sincronizar_cobertura_competencia(uuid)') AS fase_c,
       to_regprocedure('public.pvh_concluir_etapa3(uuid)') AS fase_d,
       to_regprocedure('public.pvh_registrar_anulacao_residual(uuid,numeric,date,text,text,text,boolean)') AS fase_e;

-- 2. Extrato por NE emitida: uma linha por NE, valores globais e saldo exato.
WITH alocacoes AS (
  SELECT empenho_id, SUM(valor_alocado) AS alocado
  FROM public.pvh_empenho_alocacoes GROUP BY empenho_id
), anulacoes AS (
  SELECT empenho_id,SUM(valor_anulado) AS anulado
  FROM public.pvh_empenho_anulacoes GROUP BY empenho_id
)
SELECT e.id,e.numero_ne,e.ano,e.status,
       e.valor_total AS emitido,
       COALESCE(a.alocado,0) AS alocado_global,
       COALESCE(x.anulado,0) AS anulado_contabil,
       COALESCE(e.valor_total,0)-COALESCE(a.alocado,0)-COALESCE(x.anulado,0) AS saldo_global
FROM public.pvh_empenhos e
LEFT JOIN alocacoes a ON a.empenho_id=e.id
LEFT JOIN anulacoes x ON x.empenho_id=e.id
WHERE e.status='ativo'
ORDER BY e.ano DESC,e.numero_ne;

-- 3. Esta consulta PRECISA retornar ZERO linhas.
WITH totais AS (
  SELECT e.id,e.numero_ne,e.valor_total,
         COALESCE((SELECT SUM(a.valor_alocado)
                   FROM public.pvh_empenho_alocacoes a WHERE a.empenho_id=e.id),0) AS alocado,
         COALESCE((SELECT SUM(x.valor_anulado)
                   FROM public.pvh_empenho_anulacoes x WHERE x.empenho_id=e.id),0) AS anulado
  FROM public.pvh_empenhos e WHERE e.status='ativo'
)
SELECT * FROM totais
WHERE (valor_total-alocado-anulado)< -0.009
   OR (anulado>0 AND abs(valor_total-alocado-anulado)>0.009);

-- 4. Verificar imutabilidade e registro exclusivo da anulação por NE.
SELECT empenho_id,COUNT(*) AS registros,SUM(valor_anulado) AS total
FROM public.pvh_empenho_anulacoes
GROUP BY empenho_id HAVING COUNT(*)<>1;

-- 5. Conferir as NEs de outubro/2026 SEM executar baixa real.
SELECT e.id,e.numero_ne,e.valor_total,e.nota_empenho_sei_numero,
       x.valor_anulado,x.numero_sei AS sei_anulacao
FROM public.pvh_empenhos e
LEFT JOIN public.pvh_empenho_anulacoes x ON x.empenho_id=e.id
WHERE e.numero_ne IN ('6604/2026','6606/2026')
ORDER BY e.numero_ne;

-- 6. Conferir o documento e usuário autor do evento.
SELECT x.empenho_id,x.valor_anulado,x.data_anulacao,
       x.numero_sei,x.link_sei,x.created_by,x.created_at
FROM public.pvh_empenho_anulacoes x
ORDER BY x.created_at DESC;
