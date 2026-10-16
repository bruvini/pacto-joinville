-- Verificação SOMENTE LEITURA da exclusão definitiva de teste.
-- Execute APÓS a migration, antes de apagar 07/2026 na interface.
BEGIN READ ONLY;
SELECT c.competencia,c.cnes,c.status,(c.arquivada_em IS NOT NULL) AS arquivada,
 c.lancamento_id,l.valor_atestado AS valor_atestado_original,
 (SELECT count(*) FROM public.eletivas_arquivos a
   WHERE a.competencia_id=c.id) AS arquivos_a_excluir,
 (SELECT count(*) FROM public.eletivas_itens i
   WHERE i.competencia_id=c.id) AS itens_a_excluir,
 (SELECT count(*) FROM public.eletivas_decisoes_revisoes d
   WHERE d.competencia_id=c.id) AS revisoes_a_excluir,
 CASE
  WHEN c.status='encerrada' OR c.fechado_em IS NOT NULL OR
   c.valor_fechado IS NOT NULL THEN 'BLOQUEADO: encerrada'
  WHEN EXISTS(SELECT 1 FROM public.eletivas_fechamentos f
    WHERE f.competencia_id=c.id) THEN 'BLOQUEADO: fechamento fiscal'
  WHEN EXISTS(SELECT 1 FROM public.eletivas_integracoes x
    WHERE x.competencia_id=c.id) THEN 'BLOQUEADO: integração financeira'
  WHEN EXISTS(SELECT 1 FROM public.eletivas_atesto_escolhas x
    WHERE x.competencia_id=c.id OR x.lancamento_id=c.lancamento_id)
    THEN 'BLOQUEADO: escolha formal de atesto'
  WHEN l.id IS NULL OR l.concluido OR l.data_pagamento IS NOT NULL OR
   l.link_comprovante_pagamento_sei IS NOT NULL OR l.ec_escolha_pendente OR
   coalesce(l.valor_atestado_automatico,0)<>0 OR
   l.origem_valor_atestado='automatico'
    THEN 'BLOQUEADO: lançamento não elegível'
  ELSE 'ELEGÍVEL: com justificativa, confirmação e perfil ACP/Admin'
 END AS verificacao
FROM public.eletivas_competencias c
LEFT JOIN public.lancamentos_pagamento l ON l.id=c.lancamento_id
WHERE c.competencia='07/2026' AND c.cnes='2436469'
ORDER BY c.criado_em DESC;

SELECT p.proname,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS acesso_autenticado,
 has_function_privilege('anon',p.oid,'EXECUTE') AS acesso_anon
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
 AND p.proname IN('ec_excluir_competencia_teste','ec_confirmar_limpeza_teste')
ORDER BY p.proname;
COMMIT;
