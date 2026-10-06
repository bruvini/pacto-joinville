-- Piso da Enfermagem — alinhar matriz de assinaturas ao fluxo operacional real.
-- Idempotente.

-- Solicitação de Nota de Empenho:
-- Auditor Fiscal usa o mesmo pool do cargo Fiscal;
-- Coordenador da UFI usa o mesmo campo do Coordenador de Orçamentos;
-- Comissão é assinatura manual com histórico/autocomplete;
-- Diretora Financeira usa o pool já existente da Diretoria Financeira.
INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'solicitacao_ne',
    'auditor_fiscal',
    'Auditor Fiscal',
    ARRAY['Fiscal'],
    false,
    false,
    false,
    1
  ),
  (
    'solicitacao_ne',
    'coordenador_ufi',
    'Coordenador da UFI',
    ARRAY['Coordenador de Orçamentos'],
    false,
    false,
    false,
    2
  ),
  (
    'solicitacao_ne',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY[]::text[],
    true,
    false,
    false,
    3
  ),
  (
    'solicitacao_ne',
    'diretora_financeira',
    'Diretora Financeira',
    ARRAY['Diretoria Financeira'],
    false,
    false,
    false,
    4
  )
ON CONFLICT (tipo_documento, slot_key) DO UPDATE
SET label = EXCLUDED.label,
    cargos = EXCLUDED.cargos,
    manual = EXCLUDED.manual,
    qualquer = EXCLUDED.qualquer,
    opcional = EXCLUDED.opcional,
    ordem = EXCLUDED.ordem;

-- Etapa 6: Comissão também é assinatura manual, tal como Membro da SEFAZ.
INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
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
