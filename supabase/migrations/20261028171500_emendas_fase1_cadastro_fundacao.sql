-- PACTO Joinville — Emendas Parlamentares: Fase 1 (cadastro e fundação).
-- Não executa movimentações financeiras nem cria notas/pagamentos.
-- Os eventos formais de ajuste são a ÚNICA fonte de alteração do limite vigente.
BEGIN;

CREATE TABLE public.emendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL CHECK (length(btrim(numero)) BETWEEN 3 AND 50),
  exercicio integer NOT NULL CHECK (exercicio BETWEEN 2000 AND 2100),
  modalidade text NOT NULL CHECK (length(btrim(modalidade)) BETWEEN 2 AND 120),
  autoria_parlamentar text NOT NULL CHECK (length(btrim(autoria_parlamentar)) BETWEEN 2 AND 200),
  origem_recurso text NOT NULL CHECK (length(btrim(origem_recurso)) BETWEEN 2 AND 160),
  objeto text NOT NULL CHECK (length(btrim(objeto)) BETWEEN 3 AND 1000),
  finalidade text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  valor_autorizado_inicial numeric(16,2) NOT NULL CHECK (valor_autorizado_inicial >= 0),
  situacao text NOT NULL DEFAULT 'cadastrada' CHECK (situacao IN ('cadastrada','ativa','suspensa','encerrada')),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id),
  convenio_id uuid REFERENCES public.convenios(id),
  termo_aditivo_id uuid REFERENCES public.termos_aditivos(id),
  numero_proposta text,
  data_publicacao date,
  competencia_inicial text CHECK (competencia_inicial IS NULL OR competencia_inicial ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'),
  periodicidade_padrao text NOT NULL DEFAULT 'mensal'
    CHECK (periodicidade_padrao IN ('mensal','trimestral','anual')),
  prazo_execucao_dias integer CHECK (prazo_execucao_dias IS NULL OR prazo_execucao_dias BETWEEN 1 AND 3650),
  exige_atesto boolean NOT NULL DEFAULT true,
  responsavel_id uuid REFERENCES auth.users(id),
  processo_sei_numero text,
  processo_sei_link text,
  observacoes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emendas_numero_exercicio_unique UNIQUE (numero,exercicio),
  CONSTRAINT emendas_convenio_termo CHECK (termo_aditivo_id IS NULL OR convenio_id IS NOT NULL),
  CONSTRAINT emendas_link_processo CHECK (processo_sei_link IS NULL OR processo_sei_link ~* '^https://[^[:space:]]+$')
);

CREATE TABLE public.emenda_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
  categoria text NOT NULL CHECK (categoria IN ('normativa','administrativa','processo','financeira','outros')),
  tipo text NOT NULL CHECK (length(btrim(tipo)) BETWEEN 2 AND 120),
  numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) BETWEEN 1 AND 100),
  link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
  data_documento date,
  descricao text NOT NULL DEFAULT '',
  situacao text NOT NULL DEFAULT 'informado'
    CHECK (situacao IN ('informado','conferido','substituido','cancelado')),
  origem text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.emenda_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
  exercicio integer NOT NULL CHECK (exercicio BETWEEN 2000 AND 2100),
  dotacao text NOT NULL CHECK (length(btrim(dotacao)) BETWEEN 1 AND 100),
  fonte text NOT NULL CHECK (length(btrim(fonte)) BETWEEN 1 AND 100),
  valor_referencia numeric(16,2) CHECK (valor_referencia IS NULL OR valor_referencia >= 0),
  documento_sei_numero text,
  documento_sei_link text CHECK (documento_sei_link IS NULL OR documento_sei_link ~* '^https://[^[:space:]]+$'),
  observacoes text NOT NULL DEFAULT '',
  ativa boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.emenda_ajustes_valor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
  valor_anterior numeric(16,2) NOT NULL CHECK (valor_anterior >= 0),
  variacao numeric(16,2) NOT NULL CHECK (variacao <> 0),
  valor_novo numeric(16,2) NOT NULL CHECK (valor_novo >= 0),
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 10 AND 2000),
  documento_sei_numero text NOT NULL CHECK (length(btrim(documento_sei_numero)) BETWEEN 1 AND 100),
  documento_sei_link text NOT NULL CHECK (documento_sei_link ~* '^https://[^[:space:]]+$'),
  registrado_por uuid NOT NULL REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emenda_ajustes_total_check CHECK (valor_anterior + variacao = valor_novo)
);

