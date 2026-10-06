-- Ajustes consolidados do Piso da Enfermagem — assinaturas e reconferência.
-- Idempotente: pode ser executado no SQL Editor mesmo que a migration anterior
-- 20261006143000 tenha sido aplicada parcialmente ou integralmente.

-- 1) Memorando para publicação: inclui o Diretor de Serviços Complementares.
INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'memorando',
    'diretor',
    'Diretor de Serviços Complementares',
    ARRAY['Diretor de Serviços Complementares'],
    false,
    false,
    false,
    3
  )
ON CONFLICT (tipo_documento, slot_key) DO UPDATE
SET label = EXCLUDED.label,
    cargos = EXCLUDED.cargos,
    manual = EXCLUDED.manual,
    qualquer = EXCLUDED.qualquer,
    opcional = EXCLUDED.opcional,
    ordem = EXCLUDED.ordem;

-- 2) Etapa 5 — Solicitação de Nota de Empenho:
-- Auditor Fiscal + Coordenador UFI + membro da Comissão + Diretora Financeira.
INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'solicitacao_ne',
    'auditor_fiscal',
    'Auditor Fiscal',
    ARRAY['Auditor Fiscal','Fiscal'],
    false,
    true,
    false,
    1
  ),
  (
    'solicitacao_ne',
    'coordenador_ufi',
    'Coordenador da UFI',
    ARRAY['Coordenador UFI'],
    false,
    false,
    false,
    2
  ),
  (
    'solicitacao_ne',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY['Membro da Comissão de Gestão e Controle de Despesa'],
    false,
    false,
    false,
    3
  ),
  (
    'solicitacao_ne',
    'diretora_financeira',
    'Diretora Financeira',
    ARRAY['Diretora Financeira','Diretoria Financeira'],
    false,
    true,
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

-- 3) Etapa 6 — o membro da Comissão deixa de ser texto livre:
-- passa a ser um signatário cadastrado no pool, tanto no Subempenho/Liquidação
-- quanto no Aviso de Movimento. Os demais slots preexistentes são preservados.
INSERT INTO public.piso_assinatura_matriz
  (tipo_documento, slot_key, label, cargos, manual, qualquer, opcional, ordem)
VALUES
  (
    'solicitacao_liquidacao',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY['Membro da Comissão de Gestão e Controle de Despesa'],
    false,
    false,
    false,
    2
  ),
  (
    'aviso_liquidacao',
    'comissao',
    'Membro da Comissão de Gestão e Controle de Despesa',
    ARRAY['Membro da Comissão de Gestão e Controle de Despesa'],
    false,
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

-- 4) Complementa a migration anterior: alterar o link da Informação SEI
-- do crédito deve reabrir a Etapa 4 para reconferência quando aplicável.
CREATE OR REPLACE FUNCTION public.piso_reconferir_credito_fms_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.credito_fms_link IS DISTINCT FROM OLD.credito_fms_link THEN
    PERFORM public.piso_marcar_reconferencia(NEW.id, 4);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.piso_reconferir_credito_fms_link()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_piso_credito_fms_link_reconferencia
  ON public.piso_competencias;

CREATE TRIGGER trg_piso_credito_fms_link_reconferencia
AFTER UPDATE OF credito_fms_link
ON public.piso_competencias
FOR EACH ROW
EXECUTE FUNCTION public.piso_reconferir_credito_fms_link();
