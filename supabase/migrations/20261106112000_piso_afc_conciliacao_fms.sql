-- AFC Piso: conciliação por competência e fonte bancária no âmbito do FMS.
-- Não altera competências existentes, histórico, Etapa 7A (chave 10), nem 13ª.
-- Valor de extrato já inclui os créditos nele lançados: NUNCA somar crédito FMS novamente.
BEGIN;

CREATE TABLE IF NOT EXISTS public.piso_afc_contas_fms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identificacao text NOT NULL UNIQUE,
  data_saldo date,
  saldo_bancario numeric(16,2),
  compromissos_preexistentes numeric(16,2),
  documento_sei text,
  documento_link text,
  observacao text,
  atualizado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piso_afc_conta_identificacao CHECK (length(btrim(identificacao)) > 2),
  CONSTRAINT piso_afc_conta_saldo CHECK (saldo_bancario IS NULL OR saldo_bancario >= 0),
  CONSTRAINT piso_afc_conta_compromissos CHECK (compromissos_preexistentes IS NULL OR compromissos_preexistentes >= 0)
);

CREATE TABLE IF NOT EXISTS public.piso_afc_conciliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL UNIQUE REFERENCES public.piso_competencias(id) ON DELETE RESTRICT,
  conta_id uuid REFERENCES public.piso_afc_contas_fms(id) ON DELETE RESTRICT,
  situacao text NOT NULL DEFAULT 'rascunho',
  valor_reservado numeric(16,2) NOT NULL DEFAULT 0,
  justificativa text,
  confirmada_em timestamptz,
  confirmada_por uuid REFERENCES auth.users(id),
  autorizacao_excecao_sei text,
  autorizacao_excecao_link text,
  responsavel_excecao text,
  revisao_situacao text NOT NULL DEFAULT 'nao_solicitada',
  revisao_justificativa text,
  revisao_oficio text,
  revisao_protocolo text,
  revisao_data date,
  revisao_decisao text,
  atualizado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piso_afc_situacao CHECK (situacao IN ('rascunho','confirmada','reconferir','excecao_autorizada')),
  CONSTRAINT piso_afc_reserva_valor CHECK (valor_reservado >= 0),
  CONSTRAINT piso_afc_revisao CHECK (revisao_situacao IN
    ('nao_solicitada','em_preparacao','protocolada','em_analise','deferida','indeferida','encerrada'))
);

CREATE INDEX IF NOT EXISTS idx_piso_afc_conciliacoes_conta ON public.piso_afc_conciliacoes(conta_id,situacao);
CREATE INDEX IF NOT EXISTS idx_piso_afc_conciliacoes_competencia ON public.piso_afc_conciliacoes(competencia_id);

ALTER TABLE public.piso_afc_contas_fms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piso_afc_conciliacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piso_afc_contas_fms, public.piso_afc_conciliacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.piso_afc_contas_fms, public.piso_afc_conciliacoes TO authenticated;
GRANT ALL ON public.piso_afc_contas_fms, public.piso_afc_conciliacoes TO service_role;

CREATE POLICY "piso afc contas read" ON public.piso_afc_contas_fms FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]));
CREATE POLICY "piso afc contas write" ON public.piso_afc_contas_fms FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]));
CREATE POLICY "piso afc contas update" ON public.piso_afc_contas_fms FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]));
CREATE POLICY "piso afc conciliacoes read" ON public.piso_afc_conciliacoes FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::public.app_role[]));
CREATE POLICY "piso afc conciliacoes write" ON public.piso_afc_conciliacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]));
CREATE POLICY "piso afc conciliacoes update" ON public.piso_afc_conciliacoes FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]));

-- Concentra todas as reservas de competências na mesma conta, sob lock serial.
CREATE OR REPLACE FUNCTION public.piso_afc_validar_conciliacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_comp public.piso_competencias%ROWTYPE;
  v_conta public.piso_afc_contas_fms%ROWTYPE;
  v_outras numeric(16,2);
  v_devido numeric(16,2);