CREATE TABLE public.emenda_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  acao text NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE')),
  anterior jsonb,
  novo jsonb,
  usuario_id uuid,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX emenda_documentos_idx ON public.emenda_documentos (emenda_id, created_at DESC);
CREATE INDEX emenda_fontes_idx ON public.emenda_fontes (emenda_id, exercicio);
CREATE INDEX emenda_ajustes_valor_idx ON public.emenda_ajustes_valor (emenda_id, registrado_em);
CREATE INDEX emenda_historico_idx ON public.emenda_historico (emenda_id, ocorrido_em DESC);
CREATE INDEX emendas_prestador_idx ON public.emendas (prestador_id, exercicio DESC);

-- Trigger de integridade relacional e imutabilidade do valor-base.
CREATE FUNCTION public.emenda_validar_cadastro()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.valor_autorizado_inicial IS DISTINCT FROM OLD.valor_autorizado_inicial OR
       NEW.created_by IS DISTINCT FROM OLD.created_by OR
       NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN RAISE EXCEPTION 'Dados imutáveis: utilize uma movimentação formal para ajustar o valor autorizado.'
        USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.convenio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.convenios c
    WHERE c.id=NEW.convenio_id AND c.prestador_id=NEW.prestador_id
  ) THEN
    RAISE EXCEPTION 'O convênio selecionado não pertence à instituição da emenda.' USING ERRCODE='23514';
  END IF;
  IF NEW.termo_aditivo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.termos_aditivos t WHERE t.id=NEW.termo_aditivo_id AND t.convenio_id=NEW.convenio_id
  ) THEN
    RAISE EXCEPTION 'O termo aditivo não pertence ao convênio selecionado.' USING ERRCODE='23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER emenda_validar_cadastro_trg BEFORE INSERT OR UPDATE ON public.emendas
  FOR EACH ROW EXECUTE FUNCTION public.emenda_validar_cadastro();

CREATE FUNCTION public.emenda_validar_filho()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.emenda_id IS DISTINCT FROM OLD.emenda_id OR
    NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'Não é permitido mover ou reatribuir documentos/fontes entre emendas.'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER emenda_documento_validar BEFORE INSERT OR UPDATE ON public.emenda_documentos
  FOR EACH ROW EXECUTE FUNCTION public.emenda_validar_filho();
CREATE TRIGGER emenda_fonte_validar BEFORE INSERT OR UPDATE ON public.emenda_fontes
  FOR EACH ROW EXECUTE FUNCTION public.emenda_validar_filho();

-- Auditoria não editável pela API. Trigger com permissões do proprietário, não do cliente.
CREATE FUNCTION public.emenda_registrar_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE chave uuid;
BEGIN
  chave := CASE WHEN TG_TABLE_NAME='emendas'
    THEN COALESCE(NEW.id,OLD.id)
    ELSE COALESCE(NEW.emenda_id,OLD.emenda_id) END;
  INSERT INTO public.emenda_historico (emenda_id,tabela,registro_id,acao,anterior,novo,usuario_id)
  VALUES (chave,TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),TG_OP,
          CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,auth.uid());
  RETURN COALESCE(NEW,OLD);
END;
$fn$;
CREATE TRIGGER emenda_audit_emendas AFTER INSERT OR UPDATE ON public.emendas
  FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_audit_documentos AFTER INSERT OR UPDATE ON public.emenda_documentos
  FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_audit_fontes AFTER INSERT OR UPDATE ON public.emenda_fontes
  FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_audit_ajustes AFTER INSERT ON public.emenda_ajustes_valor
  FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();

