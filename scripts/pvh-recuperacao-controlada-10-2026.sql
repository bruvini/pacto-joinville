-- USO ÚNICO: reparação transacional PVH 10/2026, incidente 10/11/2026 17:54.
-- NÃO colocar em supabase/migrations; apenas executar após deploy do hotfix
-- e da guarda de limpeza. Recupera a pré-imagem auditável de historico_logs.
-- Não recria/duplica NEs, pagamentos, subempenhos ou documentos existentes.
-- Retorna erro SEM alterações se a competência tiver mudado desde o diagnóstico.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';

CREATE SCHEMA IF NOT EXISTS pvh_resgate_privado;
REVOKE ALL ON SCHEMA pvh_resgate_privado FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS pvh_resgate_privado.snapshot_incidente_20261110 (
  competencia_id uuid PRIMARY KEY,
  capturado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  competencia_antes jsonb NOT NULL,
  participantes_antes jsonb NOT NULL,
  logs_origem jsonb NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA pvh_resgate_privado FROM PUBLIC,anon,authenticated;

DO $body$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_comp_id uuid := '26a051ed-c366-45c2-936d-6318c43b5bf4';
  v_bethesda_id uuid := '95e59c5a-df60-4e75-ad52-43de1e888c60';
  v_hmsj_id uuid := '06c15f70-75c0-4981-b1c9-bd7798b01f89';
  v_anterior jsonb;
  v_bethesda jsonb;
  v_hmsj jsonb;
  v_count integer;
  v_antes_geral jsonb;
  v_antes_participantes jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resgate-pvh-10-2026-etapa1',0)
  );
  SELECT * INTO v_comp FROM public.pvh_competencias
    WHERE id=v_comp_id AND competencia='10/2026' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resgate interrompido: competência diferente da auditada.';
  END IF;

  IF v_comp.status <> 'ativa' OR
     v_comp.portaria_estadual_numero IS NOT NULL OR
     v_comp.portaria_estadual_data IS NOT NULL OR
     v_comp.portaria_estadual_url IS NOT NULL OR
     v_comp.etapas_concluidas <> '{"1":true,"2":true,"3":true,"4":true,"6":true}'::jsonb OR
     v_comp.etapas_reconferir <> ARRAY[1,2,3,4,6]::integer[] OR
     v_comp.recurso_fms_valor IS DISTINCT FROM 3015502.09 OR
     v_comp.portaria_municipal_numero IS DISTINCT FROM '257/2026/SES'
  THEN
    RAISE EXCEPTION 'Resgate interrompido: situação atual difere da fotografia verificada.';
  END IF;

  SELECT detalhes->'antes' INTO v_anterior
    FROM public.historico_logs
   WHERE pvh_competencia_id=v_comp_id
     AND acao='PVH · update: pvh_competencias'
     AND data_hora BETWEEN '2026-11-10 20:54:37+00' AND '2026-11-10 20:54:38+00'
     AND detalhes->'antes'->>'portaria_estadual_numero' IS NOT NULL
     AND detalhes->'depois'->>'portaria_estadual_numero' IS NULL
   ORDER BY data_hora DESC LIMIT 1;

  IF v_anterior IS NULL
     OR v_anterior->>'portaria_estadual_numero' <> 'SES Nº 3531'
     OR v_anterior->>'portaria_estadual_data' <> '2026-10-21'
     OR v_anterior->>'portaria_estadual_url' NOT LIKE
       'https://www.saude.sc.gov.br/%portaria-ses-no-3531-21-10-2026-parcela-outubro-2026/download'
     OR v_anterior->'etapas_reconferir' <> '[6]'::jsonb
  THEN
    RAISE EXCEPTION 'Resgate interrompido: pré-imagem documental não comprovada.';
  END IF;

  SELECT detalhes->'antes' INTO v_bethesda
    FROM public.historico_logs
   WHERE pvh_competencia_id=v_comp_id
     AND acao='PVH · update: pvh_participantes'
     AND data_hora BETWEEN '2026-11-10 20:54:38+00' AND '2026-11-10 20:54:40+00'
     AND detalhes->'antes'->>'id'=v_bethesda_id::text
     AND detalhes->'depois'->>'valor_estadual' IS NULL
   ORDER BY data_hora DESC LIMIT 1;
  SELECT detalhes->'antes' INTO v_hmsj
    FROM public.historico_logs
   WHERE pvh_competencia_id=v_comp_id
     AND acao='PVH · update: pvh_participantes'
     AND data_hora BETWEEN '2026-11-10 20:54:38+00' AND '2026-11-10 20:54:40+00'
     AND detalhes->'antes'->>'id'=v_hmsj_id::text
     AND detalhes->'depois'->>'valor_estadual' IS NULL
   ORDER BY data_hora DESC LIMIT 1;

  IF v_bethesda IS NULL OR v_hmsj IS NULL
    OR (v_bethesda->>'valor_estadual')::numeric <> 1240000
    OR (v_hmsj->>'valor_estadual')::numeric <> 1775502.09
  THEN
    RAISE EXCEPTION 'Resgate interrompido: valores oficiais sem comprovação auditável.';
  END IF;

  SELECT count(*) INTO v_count FROM public.pvh_participantes
   WHERE competencia_id=v_comp_id;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Resgate interrompido: instituições diferentes.'; END IF;

  PERFORM 1 FROM public.pvh_participantes
    WHERE competencia_id=v_comp_id AND id=v_bethesda_id AND valor_estadual IS NULL
      AND valor_municipal=1240000 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resgate interrompido: Bethesda alterada.'; END IF;
  PERFORM 1 FROM public.pvh_participantes
    WHERE competencia_id=v_comp_id AND id=v_hmsj_id AND valor_estadual IS NULL
      AND valor_municipal=1775502.09 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resgate interrompido: HMSJ alterado.'; END IF;

  v_antes_geral:=to_jsonb(v_comp);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
    INTO v_antes_participantes
    FROM public.pvh_participantes p WHERE p.competencia_id=v_comp_id;

  INSERT INTO pvh_resgate_privado.snapshot_incidente_20261110(
    competencia_id,competencia_antes,participantes_antes,logs_origem)
  VALUES(v_comp_id,v_antes_geral,v_antes_participantes,
    jsonb_build_object('portaria',v_anterior,'bethesda',v_bethesda,'hmsj',v_hmsj))
  ON CONFLICT (competencia_id) DO NOTHING;

  UPDATE public.pvh_competencias SET
      portaria_estadual_numero=v_anterior->>'portaria_estadual_numero',
      portaria_estadual_data=(v_anterior->>'portaria_estadual_data')::date,
      portaria_estadual_url=v_anterior->>'portaria_estadual_url'
    WHERE id=v_comp_id;

  UPDATE public.pvh_participantes SET valor_estadual=(v_bethesda->>'valor_estadual')::numeric
    WHERE id=v_bethesda_id AND competencia_id=v_comp_id AND valor_estadual IS NULL;
  UPDATE public.pvh_participantes SET valor_estadual=(v_hmsj->>'valor_estadual')::numeric
    WHERE id=v_hmsj_id AND competencia_id=v_comp_id AND valor_estadual IS NULL;

  -- Remover somente reconferências 1/2/3/4 provocadas por esta limpeza;
  -- manter a reconferência 6 que já existia ANTES do incidente.
  UPDATE public.pvh_competencias SET etapas_reconferir=ARRAY[6]::integer[]
    WHERE id=v_comp_id AND etapas_reconferir=ARRAY[1,2,3,4,6]::integer[];

  IF NOT EXISTS(
    SELECT 1 FROM public.pvh_competencias c
    WHERE c.id=v_comp_id AND c.portaria_estadual_numero='SES Nº 3531'
      AND c.portaria_estadual_data='2026-10-21'
      AND c.portaria_estadual_url=v_anterior->>'portaria_estadual_url'
      AND c.etapas_reconferir=ARRAY[6]::integer[]
      AND (SELECT sum(p.valor_estadual) FROM public.pvh_participantes p
           WHERE p.competencia_id=c.id)=3015502.09
  ) THEN
    RAISE EXCEPTION 'Resgate interrompido: pós-validação financeira falhou.';
  END IF;

  INSERT INTO public.historico_logs (
    id, pvh_competencia_id, usuario_nome, acao, detalhes, data_hora
  ) VALUES (
    gen_random_uuid(),v_comp_id,'Recuperação técnica controlada',
    'PVH · recuperação de campos apagados por autossalvamento',
    jsonb_build_object(
      'origem','pré-imagem auditável de historico_logs em 10/11/2026 17h54',
      'campos','portaria_estadual_numero,data,url + valor_estadual das 2 instituições',
      'instituicoes',jsonb_build_array('Bethesda','HMSJ'),
      'etapas_reconferir_preservadas',jsonb_build_array(6),
      'observacao','NEs, subempenhos, pagamentos, documentos e comunicações não foram recriados'
    ),clock_timestamp()
  );
END;
$body$;
COMMIT;