BEGIN
  IF auth.uid() IS NOT NULL AND
     NOT public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[])
     AND NOT (TG_OP='UPDATE' AND OLD.situacao='confirmada'
       AND NEW.situacao='reconferir'
       AND NEW.justificativa='Reconferência automática por alteração de evidência financeira.') THEN
    RAISE EXCEPTION 'Somente ACP e administradores podem alterar conciliações da AFC.'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_comp FROM public.piso_competencias WHERE id=NEW.competencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competência não encontrada.'; END IF;
  IF v_comp.status='encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada. Reabra formalmente antes de alterar a conciliação.';
  END IF;
  IF v_comp.tipo_parcela='decimo_terceiro' THEN
    RAISE EXCEPTION 'A 13ª parcela exige conciliação específica; não utilizar a conciliação mensal.';
  END IF;
  IF TG_OP='UPDATE' AND OLD.situacao IN ('confirmada','excecao_autorizada')
     AND (NEW.situacao IS DISTINCT FROM OLD.situacao OR NEW.conta_id IS DISTINCT FROM OLD.conta_id)
     AND length(btrim(COALESCE(NEW.justificativa,''))) < 20 THEN
    RAISE EXCEPTION 'Revisão de conciliação confirmada exige justificativa com pelo menos 20 caracteres.';
  END IF;

  IF NEW.situacao='confirmada' THEN
    IF NEW.conta_id IS NULL THEN RAISE EXCEPTION 'Informe a conta vinculada ao FMS.'; END IF;
    SELECT * INTO v_conta FROM public.piso_afc_contas_fms WHERE id=NEW.conta_id FOR UPDATE;
    IF NOT FOUND OR v_conta.saldo_bancario IS NULL
      OR v_conta.compromissos_preexistentes IS NULL OR v_conta.data_saldo IS NULL
      OR nullif(btrim(v_conta.documento_sei),'') IS NULL
      OR coalesce(v_conta.documento_link,'') !~* '^https://'
    THEN RAISE EXCEPTION 'Extrato, data, saldo, compromissos anteriores e evidência SEI são obrigatórios.'; END IF;
    IF v_comp.credito_fms_valor IS NULL OR v_comp.credito_fms_data IS NULL
      OR nullif(btrim(v_comp.credito_fms_referencia),'') IS NULL
      OR coalesce(v_comp.credito_fms_link,'') !~* '^https://'
    THEN RAISE EXCEPTION 'Registre o crédito efetivo do FMS, inclusive evidência documental, na Etapa 4.'; END IF;
    IF v_conta.data_saldo < v_comp.credito_fms_data THEN
      RAISE EXCEPTION 'O extrato da disponibilidade deve ser posterior ou igual ao registro do crédito do FMS.';
    END IF;
    IF v_comp.valor_homologado IS NULL OR v_comp.valor_transferido IS NULL THEN
      RAISE EXCEPTION 'Não é possível confirmar disponibilidade sem homologação federal.';
    END IF;
    IF v_comp.valor_transferido IS NOT NULL AND
      abs(v_comp.credito_fms_valor - v_comp.valor_transferido) > 0.02 AND
      length(btrim(coalesce(v_comp.justificativa_credito,''))) < 20 THEN
      RAISE EXCEPTION 'Crédito divergente do previsto exige justificativa documental detalhada.';
    END IF;
    SELECT round(coalesce(sum(p.valor_devido),0),2) INTO v_devido
      FROM public.piso_participantes p
      WHERE p.competencia_id=NEW.competencia_id AND NOT p.sem_elegiveis;
    IF abs(v_devido - v_comp.valor_homologado) > 0.02 THEN
      RAISE EXCEPTION 'Soma institucional não confere com o valor homologado.';
    END IF;
    SELECT coalesce(sum(valor_reservado),0) INTO v_outras FROM public.piso_afc_conciliacoes
      WHERE conta_id=NEW.conta_id AND competencia_id<>NEW.competencia_id
        AND situacao IN ('confirmada','reconferir');
    IF v_devido > v_conta.saldo_bancario - v_conta.compromissos_preexistentes - v_outras + 0.009 THEN
      RAISE EXCEPTION 'Disponibilidade insuficiente: esta conta já possui compromissos ou reservas de outras competências.';
    END IF;
    NEW.valor_reservado:=v_devido;
    NEW.confirmada_em:=now();
    NEW.confirmada_por:=auth.uid();
  ELSIF NEW.situacao='excecao_autorizada' THEN
    IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Somente administrador registra decisão institucional excepcional.';
    END IF;
    IF length(btrim(coalesce(NEW.justificativa,'')))<20
      OR nullif(btrim(coalesce(NEW.autorizacao_excecao_sei,'')),'') IS NULL
      OR coalesce(NEW.autorizacao_excecao_link,'') !~* '^https://'
      OR nullif(btrim(coalesce(NEW.responsavel_excecao,'')),'') IS NULL
    THEN RAISE EXCEPTION 'Exceção exige autorização institucional, responsável, SEI e justificativa formal.'; END IF;
    NEW.valor_reservado:=0;
    NEW.confirmada_em:=now();
    NEW.confirmada_por:=auth.uid();
  ELSIF NEW.situacao='reconferir' AND TG_OP='UPDATE' THEN
    -- Reserva já alocada permanece indisponível até revisão explícita.
    NEW.valor_reservado:=OLD.valor_reservado;
    NEW.confirmada_em:=null;
    NEW.confirmada_por:=null;
  ELSE
    NEW.valor_reservado:=0;
    NEW.confirmada_em:=null;
    NEW.confirmada_por:=null;
  END IF;
  NEW.atualizado_por:=auth.uid();
  NEW.updated_at:=now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.piso_afc_validar_conciliacao() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_piso_afc_validar_conciliacao BEFORE INSERT OR UPDATE
  ON public.piso_afc_conciliacoes FOR EACH ROW
  EXECUTE FUNCTION public.piso_afc_validar_conciliacao();

