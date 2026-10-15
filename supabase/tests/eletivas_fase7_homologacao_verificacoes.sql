-- Encontro de Contas HMSJ Fase 7: validações somente leitura após Fases 0–6.
-- Execute no SQL Editor Lovable. Não modifica registros, fechamento ou convênio.
BEGIN;
DO $fase7$
DECLARE nome text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname='anon' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'Fase 7: papel anon não localizado ou capaz de contornar a RLS.'
   USING ERRCODE='42501';
 END IF;
 FOREACH nome IN ARRAY ARRAY[
 'eletivas_competencias','eletivas_itens','eletivas_arquivos',
 'eletivas_decisoes_revisoes','eletivas_correcoes',
 'eletivas_fechamentos','eletivas_integracoes','eletivas_atesto_escolhas'
 ] LOOP
  IF to_regclass('public.'||nome) IS NULL THEN
   RAISE EXCEPTION 'Fase 7: tabela exigida ausente: %',nome USING ERRCODE='23514';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid=('public.'||nome)::regclass) THEN
   RAISE EXCEPTION 'Fase 7: RLS desabilitada: %',nome USING ERRCODE='23514';
  END IF;
  -- O GRANT de tabela ao papel anon não concede acesso sozinho quando
  -- RLS está habilitada. Supabase pode conceder SELECT a anon por padrão,
  -- enquanto as policies efetivas estão limitadas a authenticated.
  -- Testar GRANT isolado gerava um falso positivo (42501).
  -- Acesso real exige uma policy PERMISSIVE aplicável ao papel anon/PUBLIC.
  IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_policy pol
   WHERE pol.polrelid=('public.'||nome)::regclass
     AND pol.polpermissive
     AND EXISTS (
       SELECT 1 FROM unnest(pol.polroles) AS permitido(role_oid)
       WHERE CASE WHEN permitido.role_oid=0::oid THEN true
         ELSE pg_catalog.pg_has_role('anon'::name,permitido.role_oid,'USAGE')
       END
     )
  ) THEN
   RAISE EXCEPTION 'Fase 7: política RLS permissiva aplicável a anon/PUBLIC na tabela %; revisar policy.',
     nome USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF has_function_privilege('anon',
   'public.ec_importar_itens_local(uuid,jsonb,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon','public.ec_checklist_fechamento(uuid)','EXECUTE')
  OR has_function_privilege('anon',
   'public.ec_encerrar_seguro(uuid,uuid,text,text,boolean)','EXECUTE')
  OR has_function_privilege('anon',
   'public.ec_aplicar_integracao(uuid,numeric,boolean)','EXECUTE')
  OR has_function_privilege('authenticated','public.ec_encerrar(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Fase 7: RPC de importação/fechamento exposta.' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgrelid='public.eletivas_competencias'::regclass
   AND tgname='ec_snapshot_final' AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Fase 7: trigger de snapshot inativo.' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgrelid='public.lancamentos_pagamento'::regclass
   AND tgname='ec_fontes_atesto_guard' AND tgenabled<>'D') THEN
  RAISE EXCEPTION 'Fase 7: escolha de valor atestado sem guardião.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_integracoes e
  WHERE e.status IN('proposta','aplicada')
  GROUP BY e.competencia_id HAVING count(*)>1) OR
 EXISTS(SELECT 1 FROM public.eletivas_integracoes e
  WHERE e.status IN('proposta','aplicada')
  GROUP BY e.lancamento_id HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Fase 7: integração duplicada ativa.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_correcoes c
  WHERE c.status='aprovada'
  GROUP BY c.prestador_id,c.fingerprint HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Fase 7: correção aprovada em duplicidade.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens i
  GROUP BY i.competencia_id,i.chave HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Fase 7: linha AIH/procedimento repetida.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_itens i
  JOIN public.eletivas_competencias c ON c.id=i.competencia_id
  WHERE i.origem='parser_validado' AND i.ec_execucao_id IS DISTINCT FROM c.ec_execucao_id
    AND c.status='encerrada') THEN
   RAISE EXCEPTION 'Fase 7: fechamento com itens de execução divergente.'
    USING ERRCODE='23514';
 END IF;
 RAISE NOTICE 'Fase 7: catálogo, RLS, anti-duplo-atesto e origem de execução OK.';
