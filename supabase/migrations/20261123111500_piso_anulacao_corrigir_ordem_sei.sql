-- Correção da etapa de anulação do Piso: número/link/data SEI da SOLICITAÇÃO
-- são anteriores às assinaturas e à confirmação de encaminhamento.
-- O Aviso de Movimento de Anulação continua sendo registrado DEPOIS do envio.
-- Não altera os dados existentes; apenas corrige a validação do fluxo.
BEGIN;

-- A versão anterior bloqueava salvar os dados SEI da solicitação antes do
-- envio, invertendo a ordem documental do processo.
DROP TRIGGER IF EXISTS trg_piso_exigir_envio_antes_sei_anulacao
  ON public.piso_documentos;
DROP FUNCTION IF EXISTS public.piso_exigir_envio_antes_sei_anulacao();

-- A confirmação auditável requer que a solicitação já exista, tenha seus
-- metadados SEI e possua os quatro signatários obrigatórios.
CREATE OR REPLACE FUNCTION public.piso_validar_confirmacao_anulacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.acao = 'encaminhado'
    AND EXISTS (
      SELECT 1
      FROM public.piso_documentos d
      WHERE d.id = NEW.documento_id
        AND d.tipo = 'solicitacao_anulacao'
    )
  THEN
    IF NEW.destino IS DISTINCT FROM 'SEFAZ.UCG.AEO'
      OR NOT EXISTS (
        SELECT 1
        FROM public.piso_documentos d
        WHERE d.id = NEW.documento_id
          AND d.tipo = 'solicitacao_anulacao'
          AND NULLIF(btrim(d.numero_sei), '') IS NOT NULL
          AND d.link_sei ~* '^https://[^ /]+'
          AND d.data_documento IS NOT NULL
      )
      OR NOT public.piso_anulacao_quatro_assinaturas_ok(NEW.documento_id)
    THEN
      RAISE EXCEPTION
        'Preencha número, link e data SEI da solicitação e registre os quatro signatários antes de confirmar o envio à SEFAZ.UCG.AEO.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.piso_validar_confirmacao_anulacao()
  FROM PUBLIC, anon, authenticated;

-- O trigger de confirmação já foi criado na migração anterior.
-- Mantê-lo permite continuar auditando os eventos sem recriar documentos.
DROP TRIGGER IF EXISTS trg_piso_validar_confirmacao_anulacao
  ON public.piso_encaminhamentos;
CREATE TRIGGER trg_piso_validar_confirmacao_anulacao
BEFORE INSERT ON public.piso_encaminhamentos
FOR EACH ROW EXECUTE FUNCTION public.piso_validar_confirmacao_anulacao();

-- NÃO alterar trg_piso_exigir_solicitacao_antes_aviso_anulacao:
-- ele continua impedindo registrar o Aviso de Movimento antes da
-- confirmação da solicitação documentada e assinada.

COMMIT;