-- Evita alteração retroativa de saldo bancário que invalidaria reservas já conferidas.
CREATE OR REPLACE FUNCTION public.piso_afc_proteger_conta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND
     NOT public.has_any_role(auth.uid(), ARRAY['admin','acp']::public.app_role[]) THEN
    RAISE EXCEPTION 'Acesso restrito à ACP e administradores.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.piso_afc_conciliacoes
    WHERE conta_id=OLD.id AND situacao IN ('confirmada','reconferir')) AND (
    NEW.saldo_bancario IS DISTINCT FROM OLD.saldo_bancario OR
    NEW.compromissos_preexistentes IS DISTINCT FROM OLD.compromissos_preexistentes OR
    NEW.data_saldo IS DISTINCT FROM OLD.data_saldo OR
    NEW.documento_sei IS DISTINCT FROM OLD.documento_sei OR
    NEW.documento_link IS DISTINCT FROM OLD.documento_link
  ) THEN
    RAISE EXCEPTION 'Há conciliação confirmada nesta conta. Reabra as conciliações vinculadas antes de alterar a fonte bancária.';
  END IF;
  NEW.updated_at:=now();
  NEW.atualizado_por:=auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.piso_afc_proteger_conta() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_piso_afc_proteger_conta BEFORE UPDATE ON public.piso_afc_contas_fms
 FOR EACH ROW EXECUTE FUNCTION public.piso_afc_proteger_conta();

-- Auditoria de cada confirmação, revisão, edição e solicitação de revisão do desconto.
CREATE OR REPLACE FUNCTION public.piso_afc_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
  IF TG_TABLE_NAME='piso_afc_conciliacoes' AND TG_OP='UPDATE' AND
    (NEW.situacao IS DISTINCT FROM OLD.situacao OR
     NEW.conta_id IS DISTINCT FROM OLD.conta_id OR
     NEW.valor_reservado IS DISTINCT FROM OLD.valor_reservado) THEN
    UPDATE public.piso_competencias c SET etapas_reconferir=(
       SELECT coalesce(array_agg(DISTINCT n ORDER BY n),ARRAY[]::integer[])
       FROM unnest(COALESCE(c.etapas_reconferir,ARRAY[]::integer[]) ||
         CASE WHEN coalesce((c.etapas_concluidas->>'4')::boolean,false)
           THEN ARRAY[4]::integer[] ELSE ARRAY[]::integer[] END ||
         CASE WHEN coalesce((c.etapas_concluidas->>'9')::boolean,false)
           THEN ARRAY[9]::integer[] ELSE ARRAY[]::integer[] END) n
    ) WHERE c.id=NEW.competencia_id AND c.status<>'encerrada';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.piso_afc_auditar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_piso_afc_conciliacoes_audit AFTER INSERT OR UPDATE
 ON public.piso_afc_conciliacoes FOR EACH ROW EXECUTE FUNCTION public.piso_afc_auditar();
CREATE TRIGGER trg_piso_afc_contas_audit AFTER INSERT OR UPDATE
 ON public.piso_afc_contas_fms FOR EACH ROW EXECUTE FUNCTION public.piso_afc_auditar();

-- Alterações em evidências financeiras tornam a confirmação anterior pendente
-- de reconferência. A reserva permanece bloqueada, prevenindo dupla utilização.
CREATE OR REPLACE FUNCTION public.piso_afc_reconferir_evidencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.piso_afc_reconferir_evidencia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_piso_afc_reconferir_evidencia AFTER UPDATE OF
  valor_homologado, desconto_saldo, acerto_contas, valor_transferido,
  credito_fms_valor, credito_fms_data, credito_fms_referencia,
  credito_fms_link, saldo_afc_anterior, fonte_saldo_afc
  ON public.piso_competencias FOR EACH ROW
  EXECUTE FUNCTION public.piso_afc_reconferir_evidencia();

-- Encerramento mensal: disponibilidade comprovada ou decisão excepcional FORMAL.
-- Não interfere na preparação simultânea de empenhos nem na 13ª parcela.
CREATE OR REPLACE FUNCTION public.piso_afc_guardar_encerramento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status='encerrada' AND OLD.status IS DISTINCT FROM 'encerrada'
     AND NEW.tipo_parcela<>'decimo_terceiro' AND
     NOT EXISTS (SELECT 1 FROM public.piso_afc_conciliacoes cf
       WHERE cf.competencia_id=NEW.id AND cf.situacao IN ('confirmada','excecao_autorizada'))
  THEN
    RAISE EXCEPTION 'Encerramento exige conciliação da AFC com comprovação ou decisão excepcional autorizada.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.piso_afc_guardar_encerramento() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_piso_afc_guardar_encerramento BEFORE UPDATE OF status
 ON public.piso_competencias FOR EACH ROW EXECUTE FUNCTION public.piso_afc_guardar_encerramento();

COMMIT;
