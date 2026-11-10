-- PVH · homologação integrada C/D/E · hardening da preparação da Etapa 4.
-- Encontrado em auditoria de 10/11/2026: UI exigia cobertura integral,
-- mas public.pvh_preparar_etapa4 podia criar cadeias com cobertura parcial.
-- Não altera dados existentes; corrige somente a função RPC.
-- Aplicar após Fases C, D e E em homologação com backup verificado.
BEGIN;

CREATE OR REPLACE FUNCTION public.pvh_preparar_etapa4(p_comp uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_part record;
  v_devido numeric(16,2);
  v_coberto numeric(16,2);
  v_invalido integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
     auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para preparar a Etapa 4.'
    USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_comp FROM public.pvh_competencias WHERE id=p_comp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
    USING ERRCODE='23503';
  END IF;
  IF v_comp.status='encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada não admite novas cadeias de subempenho.'
    USING ERRCODE='23514';
  END IF;
  IF COALESCE((v_comp.etapas_concluidas->>'1')::boolean,false) IS DISTINCT FROM true
    OR 1=ANY(COALESCE(v_comp.etapas_reconferir,'{}'::integer[])) THEN
    RAISE EXCEPTION 'Conclua e confira a Portaria Estadual antes de preparar subempenhos.'
    USING ERRCODE='23514';
  END IF;

  -- Exige o MESMO fato oficial utilizado pela Fase D, mas NÃO exige FMS.
  IF NULLIF(btrim(COALESCE(v_comp.portaria_municipal_numero,'')),'') IS NULL
     OR v_comp.portaria_municipal_data IS NULL
     OR NULLIF(btrim(COALESCE(v_comp.portaria_municipal_link,'')),'') IS NULL
     OR v_comp.portaria_municipal_link !~* '^https?://'
     OR NOT EXISTS (
       SELECT 1 FROM public.pvh_documentos d
       WHERE d.competencia_id=p_comp
         AND d.tipo_codigo='portaria_municipal_publicada'
         AND d.numero=v_comp.portaria_municipal_numero
         AND d.data_documento=v_comp.portaria_municipal_data
         AND d.link_documento=v_comp.portaria_municipal_link
         AND NULLIF(btrim(COALESCE(d.numero_sei,'')),'') IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'Portaria Municipal publicada, documento SEI e data devem estar consistentes.'
    USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pvh_participantes WHERE competencia_id=p_comp) THEN
    RAISE EXCEPTION 'Competência sem instituições participantes.'
    USING ERRCODE='23514';
  END IF;

  -- Sincronização é transacional; se qualquer instituição ficar com
  -- cobertura incompleta, todo o preparo falha e as novas alocações são revertidas.
  PERFORM public.pvh_sincronizar_cobertura_competencia(p_comp);

  FOR v_part IN
    SELECT id,prestador_id
    FROM public.pvh_participantes
    WHERE competencia_id=p_comp
    ORDER BY prestador_id,id
  LOOP
    -- Mesma chave e ordem de bloqueio por prestador da Fase C.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('pvh-ne-prestador:' || v_part.prestador_id::text,0)
    );

    SELECT COALESCE(valor_municipal,valor_estadual) INTO v_devido
    FROM public.pvh_participantes WHERE id=v_part.id FOR UPDATE;

    SELECT COALESCE(SUM(a.valor_alocado),0),
           COUNT(*) FILTER (WHERE
             e.status <> 'ativo' OR NULLIF(btrim(e.numero_ne),'') IS NULL
             OR e.prestador_id IS DISTINCT FROM v_part.prestador_id
           )
    INTO v_coberto,v_invalido
    FROM public.pvh_empenho_alocacoes a
    JOIN public.pvh_empenhos e ON e.id=a.empenho_id
    WHERE a.participante_id=v_part.id;

    IF COALESCE(v_devido,0) <= 0
       OR abs(v_coberto-v_devido) >= 0.01 OR v_invalido>0 THEN
      RAISE EXCEPTION 'Cobertura da instituição incompleta ou inconsistente: não é permitido preparar a Etapa 4.'
      USING ERRCODE='23514';
    END IF;

    INSERT INTO public.pvh_subempenhos (alocacao_id,valor,created_by)
      SELECT a.id,a.valor_alocado,auth.uid()
      FROM public.pvh_empenho_alocacoes a
      WHERE a.participante_id=v_part.id
        AND NOT EXISTS (
          SELECT 1 FROM public.pvh_subempenhos s WHERE s.alocacao_id=a.id
        );
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pvh_preparar_etapa4(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pvh_preparar_etapa4(uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
