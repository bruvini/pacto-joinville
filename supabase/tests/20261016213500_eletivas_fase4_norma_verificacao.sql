-- Fase 4 + exclusão legada: conferência somente leitura, sem DELETE.
BEGIN READ ONLY;
SELECT 'Funções' AS bloco,
 public.ec_norma_cib_competencia('08/2025') AS delib_030,
 public.ec_norma_cib_competencia('07/2026') AS delib_727,
 public.ec_norma_cib_competencia('08/2026') AS delib_399,
 public.ec_norma_cib_competencia('01/2027') AS fora_matriz;
SELECT 'FK legada' AS bloco,column_name,is_nullable
 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='eletivas_exclusoes'
 AND column_name='lancamento_id';
SELECT 'Guarda normativa' AS bloco,tgname,tgenabled
 FROM pg_trigger
 WHERE tgrelid='public.eletivas_itens'::regclass
 AND tgname='ec_normativa_fase4_guard';
SELECT c.competencia,c.status,c.arquivada_em IS NOT NULL AS arquivada,
 c.lancamento_id, count(i.id) FILTER(WHERE i.categoria IN('faec_mult','mac_mult')) AS multiplas,
 count(i.id) FILTER(WHERE i.categoria IN('faec_mult','mac_mult')
  AND i.detalhe->>'regra_normativa' IS DISTINCT FROM
      public.ec_norma_cib_competencia(c.competencia)) AS multiplas_sem_versao_atual,
 count(i.id) FILTER(WHERE i.categoria IN('faec_mult','mac_mult')
  AND (i.detalhe->>'exige_programacao_fpo')='true') AS com_fpo_a_conferir,
 count(i.id) FILTER(WHERE i.categoria IN('faec_mult','mac_mult')
  AND i.situacao='ok'
  AND (i.detalhe->>'exige_programacao_fpo')='true') AS revisar_ok_fpo
 FROM public.eletivas_competencias c
 LEFT JOIN public.eletivas_itens i ON i.competencia_id=c.id
 GROUP BY c.id,c.competencia,c.status,c.arquivada_em,c.lancamento_id
 ORDER BY c.competencia DESC LIMIT 20;
SELECT c.competencia,c.id AS encontro_id,c.lancamento_id,
 CASE WHEN c.lancamento_id IS NULL THEN 'LEGADO: sem vínculo de origem'
 ELSE 'Vinculada à parcela' END AS origem,
 CASE WHEN EXISTS(SELECT 1 FROM public.eletivas_fechamentos f WHERE f.competencia_id=c.id)
 OR EXISTS(SELECT 1 FROM public.eletivas_integracoes f WHERE f.competencia_id=c.id)
 OR EXISTS(SELECT 1 FROM public.eletivas_atesto_escolhas a
  WHERE a.competencia_id=c.id)
 THEN 'BLOQUEADO: histórico financeiro' ELSE 'Conferir a elegibilidade restante na RPC' END AS exclusao
 FROM public.eletivas_competencias c
 WHERE c.competencia='07/2026' AND c.cnes='2436469';
COMMIT;
