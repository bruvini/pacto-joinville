-- Piso da Enfermagem · Solicitação de anulação: matriz dos convênios e envio antes do SEI.
-- Aditiva: não exclui assinaturas, encaminhamentos ou dados SEI existentes.
BEGIN;

-- Slots históricos de Solicitação de NE continuam registrados para auditoria,
-- mas deixam de ser exigidos ou exibidos na nova matriz.
UPDATE public.piso_assinatura_matriz
   SET opcional=true
 WHERE tipo_documento='solicitacao_anulacao'
   AND slot_key NOT IN ('fiscal','gerente','diretor','financeira');

INSERT INTO public.piso_assinatura_matriz
  (tipo_documento,slot_key,label,cargos,manual,qualquer,opcional,ordem)
VALUES
  ('solicitacao_anulacao','fiscal','Fiscal',ARRAY['Fiscal']::text[],false,false,false,1),
  ('solicitacao_anulacao','gerente','Gerente / Coordenador ACP',
    ARRAY['Gerente','Coordenador ACP','Coordenador']::text[],false,true,false,2),
  ('solicitacao_anulacao','diretor','Diretor de Serviços Complementares',
    ARRAY['Diretor de Serviços Complementares']::text[],false,false,false,3),
  ('solicitacao_anulacao','financeira','Diretoria Financeira / Secretária de Saúde',
    ARRAY['Diretoria Financeira','Secretária de Saúde']::text[],false,true,false,4)
ON CONFLICT (tipo_documento,slot_key) DO UPDATE SET
  label=EXCLUDED.label,cargos=EXCLUDED.cargos,manual=EXCLUDED.manual,
  qualquer=EXCLUDED.qualquer,opcional=EXCLUDED.opcional,ordem=EXCLUDED.ordem;

