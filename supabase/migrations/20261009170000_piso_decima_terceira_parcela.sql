-- PACTO Joinville | Piso da Enfermagem: 12 parcelas mensais + 13ª anual.
-- Referências: cartilha MS 2026 (questão 18); Portaria de Consolidação
-- GM/MS 6/2017, Título IX-A; Lei 4.320/1964; MCASP 11ª ed.
-- NÃO presume valores da 13ª, não replica financeiros e não altera fluxos existentes.
-- Executar no SQL Editor do Lovable ANTES da publicação do frontend.
BEGIN;

ALTER TABLE public.piso_competencias
  ADD COLUMN IF NOT EXISTS tipo_parcela text NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS exercicio_referencia integer;

UPDATE public.piso_competencias
   SET exercicio_referencia = substring(competencia FROM 4 FOR 4)::integer
 WHERE exercicio_referencia IS NULL
   AND competencia ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$';

-- Não migrar silenciosamente competências legadas cujo formato não seja MM/AAAA.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.piso_competencias WHERE exercicio_referencia IS NULL) THEN
    RAISE EXCEPTION 'Há competências antigas com período inválido. Corrija-as antes da migração.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.piso_validar_tipo_parcela()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE ano_periodo integer;
BEGIN
  IF NEW.competencia IS NULL OR
     NEW.competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' THEN
    RAISE EXCEPTION 'Competência deve ter formato MM/AAAA (2000–2099).'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo_parcela IS NULL OR NEW.tipo_parcela NOT IN ('mensal','decimo_terceiro') THEN
    RAISE EXCEPTION 'Tipo de parcela inválido.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.tipo_parcela IS DISTINCT FROM OLD.tipo_parcela
       OR (
         OLD.tipo_parcela = 'decimo_terceiro'
         AND NEW.exercicio_referencia IS DISTINCT FROM OLD.exercicio_referencia
       )
     ) THEN
    RAISE EXCEPTION
      'O tipo e o exercício da 13ª são imutáveis. Crie um processo novo e preserve a auditoria.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.tipo_parcela = 'decimo_terceiro'
    AND NEW.competencia IS DISTINCT FROM OLD.competencia
    AND OLD.investsus_resumo->>'origem_calculo' = 'afc13_cnes' THEN
    RAISE EXCEPTION 'Não é permitido mover o repasse da 13ª após conciliação financeira.'
      USING ERRCODE='23514';
  END IF;
  ano_periodo := substring(NEW.competencia FROM 4 FOR 4)::integer;
  IF NEW.exercicio_referencia IS NULL THEN
    NEW.exercicio_referencia := ano_periodo;
  END IF;
  IF NEW.exercicio_referencia NOT BETWEEN 2000 AND 2099 THEN
    RAISE EXCEPTION 'Exercício de referência inválido.' USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo_parcela = 'mensal' AND NEW.exercicio_referencia <> ano_periodo THEN
    RAISE EXCEPTION 'Parcela mensal deve pertencer ao exercício de sua competência.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piso_validar_tipo_parcela ON public.piso_competencias;
CREATE TRIGGER trg_piso_validar_tipo_parcela
  BEFORE INSERT OR UPDATE ON public.piso_competencias
  FOR EACH ROW EXECUTE FUNCTION public.piso_validar_tipo_parcela();

ALTER TABLE public.piso_competencias
  ALTER COLUMN exercicio_referencia SET NOT NULL;

