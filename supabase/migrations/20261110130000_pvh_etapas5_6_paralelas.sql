-- PVH — Etapas 5 e 6 paralelas, encerramento somente após ambas.
-- Correção compatível com o banco existente. Não altera registros financeiros,
-- comunicados já enviados nem flags das competências.
-- Etapa 6 depende de Etapa 4 concluída e da comunicação com SEI completo;
-- Etapa 5 pode permanecer pendente. A RPC de Etapa 7 continua exigindo 1..6.
BEGIN;

CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa6(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 6 do PVH.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_comp.status = 'encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada não admite nova conclusão de comunicação.'
      USING ERRCODE = '23514';
  END IF;

  -- Comunicação e pagamento são irmãos: ambos dependem da Etapa 4,
  -- mas NÃO um do outro. Não exigir conclusão nem reconferência da Etapa 5.
  IF COALESCE((v_comp.etapas_concluidas ->> '4')::boolean, false)
       IS DISTINCT FROM true
     OR 4 = ANY(COALESCE(v_comp.etapas_reconferir, '{}'::integer[]))
  THEN
    RAISE EXCEPTION 'Conclua e reconfira a Etapa 4 antes da comunicação.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pvh_participantes p
    WHERE p.competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'Competência sem instituições participantes.'
      USING ERRCODE = '23514';
  END IF;

  -- Mantém inalterada a validação das evidências originais da comunicação.
  -- Instituições com notificar_email=false não exigem e-mail.
  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND p.notificar_email = true
       AND NOT EXISTS (
         SELECT 1
           FROM public.pvh_notificacoes_email n
          WHERE n.participante_id = p.id
            AND n.enviado_em IS NOT NULL
            AND cardinality(COALESCE(n.destinatarios, '{}'::text[])) > 0
            AND NULLIF(btrim(n.assunto), '') IS NOT NULL
            AND NULLIF(btrim(n.corpo), '') IS NOT NULL
            AND NULLIF(btrim(n.processo_sei_numero), '') IS NOT NULL
            AND NULLIF(btrim(n.processo_sei_link), '') IS NOT NULL
            AND (
              n.processo_sei_link ~* '^https?://'
              OR n.processo_sei_link ~* '^[^[:space:]]+\.[^[:space:]]{2,}'
            )
            AND n.enviado_por IS NOT NULL
            AND NULLIF(btrim(n.enviado_por_nome), '') IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'Há instituição com comunicação obrigatória ainda pendente.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{6}', 'true'::jsonb, true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]), 6
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa6(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa6(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
