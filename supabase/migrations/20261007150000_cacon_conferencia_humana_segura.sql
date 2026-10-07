-- Conferência humana segura da Dieta CACON.
--
-- O trigger cacon_bloquear_resultados_derivados continua protegendo os campos
-- derivados do PDF contra UPDATE direto pelo navegador. As ações humanas
-- autorizadas passam por RPCs SECURITY DEFINER estreitas e auditáveis.

CREATE OR REPLACE FUNCTION public.cacon_confirmar_extracao(
  p_competencia uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comp public.cacon_competencias%ROWTYPE;
  v_nome text;
  v_extracao jsonb;
  v_criticas int;
BEGIN
  IF v_uid IS NULL
     OR NOT public.has_any_role(v_uid, ARRAY['admin','acp']::app_role[]) THEN
    RAISE EXCEPTION 'Apenas Admin ou ACP podem confirmar a extração CACON.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.cacon_competencias
   WHERE id = p_competencia
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência CACON não encontrada.';
  END IF;

  IF v_comp.processado_em IS NULL THEN
    RAISE EXCEPTION 'Não há extração processada para confirmar.';
  END IF;

  v_criticas := COALESCE((v_comp.auditoria->>'criticas')::int, 0);
  IF v_criticas > 0 THEN
    RAISE EXCEPTION 'Resolva as críticas bloqueantes antes de confirmar a extração.';
  END IF;

  SELECT COALESCE(NULLIF(nome, ''), email)
    INTO v_nome
    FROM public.profiles
   WHERE id = v_uid;

  v_nome := COALESCE(v_nome, 'Usuário');
  v_extracao :=
    COALESCE(v_comp.extracao, '{}'::jsonb)
    || jsonb_build_object(
      'versao', 3,
      'status', 'confirmada',
      'confirmada_em', now(),
      'confirmada_por', v_uid,
      'confirmada_por_nome', v_nome
    );

  UPDATE public.cacon_competencias
     SET extracao = v_extracao,
         updated_by = v_uid
   WHERE id = p_competencia;

  INSERT INTO public.cacon_logs (
    competencia_id,
    acao,
    detalhes,
    usuario_id,
    usuario_nome
  )
  VALUES (
    p_competencia,
    'Extração CACON conferida e confirmada',
    jsonb_build_object(
      'descricao',
      'Usuário conferiu os indicadores extraídos do PDF e confirmou os dados para continuidade do fluxo.',
      'modo_extracao',
      v_extracao->>'modo'
    ),
    v_uid,
    v_nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cacon_registrar_falha_extracao(
  p_competencia uuid,
  p_arquivo uuid,
  p_sha256 text,
  p_erro text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
  IF v_uid IS NULL
     OR NOT public.has_any_role(v_uid, ARRAY['admin','acp']::app_role[]) THEN
    RAISE EXCEPTION 'Apenas Admin ou ACP podem registrar falha de extração CACON.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.cacon_arquivos
     WHERE id = p_arquivo
       AND competencia_id = p_competencia
       AND sha256 = p_sha256
  ) THEN
    RAISE EXCEPTION 'O arquivo informado não pertence à competência ou o SHA-256 diverge.';
  END IF;

  SELECT COALESCE(NULLIF(nome, ''), email)
    INTO v_nome
    FROM public.profiles
   WHERE id = v_uid;
  v_nome := COALESCE(v_nome, 'Usuário');

  UPDATE public.cacon_competencias
     SET total_unidades = NULL,
         valor_medio_unitario = NULL,
         valor_medio_dia = NULL,
         valor_fornecido = NULL,
         pacientes_oral = NULL,
         dias_oral = NULL,
         pacientes_enteral = NULL,
         dias_enteral = NULL,
         processado_em = NULL,
         auditoria = '{}'::jsonb,
         extracao = jsonb_build_object(
           'versao', 3,
           'origem', 'pdf_original',
           'modo', 'falha_extracao',
           'status', 'requer_preenchimento_manual',
           'arquivo_id', p_arquivo,
           'sha256', p_sha256,
           'erro', LEFT(COALESCE(p_erro, 'Falha de extração não detalhada.'), 2000),
           'tentativa_em', now(),
           'confirmada_em', NULL,
           'confirmada_por', NULL,
           'confirmada_por_nome', NULL
         ),
         updated_by = v_uid
   WHERE id = p_competencia;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência CACON não encontrada.';
  END IF;

  INSERT INTO public.cacon_logs (
    competencia_id,
    acao,
    detalhes,
    usuario_id,
    usuario_nome
  )
  VALUES (
    p_competencia,
    'Extração automática CACON não concluída',
    jsonb_build_object(
      'descricao',
      'A leitura automática do PDF não fechou os indicadores. Preenchimento manual liberado.',
      'erro',
      LEFT(COALESCE(p_erro, 'Falha de extração não detalhada.'), 2000),
      'arquivo_id',
      p_arquivo,
      'sha256',
      p_sha256
    ),
    v_uid,
    v_nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cacon_salvar_conferencia_manual(
  p_competencia uuid,
  p_dados jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comp public.cacon_competencias%ROWTYPE;
  v_nome text;

  v_total_unidades numeric;
  v_valor_medio_unitario numeric;
  v_valor_medio_dia numeric;
  v_valor_fornecido numeric;
  v_pacientes_oral numeric;
  v_dias_oral numeric;
  v_pacientes_enteral numeric;
  v_dias_enteral numeric;

  v_dias numeric;
  v_pacientes numeric;
  v_media_calc numeric;
  v_alertas int := 0;
  v_ocorrencias jsonb := '[]'::jsonb;
  v_auditoria jsonb;
  v_extracao jsonb;
BEGIN
  IF v_uid IS NULL
     OR NOT public.has_any_role(v_uid, ARRAY['admin','acp']::app_role[]) THEN
    RAISE EXCEPTION 'Apenas Admin ou ACP podem confirmar dados CACON manualmente.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_comp
    FROM public.cacon_competencias
   WHERE id = p_competencia
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência CACON não encontrada.';
  END IF;

  BEGIN
    v_total_unidades := NULLIF(p_dados->>'total_unidades', '')::numeric;
    v_valor_medio_unitario := NULLIF(p_dados->>'valor_medio_unitario', '')::numeric;
    v_valor_medio_dia := NULLIF(p_dados->>'valor_medio_dia', '')::numeric;
    v_valor_fornecido := NULLIF(p_dados->>'valor_fornecido', '')::numeric;
    v_pacientes_oral := NULLIF(p_dados->>'pacientes_oral', '')::numeric;
    v_dias_oral := NULLIF(p_dados->>'dias_oral', '')::numeric;
    v_pacientes_enteral := NULLIF(p_dados->>'pacientes_enteral', '')::numeric;
    v_dias_enteral := NULLIF(p_dados->>'dias_enteral', '')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Os dados manuais possuem valores numéricos inválidos.';
  END;

  IF COALESCE(v_total_unidades, 0) <= 0
     OR COALESCE(v_valor_medio_unitario, 0) <= 0
     OR COALESCE(v_valor_medio_dia, 0) <= 0
     OR COALESCE(v_valor_fornecido, 0) <= 0 THEN
    RAISE EXCEPTION 'Unidades, valor médio unitário, valor médio por dia e valor fornecido devem ser maiores que zero.';
  END IF;

  v_media_calc := v_valor_fornecido / v_total_unidades;
  IF abs(v_media_calc - v_valor_medio_unitario) > 0.03 THEN
    v_alertas := v_alertas + 1;
    v_ocorrencias := v_ocorrencias || jsonb_build_array(
      jsonb_build_object(
        'severidade', 'alerta',
        'regra', 'media_unitaria',
        'descricao',
        format(
          'Valor médio unitário informado (R$ %s) não fecha exatamente com valor fornecido ÷ unidades (R$ %s).',
          to_char(v_valor_medio_unitario, 'FM999999990D00'),
          to_char(v_media_calc, 'FM999999990D00')
        )
      )
    );
  END IF;

  v_dias := COALESCE(v_dias_oral, 0) + COALESCE(v_dias_enteral, 0);
  IF v_dias > 0 THEN
    v_media_calc := v_valor_fornecido / v_dias;
    IF abs(v_media_calc - v_valor_medio_dia) > 0.03 THEN
      v_alertas := v_alertas + 1;
      v_ocorrencias := v_ocorrencias || jsonb_build_array(
        jsonb_build_object(
          'severidade', 'alerta',
          'regra', 'media_dia',
          'descricao',
          format(
            'Valor médio por dia informado (R$ %s) não fecha exatamente com valor fornecido ÷ dias de suplementação (R$ %s).',
            to_char(v_valor_medio_dia, 'FM999999990D00'),
            to_char(v_media_calc, 'FM999999990D00')
          )
        )
      );
    END IF;
  ELSE
    v_alertas := v_alertas + 1;
    v_ocorrencias := v_ocorrencias || jsonb_build_array(
      jsonb_build_object(
        'severidade', 'alerta',
        'regra', 'dias_nao_informados',
        'descricao',
        'Os dias de suplementação não foram informados; não foi possível validar o valor médio por dia.'
      )
    );
  END IF;

  v_pacientes := COALESCE(v_pacientes_oral, 0) + COALESCE(v_pacientes_enteral, 0);
  IF v_pacientes <= 0 THEN
    v_alertas := v_alertas + 1;
    v_ocorrencias := v_ocorrencias || jsonb_build_array(
      jsonb_build_object(
        'severidade', 'alerta',
        'regra', 'pacientes_nao_informados',
        'descricao',
        'Os quantitativos de pacientes não foram informados ou resultaram em zero.'
      )
    );
  END IF;

  v_ocorrencias := v_ocorrencias || jsonb_build_array(
    jsonb_build_object(
      'severidade', 'info',
      'regra', 'origem_manual',
      'descricao',
      'Os dados estruturados foram conferidos/preenchidos manualmente pelo usuário responsável.'
    )
  );

  v_auditoria := jsonb_build_object(
    'criticas', 0,
    'alertas', v_alertas,
    'informacoes', 1,
    'ocorrencias', v_ocorrencias
  );

  SELECT COALESCE(NULLIF(nome, ''), email)
    INTO v_nome
    FROM public.profiles
   WHERE id = v_uid;
  v_nome := COALESCE(v_nome, 'Usuário');

  v_extracao :=
    COALESCE(v_comp.extracao, '{}'::jsonb)
    || jsonb_build_object(
      'versao', 3,
      'origem', 'preenchimento_manual',
      'modo',
      CASE
        WHEN v_comp.processado_em IS NULL THEN 'manual_fallback'
        ELSE 'manual_apos_extracao'
      END,
      'status', 'confirmada',
      'preenchido_em', now(),
      'confirmada_em', now(),
      'confirmada_por', v_uid,
      'confirmada_por_nome', v_nome
    );

  UPDATE public.cacon_competencias
     SET total_unidades = v_total_unidades,
         valor_medio_unitario = v_valor_medio_unitario,
         valor_medio_dia = v_valor_medio_dia,
         valor_fornecido = v_valor_fornecido,
         pacientes_oral = v_pacientes_oral,
         dias_oral = v_dias_oral,
         pacientes_enteral = v_pacientes_enteral,
         dias_enteral = v_dias_enteral,
         auditoria = v_auditoria,
         extracao = v_extracao,
         processado_em = COALESCE(v_comp.processado_em, now()),
         updated_by = v_uid
   WHERE id = p_competencia;

  INSERT INTO public.cacon_logs (
    competencia_id,
    acao,
    detalhes,
    usuario_id,
    usuario_nome
  )
  VALUES (
    p_competencia,
    'Dados CACON preenchidos e confirmados manualmente',
    jsonb_build_object(
      'descricao',
      format('Indicadores conferidos manualmente no PDF; %s alerta(s) de consistência.', v_alertas),
      'origem',
      v_extracao->>'modo',
      'valor_fornecido',
      v_valor_fornecido,
      'total_unidades',
      v_total_unidades
    ),
    v_uid,
    v_nome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cacon_confirmar_extracao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cacon_registrar_falha_extracao(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cacon_salvar_conferencia_manual(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cacon_confirmar_extracao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cacon_registrar_falha_extracao(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cacon_salvar_conferencia_manual(uuid, jsonb) TO authenticated;
