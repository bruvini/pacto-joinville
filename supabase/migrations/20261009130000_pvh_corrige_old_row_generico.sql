-- PVH: correção definitiva de OLD.participante_id e afins.
-- Executar no SQL Editor APÓS 20261009100000. Não altera dados.
BEGIN;

CREATE OR REPLACE FUNCTION public.pvh_bloquear_filho_encerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp uuid;
  v_part uuid;
  v_alocacao uuid;
  v_sub uuid;
  v_doc uuid;
  -- A mesma função de trigger atende tabelas com ROWTYPEs distintos.
  v_antigo jsonb;
  v_novo jsonb;
BEGIN
  v_antigo := CASE WHEN TG_OP = 'INSERT'
    THEN '{}'::jsonb ELSE COALESCE(to_jsonb(OLD), '{}'::jsonb) END;
  v_novo := CASE WHEN TG_OP = 'DELETE'
    THEN '{}'::jsonb ELSE COALESCE(to_jsonb(NEW), '{}'::jsonb) END;
  IF TG_TABLE_NAME IN (
    'pvh_participantes','pvh_documentos','pvh_pagamentos','pvh_notificacoes_email'
  ) THEN
    v_comp := CASE WHEN TG_OP = 'DELETE'
      THEN (v_antigo ->> 'competencia_id')::uuid ELSE (v_novo ->> 'competencia_id')::uuid END;
  ELSIF TG_TABLE_NAME = 'pvh_documento_assinaturas' THEN
    v_doc := CASE WHEN TG_OP = 'DELETE'
      THEN (v_antigo ->> 'documento_id')::uuid ELSE (v_novo ->> 'documento_id')::uuid END;
    SELECT competencia_id INTO v_comp FROM public.pvh_documentos WHERE id = v_doc;
  ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    v_part := CASE WHEN TG_OP = 'DELETE'
      THEN (v_antigo ->> 'participante_id')::uuid ELSE (v_novo ->> 'participante_id')::uuid END;
    SELECT competencia_id INTO v_comp FROM public.pvh_participantes WHERE id = v_part;
  ELSIF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    v_alocacao := CASE WHEN TG_OP = 'DELETE'
      THEN (v_antigo ->> 'alocacao_id')::uuid ELSE (v_novo ->> 'alocacao_id')::uuid END;
    SELECT p.competencia_id INTO v_comp
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE a.id = v_alocacao;
  ELSIF TG_TABLE_NAME = 'pvh_subempenho_assinaturas' THEN
    v_sub := CASE WHEN TG_OP = 'DELETE'
      THEN (v_antigo ->> 'subempenho_id')::uuid ELSE (v_novo ->> 'subempenho_id')::uuid END;
    SELECT p.competencia_id INTO v_comp
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
      JOIN public.pvh_participantes p ON p.id = a.participante_id
     WHERE s.id = v_sub;
  END IF;

  -- Em UPDATE, verifica também o vínculo anterior para impedir que um
  -- registro seja movido de uma competência já encerrada para outra.
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME IN (
      'pvh_participantes','pvh_documentos','pvh_pagamentos','pvh_notificacoes_email'
    ) THEN
      IF (v_antigo ->> 'competencia_id')::uuid IS DISTINCT FROM (v_novo ->> 'competencia_id')::uuid THEN
        IF EXISTS (
          SELECT 1 FROM public.pvh_competencias
           WHERE id = (v_antigo ->> 'competencia_id')::uuid AND status = 'encerrada'
           FOR NO KEY UPDATE
        ) THEN
          RAISE EXCEPTION 'O vínculo anterior pertence a uma competência PVH encerrada.'
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF TG_TABLE_NAME = 'pvh_documento_assinaturas'
      AND (v_antigo ->> 'documento_id')::uuid IS DISTINCT FROM (v_novo ->> 'documento_id')::uuid THEN
      IF EXISTS (
        SELECT 1 FROM public.pvh_documentos d
        JOIN public.pvh_competencias c ON c.id = d.competencia_id
        WHERE d.id = (v_antigo ->> 'documento_id')::uuid AND c.status = 'encerrada'
      ) THEN
        RAISE EXCEPTION 'Não é permitido mover assinatura de competência encerrada.'
          USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'pvh_empenho_alocacoes'
      AND (v_antigo ->> 'participante_id')::uuid IS DISTINCT FROM (v_novo ->> 'participante_id')::uuid THEN
      IF EXISTS (
        SELECT 1 FROM public.pvh_participantes p
        JOIN public.pvh_competencias c ON c.id = p.competencia_id
        WHERE p.id = (v_antigo ->> 'participante_id')::uuid AND c.status = 'encerrada'
      ) THEN
        RAISE EXCEPTION 'Não é permitido mover alocação de competência encerrada.'
          USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'pvh_subempenhos'
      AND (v_antigo ->> 'alocacao_id')::uuid IS DISTINCT FROM (v_novo ->> 'alocacao_id')::uuid THEN
      IF EXISTS (
        SELECT 1 FROM public.pvh_empenho_alocacoes a
        JOIN public.pvh_participantes p ON p.id = a.participante_id
        JOIN public.pvh_competencias c ON c.id = p.competencia_id
        WHERE a.id = (v_antigo ->> 'alocacao_id')::uuid AND c.status = 'encerrada'
      ) THEN
        RAISE EXCEPTION 'Não é permitido mover subempenho de competência encerrada.'
          USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'pvh_subempenho_assinaturas'
      AND (v_antigo ->> 'subempenho_id')::uuid IS DISTINCT FROM (v_novo ->> 'subempenho_id')::uuid THEN
      IF EXISTS (
        SELECT 1 FROM public.pvh_subempenhos s
        JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
        JOIN public.pvh_participantes p ON p.id = a.participante_id
        JOIN public.pvh_competencias c ON c.id = p.competencia_id
        WHERE s.id = (v_antigo ->> 'subempenho_id')::uuid AND c.status = 'encerrada'
      ) THEN
        RAISE EXCEPTION 'Não é permitido mover assinatura de subempenho encerrado.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pvh_competencias
     WHERE id = v_comp AND status = 'encerrada'
     FOR NO KEY UPDATE
  ) THEN
    RAISE EXCEPTION
      'Competência PVH encerrada: reabra-a formalmente antes de alterar seus registros.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