-- Ajuste formal: o registro é atômico, serializado por emenda e nunca sobrescreve a base.
CREATE FUNCTION public.emenda_registrar_ajuste(
  p_emenda_id uuid, p_variacao numeric, p_motivo text,
  p_documento_sei_numero text, p_documento_sei_link text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid := auth.uid(); anterior numeric(16,2); novo numeric(16,2);
BEGIN
  IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
    THEN RAISE EXCEPTION 'Sem autorização para ajustar emendas.' USING ERRCODE='42501'; END IF;
  IF p_variacao IS NULL OR p_variacao=0 OR scale(p_variacao)>2
    THEN RAISE EXCEPTION 'Informe um ajuste não nulo com duas casas decimais.'; END IF;
  IF length(btrim(coalesce(p_motivo,'')))<10 OR
     length(btrim(coalesce(p_documento_sei_numero,'')))=0 OR
     coalesce(p_documento_sei_link,'') !~* '^https://[^[:space:]]+$'
    THEN RAISE EXCEPTION 'Justificativa e documento SEI com link HTTPS são obrigatórios.'; END IF;

  PERFORM 1 FROM public.emendas WHERE id=p_emenda_id AND situacao<>'encerrada' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Emenda inexistente ou encerrada.'; END IF;
  SELECT e.valor_autorizado_inicial + COALESCE(sum(a.variacao),0)
    INTO anterior FROM public.emendas e
    LEFT JOIN public.emenda_ajustes_valor a ON a.emenda_id=e.id
    WHERE e.id=p_emenda_id GROUP BY e.id;
  novo := anterior + p_variacao;
  IF novo < 0 THEN RAISE EXCEPTION 'O valor autorizado vigente não pode ficar negativo.'; END IF;
  INSERT INTO public.emenda_ajustes_valor
    (emenda_id,valor_anterior,variacao,valor_novo,motivo,documento_sei_numero,documento_sei_link,registrado_por)
  VALUES (p_emenda_id,anterior,p_variacao,novo,btrim(p_motivo),btrim(p_documento_sei_numero),
          btrim(p_documento_sei_link),ator);
  RETURN novo;
END;
$fn$;

-- Exposição segura na Data API; a view respeita RLS do chamador.
CREATE VIEW public.emendas_resumo WITH (security_invoker=true) AS
SELECT e.id,e.numero,e.exercicio,e.prestador_id,e.situacao,e.valor_autorizado_inicial,
  e.valor_autorizado_inicial + coalesce(sum(a.variacao),0)::numeric(16,2) AS valor_autorizado_vigente,
  count(a.id)::integer AS total_ajustes
FROM public.emendas e LEFT JOIN public.emenda_ajustes_valor a ON a.emenda_id=e.id
GROUP BY e.id;

ALTER TABLE public.emendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_ajustes_valor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.emendas,public.emenda_documentos,public.emenda_fontes,
  public.emenda_ajustes_valor,public.emenda_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.emendas,public.emenda_documentos,public.emenda_fontes TO authenticated;
GRANT SELECT ON public.emenda_ajustes_valor,public.emenda_historico,public.emendas_resumo TO authenticated;

CREATE POLICY "emendas_read" ON public.emendas FOR SELECT TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY "emendas_insert" ON public.emendas FOR INSERT TO authenticated
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]) AND created_by=(select auth.uid()));
CREATE POLICY "emendas_update" ON public.emendas FOR UPDATE TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]))
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]));

CREATE POLICY "emenda_documentos_read" ON public.emenda_documentos FOR SELECT TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY "emenda_documentos_insert" ON public.emenda_documentos FOR INSERT TO authenticated
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]) AND created_by=(select auth.uid()));
CREATE POLICY "emenda_documentos_update" ON public.emenda_documentos FOR UPDATE TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]))
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]));

CREATE POLICY "emenda_fontes_read" ON public.emenda_fontes FOR SELECT TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY "emenda_fontes_insert" ON public.emenda_fontes FOR INSERT TO authenticated
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]) AND created_by=(select auth.uid()));
CREATE POLICY "emenda_fontes_update" ON public.emenda_fontes FOR UPDATE TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]))
 WITH CHECK (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role]));

CREATE POLICY "emenda_ajustes_read" ON public.emenda_ajustes_valor FOR SELECT TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY "emenda_historico_read" ON public.emenda_historico FOR SELECT TO authenticated
 USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

REVOKE ALL ON FUNCTION public.emenda_registrar_ajuste(uuid,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_registrar_ajuste(uuid,numeric,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.emenda_registrar_historico(),public.emenda_validar_cadastro(),public.emenda_validar_filho()
  FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE public.emendas IS 'Cadastro independente das Emendas Parlamentares, Fase 1; não gera empenhos nem pagamentos.';
COMMENT ON TABLE public.emenda_ajustes_valor IS 'Movimentações formais imutáveis que alteram o valor autorizado vigente; escrita somente por RPC.';
COMMENT ON TABLE public.emenda_historico IS 'Rastro somente-apensado das alterações nos cadastros das emendas.';
COMMIT;