-- Substitui a antiga unicidade simples por duas regras com escopos explícitos.
-- Descobre a constraint legada por sua definição, sem assumir o nome gerado.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class tab ON tab.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = tab.relnamespace
     WHERE ns.nspname = 'public'
       AND tab.relname = 'piso_competencias'
       AND con.contype = 'u'
       AND (
         SELECT array_agg(att.attname ORDER BY cols.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = tab.oid AND att.attnum = cols.attnum
       ) = ARRAY['competencia']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.piso_competencias DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS piso_competencias_mensal_unica
  ON public.piso_competencias (competencia)
  WHERE tipo_parcela = 'mensal';

CREATE UNIQUE INDEX IF NOT EXISTS piso_competencias_decimo_exercicio_unico
  ON public.piso_competencias (exercicio_referencia)
  WHERE tipo_parcela = 'decimo_terceiro';

-- Nunca substitui os vínculos originais de participante, documento, nota,
-- pagamento, auditoria, logs, arquivos e prestações de contas.
COMMENT ON COLUMN public.piso_competencias.tipo_parcela IS
  'mensal: uma por MM/AAAA; decimo_terceiro: uma AFC adicional por exercício.';
COMMENT ON COLUMN public.piso_competencias.exercicio_referencia IS
  'Exercício a que se refere o direito; pode ser diferente do ano do repasse da 13ª.';

-- Não concede permissões adicionais: mantém RLS e políticas existentes.

-- Importação autoritativa da memória de 13ª por CNES.
-- Execução restrita ao service_role da Edge Function, nunca ao navegador.
-- A origem é um XLSX/CSV privado e hasheado, processado e validado no servidor.
CREATE OR REPLACE FUNCTION public.piso_aplicar_memoria_13_cnes(
  p_competencia uuid,
  p_arquivo uuid,
  p_linhas jsonb,
  p_autor uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_comp public.piso_competencias%ROWTYPE;
  v_arquivo public.piso_arquivos%ROWTYPE;
  v_item jsonb;
  v_cnes text;
  v_valor numeric;
  v_destino uuid;
  v_quantidade integer;
  v_total numeric := 0;
  v_somas jsonb := '{}'::jsonb;
  v_cnes_vistos text[] := ARRAY[]::text[];
  v_part record;
  v_nome text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Processamento da 13ª é exclusivo da função de evidências.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_comp FROM public.piso_competencias WHERE id = p_competencia FOR UPDATE;
  IF NOT FOUND OR v_comp.tipo_parcela <> 'decimo_terceiro' THEN
    RAISE EXCEPTION 'Competência da 13ª parcela não encontrada.' USING ERRCODE='23514';
  END IF;
  IF v_comp.status = 'encerrada' OR
    EXISTS (SELECT 1 FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=p_competencia) THEN
    RAISE EXCEPTION 'Reabra formalmente e reconcilie as obrigações antes de reprocessar a memória.'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_arquivo FROM public.piso_arquivos
  WHERE id=p_arquivo AND competencia_id=p_competencia AND categoria='afc13_cnes';
  IF NOT FOUND OR COALESCE(v_arquivo.sha256,'') = '' THEN
    RAISE EXCEPTION 'Arquivo fonte da 13ª não localizado ou sem hash.' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_linhas) = 0
    OR jsonb_array_length(p_linhas) > 20000 THEN
    RAISE EXCEPTION 'Memória por CNES ausente ou fora do limite de 20.000 linhas.' USING ERRCODE='23514';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas)
  LOOP
    v_cnes := regexp_replace(COALESCE(v_item->>'cnes',''), '[^0-9]', '', 'g');
    IF v_cnes !~ '^[0-9]{7}$' OR v_cnes = ANY(v_cnes_vistos) THEN
      RAISE EXCEPTION 'CNES inválido ou duplicado na memória da 13ª.' USING ERRCODE='23514';
    END IF;
    v_cnes_vistos := array_append(v_cnes_vistos, v_cnes);
    IF COALESCE(v_item->>'valor','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Valor inválido na memória da 13ª para CNES %.', v_cnes USING ERRCODE='23514';
    END IF;
    v_valor := (v_item->>'valor')::numeric;
    SELECT count(DISTINCT p.id), (array_agg(DISTINCT p.id))[1] INTO v_quantidade, v_destino
      FROM public.piso_participantes p
      JOIN public.prestador_cnes cn ON cn.prestador_id=p.prestador_id
      WHERE p.competencia_id=p_competencia
        AND regexp_replace(cn.cnes::text, '[^0-9]', '', 'g')=v_cnes;
    IF v_quantidade <> 1 THEN
      RAISE EXCEPTION 'CNES % não corresponde unicamente a instituição participante.', v_cnes
        USING ERRCODE='23514';
    END IF;
    v_somas := jsonb_set(v_somas, ARRAY[v_destino::text],
      to_jsonb(COALESCE((v_somas->>v_destino::text)::numeric,0)+v_valor), true);
    v_total := v_total + v_valor;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    IF NOT COALESCE(v_part.sem_elegiveis,false) AND NOT (v_somas ? v_part.id::text) THEN
      RAISE EXCEPTION 'Instituição % não consta da memória por CNES da 13ª.', v_part.id
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    UPDATE public.piso_participantes
       SET valor_devido = COALESCE((v_somas->>v_part.id::text)::numeric,0)
     WHERE id=v_part.id;
  END LOOP;
  UPDATE public.piso_competencias SET
    investsus_resumo=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'sha256',v_arquivo.sha256,'total_complemento',v_total,
      'linhas',jsonb_array_length(p_linhas)),
    investsus_auditoria=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'versao_regras',5,
      'interna',jsonb_build_object('erros',0,'alertas',0),
      'conciliacao',jsonb_build_object('criticas',0,'alertas',0)),
    valor_apurado_investsus=v_total,
    total_publicado_municipal=v_total
  WHERE id=p_competencia;
  SELECT nome INTO v_nome FROM public.profiles WHERE id=p_autor;
  INSERT INTO public.historico_logs
    (piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES (p_competencia,p_autor,v_nome,'Piso · memória oficial da 13ª conciliada por CNES',
    jsonb_build_object('arquivo_id',p_arquivo,'sha256',v_arquivo.sha256,
      'total',v_total,'quantidade_cnes',array_length(v_cnes_vistos,1),
      'exercicio',v_comp.exercicio_referencia));
  RETURN v_total;
END;
$;
REVOKE ALL ON FUNCTION public.piso_aplicar_memoria_13_cnes(uuid,uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piso_aplicar_memoria_13_cnes(uuid,uuid,jsonb,uuid)
  TO service_role;

COMMIT;
 OR v_cnes = ANY(v_cnes_vistos) THEN
      RAISE EXCEPTION 'CNES inválido ou duplicado na memória da 13ª.' USING ERRCODE='23514';
    END IF;
    v_cnes_vistos := array_append(v_cnes_vistos, v_cnes);
    IF COALESCE(v_item->>'valor','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Valor inválido na memória da 13ª para CNES %.', v_cnes USING ERRCODE='23514';
    END IF;
    v_valor := (v_item->>'valor')::numeric;
    SELECT count(DISTINCT p.id), min(p.id) INTO v_quantidade, v_destino
      FROM public.piso_participantes p
      JOIN public.prestador_cnes cn ON cn.prestador_id=p.prestador_id
      WHERE p.competencia_id=p_competencia
        AND regexp_replace(cn.cnes::text, '[^0-9]', '', 'g')=v_cnes;
    IF v_quantidade <> 1 THEN
      RAISE EXCEPTION 'CNES % não corresponde unicamente a instituição participante.', v_cnes
        USING ERRCODE='23514';
    END IF;
    v_somas := jsonb_set(v_somas, ARRAY[v_destino::text],
      to_jsonb(COALESCE((v_somas->>v_destino::text)::numeric,0)+v_valor), true);
    v_total := v_total + v_valor;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    IF NOT COALESCE(v_part.sem_elegiveis,false) AND NOT (v_somas ? v_part.id::text) THEN
      RAISE EXCEPTION 'Instituição % não consta da memória por CNES da 13ª.', v_part.id
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR v_part IN SELECT id, sem_elegiveis FROM public.piso_participantes
    WHERE competencia_id=p_competencia
  LOOP
    UPDATE public.piso_participantes
       SET valor_devido = COALESCE((v_somas->>v_part.id::text)::numeric,0)
     WHERE id=v_part.id;
  END LOOP;
  UPDATE public.piso_competencias SET
    investsus_resumo=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'sha256',v_arquivo.sha256,'total_complemento',v_total,
      'linhas',jsonb_array_length(p_linhas)),
    investsus_auditoria=jsonb_build_object(
      'origem_calculo','afc13_cnes','arquivo_id',p_arquivo,
      'versao_regras',5,
      'interna',jsonb_build_object('erros',0,'alertas',0),
      'conciliacao',jsonb_build_object('criticas',0,'alertas',0)),
    valor_apurado_investsus=v_total,
    total_publicado_municipal=v_total
  WHERE id=p_competencia;
  SELECT nome INTO v_nome FROM public.profiles WHERE id=p_autor;
  INSERT INTO public.historico_logs
    (piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES (p_competencia,p_autor,v_nome,'Piso · memória oficial da 13ª conciliada por CNES',
    jsonb_build_object('arquivo_id',p_arquivo,'sha256',v_arquivo.sha256,
      'total',v_total,'quantidade_cnes',array_length(v_cnes_vistos,1),
      'exercicio',v_comp.exercicio_referencia));
  RETURN v_total;
END;
$;
REVOKE ALL ON FUNCTION public.piso_aplicar_memoria_13_cnes(uuid,uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piso_aplicar_memoria_13_cnes(uuid,uuid,jsonb,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.piso_proteger_participantes_13()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.competencia_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.competencia_id; END IF;
  IF EXISTS (
    SELECT 1 FROM public.piso_competencias c
    WHERE c.id IN (v_old,v_new)
      AND c.tipo_parcela = 'decimo_terceiro'
      AND c.investsus_resumo->>'origem_calculo' = 'afc13_cnes'
  ) THEN
    RAISE EXCEPTION 'Instituições da 13ª conciliada não podem ser alteradas sem novo procedimento formal.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piso_proteger_participantes_13 ON public.piso_participantes;
CREATE TRIGGER trg_piso_proteger_participantes_13
  BEFORE INSERT OR DELETE OR UPDATE OF prestador_id, competencia_id, sem_elegiveis
  ON public.piso_participantes
  FOR EACH ROW EXECUTE FUNCTION public.piso_proteger_participantes_13();
COMMIT;
