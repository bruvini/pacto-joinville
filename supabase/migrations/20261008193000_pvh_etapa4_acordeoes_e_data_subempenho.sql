-- PVH — Etapa 4: Aviso de Movimento — Subempenho exige data
--
-- A UI passa a tratar as três partes da cadeia como subetapas com conclusão
-- objetiva. Para a terceira subetapa, Nº SEI + Link SEI + data do aviso são
-- obrigatórios. A validação também fica no banco para não depender da tela.

CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa4(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 4 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE((v_comp.etapas_concluidas ->> '2')::boolean, false)
       IS DISTINCT FROM true
     OR COALESCE((v_comp.etapas_concluidas ->> '3')::boolean, false)
       IS DISTINCT FROM true
     OR 2 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[]))
     OR 3 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[]))
  THEN
    RAISE EXCEPTION
      'Conclua e reconfira as Etapas 2 e 3 antes de concluir o Subempenho.'
      USING ERRCODE = '23514';
  END IF;

  IF v_comp.recurso_fms_data IS NULL
     OR COALESCE(v_comp.recurso_fms_valor, 0) <= 0
     OR NULLIF(btrim(v_comp.recurso_fms_referencia), '') IS NULL
     OR NULLIF(btrim(v_comp.recurso_fms_link), '') IS NULL
     OR (
       v_comp.recurso_fms_link !~* '^https?://'
       AND v_comp.recurso_fms_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
     )
     OR abs(
       COALESCE(v_comp.recurso_fms_valor, 0)
       - COALESCE(
           (
             SELECT SUM(p.valor_estadual)
               FROM public.pvh_participantes p
              WHERE p.competencia_id = p_comp
           ),
           0
         )
     ) >= 0.01
  THEN
    RAISE EXCEPTION
      'O recebimento no FMS precisa estar completo antes da Etapa 4.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui Notas de Empenho vinculadas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE p.competencia_id = p_comp
       AND (
         (
           SELECT count(*)
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
         ) <> 1
         OR EXISTS (
           SELECT 1
             FROM public.pvh_subempenhos s
            WHERE s.alocacao_id = a.id
              AND (
                abs(s.valor - a.valor_alocado) >= 0.01
                OR NULLIF(btrim(s.solicitacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.solicitacao_sei_link), '') IS NULL
                OR (
                  s.solicitacao_sei_link !~* '^https?://'
                  AND s.solicitacao_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
                OR NULLIF(btrim(s.movimento_liquidacao_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_liquidacao_sei_link), '') IS NULL
                OR (
                  s.movimento_liquidacao_sei_link !~* '^https?://'
                  AND s.movimento_liquidacao_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
                OR s.movimento_liquidacao_encaminhado_sefaz IS DISTINCT FROM true
                OR NULLIF(btrim(s.movimento_subempenho_sei_numero), '') IS NULL
                OR NULLIF(btrim(s.movimento_subempenho_sei_link), '') IS NULL
                OR (
                  s.movimento_subempenho_sei_link !~* '^https?://'
                  AND s.movimento_subempenho_sei_link !~* '^[^[:space:]]+\.[^[:space:]]{2,}'
                )
                OR s.movimento_subempenho_data IS NULL
                OR NOT EXISTS (
                  SELECT 1
                    FROM public.pvh_subempenho_assinaturas ass
                   WHERE ass.subempenho_id = s.id
                     AND ass.documento_tipo = 'solicitacao'
                     AND ass.slot = 'comissao'
                     AND ass.revogado_em IS NULL
                )
                OR NOT EXISTS (
                  SELECT 1
                    FROM public.pvh_subempenho_assinaturas ass
                   WHERE ass.subempenho_id = s.id
                     AND ass.documento_tipo = 'movimento_liquidacao'
                     AND ass.slot = 'comissao'
                     AND ass.revogado_em IS NULL
                )
              )
         )
       )
  ) THEN
    RAISE EXCEPTION
      'Cada Nota de Empenho precisa possuir exatamente uma cadeia de Subempenho/Liquidação completa, incluindo a data do Aviso de Movimento — Subempenho.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{4}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           4
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa4(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa4(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