REVOKE ALL ON FUNCTION public.pvh_bloquear_filho_encerrado()
  FROM PUBLIC, anon, authenticated;

-- Verificação não destrutiva: aponta eventuais funções documentais
-- vinculadas incorretamente a tabelas operacionais.
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname tabela, t.tgname gatilho, p.proname funcao
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
      AND c.relname LIKE 'pvh_%'
      AND c.relname NOT IN ('pvh_documentos', 'pvh_documento_assinaturas')
      AND p.proname IN ('pvh_audit_documental', 'pvh_reconferir_documento_etapa2')
  LOOP
    RAISE WARNING 'Revisar associação de gatilho documental %.%: %', v.tabela, v.gatilho, v.funcao;
  END LOOP;
END;
$$;

-- Auditoria financeira vinculada à competência de origem sempre que possível.
-- Preserva as tabelas globais de NEs reutilizáveis: o vínculo mensal continua
-- sendo atribuído pelas alocações/subempenhos, sem reescrever NEs antigas.
CREATE OR REPLACE FUNCTION public.pvh_audit_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_nome text;
  v_comp uuid;
  v_atual jsonb;
  v_anterior jsonb;
  v_ref uuid;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_usuario;
  v_atual := CASE WHEN TG_OP = 'DELETE'
    THEN NULL ELSE to_jsonb(NEW) END;
  v_anterior := CASE WHEN TG_OP = 'INSERT'
    THEN NULL ELSE to_jsonb(OLD) END;

  IF TG_TABLE_NAME = 'pvh_empenho_alocacoes' THEN
    v_ref := (COALESCE(v_atual, v_anterior) ->> 'participante_id')::uuid;
    SELECT competencia_id INTO v_comp
      FROM public.pvh_participantes WHERE id = v_ref;
  ELSIF TG_TABLE_NAME = 'pvh_subempenhos' THEN
    v_ref := (COALESCE(v_atual, v_anterior) ->> 'alocacao_id')::uuid;
    SELECT pp.competencia_id INTO v_comp
      FROM public.pvh_empenho_alocacoes a
      JOIN public.pvh_participantes pp ON pp.id = a.participante_id
     WHERE a.id = v_ref;
  ELSIF TG_TABLE_NAME = 'pvh_empenhos' THEN
    v_comp := (COALESCE(v_atual, v_anterior) ->> 'solicitacao_competencia_id')::uuid;
  END IF;

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    v_comp, v_usuario, v_nome,
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_strip_nulls(jsonb_build_object(
      'antes', v_anterior, 'depois', v_atual
    ))
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pvh_audit_financeiro()
  FROM PUBLIC, anon, authenticated;

-- Recupera o vínculo da competência dos eventos históricos de NEs que
-- possuem competência de solicitação registrada. Nenhum evento é criado,
-- apagado ou recebe data/responsável inventados.
UPDATE public.historico_logs h
   SET pvh_competencia_id = e.solicitacao_competencia_id
  FROM public.pvh_empenhos e
 WHERE h.pvh_competencia_id IS NULL
   AND h.acao IN (
     'PVH · insert: pvh_empenhos',
     'PVH · update: pvh_empenhos',
     'PVH · delete: pvh_empenhos'
   )
   AND e.solicitacao_competencia_id IS NOT NULL
   AND COALESCE(
     h.detalhes -> 'depois' ->> 'id',
     h.detalhes -> 'antes' ->> 'id'
   ) = e.id::text;

COMMIT;
