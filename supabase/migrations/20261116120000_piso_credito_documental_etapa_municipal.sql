-- Piso: separar o crédito documental da disponibilidade bancária opcional.
-- Nenhuma competência existente, reserva, conciliação ou histórico é alterado.
BEGIN;
ALTER TABLE public.piso_competencias ADD COLUMN IF NOT EXISTS credito_fms_numero_sei text;

-- Desativa somente a exigência de conciliação para encerramento operacional.
-- Preserva a função original para eventual reversão e os demais triggers de integridade.
DROP TRIGGER IF EXISTS trg_piso_afc_guardar_encerramento ON public.piso_competencias;

CREATE OR REPLACE FUNCTION public.piso_reconferir_credito_fms_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.credito_fms_link IS DISTINCT FROM OLD.credito_fms_link OR
     NEW.credito_fms_numero_sei IS DISTINCT FROM OLD.credito_fms_numero_sei THEN
    PERFORM public.piso_marcar_reconferencia(NEW.id, 4);
  END IF;

  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_piso_credito_fms_link_reconferencia ON public.piso_competencias;
CREATE TRIGGER trg_piso_credito_fms_link_reconferencia AFTER UPDATE OF credito_fms_link, credito_fms_numero_sei ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.piso_reconferir_credito_fms_link();

CREATE OR REPLACE FUNCTION public.piso_afc_reconferir_evidencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.tipo_parcela='decimo_terceiro' OR NEW.status='encerrada' THEN RETURN NEW; END IF;
  IF NEW.valor_homologado IS DISTINCT FROM OLD.valor_homologado OR
     NEW.desconto_saldo IS DISTINCT FROM OLD.desconto_saldo OR
     NEW.acerto_contas IS DISTINCT FROM OLD.acerto_contas OR
     NEW.valor_transferido IS DISTINCT FROM OLD.valor_transferido OR
     NEW.credito_fms_valor IS DISTINCT FROM OLD.credito_fms_valor OR
     NEW.credito_fms_data IS DISTINCT FROM OLD.credito_fms_data OR
     NEW.credito_fms_referencia IS DISTINCT FROM OLD.credito_fms_referencia OR
     NEW.credito_fms_link IS DISTINCT FROM OLD.credito_fms_link OR
     NEW.credito_fms_numero_sei IS DISTINCT FROM OLD.credito_fms_numero_sei OR
     NEW.saldo_afc_anterior IS DISTINCT FROM OLD.saldo_afc_anterior OR
     NEW.fonte_saldo_afc IS DISTINCT FROM OLD.fonte_saldo_afc
  THEN
    UPDATE public.piso_afc_conciliacoes SET
      situacao='reconferir',
      justificativa='Reconferência automática por alteração de evidência financeira.'
    WHERE competencia_id=NEW.id AND situacao='confirmada';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_piso_afc_reconferir_evidencia ON public.piso_competencias;
CREATE TRIGGER trg_piso_afc_reconferir_evidencia AFTER UPDATE OF valor_homologado, desconto_saldo, acerto_contas, valor_transferido, credito_fms_valor, credito_fms_data, credito_fms_referencia, credito_fms_link, credito_fms_numero_sei, saldo_afc_anterior, fonte_saldo_afc ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.piso_afc_reconferir_evidencia();
-- Mantém a trilha histórica da AFC sem reabrir as etapas operacionais.
CREATE OR REPLACE FUNCTION public.piso_afc_auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.historico_logs
    (piso_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES (
    CASE WHEN TG_TABLE_NAME='piso_afc_conciliacoes'
      THEN NEW.competencia_id ELSE NULL END,
    auth.uid(), coalesce(v_nome,'Sistema'),
    'Piso · AFC FMS ' || lower(TG_OP) || ' · ' || TG_TABLE_NAME,
    jsonb_build_object('anterior',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
                       'posterior',to_jsonb(NEW))
  );
  -- Controle complementar: não reabre a conclusão operacional.
  RETURN NEW;
END;
$function$;
COMMIT;
