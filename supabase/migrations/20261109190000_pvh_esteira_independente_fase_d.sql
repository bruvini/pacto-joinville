-- PVH Fase D · Esteira independente (2 x 3) e bloqueio financeiro da 4.
-- Pré-requisito: Fase C instalada e validada.
-- Sem UPDATE em NE, alocações, subempenhos ou etapas neste deploy.
BEGIN;

-- Fase D: a reconferência da Etapa 2 não invalida a Etapa 3
-- apenas porque o FMS foi creditado ou uma referência SEI foi ajustada.
-- Mudanças de valor estadual continuam usando pvh_marcar_reconferencia(1).
CREATE OR REPLACE FUNCTION public.pvh_marcar_reconferencia_etapa2_financeira(
  p_comp uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.pvh_competencias c
     SET etapas_reconferir = ARRAY(
       SELECT DISTINCT etapa
         FROM (
           SELECT unnest(COALESCE(c.etapas_reconferir, '{}'::integer[])) AS etapa
           UNION ALL
           SELECT n AS etapa
           FROM unnest(ARRAY[2,4,5,6,7]::integer[]) AS n
           WHERE COALESCE((c.etapas_concluidas ->> n::text)::boolean, false)
         ) pendencias
        WHERE etapa BETWEEN 1 AND 7
        ORDER BY etapa
     )
   WHERE c.id = p_comp;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pvh_marcar_reconferencia_etapa2_financeira(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pvh_reconferir_etapa2_por_comp(
  p_comp uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pvh_competencias
     WHERE id = p_comp
       AND COALESCE((etapas_concluidas ->> '2')::boolean, false)
  ) THEN
    PERFORM public.pvh_marcar_reconferencia_etapa2_financeira(p_comp);
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_etapa2_por_comp(uuid)
  FROM PUBLIC, anon, authenticated;

-- Preserva integralmente as conferências documentais e monetárias já existentes
-- da Etapa 3, trocando apenas a dependência indevida da Etapa 2.
CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa3(p_comp uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_part record;
  v_coberto numeric(16,2);
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION
      'Sem permissão para concluir a Etapa 3 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  -- Etapa 3 é documental/orçamentária e independe do crédito no FMS.
  -- Sua base é a Portaria Estadual concluída e a publicação municipal
  -- registrada, ainda que a Etapa 2 aguarde o ingresso financeiro.
  IF COALESCE((v_comp.etapas_concluidas ->> '1')::boolean, false)
       IS DISTINCT FROM true
     OR 1 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[])) THEN
    RAISE EXCEPTION
      'Conclua/reconfira a Portaria Estadual antes dos empenhos.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp.status = 'encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada não pode ser alterada.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pvh_participantes
     WHERE competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui instituições para conciliação.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_comp.portaria_municipal_numero), '') IS NULL
     OR v_comp.portaria_municipal_data IS NULL
     OR NULLIF(btrim(v_comp.portaria_municipal_link), '') IS NULL
     OR v_comp.portaria_municipal_link !~* '^https?://'
     OR NOT EXISTS (
       SELECT 1
         FROM public.pvh_documentos d
        WHERE d.competencia_id = p_comp
          AND d.tipo_codigo = 'portaria_municipal_publicada'
          AND d.numero = v_comp.portaria_municipal_numero
          AND d.data_documento = v_comp.portaria_municipal_data
          AND d.link_documento = v_comp.portaria_municipal_link
          AND NULLIF(btrim(d.numero_sei), '') IS NOT NULL
          AND d.link_documento ~* '^https?://'
     )
  THEN
    RAISE EXCEPTION
      'Registre e confira a Portaria Municipal publicada, com número, data, Nº SEI e link, antes de concluir os empenhos. O crédito FMS pode continuar pendente.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_part IN
    SELECT
      p.id,
      COALESCE(
        p.valor_municipal,
        p.valor_estadual,
        0
      ) AS devido,
      pr.nome_instituicao
    FROM public.pvh_participantes p
    JOIN public.prestadores pr
      ON pr.id = p.prestador_id
    WHERE p.competencia_id = p_comp
  LOOP
    SELECT COALESCE(SUM(a.valor_alocado), 0)
      INTO v_coberto
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE a.participante_id = v_part.id
       AND e.status = 'ativo';

    IF v_part.devido <= 0
       OR abs(v_coberto - v_part.devido) >= 0.01 THEN
      RAISE EXCEPTION
        'A cobertura de empenho de % não fecha o valor da competência.',
        v_part.nome_instituicao
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND (
         e.status <> 'ativo'
         OR NULLIF(btrim(e.numero_ne), '') IS NULL
         OR e.numero_ne !~ '^\d{1,8}/\d{4}$'
         OR COALESCE(e.valor_total, 0) <= 0
         OR NULLIF(
              btrim(e.solicitacao_sei_numero),
              ''
            ) IS NULL
         OR NULLIF(
              btrim(e.solicitacao_sei_link),
              ''
            ) IS NULL
         OR e.solicitacao_sei_link !~* '^https?://'
         OR e.solicitacao_data IS NULL
         OR NULLIF(btrim(e.cr_dotacao), '') IS NULL
         OR NULLIF(btrim(e.fonte_recurso), '') IS NULL
         OR NULLIF(
              btrim(e.nota_empenho_sei_numero),
              ''
            ) IS NULL
         OR NULLIF(
              btrim(e.nota_empenho_sei_link),
              ''
            ) IS NULL
         OR e.nota_empenho_sei_link !~* '^https?://'
       )
  ) THEN
    RAISE EXCEPTION
      'Toda NE utilizada precisa ter Solicitação e Nota de Empenho integralmente rastreadas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p
        ON p.id = a.participante_id
      JOIN public.pvh_empenhos e
        ON e.id = a.empenho_id
     WHERE p.competencia_id = p_comp
       AND e.solicitacao_competencia_id IS NOT NULL
       AND (
         e.solicitacao_enviada_aco IS DISTINCT FROM true
         OR e.solicitacao_enviada_sefaz IS DISTINCT FROM true
         OR NOT public.pvh_assinaturas_obrigatorias_empenho_ok(e.id)
       )
  ) THEN
    RAISE EXCEPTION
      'Toda Solicitação nova precisa passar por SES.UFI.ACO, pelas três assinaturas obrigatórias e por SEFAZ.UCG.AEO antes da conclusão da Etapa 3.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(
             etapas_concluidas,
             '{}'::jsonb
           ),
           '{3}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(
             etapas_reconferir,
             '{}'::integer[]
           ),
           3
         )
   WHERE id = p_comp;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa3(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa3(uuid)
  TO authenticated, service_role;

-- Alteração do FMS afeta 2 e 4–7, mas não invalida empenhos já conferidos.
CREATE OR REPLACE FUNCTION public.pvh_reconferir_recurso_fms_etapa2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (
       OLD.recurso_fms_data
         IS DISTINCT FROM NEW.recurso_fms_data

       OR OLD.recurso_fms_valor
         IS DISTINCT FROM NEW.recurso_fms_valor

       OR OLD.recurso_fms_referencia
         IS DISTINCT FROM NEW.recurso_fms_referencia

       OR OLD.recurso_fms_link
         IS DISTINCT FROM NEW.recurso_fms_link
     )

     AND COALESCE(
       (
         OLD.etapas_concluidas
         ->> '2'
       )::boolean,
       false
     ) = true
  THEN
    PERFORM public.pvh_marcar_reconferencia_etapa2_financeira(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pvh_reconferir_recurso_fms_etapa2()
  FROM PUBLIC, anon, authenticated;

-- A regra de fechamento da Etapa 4 continua exigindo Etapas 2 e 3
-- sem reconferência, recebimento FMS conciliado e cadeia SEI completa.
-- Não alterar pvh_concluir_etapa4 nesta fase.
COMMIT;
