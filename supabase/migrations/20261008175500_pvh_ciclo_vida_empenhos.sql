-- PVH — ciclo de vida das Notas de Empenho ao excluir competência
--
-- Corrige dois problemas:
-- 1) uma NE criada exclusivamente dentro de uma competência excluída não deve
--    reaparecer como se já estivesse lançada quando a mesma competência for
--    aberta novamente;
-- 2) NEs realmente reutilizadas por outras competências continuam preservadas,
--    mantendo a modelagem N:N e a integridade histórica.
--
-- Também cria uma exclusão controlada para registros órfãos antigos, gerados
-- antes desta correção, desde que não possuam origem nem qualquer alocação.

-- ============================================================================
-- 1. Exclusão da competência: apagar NEs exclusivas e preservar NEs reutilizadas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_excluir_competencia(
  p_comp uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_competencia text;
  v_empenhos_exclusivos uuid[] := '{}'::uuid[];
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Somente administradores podem excluir competências do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT competencia
    INTO v_competencia
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  -- Captura as NEs cuja Solicitação nasceu nesta competência e que NÃO foram
  -- reaproveitadas por participante de outra competência. Essas NEs pertencem
  -- exclusivamente ao processo que está sendo apagado.
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[])
    INTO v_empenhos_exclusivos
    FROM public.pvh_empenhos e
   WHERE e.solicitacao_competencia_id = p_comp
     AND NOT EXISTS (
       SELECT 1
         FROM public.pvh_empenho_alocacoes a
         JOIN public.pvh_participantes p
           ON p.id = a.participante_id
        WHERE a.empenho_id = e.id
          AND p.competencia_id <> p_comp
     );

  -- Assinaturas da Etapa 2 usam RESTRICT.
  DELETE FROM public.pvh_documento_assinaturas a
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_documentos d
      WHERE d.id = a.documento_id
        AND d.competencia_id = p_comp
   );

  -- Assinaturas da Etapa 4 também usam RESTRICT e precisam sair antes dos
  -- subempenhos da competência.
  DELETE FROM public.pvh_subempenho_assinaturas sa
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_subempenhos s
       JOIN public.pvh_empenho_alocacoes a
         ON a.id = s.alocacao_id
       JOIN public.pvh_participantes p
         ON p.id = a.participante_id
      WHERE s.id = sa.subempenho_id
        AND p.competencia_id = p_comp
   );

  DELETE FROM public.pvh_subempenhos s
   WHERE EXISTS (
     SELECT 1
       FROM public.pvh_empenho_alocacoes a
       JOIN public.pvh_participantes p
         ON p.id = a.participante_id
      WHERE a.id = s.alocacao_id
        AND p.competencia_id = p_comp
   );

  -- Para NEs exclusivas desta competência, removemos primeiro assinaturas e
  -- alocações protegidas por RESTRICT e só depois a própria NE.
  DELETE FROM public.pvh_empenho_solicitacao_assinaturas s
   WHERE s.empenho_id = ANY(v_empenhos_exclusivos);

  DELETE FROM public.pvh_empenho_alocacoes a
   WHERE a.empenho_id = ANY(v_empenhos_exclusivos);

  DELETE FROM public.pvh_empenhos e
   WHERE e.id = ANY(v_empenhos_exclusivos);

  -- NEs reutilizadas em outras competências NÃO estão no array acima. Ao
  -- apagar a competência, o FK ON DELETE SET NULL apenas remove a referência
  -- de origem; suas alocações em outras competências continuam intactas.
  DELETE FROM public.pvh_competencias
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_competencia(uuid)
  TO authenticated, service_role;


-- ============================================================================
-- 2. Limpeza controlada de NE órfã criada antes desta correção
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvh_excluir_empenho_orfao(
  p_empenho uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.pvh_empenhos%ROWTYPE;
  v_nome text;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir registro de empenho sem vínculo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_emp
    FROM public.pvh_empenhos
   WHERE id = p_empenho
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota de Empenho não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_emp.solicitacao_competencia_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Esta Nota de Empenho ainda possui competência de origem. Exclua o fluxo pela própria competência.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
     WHERE a.empenho_id = p_empenho
  ) THEN
    RAISE EXCEPTION
      'Esta Nota de Empenho possui alocação ativa e não pode ser excluída como órfã.'
      USING ERRCODE = '23514';
  END IF;

  SELECT nome
    INTO v_nome
    FROM public.profiles
   WHERE id = auth.uid();

  INSERT INTO public.historico_logs (
    pvh_competencia_id,
    usuario_id,
    usuario_nome,
    acao,
    detalhes
  )
  VALUES (
    NULL,
    auth.uid(),
    v_nome,
    'PVH · exclusão controlada de empenho sem vínculo',
    jsonb_build_object('empenho', to_jsonb(v_emp))
  );

  DELETE FROM public.pvh_empenho_solicitacao_assinaturas
   WHERE empenho_id = p_empenho;

  DELETE FROM public.pvh_empenhos
   WHERE id = p_empenho;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_excluir_empenho_orfao(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_excluir_empenho_orfao(uuid)
  TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';