END;$fase7$;

-- Diagnóstico de permissões: o GRANT de SELECT isolado não significa
-- leitura permitida. Para anon a ausência de policy permissiva é bloqueio.
SELECT tbl.nome AS tabela,
  has_table_privilege('anon','public.'||tbl.nome,'SELECT') AS grant_select_anon,
  (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
    WHERE c.oid=('public.'||tbl.nome)::regclass) AS rls_habilitada,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy pol
    WHERE pol.polrelid=('public.'||tbl.nome)::regclass
      AND pol.polpermissive
      AND EXISTS (
        SELECT 1 FROM unnest(pol.polroles) AS permitido(role_oid)
        WHERE CASE WHEN permitido.role_oid=0::oid THEN true
          ELSE pg_catalog.pg_has_role('anon'::name,permitido.role_oid,'USAGE')
        END
      )
  ) AS politica_permissiva_para_anon
FROM (VALUES
 ('eletivas_competencias'),('eletivas_itens'),('eletivas_arquivos'),
 ('eletivas_decisoes_revisoes'),('eletivas_correcoes'),
 ('eletivas_fechamentos'),('eletivas_integracoes'),('eletivas_atesto_escolhas')
) AS tbl(nome);

-- Confronto SQL do motor: aritmética em centavos, categoria de controle
-- excluída, correções aprovadas aplicadas somente uma vez.
WITH por_competencia AS(
 SELECT e.id,e.competencia,e.status,e.valor_fechado,
  (public.ec_resumo_financeiro(e.id)) resumo
 FROM public.eletivas_competencias e
 WHERE e.competencia IN('04/2026','07/2026','08/2026')
    OR e.status='encerrada'
)
SELECT competencia,status,valor_fechado,
 (resumo->>'itens')::integer AS itens,
 (resumo->>'sem_conferencia')::integer AS sem_conferencia,
 (resumo->>'pendencias_sem_decisao')::integer AS sem_decisao,
 (resumo->>'em_analise')::integer AS em_analise,
 (resumo->>'fiscalmente_admitido')::numeric(16,2) AS admitido,
 (resumo->>'correcoes')::numeric(16,2) AS correcoes,
 (resumo->>'total_com_correcoes')::numeric(16,2) AS total_sql,
 (resumo->>'controle_faec_fxmac_nao_somado')::numeric(16,2) AS controle_nao_somar,
 CASE
  WHEN status='encerrada' AND valor_fechado IS DISTINCT FROM
       (resumo->>'total_com_correcoes')::numeric THEN 'DIVERGENTE — BLOQUEAR'
  WHEN status='encerrada' THEN 'FECHADO — conferir snapshot/SEI'
  ELSE 'ABERTO — não homologado'
 END AS diagnostico
FROM por_competencia ORDER BY competencia;

-- Snapshots imutáveis devem sobreviver a reabertura; como este relatório
-- é read-only, nenhum fechamento fica aprovado somente por rodá-lo.
SELECT c.competencia,count(f.id) AS snapshots,
 count(e.id) FILTER(WHERE e.status='aplicada') AS integracoes_aplicadas
FROM public.eletivas_competencias c
LEFT JOIN public.eletivas_fechamentos f ON f.competencia_id=c.id
LEFT JOIN public.eletivas_integracoes e ON e.competencia_id=c.id AND e.fechamento_id=f.id
WHERE c.competencia IN('04/2026','07/2026','08/2026') OR c.status='encerrada'
GROUP BY c.id,c.competencia ORDER BY c.competencia;
ROLLBACK;
