-- Não altera registros. Libera as etapas em paralelo e preserva as validações de encerramento.
BEGIN;

-- Programação completa da competência (independente da NE utilizada).
CREATE OR REPLACE FUNCTION public.piso_programacao_pagamento_pronta(p_competencia uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.piso_documentos pr
    JOIN public.piso_obrigacoes o ON o.id=pr.obrigacao_id
    JOIN public.piso_participantes p ON p.id=o.participante_id
    WHERE p.competencia_id=p_competencia AND pr.competencia_id=p_competencia
      AND pr.tipo='programacao_pagamento'
      AND NULLIF(btrim(pr.numero_sei),'') IS NOT NULL
      AND btrim(pr.link_sei) ~* '^(https?://)?(([a-z0-9-]+\.)+[a-z0-9-]+|localhost)(:[0-9]+)?([/?#][^[:space:]]*)?$'
      AND pr.data_documento IS NOT NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.piso_programacao_pagamento_pronta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piso_programacao_pagamento_pronta(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.piso_bloquear_anulacao_sem_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.tipo IN ('solicitacao_anulacao','aviso_anulacao') AND NOT (
    EXISTS (
      SELECT 1 FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE o.id=NEW.obrigacao_id AND p.competencia_id=NEW.competencia_id
    ) AND public.piso_programacao_pagamento_pronta(NEW.competencia_id)
  ) THEN
    RAISE EXCEPTION 'Registre ao menos uma Programação de pagamento completa na competência.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_validar_dependencias_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  n integer;
  requisito integer;
  requisitos integer[];
  precisa_validar boolean;
BEGIN
  FOR n IN 1..10 LOOP
    IF n = 1 AND NEW.tipo_parcela = 'decimo_terceiro'
      AND NEW.etapas_concluidas ->> '1' = 'true'
      AND OLD.etapas_concluidas ->> '1' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Etapa 1 mensal não é aplicável à 13ª parcela do Piso.'
        USING ERRCODE = '23514';
    END IF;

    precisa_validar := NEW.etapas_concluidas ->> n::text = 'true'
      AND (
        OLD.etapas_concluidas ->> n::text IS DISTINCT FROM 'true'
        OR (
          n = ANY(COALESCE(OLD.etapas_reconferir, ARRAY[]::integer[]))
          AND NOT (n = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[])))
        )
      );
    IF precisa_validar IS NOT TRUE THEN CONTINUE; END IF;

    requisitos := CASE n
      WHEN 2 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[]::integer[] ELSE ARRAY[1] END
      WHEN 3 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2] ELSE ARRAY[1,2] END
      WHEN 4 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3] ELSE ARRAY[1,2,3] END
      WHEN 6 THEN ARRAY[5]
      WHEN 7 THEN ARRAY[5,6]
      WHEN 8 THEN ARRAY[5,6]
      WHEN 10 THEN ARRAY[5,6]
      WHEN 9 THEN CASE WHEN NEW.tipo_parcela = 'decimo_terceiro'
        THEN ARRAY[2,3,4,5,6,7,8]
        ELSE ARRAY[1,2,3,4,5,6,7,8] END
      ELSE ARRAY[]::integer[]
    END;

    -- A 7A é obrigatória somente quando existe excedente real de empenho.
    -- Em competências antigas, nenhum valor empenhado foi declarado:
    -- isso NÃO retroage uma obrigação inexistente.
    IF n = 9 AND EXISTS (
      SELECT 1
      FROM public.piso_obrigacoes o
      JOIN public.piso_participantes p ON p.id=o.participante_id
      WHERE p.competencia_id=NEW.id
        AND o.valor_empenhado IS NOT NULL AND o.valor_a_liquidar IS NOT NULL
        AND o.valor_empenhado-o.valor_a_liquidar > 0.009
    ) THEN
      requisitos := array_append(requisitos,10);
    END IF;
    IF n IN (8,9,10) AND NOT public.piso_programacao_pagamento_pronta(NEW.id) THEN
      RAISE EXCEPTION 'Registre ao menos uma Programação de pagamento completa na competência.'
        USING ERRCODE='23514';
    END IF;
    IF n=10 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
      ) THEN
        RAISE EXCEPTION 'A etapa 7A só é aplicável com excedente confirmado de empenho.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.piso_obrigacoes o
        JOIN public.piso_participantes p ON p.id=o.participante_id
        LEFT JOIN public.piso_documentos s
          ON s.obrigacao_id=o.id AND s.tipo='solicitacao_anulacao'
        LEFT JOIN public.piso_documentos a
          ON a.obrigacao_id=o.id AND a.tipo='aviso_anulacao'
        WHERE p.competencia_id=NEW.id
          AND o.valor_empenhado-o.valor_a_liquidar>0.009
          AND (
            o.valor_anulado IS NULL OR abs(o.valor_anulado-(o.valor_empenhado-o.valor_a_liquidar))>0.01
            OR s.numero_sei IS NULL OR s.link_sei IS NULL OR s.data_documento IS NULL
            OR a.numero_sei IS NULL OR a.link_sei IS NULL OR a.data_documento IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.piso_encaminhamentos e
              WHERE e.documento_id=s.id AND e.acao='encaminhado'
              AND NOT EXISTS(SELECT 1 FROM public.piso_encaminhamentos e2
                WHERE e2.documento_id=e.documento_id AND e2.ocorrido_em>e.ocorrido_em))
            OR EXISTS (
              SELECT 1 FROM public.piso_assinatura_matriz m
              WHERE m.tipo_documento='solicitacao_anulacao' AND NOT m.opcional
                AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas sig
                  WHERE sig.documento_id=s.id AND sig.slot=m.slot_key)
            )
          )
      ) THEN
        RAISE EXCEPTION 'Anulação de empenho incompleta: confira valor, documento assinado, envio SEFAZ e aviso.';
      END IF;
    END IF;
    FOREACH requisito IN ARRAY requisitos LOOP
      IF NEW.etapas_concluidas ->> requisito::text IS DISTINCT FROM 'true'
        OR requisito = ANY(COALESCE(NEW.etapas_reconferir, ARRAY[]::integer[]))
      THEN
        RAISE EXCEPTION 'Etapa % do Piso depende da Etapa % concluída e sem reconferência.', n, requisito
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_marcar_reconferencia(p_comp uuid, p_etapa integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  dependentes integer[];
  novas integer[];
BEGIN
  dependentes := CASE p_etapa
    WHEN 1 THEN ARRAY[2,3,4,9]
    WHEN 2 THEN ARRAY[3,4,9]
    WHEN 3 THEN ARRAY[4,9]
    WHEN 4 THEN ARRAY[9]
    WHEN 5 THEN ARRAY[6,7,10,8,9]
    WHEN 6 THEN ARRAY[7,10,8,9]
    WHEN 7 THEN CASE WHEN public.piso_programacao_pagamento_pronta(p_comp)
      THEN ARRAY[9] ELSE ARRAY[10,8,9] END
    WHEN 10 THEN ARRAY[9]
    WHEN 8 THEN ARRAY[9]
    ELSE ARRAY[]::integer[]
  END;
  IF cardinality(dependentes) = 0 THEN RETURN; END IF;

  SELECT COALESCE(array_agg(DISTINCT n ORDER BY n), ARRAY[]::integer[])
    INTO novas
    FROM public.piso_competencias c
    CROSS JOIN LATERAL unnest(dependentes) AS dep(n)
   WHERE c.id = p_comp
     AND c.status <> 'encerrada'
     AND (c.tipo_parcela IS DISTINCT FROM 'decimo_terceiro' OR n >= 2)
     AND c.etapas_concluidas ->> n::text = 'true'
     AND NOT (n = ANY(COALESCE(c.etapas_reconferir, ARRAY[]::integer[])));

  IF cardinality(novas) > 0 THEN
    UPDATE public.piso_competencias c
       SET etapas_reconferir = (
         SELECT array_agg(DISTINCT etapa ORDER BY etapa)
           FROM unnest(COALESCE(c.etapas_reconferir, ARRAY[]::integer[]) || novas) AS x(etapa)
       )
     WHERE c.id = p_comp AND c.status <> 'encerrada';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piso_notificacao_email_validar_escopo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_competencia uuid;
  v_email text;
BEGIN
  SELECT p.competencia_id
    INTO v_competencia
    FROM public.piso_participantes p
    WHERE p.id = NEW.participante_id;

  IF v_competencia IS NULL THEN
    RAISE EXCEPTION 'Participante do Piso não encontrado.' USING ERRCODE = '23503';
  END IF;

  IF NEW.competencia_id IS DISTINCT FROM v_competencia THEN
    RAISE EXCEPTION 'A notificação deve pertencer à mesma competência do participante.'
      USING ERRCODE = '23514';
  END IF;

  IF (TG_OP = 'INSERT' OR (NEW.enviado_em IS NOT NULL AND OLD.enviado_em IS NULL))
    AND NOT public.piso_programacao_pagamento_pronta(NEW.competencia_id)
  THEN
    RAISE EXCEPTION 'Registre ao menos uma Programação de pagamento completa na competência.'
      USING ERRCODE='23514';
  END IF;

  FOREACH v_email IN ARRAY COALESCE(NEW.destinatarios, '{}'::text[]) LOOP
    IF v_email IS NULL
      OR v_email <> lower(btrim(v_email))
      OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN
      RAISE EXCEPTION 'Destinatário de e-mail inválido: %', COALESCE(v_email, '[nulo]')
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NEW.enviado_em IS NOT NULL THEN
    IF cardinality(COALESCE(NEW.destinatarios, '{}'::text[])) = 0
      OR btrim(COALESCE(NEW.assunto, '')) = ''
      OR btrim(COALESCE(NEW.corpo, '')) = ''
      OR NEW.enviado_por IS NULL
      OR btrim(COALESCE(NEW.enviado_por_nome, '')) = ''
    THEN
      RAISE EXCEPTION 'O envio exige destinatário, assunto, corpo e responsável.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.enviado_em IS NOT NULL AND NEW.enviado_em IS NOT NULL THEN
    IF NEW.destinatarios IS DISTINCT FROM OLD.destinatarios
      OR NEW.assunto IS DISTINCT FROM OLD.assunto
      OR NEW.corpo IS DISTINCT FROM OLD.corpo
      OR NEW.enviado_em IS DISTINCT FROM OLD.enviado_em
      OR NEW.enviado_por IS DISTINCT FROM OLD.enviado_por
      OR NEW.enviado_por_nome IS DISTINCT FROM OLD.enviado_por_nome
    THEN
      RAISE EXCEPTION 'Reabra o registro do envio antes de alterar destinatários ou conteúdo.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.enviado_em IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.enviado_em IS NULL)
    AND auth.uid() IS NOT NULL
    AND NEW.enviado_por IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'O responsável pelo envio deve ser o usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
