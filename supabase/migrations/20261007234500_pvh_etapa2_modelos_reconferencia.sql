-- PVH — refinamento da Etapa 2 e correção da reconferência
-- 1) Assinaturas documentais por slot/cargo, alinhadas ao padrão do Piso.
-- 2) Etapa 2 passa a reutilizar os valores estaduais já conferidos na Etapa 1.
-- 3) Reconferência só alcança etapas que já estavam concluídas, evitando
--    pintar etapas futuras como se precisassem ser reconferidas.

ALTER TABLE public.pvh_documento_assinaturas
  ADD COLUMN IF NOT EXISTS slot text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS codigo_sei text;

CREATE INDEX IF NOT EXISTS idx_pvh_documento_assinaturas_slot_ativo
  ON public.pvh_documento_assinaturas (documento_id, slot)
  WHERE revogado_em IS NULL;

-- Backfill conservador para registros criados antes da introdução dos slots.
UPDATE public.pvh_documento_assinaturas
   SET slot = CASE
       WHEN lower(papel_funcao) LIKE '%fiscal%' THEN 'fiscal'
       WHEN lower(papel_funcao) LIKE '%diretor%servi%complement%' THEN 'diretor_servicos_complementares'
       WHEN lower(papel_funcao) LIKE '%gerent%'
         OR lower(papel_funcao) LIKE '%coorden%' THEN 'gestao'
       ELSE slot
     END,
       cargo = COALESCE(cargo, papel_funcao)
 WHERE slot IS NULL;

UPDATE public.pvh_documento_tipos
   SET exige_data = true,
       descricao = 'Minuta preparada com competência, Portaria SES, base normativa vigente, estabelecimentos/CNES e valores oficiais da Etapa 1.'
 WHERE codigo = 'minuta_portaria_municipal';

UPDATE public.pvh_documento_tipos
   SET exige_data = true,
       descricao = 'Memorando alimentado pela Minuta e pelas referências institucionais, com confirmação de encaminhamento às unidades responsáveis.'
 WHERE codigo = 'memorando_portaria_municipal';

UPDATE public.pvh_documento_tipos
   SET descricao = 'Ato municipal final publicado no SEI para a competência.'
 WHERE codigo = 'portaria_municipal_publicada';

