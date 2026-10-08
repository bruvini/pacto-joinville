-- PVH — redução da esteira para 7 etapas + exclusão auditável
--
-- Mudanças:
-- 1) Recebimento do recurso no FMS deixa de ser etapa autônoma e passa a ser
--    um marco financeiro dentro da Etapa 2 (Portaria Municipal).
-- 2) Antigas etapas 5–8 tornam-se 4–7.
-- 3) Reconferência passa a trabalhar com 7 etapas.
-- 4) Exclusão de competência preserva logs sem violar FK durante cascatas.

-- ---------------------------------------------------------------------------
-- 1. Corrigir FK de auditoria
-- ---------------------------------------------------------------------------

ALTER TABLE public.historico_logs
  DROP CONSTRAINT IF EXISTS historico_logs_pvh_competencia_id_fkey;

ALTER TABLE public.historico_logs
  ADD CONSTRAINT historico_logs_pvh_competencia_id_fkey
  FOREIGN KEY (pvh_competencia_id)
  REFERENCES public.pvh_competencias(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Auditorias seguras em DELETE
--
-- Em exclusões em cascata, o pai pode já estar logicamente em remoção quando
-- um trigger filho tenta inserir o log. Por isso, eventos DELETE preservam o
-- UUID original dentro de detalhes, mas gravam pvh_competencia_id = NULL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pvh_audit_basico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  comp_log uuid;
  acao_text text;
  detalhes_json jsonb;
BEGIN
  SELECT nome
    INTO uname
    FROM public.profiles
   WHERE id = uid;

  IF TG_TABLE_NAME = 'pvh_competencias' THEN
    comp := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    comp := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.competencia_id
      ELSE NEW.competencia_id
    END;
  END IF;

  comp_log := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE comp END;
  acao_text := 'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME;

  detalhes_json := jsonb_strip_nulls(
    jsonb_build_object(
      'pvh_competencia_id_original', comp,
      'antes', CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
      'depois', CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES
    (comp_log, uid, uname, acao_text, detalhes_json);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_basico()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pvh_audit_documental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  comp_log uuid;
  documento uuid;
  row_json jsonb;
  old_json jsonb;
BEGIN
  SELECT nome
    INTO uname
    FROM public.profiles
   WHERE id = uid;

  IF TG_OP = 'DELETE' THEN
    row_json := NULL;
    old_json := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    row_json := to_jsonb(NEW);
    old_json := NULL;
  ELSE
    row_json := to_jsonb(NEW);
    old_json := to_jsonb(OLD);
  END IF;

  IF TG_TABLE_NAME = 'pvh_documentos' THEN
    comp := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.competencia_id
      ELSE NEW.competencia_id
    END;
  ELSIF TG_TABLE_NAME = 'pvh_documento_assinaturas' THEN
    documento := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.documento_id
      ELSE NEW.documento_id
    END;

    SELECT competencia_id
      INTO comp
      FROM public.pvh_documentos
     WHERE id = documento;
  END IF;

  comp_log := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE comp END;

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    comp_log,
    uid,
    uname,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(
      jsonb_build_object(
        'pvh_competencia_id_original', comp,
        'antes', old_json,
        'depois', row_json
      )
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_documental()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pvh_audit_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  comp uuid;
  comp_log uuid;
  row_json jsonb;
  old_json jsonb;
  v_empenho uuid;
  v_participante uuid;
  v_alocacao uuid;
BEGIN
  SELECT nome
    INTO uname
    FROM public.profiles
   WHERE id = uid;

  row_json := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  old_json := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  IF TG_TABLE_NAME = 'pvh_empenhos' THEN
    comp := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.solicitacao_competencia_id
      ELSE NEW.solicitacao_competencia_id
    END;

  ELSIF TG_TABLE_NAME = 'pvh_empenho_solicitacao_assinaturas' THEN
    v_empenho := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.empenho_id
      ELSE NEW.empenho_id
    END;

    SELECT solicitacao_competencia_id
      INTO comp
      FROM public.pvh_empenhos
     WHERE id = v_empenho;

  ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    v_participante := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.participante_id
      ELSE NEW.participante_id
    END;

    SELECT competencia_id
      INTO comp
      FROM public.pvh_participantes
     WHERE id = v_participante;

  ELSIF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    v_alocacao := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.alocacao_id
      ELSE NEW.alocacao_id
    END;

    SELECT pp.competencia_id
      INTO comp
      FROM public.pvh_empenho_alocacoes pa
      JOIN public.pvh_participantes pp
        ON pp.id = pa.participante_id
     WHERE pa.id = v_alocacao;
  ELSE
    comp := NULL;
  END IF;

  comp_log := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE comp END;

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    comp_log,
    uid,
    uname,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(
      jsonb_build_object(
        'pvh_competencia_id_original', comp,
        'antes', old_json,
        'depois', row_json
      )
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_audit_financeiro()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Migrar a numeração da esteira uma única vez
--
-- A constraint antiga ainda aceita etapa 8. Depois desta migration ela aceita
-- no máximo 7; isso funciona também como guarda para uma execução acidental
-- repetida do bloco de remapeamento.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pvh_documento_tipos'::regclass
       AND conname = 'pvh_documento_tipos_etapa_check'
       AND pg_get_constraintdef(oid) LIKE '%8%'
  ) THEN
    UPDATE public.pvh_competencias c
       SET etapas_concluidas = jsonb_strip_nulls(
             jsonb_build_object(
               '1', c.etapas_concluidas -> '1',
               '2', c.etapas_concluidas -> '2',
               '3', c.etapas_concluidas -> '3',
               '4', c.etapas_concluidas -> '5',
               '5', c.etapas_concluidas -> '6',
               '6', c.etapas_concluidas -> '7',
               '7', c.etapas_concluidas -> '8'
             )
           ),
           etapas_reconferir = COALESCE(
             (
               SELECT ARRAY(
                 SELECT DISTINCT nova_etapa
                   FROM (
                     SELECT CASE etapa
                       WHEN 1 THEN 1
                       WHEN 2 THEN 2
                       WHEN 3 THEN 3
                       -- A antiga Etapa 4 era o FMS. Como esse marco agora
                       -- impacta primeiro o Subempenho, qualquer reconferência
                       -- pendente nela converge para a nova Etapa 4.
                       WHEN 4 THEN 4
                       WHEN 5 THEN 4
                       WHEN 6 THEN 5
                       WHEN 7 THEN 6
                       WHEN 8 THEN 7
                       ELSE NULL
                     END AS nova_etapa
                     FROM unnest(
                       COALESCE(c.etapas_reconferir, '{}'::integer[])
                     ) AS etapa
                   ) remapeadas
                  WHERE nova_etapa IS NOT NULL
                  ORDER BY nova_etapa
               )
             ),
             '{}'::integer[]
           );

    UPDATE public.pvh_documento_tipos
       SET etapa = etapa - 1
     WHERE etapa BETWEEN 5 AND 8;
  END IF;
END;
$$;

ALTER TABLE public.pvh_documento_tipos
  DROP CONSTRAINT IF EXISTS pvh_documento_tipos_etapa_check;

ALTER TABLE public.pvh_documento_tipos
  ADD CONSTRAINT pvh_documento_tipos_etapa_check
  CHECK (etapa BETWEEN 1 AND 7);

-- ---------------------------------------------------------------------------
-- 4. Reconferência compatível com a nova esteira de 7 etapas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pvh_marcar_reconferencia(
  p_comp uuid,
  p_etapa integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_etapa < 1 OR p_etapa > 7 THEN
    RAISE EXCEPTION 'Etapa PVH inválida.';
  END IF;

  UPDATE public.pvh_competencias c
     SET etapas_reconferir = COALESCE(
       (
         SELECT ARRAY(
           SELECT DISTINCT etapa
             FROM (
               SELECT unnest(
                 COALESCE(c.etapas_reconferir, '{}'::integer[])
               ) AS etapa

               UNION ALL

               SELECT serie AS etapa
                 FROM generate_series(p_etapa, 7) AS serie
                WHERE COALESCE(
                  (c.etapas_concluidas ->> serie::text)::boolean,
                  false
                ) = true
             ) candidatos
            WHERE etapa BETWEEN 1 AND 7
            ORDER BY etapa
         )
       ),
       '{}'::integer[]
     )
   WHERE c.id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_marcar_reconferencia(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_marcar_reconferencia(uuid, integer)
  TO authenticated, service_role;

-- Limpeza defensiva de qualquer marca residual fora da nova faixa.
UPDATE public.pvh_competencias c
   SET etapas_reconferir = COALESCE(
     (
       SELECT ARRAY(
         SELECT DISTINCT etapa
           FROM unnest(
             COALESCE(c.etapas_reconferir, '{}'::integer[])
           ) AS etapa
          WHERE etapa BETWEEN 1 AND 7
            AND COALESCE(
              (c.etapas_concluidas ->> etapa::text)::boolean,
              false
            ) = true
          ORDER BY etapa
       )
     ),
     '{}'::integer[]
   );
