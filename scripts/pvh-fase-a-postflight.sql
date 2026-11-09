-- SOMENTE LEITURA. Executar APÓS migration no banco de homologação.
-- NÃO executar se a migration ainda não foi aplicada.

SELECT to_regclass('public.pvh_empenho_competencias') AS abrangencias,
       to_regclass('public.pvh_empenho_anulacoes') AS anulacoes;

SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='pvh_empenhos' AND column_name='valor_solicitado')
  OR table_name IN ('pvh_empenho_competencias','pvh_empenho_anulacoes'))
ORDER BY table_name,ordinal_position;

SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
WHERE c.oid IN ('public.pvh_empenho_competencias'::regclass,
                'public.pvh_empenho_anulacoes'::regclass);

SELECT tablename,policyname,cmd,roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('pvh_empenho_competencias','pvh_empenho_anulacoes')
ORDER BY tablename,policyname;

SELECT c.relname AS tabela,t.tgname AS trigger,t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.oid IN ('public.pvh_empenho_competencias'::regclass,
                'public.pvh_empenho_anulacoes'::regclass)
  AND NOT t.tgisinternal ORDER BY 1,2;

-- Cada alocação antiga precisa ter um mês correspondente no novo calendário.
SELECT count(*) AS alocacoes_historicas_sem_mes
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
LEFT JOIN public.pvh_empenho_competencias m
 ON m.empenho_id=a.empenho_id AND m.competencia=c.competencia
WHERE m.id IS NULL;

-- Meses históricos não são lançamentos financeiros novos.
SELECT origem_vinculo, count(*) AS registros
FROM public.pvh_empenho_competencias GROUP BY 1 ORDER BY 1;

SELECT count(*) AS anulacoes_registradas_na_migration
FROM public.pvh_empenho_anulacoes;

-- Conferir invariantes: o legado continua sem solicitação reconstruída.
SELECT count(*) AS ne_legadas_com_valor_solicitado_nao_nulo
FROM public.pvh_empenhos WHERE valor_solicitado IS NOT NULL;

-- Conferir cobertura de outubro sem criar/alterar alocação.
SELECT c.competencia,pr.nome_instituicao,e.numero_ne,
       e.valor_total,a.valor_alocado
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_empenhos e ON e.id=a.empenho_id
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
JOIN public.prestadores pr ON pr.id=p.prestador_id
WHERE c.competencia='10/2026'
ORDER BY pr.nome_instituicao,e.numero_ne;