-- Funções internas do fluxo. SECURITY DEFINER é restrita a esses validadores.
CREATE OR REPLACE FUNCTION public.piso_anulacao_quatro_assinaturas_ok(p_documento uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $sql$
  SELECT EXISTS (SELECT 1 FROM public.piso_documentos d
    WHERE d.id=p_documento AND d.tipo='solicitacao_anulacao')
  AND (SELECT count(*) FROM public.piso_assinatura_matriz m
       WHERE m.tipo_documento='solicitacao_anulacao' AND NOT m.opcional)=4
  AND NOT EXISTS (
    SELECT 1 FROM public.piso_assinatura_matriz m
    WHERE m.tipo_documento='solicitacao_anulacao' AND NOT m.opcional
      AND NOT EXISTS (SELECT 1 FROM public.piso_documento_assinaturas a
        WHERE a.documento_id=p_documento AND a.slot=m.slot_key
          AND NULLIF(btrim(a.servidor_nome),'') IS NOT NULL
          AND a.cargo=ANY(m.cargos)));
$sql$;

CREATE OR REPLACE FUNCTION public.piso_anulacao_envio_confirmado(p_documento uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $sql$
 SELECT public.piso_anulacao_quatro_assinaturas_ok(p_documento)
   AND EXISTS (
     SELECT 1 FROM public.piso_encaminhamentos e
      WHERE e.documento_id=p_documento
        AND e.id=(SELECT e2.id FROM public.piso_encaminhamentos e2
          WHERE e2.documento_id=p_documento
          ORDER BY e2.ocorrido_em DESC,e2.id DESC LIMIT 1)
        AND e.acao='encaminhado' AND e.destino='SEFAZ.UCG.AEO'
        AND NOT EXISTS(SELECT 1 FROM public.piso_documento_assinaturas a
          WHERE a.documento_id=p_documento AND a.assinado_em>e.ocorrido_em)
   );
$sql$;

REVOKE ALL ON FUNCTION public.piso_anulacao_quatro_assinaturas_ok(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.piso_anulacao_envio_confirmado(uuid) FROM PUBLIC,anon,authenticated;

-- O checkbox só pode ser confirmado quando os quatro slots estiverem registrados.
CREATE OR REPLACE FUNCTION public.piso_validar_confirmacao_anulacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NEW.acao='encaminhado' AND EXISTS(
   SELECT 1 FROM public.piso_documentos d
   WHERE d.id=NEW.documento_id AND d.tipo='solicitacao_anulacao'
 ) THEN
   IF NEW.destino IS DISTINCT FROM 'SEFAZ.UCG.AEO'
      OR NOT public.piso_anulacao_quatro_assinaturas_ok(NEW.documento_id)
   THEN
     RAISE EXCEPTION 'Registre os quatro signatários antes de confirmar o envio à SEFAZ.UCG.AEO.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_confirmacao_anulacao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_piso_validar_confirmacao_anulacao ON public.piso_encaminhamentos;
CREATE TRIGGER trg_piso_validar_confirmacao_anulacao
 BEFORE INSERT ON public.piso_encaminhamentos
 FOR EACH ROW EXECUTE FUNCTION public.piso_validar_confirmacao_anulacao();

-- O documento pode nascer vazio para permitir cadastrar signatários primeiro.
-- Dados SEI só são registrados ou alterados após confirmação auditada de envio.
CREATE OR REPLACE FUNCTION public.piso_exigir_envio_antes_sei_anulacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE metadados_mudaram boolean := false;
BEGIN
 IF NEW.tipo = 'solicitacao_anulacao' THEN
   IF TG_OP = 'INSERT' THEN
     metadados_mudaram := NEW.numero_sei IS NOT NULL
       OR NEW.link_sei IS NOT NULL OR NEW.data_documento IS NOT NULL;
   ELSE
     metadados_mudaram := NEW.numero_sei IS DISTINCT FROM OLD.numero_sei
       OR NEW.link_sei IS DISTINCT FROM OLD.link_sei
       OR NEW.data_documento IS DISTINCT FROM OLD.data_documento;
   END IF;
   IF metadados_mudaram AND NOT public.piso_anulacao_envio_confirmado(NEW.id) THEN
     RAISE EXCEPTION 'Confirme primeiro as quatro assinaturas e o envio à SEFAZ.UCG.AEO.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_exigir_envio_antes_sei_anulacao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_piso_exigir_envio_antes_sei_anulacao ON public.piso_documentos;
CREATE TRIGGER trg_piso_exigir_envio_antes_sei_anulacao
 BEFORE INSERT OR UPDATE OF numero_sei,link_sei,data_documento
 ON public.piso_documentos FOR EACH ROW
 EXECUTE FUNCTION public.piso_exigir_envio_antes_sei_anulacao();

-- Evita que o aviso posterior seja criado/alterado antes do envio e do SEI da solicitação.
CREATE OR REPLACE FUNCTION public.piso_exigir_solicitacao_antes_aviso_anulacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE solicitacao uuid;
BEGIN
 IF NEW.tipo='aviso_anulacao' THEN
   SELECT s.id INTO solicitacao FROM public.piso_documentos s
    WHERE s.obrigacao_id=NEW.obrigacao_id AND s.tipo='solicitacao_anulacao'
      AND NULLIF(btrim(s.numero_sei),'') IS NOT NULL
      AND s.link_sei ~* '^https://[^ /]+' AND s.data_documento IS NOT NULL
    ORDER BY s.created_at DESC LIMIT 1;
   IF solicitacao IS NULL OR NOT public.piso_anulacao_envio_confirmado(solicitacao) THEN
     RAISE EXCEPTION 'Conclua assinaturas, envio à SEFAZ.UCG.AEO e dados SEI da solicitação antes do Aviso de Anulação.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_exigir_solicitacao_antes_aviso_anulacao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_piso_exigir_solicitacao_antes_aviso_anulacao ON public.piso_documentos;
CREATE TRIGGER trg_piso_exigir_solicitacao_antes_aviso_anulacao
 BEFORE INSERT OR UPDATE OF tipo,numero_sei,link_sei,data_documento
 ON public.piso_documentos FOR EACH ROW
 EXECUTE FUNCTION public.piso_exigir_solicitacao_antes_aviso_anulacao();

-- Revalida confirmação ao concluir a etapa 6A; fatos históricos não são apagados.
CREATE OR REPLACE FUNCTION public.piso_validar_fluxo_anulacao_concluida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NEW.etapas_concluidas->>'10'='true'
   AND (OLD.etapas_concluidas->>'10' IS DISTINCT FROM 'true'
        OR (10=ANY(COALESCE(OLD.etapas_reconferir,ARRAY[]::integer[]))
           AND NOT (10=ANY(COALESCE(NEW.etapas_reconferir,ARRAY[]::integer[])))))
   AND EXISTS(
     SELECT 1 FROM public.piso_documentos s
     WHERE s.competencia_id=NEW.id AND s.tipo='solicitacao_anulacao'
       AND NOT public.piso_anulacao_envio_confirmado(s.id)
   )
 THEN
   RAISE EXCEPTION 'Anulação incompleta: confirme o envio à SEFAZ.UCG.AEO após as quatro assinaturas.'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_fluxo_anulacao_concluida() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_piso_validar_fluxo_anulacao_concluida ON public.piso_competencias;
CREATE TRIGGER trg_piso_validar_fluxo_anulacao_concluida
 BEFORE UPDATE OF etapas_concluidas,etapas_reconferir
 ON public.piso_competencias FOR EACH ROW
 EXECUTE FUNCTION public.piso_validar_fluxo_anulacao_concluida();

COMMIT;
