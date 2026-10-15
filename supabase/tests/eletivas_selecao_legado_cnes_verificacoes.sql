-- Migração 20261015203000: verificações somente leitura.
BEGIN;
DO $verificar$
DECLARE p integer;
BEGIN
 IF to_regclass('public.ec_cnes_instituicoes') IS NULL THEN
  RAISE EXCEPTION 'Cadastro institucional CNES ausente.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ec_cnes_instituicoes WHERE cnes='2436469') THEN
  RAISE NOTICE 'ATENÇÃO: não foi localizado prestador HMSJ no cadastro CNES; confira prestadores.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c
  WHERE c.oid='public.ec_cnes_instituicoes'::regclass AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'RLS do cadastro institucional CNES desabilitada.';
 END IF;
 IF to_regprocedure('public.ec_listar_parcelas_encontro()') IS NULL OR
  to_regprocedure('public.ec_atualizar_observacao_competencia(uuid,text,text)') IS NULL THEN
  RAISE EXCEPTION 'RPCs do seletor/encontro legado ausentes.';
 END IF;
 IF has_function_privilege('anon','public.ec_listar_parcelas_encontro()','EXECUTE')
 OR has_function_privilege('anon',
  'public.ec_atualizar_observacao_competencia(uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'RPCs de seleção/edição expostas anonimamente.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias e
   WHERE e.lancamento_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.lancamentos_pagamento l
    WHERE l.id=e.lancamento_id AND l.prestador_id=e.prestador_id
      AND l.competencia=e.competencia)) THEN
  RAISE EXCEPTION 'Há encontro vinculado a prestador/competência diferente.';
 END IF;
 RAISE NOTICE 'Consulta institucional e vínculo do encontro: OK.';
END;$verificar$;

-- Diagnóstico de julho: mostra se há encontro antigo, vínculo ou impedimento
-- do lançamento. Valor atestado é exibido, mas NÃO elimina a elegibilidade.
SELECT l.competencia, l.parcela,l.valor_atestado,
       l.concluido,l.data_pagamento,
       e.status AS encontro_status,e.id AS encontro_id,
       e.lancamento_id AS vinculo_do_encontro,
       CASE
        WHEN l.concluido THEN 'Lançamento concluído'
        WHEN l.data_pagamento IS NOT NULL OR l.link_comprovante_pagamento_sei IS NOT NULL
         THEN 'Pagamento registrado'
        WHEN e.id IS NOT NULL AND e.lancamento_id IS DISTINCT FROM l.id
         AND e.lancamento_id IS NOT NULL THEN 'Encontro vinculado a outra parcela'
        WHEN e.id IS NOT NULL AND e.lancamento_id IS NULL THEN 'Encontro legado sem vínculo'
        WHEN e.id IS NOT NULL THEN 'Encontro já vinculado à parcela'
        ELSE 'Parcela disponível para novo encontro'
       END AS motivo
FROM public.lancamentos_pagamento l
JOIN public.prestadores p ON p.id=l.prestador_id
JOIN public.convenios cv ON cv.id=l.convenio_id
LEFT JOIN public.eletivas_competencias e ON e.prestador_id=l.prestador_id
 AND e.competencia=l.competencia
WHERE l.competencia='07/2026' AND cv.modelo_fluxo='fluxo_1'
 AND p.nome_instituicao ~* '(hospital municipal s[aã]o jos[eé]|^hmsj$)'
ORDER BY l.parcela,l.id;
ROLLBACK;
