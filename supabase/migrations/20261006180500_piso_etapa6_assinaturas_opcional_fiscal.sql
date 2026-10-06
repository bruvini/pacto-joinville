-- Piso da Enfermagem — Etapa 6: Comissão obrigatória e Fiscal opcional.
-- Idempotente.

INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'solicitacao_liquidacao',
    'fiscal',
    'Fiscal',
    ARRAY['Fiscal'],
    false,
    false,
    true,
    1
  ),
  (
    'solicitacao_liquidacao',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY[]::text[],
    true,
    false,
    false,
    2
  ),
  (
    'aviso_liquidacao',
    'fiscal',
    'Fiscal',
    ARRAY['Fiscal'],
    false,
    false,
    true,
    1
  ),
  (
    'aviso_liquidacao',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY[]::text[],
    true,
    false,
    false,
    2
  )
ON CONFLICT (tipo_documento, slot_key) DO UPDATE
SET label = EXCLUDED.label,
    cargos = EXCLUDED.cargos,
    manual = EXCLUDED.manual,
    qualquer = EXCLUDED.qualquer,
    opcional = EXCLUDED.opcional,
    ordem = EXCLUDED.ordem;