-- Reconferência correta: uma alteração em etapa já concluída só marca essa etapa
-- e as etapas POSTERIORES QUE TAMBÉM JÁ HAVIAM SIDO CONCLUÍDAS.
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
  IF p_etapa < 1 OR p_etapa > 8 THEN
    RAISE EXCEPTION 'Etapa PVH inválida.';
  END IF;

  UPDATE public.pvh_competencias c
     SET etapas_reconferir = COALESCE(
       (
         SELECT ARRAY(
           SELECT DISTINCT etapa
             FROM (
               SELECT unnest(COALESCE(c.etapas_reconferir, '{}'::integer[])) AS etapa
               UNION ALL
               SELECT serie AS etapa
                 FROM generate_series(p_etapa, 8) AS serie
                WHERE COALESCE(
                  (c.etapas_concluidas ->> serie::text)::boolean,
                  false
                ) = true
             ) candidatos
            WHERE etapa BETWEEN 1 AND 8
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

-- Limpa marcas fantasmas deixadas pela implementação anterior. Uma etapa nunca
-- pode estar em "reconferir" se ela sequer foi concluída.
UPDATE public.pvh_competencias c
   SET etapas_reconferir = COALESCE(
     (
       SELECT ARRAY(
         SELECT DISTINCT etapa
           FROM unnest(COALESCE(c.etapas_reconferir, '{}'::integer[])) AS etapa
          WHERE etapa BETWEEN 1 AND 8
            AND COALESCE(
              (c.etapas_concluidas ->> etapa::text)::boolean,
              false
            ) = true
          ORDER BY etapa
       )
     ),
     '{}'::integer[]
   )
 WHERE cardinality(COALESCE(c.etapas_reconferir, '{}'::integer[])) > 0;

-- Conclusão da Etapa 2:
-- • não existe nova conciliação financeira: o valor municipal nasce do valor
--   estadual já conferido na Etapa 1;
-- • valida a cadeia documental e os slots de assinatura;
-- • exige a confirmação dos dois encaminhamentos do Memorando.
CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa2(p_comp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_minuta public.pvh_documentos%ROWTYPE;
  v_memorando public.pvh_documentos%ROWTYPE;
  v_portaria public.pvh_documentos%ROWTYPE;
  v_destinatarios jsonb;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para concluir a Etapa 2 do PVH.'
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

  IF COALESCE((v_comp.etapas_concluidas ->> '1')::boolean, false)
     IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conclua a Etapa 1 antes da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'A competência não possui instituições participantes.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes
     WHERE competencia_id = p_comp
       AND COALESCE(valor_estadual, 0) <= 0
  ) THEN
    RAISE EXCEPTION
      'Todas as instituições precisam ter valor estadual positivo e conferido na Etapa 1.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_minuta
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'minuta_portaria_municipal'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_minuta.numero_sei), '') IS NULL
     OR v_minuta.data_documento IS NULL
     OR NULLIF(btrim(v_minuta.link_documento), '') IS NULL THEN
    RAISE EXCEPTION
      'Registre Nº SEI, data e Link SEI da Minuta da Portaria Municipal.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_minuta.dados ->> 'autoridade_nome'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'autoridade_cargo'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'portaria_geral_numero'), '') IS NULL
     OR NULLIF(btrim(v_minuta.dados ->> 'portaria_geral_sei'), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete os dados de construção do texto-base da Minuta.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND NULLIF(
         btrim(
           COALESCE(
             v_minuta.dados -> 'cnes_por_prestador' ->> p.prestador_id::text,
             ''
           )
         ),
         ''
       ) IS NULL
  ) THEN
    RAISE EXCEPTION
      'Informe o CNES de todas as instituições no Anexo I da Minuta.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_minuta.id
       AND a.slot = 'gestao'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Minuta exige assinatura de Gerente ou Coordenador.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_minuta.id
       AND a.slot = 'diretor_servicos_complementares'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Minuta exige assinatura do Diretor de Serviços Complementares.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_memorando
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'memorando_portaria_municipal'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_memorando.numero_sei), '') IS NULL
     OR v_memorando.data_documento IS NULL
     OR NULLIF(btrim(v_memorando.link_documento), '') IS NULL THEN
    RAISE EXCEPTION
      'Registre Nº SEI, data e Link SEI do Memorando de encaminhamento.'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(v_memorando.dados ->> 'memorando_pgm_numero'), '') IS NULL
     OR NULLIF(btrim(v_memorando.dados ->> 'memorando_sap_numero'), '') IS NULL
     OR NULLIF(btrim(v_memorando.dados ->> 'processo_referencia'), '') IS NULL THEN
    RAISE EXCEPTION
      'Complete as referências institucionais do Memorando.'
      USING ERRCODE = '23514';
  END IF;

  v_destinatarios := v_memorando.dados -> 'destinatarios';
  IF v_destinatarios IS NULL
     OR jsonb_typeof(v_destinatarios) <> 'array'
     OR jsonb_array_length(v_destinatarios) < 2
     OR EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_destinatarios) AS dest
        WHERE NULLIF(btrim(dest ->> 'unidade'), '') IS NULL
           OR NULLIF(btrim(dest ->> 'nome'), '') IS NULL
           OR NULLIF(btrim(dest ->> 'cargo'), '') IS NULL
     ) THEN
    RAISE EXCEPTION
      'Informe Unidade SEI, nome e cargo dos destinatários do Memorando.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_memorando.id
       AND a.slot = 'fiscal'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'O Memorando exige assinatura de um Fiscal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pvh_documento_assinaturas a
     WHERE a.documento_id = v_memorando.id
       AND a.slot = 'gestao'
       AND a.revogado_em IS NULL
  ) THEN
    RAISE EXCEPTION
      'O Memorando exige assinatura de Gerente ou Coordenador.'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE((v_memorando.dados ->> 'encaminhado_ses_uap')::boolean, false)
     IS DISTINCT FROM true
     OR COALESCE((v_memorando.dados ->> 'encaminhado_ses_uap_apa')::boolean, false)
     IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Confirme o encaminhamento do Memorando para SES.UAP e SES.UAP.APA.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_portaria
    FROM public.pvh_documentos
   WHERE competencia_id = p_comp
     AND participante_id IS NULL
     AND tipo_codigo = 'portaria_municipal_publicada'
   LIMIT 1;

  IF NOT FOUND
     OR NULLIF(btrim(v_portaria.numero), '') IS NULL
     OR v_portaria.data_documento IS NULL
     OR NULLIF(btrim(v_portaria.link_documento), '') IS NULL THEN
    RAISE EXCEPTION
      'Registre número, data e Link SEI da Portaria Municipal publicada.'
      USING ERRCODE = '23514';
  END IF;

  -- A Portaria Municipal reproduz os valores oficiais da Etapa 1.
  UPDATE public.pvh_participantes
     SET valor_municipal = valor_estadual
   WHERE competencia_id = p_comp
     AND valor_municipal IS DISTINCT FROM valor_estadual;

  -- Campos legados continuam sincronizados para relatórios e consultas já
  -- existentes; a evidência detalhada permanece em pvh_documentos.
  UPDATE public.pvh_competencias
     SET minuta_municipal_numero = v_minuta.numero_sei,
         minuta_municipal_link = v_minuta.link_documento,
         memorando_municipal_numero = v_memorando.numero_sei,
         memorando_municipal_link = v_memorando.link_documento,
         portaria_municipal_numero = v_portaria.numero,
         portaria_municipal_data = v_portaria.data_documento,
         portaria_municipal_link = v_portaria.link_documento,
         etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{2}',
           'true'::jsonb,
           true
         ),
         etapas_reconferir = array_remove(
           COALESCE(etapas_reconferir, '{}'::integer[]),
           2
         )
   WHERE id = p_comp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pvh_concluir_etapa2(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_concluir_etapa2(uuid)
  TO authenticated, service_role;
