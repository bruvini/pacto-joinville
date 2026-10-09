-- Piso da Enfermagem: confirmação auditável do cálculo interno da 13ª por CNES.
-- A regra de média Jan-Nov/11 está validada SOMENTE para 2025.
-- Não cria fórmula automática nem distribui recurso do exercício 2026.
BEGIN;

CREATE OR REPLACE FUNCTION public.piso13_confirmar_calculo_cnes(p_competencia uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_comp public.piso_competencias%ROWTYPE;
  v_mes_comp public.piso_competencias%ROWTYPE;
  v_part record;
  v_cnes record;
  v_mes integer;
  v_periodo text;
  v_texto text;
  v_total_cnes numeric := 0;
  v_valor numeric;
  v_media numeric;
  v_soma numeric;
  v_mes_total numeric;
  v_instituicao numeric;
  v_qtd integer := 0;
  v_por_cnes jsonb := '{}'::jsonb;
  v_origens jsonb := '[]'::jsonb;
  v_nome text;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id=v_actor AND r.role::text IN ('admin','acp','aco')
  ) THEN
    RAISE EXCEPTION 'A confirmação do cálculo exige um usuário autorizado.'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_comp FROM public.piso_competencias
    WHERE id=p_competencia FOR UPDATE;
  IF NOT FOUND OR v_comp.tipo_parcela <> 'decimo_terceiro' THEN
    RAISE EXCEPTION 'Competência anual da 13ª não localizada.' USING ERRCODE='23514';
  END IF;
  IF v_comp.exercicio_referencia <> 2025 THEN
    RAISE EXCEPTION
      'Cálculo bloqueado: a metodologia da 13ª de % ainda não foi confirmada neste módulo.',
      v_comp.exercicio_referencia USING ERRCODE='23514';
  END IF;
  IF v_comp.status='encerrada'
     OR COALESCE(v_comp.etapas_concluidas->>'2','false')='true'
     OR COALESCE(v_comp.etapas_concluidas->>'3','false')='true'
     OR EXISTS (
       SELECT 1 FROM public.piso_obrigacoes o
       JOIN public.piso_participantes p ON p.id=o.participante_id
       WHERE p.competencia_id=p_competencia
     ) THEN
    RAISE EXCEPTION 'A 13ª já possui etapa encerrada ou obrigação. Não reprocessar sem revisão formal.'
      USING ERRCODE='23514';
  END IF;
  IF v_comp.investsus_resumo->>'origem_calculo' IN ('afc13_cnes','simulacao13_conferida') THEN
    RAISE EXCEPTION 'Já existe memória financeira aplicada. Reprocessamento bloqueado.'
      USING ERRCODE='23514';
  END IF;
  IF v_comp.portaria_gm_numero IS NULL OR v_comp.portaria_gm_data_publicacao IS NULL
     OR v_comp.portaria_gm_url_dou IS NULL OR v_comp.valor_homologado IS NULL
     OR v_comp.valor_transferido IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.piso_arquivos a
       WHERE a.competencia_id=p_competencia AND a.categoria='portaria_gm'
     ) THEN
    RAISE EXCEPTION 'Registre e confira a Portaria GM/MS específica da 13ª antes de confirmar valores.'
      USING ERRCODE='23514';
  END IF;

  -- Confirma a integridade e a procedência de cada fonte mensal.
  FOR v_mes IN 1..11 LOOP
    v_periodo := lpad(v_mes::text,2,'0')||'/2025';
    SELECT * INTO v_mes_comp FROM public.piso_competencias
      WHERE competencia=v_periodo AND tipo_parcela='mensal' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cadastre a competência mensal % antes de calcular a 13ª.', v_periodo
        USING ERRCODE='23514';
    END IF;
    IF COALESCE(v_mes_comp.investsus_resumo->>'origem_calculo','') <> 'edge_function'
       OR COALESCE(v_mes_comp.investsus_resumo->>'arquivo_id','') = ''
       OR jsonb_typeof(v_mes_comp.investsus_resumo->'por_cnes') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Falta memória mensal processada e homologada por CNES em %.', v_periodo
        USING ERRCODE='23514';
    END IF;
    IF v_mes_comp.valor_homologado IS NULL OR
       COALESCE(v_mes_comp.portaria_gm_numero,'')='' OR
       COALESCE(v_mes_comp.etapas_concluidas->>'2','false')<>'true' THEN
      RAISE EXCEPTION 'Competência mensal % sem Portaria e homologação concluídas.',v_periodo
        USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(value::numeric),0) INTO v_mes_total
      FROM jsonb_each_text(v_mes_comp.investsus_resumo->'por_cnes');
    IF abs(v_mes_total-v_mes_comp.valor_homologado)>0.01 THEN
      RAISE EXCEPTION 'Competência %: a soma dos CNES difere do homologado mensal.',
        v_periodo USING ERRCODE='23514';
    END IF;
    v_origens := v_origens || jsonb_build_array(jsonb_build_object(
      'competencia',v_periodo, 'id',v_mes_comp.id,
      'arquivo_id',v_mes_comp.investsus_resumo->>'arquivo_id',
      'atualizado_em',v_mes_comp.updated_at
    ));
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.piso_participantes p
                 WHERE p.competencia_id=p_competencia) THEN
    RAISE EXCEPTION 'Adicione as instituições participantes da 13ª.'
      USING ERRCODE='23514';
  END IF;

  FOR v_part IN SELECT id,prestador_id,sem_elegiveis
    FROM public.piso_participantes
    WHERE competencia_id=p_competencia ORDER BY id
  LOOP
    v_instituicao := 0;
    IF NOT EXISTS (SELECT 1 FROM public.prestador_cnes cn
                   WHERE cn.prestador_id=v_part.prestador_id) THEN
      RAISE EXCEPTION 'Participante % não possui CNES cadastrado.', v_part.id
        USING ERRCODE='23514';
    END IF;
    FOR v_cnes IN SELECT DISTINCT regexp_replace(cn.cnes::text,'[^0-9]','','g') AS codigo
      FROM public.prestador_cnes cn
      WHERE cn.prestador_id=v_part.prestador_id
      ORDER BY 1
    LOOP
      IF v_cnes.codigo !~ '^[0-9]{7}$' THEN
        RAISE EXCEPTION 'CNES % inválido no cadastro.', v_cnes.codigo USING ERRCODE='23514';
      END IF;
      IF v_por_cnes ? v_cnes.codigo THEN
        RAISE EXCEPTION 'CNES % pertence a mais de uma instituição participante.',
          v_cnes.codigo USING ERRCODE='23514';
      END IF;
      v_soma := 0;
      FOR v_mes IN 1..11 LOOP
        v_periodo := lpad(v_mes::text,2,'0')||'/2025';
        SELECT * INTO v_mes_comp FROM public.piso_competencias
          WHERE competencia=v_periodo AND tipo_parcela='mensal' FOR SHARE;
        v_texto := v_mes_comp.investsus_resumo->'por_cnes'->>v_cnes.codigo;
        IF v_texto IS NULL OR v_texto !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
          RAISE EXCEPTION 'CNES % sem valor explícito válido em %. Zero não é presumido.',
            v_cnes.codigo,v_periodo USING ERRCODE='23514';
        END IF;
        v_valor := v_texto::numeric;
        v_soma := v_soma + v_valor;
      END LOOP;
      v_media := round(v_soma / 11,2);
      v_por_cnes := jsonb_set(v_por_cnes,ARRAY[v_cnes.codigo],to_jsonb(v_media),true);
      v_total_cnes := v_total_cnes + v_media;
      v_instituicao := v_instituicao + v_media;
      v_qtd := v_qtd + 1;
    END LOOP;
    -- Ainda nesta transação, com a fonte original preservada.
    UPDATE public.piso_participantes SET valor_devido=v_instituicao
      WHERE id=v_part.id;
  END LOOP;

  IF abs(v_total_cnes-v_comp.valor_homologado)>0.01 THEN
    RAISE EXCEPTION
      'Somatório por CNES (%) difere do homologado na Portaria (%). Registre conferência documental antes de publicar.',
      v_total_cnes,v_comp.valor_homologado USING ERRCODE='23514';
  END IF;

  UPDATE public.piso_competencias SET
    investsus_resumo=jsonb_build_object(
      'origem_calculo','simulacao13_conferida',
      'metodologia','media_11_meses_jan_nov_2025',
      'exercicio',2025, 'divisor',11,
      'por_cnes',v_por_cnes,
      'total_complemento',v_total_cnes,
      'fontes_mensais',v_origens,
      'confirmado_em',now(),
      'confirmado_por',v_actor
    ),
    valor_apurado_investsus=v_total_cnes,
    total_publicado_municipal=v_total_cnes
  WHERE id=p_competencia;

  SELECT nome INTO v_nome FROM public.profiles WHERE id=v_actor;
  INSERT INTO public.historico_logs
    (piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES (p_competencia,v_actor,v_nome,'Piso · cálculo interno da 13ª conferido com Portaria federal',
    jsonb_build_object('exercicio',2025,'meses',11,'quantidade_cnes',v_qtd,
      'total',v_total_cnes,'valor_portaria',v_comp.valor_homologado,
      'fontes_mensais',v_origens));
  RETURN v_total_cnes;
END;
$$;
REVOKE ALL ON FUNCTION public.piso13_confirmar_calculo_cnes(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piso13_confirmar_calculo_cnes(uuid)
  TO authenticated;

-- Preserva o impedimento de troca de instituições após confirmação interna
-- ou importação de memória oficial antiga.
CREATE OR REPLACE FUNCTION public.piso_proteger_participantes_13()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.competencia_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.competencia_id; END IF;
  IF EXISTS (
    SELECT 1 FROM public.piso_competencias c
    WHERE c.id IN (v_old,v_new)
      AND c.tipo_parcela='decimo_terceiro'
      AND c.investsus_resumo->>'origem_calculo'
        IN ('afc13_cnes','simulacao13_conferida')
  ) THEN
    RAISE EXCEPTION 'Instituições de 13ª já conciliada não podem ser alteradas sem revisão formal.'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Nenhum operador pode substituir valores do cálculo confirmado por edição
-- direta da tabela de participantes após a conclusão.
CREATE OR REPLACE FUNCTION public.piso13_proteger_valores_conferidos()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.valor_devido IS DISTINCT FROM NEW.valor_devido
     AND EXISTS (
       SELECT 1 FROM public.piso_competencias c
       WHERE c.id=OLD.competencia_id AND c.tipo_parcela='decimo_terceiro'
         AND c.investsus_resumo->>'origem_calculo'='simulacao13_conferida'
     ) THEN
    RAISE EXCEPTION 'Valores da 13ª conciliada não podem ser modificados diretamente.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piso13_proteger_valores_conferidos
  ON public.piso_participantes;
CREATE TRIGGER trg_piso13_proteger_valores_conferidos
  BEFORE UPDATE OF valor_devido ON public.piso_participantes
  FOR EACH ROW EXECUTE FUNCTION public.piso13_proteger_valores_conferidos();

CREATE OR REPLACE FUNCTION public.piso13_proteger_memoria_conferida()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.investsus_resumo->>'origem_calculo'='simulacao13_conferida' THEN
    IF NEW.competencia IS DISTINCT FROM OLD.competencia OR
       NEW.investsus_resumo IS DISTINCT FROM OLD.investsus_resumo OR
       NEW.valor_apurado_investsus IS DISTINCT FROM OLD.valor_apurado_investsus OR
       NEW.total_publicado_municipal IS DISTINCT FROM OLD.total_publicado_municipal THEN
      RAISE EXCEPTION 'Memória financeira da 13ª confirmada: alteração direta bloqueada.'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_piso13_proteger_memoria_conferida
  ON public.piso_competencias;
CREATE TRIGGER trg_piso13_proteger_memoria_conferida
  BEFORE UPDATE OF competencia,investsus_resumo,valor_apurado_investsus,total_publicado_municipal
  ON public.piso_competencias
  FOR EACH ROW EXECUTE FUNCTION public.piso13_proteger_memoria_conferida();

COMMIT;
