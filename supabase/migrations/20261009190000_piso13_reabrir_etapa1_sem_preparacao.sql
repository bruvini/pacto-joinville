-- PACTO Joinville | Piso da Enfermagem
-- Corrige somente 13ª parcelas cuja Etapa 1 foi concluída automaticamente
-- após a criação sem registros preparatórios. Preserva as competências
-- mensais, participantes, documentos e quaisquer processos já executados.
--
-- Executar no SQL Editor do Lovable após publicar a versão com conclusão
-- manual da Etapa 1 da 13ª. A operação é transacional e auditável.
BEGIN;

WITH candidatas AS (
  SELECT c.id
  FROM public.piso_competencias c
  WHERE c.tipo_parcela = 'decimo_terceiro'
    AND COALESCE(c.etapas_concluidas->>'1','false') = 'true'
    -- Não retroceder processos que concluíram outra etapa.
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each_text(COALESCE(c.etapas_concluidas,'{}'::jsonb)) AS e(etapa,feito)
      WHERE e.etapa <> '1' AND e.feito = 'true'
    )
    -- Não retroceder processos com coleta ou evidências já registradas.
    AND c.investsus_carga_em IS NULL
    AND c.portaria_gm_numero IS NULL
    AND c.valor_homologado IS NULL
    AND c.valor_transferido IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.piso_participantes p
      WHERE p.competencia_id = c.id
        AND (
          p.data_envio IS NOT NULL
          OR p.data_retorno IS NOT NULL
          OR p.auditoria_resumo IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(p.observacao,'')), '') IS NOT NULL
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.piso_arquivos a
      WHERE a.competencia_id = c.id
    )
  FOR UPDATE
),
corrigidas AS (
  UPDATE public.piso_competencias c
  SET etapas_concluidas = COALESCE(c.etapas_concluidas,'{}'::jsonb) - '1',
      etapas_reconferir = array_remove(COALESCE(c.etapas_reconferir, ARRAY[]::integer[]),1),
      status = 'aberta'
  FROM candidatas v
  WHERE c.id = v.id
  RETURNING c.id, c.competencia, c.exercicio_referencia
)
INSERT INTO public.historico_logs
  (piso_competencia_id, usuario_nome, acao, detalhes)
SELECT
  id,
  'Sistema (correção de fluxo)',
  'Piso · reabertura corretiva da Etapa 1 da 13ª',
  jsonb_build_object(
    'competencia', competencia,
    'exercicio_referencia', exercicio_referencia,
    'motivo', 'A preparação foi marcada automaticamente, sem registro operacional.',
    'efeito', 'Removida apenas a marcação de conclusão da Etapa 1.'
  )
FROM corrigidas;

COMMIT;

-- Consulta opcional após a execução:
-- SELECT competencia, tipo_parcela, etapas_concluidas, status
-- FROM public.piso_competencias
-- WHERE tipo_parcela = 'decimo_terceiro'
-- ORDER BY competencia;
