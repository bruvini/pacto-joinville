-- PACTO Joinville · Emendas: lançamentos vinculados a parcelas e Fase 3 documental
-- Migration aditiva. Abrir um lançamento cria PREVISÕES; não reserva recursos até formalização.
BEGIN;

CREATE TABLE public.emenda_lancamentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 competencia_inicial date NOT NULL CHECK (EXTRACT(DAY FROM competencia_inicial)=1),
 periodicidade text NOT NULL CHECK (periodicidade IN ('mensal','trimestral','anual')),
 parcela_inicial integer NOT NULL CHECK (parcela_inicial BETWEEN 1 AND 9999),
 chave_idempotencia uuid NOT NULL,
 status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','formalizado','emitido','cancelado')),
 solicitacao_id uuid UNIQUE REFERENCES public.emenda_solicitacoes(id),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(emenda_id,chave_idempotencia),
 UNIQUE(id,emenda_id)
);
CREATE TABLE public.emenda_lancamento_meses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 ordem integer NOT NULL CHECK (ordem BETWEEN 1 AND 12),
 parcela_convenio integer NOT NULL CHECK (parcela_convenio BETWEEN 1 AND 9999),
 liberacoes_minimas integer NOT NULL DEFAULT 1 CHECK(liberacoes_minimas>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lancamento_id,ordem), UNIQUE(lancamento_id,competencia_id),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id),
 FOREIGN KEY(competencia_id,emenda_id) REFERENCES public.emenda_competencias(id,emenda_id)
);
CREATE TABLE public.emenda_etapas_documentais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 etapa text NOT NULL CHECK (etapa IN ('dotacao','autorizacao','solicitacao')),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 dotacao text,
 fonte text,
 valor_solicitado numeric(16,2),
 conferido_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 conferido_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lancamento_id,etapa),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id),
 CONSTRAINT etapa_dotacao_obrigatoria CHECK
  (etapa<>'dotacao' OR (length(btrim(coalesce(dotacao,'')))>0 AND length(btrim(coalesce(fonte,'')))>0)),
 CONSTRAINT etapa_valor_solicitacao CHECK
  (etapa<>'solicitacao' OR (valor_solicitado IS NOT NULL AND valor_solicitado>0))
);
CREATE TABLE public.emenda_assinaturas_conferidas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 papel text NOT NULL CHECK (papel IN ('fiscal','gerencia','diretoria')),
 nome_signatario text NOT NULL CHECK (length(btrim(nome_signatario))>2),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 conferido_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 conferido_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lancamento_id,papel),
 FOREIGN KEY(lancamento_id,emenda_id) REFERENCES public.emenda_lancamentos(id,emenda_id)
);
ALTER TABLE public.emenda_competencias_filhas
 ADD COLUMN parcela_convenio integer CHECK(parcela_convenio BETWEEN 1 AND 9999);

CREATE INDEX emenda_lancamentos_emenda ON public.emenda_lancamentos(emenda_id,competencia_inicial DESC);
CREATE INDEX emenda_lancamento_meses_parcela ON public.emenda_lancamento_meses(emenda_id,parcela_convenio);
CREATE INDEX emenda_etapas_lancamento ON public.emenda_etapas_documentais(lancamento_id);
CREATE INDEX emenda_assinaturas_lancamento ON public.emenda_assinaturas_conferidas(lancamento_id);

ALTER TABLE public.emenda_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_lancamento_meses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_etapas_documentais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_assinaturas_conferidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emenda_lancamentos,public.emenda_lancamento_meses,
 public.emenda_etapas_documentais,public.emenda_assinaturas_conferidas
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_lancamentos,public.emenda_lancamento_meses,
 public.emenda_etapas_documentais,public.emenda_assinaturas_conferidas TO authenticated;
CREATE POLICY emenda_lancamentos_read ON public.emenda_lancamentos
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_lancamento_meses_read ON public.emenda_lancamento_meses
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_etapas_read ON public.emenda_etapas_documentais
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_assinaturas_read ON public.emenda_assinaturas_conferidas
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

CREATE FUNCTION public.emenda_auditar_lancamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE v jsonb; anterior jsonb; novo jsonb;
BEGIN
 anterior:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 novo:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 v:=coalesce(novo,anterior);
 INSERT INTO public.emenda_historico(emenda_id,tabela,registro_id,acao,anterior,novo,usuario_id)
 VALUES((v->>'emenda_id')::uuid,TG_TABLE_NAME,(v->>'id')::uuid,TG_OP,anterior,novo,auth.uid());
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;$body$;
REVOKE ALL ON FUNCTION public.emenda_auditar_lancamento() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_emenda_lancamentos AFTER INSERT OR UPDATE OR DELETE ON public.emenda_lancamentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_lancamento_meses AFTER INSERT OR UPDATE OR DELETE ON public.emenda_lancamento_meses
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_etapas AFTER INSERT OR UPDATE OR DELETE ON public.emenda_etapas_documentais
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_assinaturas AFTER INSERT OR UPDATE OR DELETE ON public.emenda_assinaturas_conferidas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

CREATE FUNCTION public.emenda_iniciar_lancamento(
 p_emenda uuid,p_competencia text,p_periodicidade text,p_parcela integer,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); primeira date; mensal date; n integer; i integer; global_id uuid;
        lancamento_id uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para abrir lançamento.' USING ERRCODE='42501'; END IF;
 IF p_competencia IS NULL OR p_competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
 THEN RAISE EXCEPTION 'Competência inválida: use MM/AAAA.'; END IF;
 n:=CASE p_periodicidade WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 ELSE NULL END;
 IF n IS NULL OR p_parcela IS NULL OR p_parcela<1 OR p_parcela+n-1>9999 OR p_chave IS NULL
 THEN RAISE EXCEPTION 'Periodicidade, parcela ou identificador inválido.'; END IF;
 primeira:=make_date(substring(p_competencia,4,4)::integer,substring(p_competencia,1,2)::integer,1);
 PERFORM 1 FROM public.emendas
 WHERE id=p_emenda AND situacao IN ('ativa','cadastrada') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda inexistente, suspensa ou encerrada.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.emendas WHERE id=p_emenda AND convenio_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Vincule um convênio antes de informar parcelas no lançamento.'; END IF;
 SELECT id INTO lancamento_id FROM public.emenda_lancamentos WHERE emenda_id=p_emenda AND chave_idempotencia=p_chave;
 IF lancamento_id IS NOT NULL THEN RETURN lancamento_id; END IF;
 INSERT INTO public.emenda_lancamentos(emenda_id,competencia_inicial,periodicidade,parcela_inicial,chave_idempotencia)
 VALUES(p_emenda,primeira,p_periodicidade,p_parcela,p_chave) RETURNING id INTO lancamento_id;
 FOR i IN 0..n-1 LOOP
  mensal:=(primeira+make_interval(months=>i))::date;
  IF extract(year FROM mensal)>2100 THEN RAISE EXCEPTION 'Ano de competência fora do limite.'; END IF;
  INSERT INTO public.emenda_competencias(emenda_id,competencia)
   VALUES(p_emenda,mensal) ON CONFLICT(emenda_id,competencia) DO NOTHING;
  SELECT id INTO global_id FROM public.emenda_competencias WHERE emenda_id=p_emenda AND competencia=mensal;
  INSERT INTO public.emenda_lancamento_meses(emenda_id,lancamento_id,competencia_id,ordem,parcela_convenio)
   VALUES(p_emenda,lancamento_id,global_id,i+1,p_parcela+i);
 END LOOP;
 RETURN lancamento_id;
END;$body$;

CREATE FUNCTION public.emenda_salvar_etapa(
 p_lancamento uuid,p_etapa text,p_numero_sei text,p_link_sei text,
 p_dotacao text DEFAULT NULL,p_fonte text DEFAULT NULL,p_valor numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE; retorno uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para atualizar etapas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF lan.status<>'rascunho' THEN RAISE EXCEPTION 'Etapas já formalizadas; não é permitido sobrescrever evidências.'; END IF;
 IF p_etapa NOT IN ('dotacao','autorizacao','solicitacao') OR p_etapa IS NULL
 THEN RAISE EXCEPTION 'Etapa inválida.'; END IF;
 IF length(btrim(coalesce(p_numero_sei,'')))=0 OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link SEI HTTPS são obrigatórios.'; END IF;
 IF p_etapa='dotacao' AND (length(btrim(coalesce(p_dotacao,'')))=0 OR length(btrim(coalesce(p_fonte,'')))=0)
 THEN RAISE EXCEPTION 'Dotação e fonte são obrigatórias.'; END IF;
 IF p_etapa='solicitacao' AND (p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2))
 THEN RAISE EXCEPTION 'Valor solicitado inválido.'; END IF;
 IF p_etapa='autorizacao' AND NOT EXISTS
  (SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='dotacao')
 THEN RAISE EXCEPTION 'Conclua a dotação antes da autorização.'; END IF;
 IF p_etapa='solicitacao' AND NOT EXISTS
  (SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='autorizacao')
 THEN RAISE EXCEPTION 'Conclua a autorização antes da solicitação.'; END IF;
 INSERT INTO public.emenda_etapas_documentais
  (emenda_id,lancamento_id,etapa,numero_sei,link_sei,dotacao,fonte,valor_solicitado)
 VALUES(lan.emenda_id,p_lancamento,p_etapa,btrim(p_numero_sei),btrim(p_link_sei),
        CASE WHEN p_etapa='dotacao' THEN btrim(p_dotacao) ELSE NULL END,
        CASE WHEN p_etapa='dotacao' THEN btrim(p_fonte) ELSE NULL END,
        CASE WHEN p_etapa='solicitacao' THEN p_valor ELSE NULL END)
 ON CONFLICT(lancamento_id,etapa) DO UPDATE SET
  numero_sei=excluded.numero_sei,link_sei=excluded.link_sei,
  dotacao=excluded.dotacao,fonte=excluded.fonte,valor_solicitado=excluded.valor_solicitado,
  conferido_por=ator,conferido_em=now()
 RETURNING id INTO retorno;
 -- Atualizar a dotação invalida a autorização e solicitação anteriores;
 -- atualizar a autorização invalida a solicitação, inclusive suas assinaturas.
 IF p_etapa='dotacao' THEN
  DELETE FROM public.emenda_etapas_documentais
    WHERE lancamento_id=p_lancamento AND etapa IN ('autorizacao','solicitacao');
 ELSIF p_etapa='autorizacao' THEN
  DELETE FROM public.emenda_etapas_documentais
    WHERE lancamento_id=p_lancamento AND etapa='solicitacao';
 END IF;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=p_lancamento;
 RETURN retorno;
END;$body$;

CREATE FUNCTION public.emenda_conferir_assinatura(
 p_lancamento uuid,p_papel text,p_nome text,p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE; retorno uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para conferência.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF lan.status<>'rascunho' THEN RAISE EXCEPTION 'Lançamento já formalizado.'; END IF;
 IF (SELECT count(DISTINCT etapa) FROM public.emenda_etapas_documentais
      WHERE lancamento_id=p_lancamento)<>3
 THEN RAISE EXCEPTION 'Conclua dotação, autorização e solicitação antes de conferir as assinaturas.'; END IF;
 IF p_papel NOT IN ('fiscal','gerencia','diretoria') OR p_papel IS NULL
  OR length(btrim(coalesce(p_nome,'')))<3
  OR length(btrim(coalesce(p_numero_sei,'')))=0
  OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Informe papel, signatário e documento SEI assinado.'; END IF;
 INSERT INTO public.emenda_assinaturas_conferidas
 (emenda_id,lancamento_id,papel,nome_signatario,numero_sei,link_sei)
 VALUES(lan.emenda_id,p_lancamento,p_papel,btrim(p_nome),btrim(p_numero_sei),btrim(p_link_sei))
 ON CONFLICT(lancamento_id,papel) DO UPDATE SET
 nome_signatario=excluded.nome_signatario,numero_sei=excluded.numero_sei,
 link_sei=excluded.link_sei,conferido_por=ator,conferido_em=now()
 RETURNING id INTO retorno;
 RETURN retorno;
END;$body$;

CREATE FUNCTION public.emenda_formalizar_lancamento(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE;
 etapa public.emenda_etapas_documentais%ROWTYPE; id_solicitacao uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para formalizar.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF lan.solicitacao_id IS NOT NULL THEN RETURN lan.solicitacao_id; END IF;
 IF lan.status<>'rascunho' THEN RAISE EXCEPTION 'Situação inválida para formalização.'; END IF;
 IF (SELECT count(DISTINCT etapa) FROM public.emenda_etapas_documentais
     WHERE lancamento_id=p_lancamento)<>3
   OR (SELECT count(DISTINCT papel) FROM public.emenda_assinaturas_conferidas
     WHERE lancamento_id=p_lancamento)<>3
 THEN RAISE EXCEPTION 'Etapas documentais e três assinaturas conferidas são obrigatórias.'; END IF;
 SELECT * INTO etapa FROM public.emenda_etapas_documentais
  WHERE lancamento_id=p_lancamento AND etapa='solicitacao';
 id_solicitacao:=public.emenda_formalizar_solicitacao(
  lan.emenda_id,to_char(lan.competencia_inicial,'MM/YYYY'),lan.periodicidade,
  etapa.valor_solicitado,etapa.numero_sei,etapa.link_sei,lan.chave_idempotencia);
 UPDATE public.emenda_competencias_filhas f SET
  parcela_convenio=m.parcela_convenio
 FROM public.emenda_lancamento_meses m
 WHERE f.solicitacao_id=id_solicitacao AND m.lancamento_id=p_lancamento
  AND f.competencia_id=m.competencia_id;
 UPDATE public.emenda_lancamentos SET solicitacao_id=id_solicitacao,
  status='formalizado',updated_at=now() WHERE id=p_lancamento;
 RETURN id_solicitacao;
END;$body$;

CREATE FUNCTION public.emenda_registrar_ne_documental(
 p_lancamento uuid,p_numero_ne text,p_exercicio integer,p_valor numeric,
 p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE ator uuid:=auth.uid(); lan public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão para registrar NE.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lan.emenda_id FOR UPDATE;
 SELECT * INTO lan FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF lan.solicitacao_id IS NULL OR lan.status NOT IN ('formalizado','emitido')
 THEN RAISE EXCEPTION 'Formalize primeiro a solicitação e confira assinaturas.'; END IF;
 r:=public.emenda_registrar_ne(lan.solicitacao_id,p_numero_ne,p_exercicio,p_valor,p_numero_sei,p_link_sei);
 UPDATE public.emenda_lancamentos SET status='emitido',updated_at=now() WHERE id=p_lancamento;
 RETURN r;
END;$body$;

-- A Fase 2 continua acessível apenas internamente por RPCs privilegiadas;
-- evita criação de reservas/notas contornando as etapas e assinaturas da Fase 3.
REVOKE ALL ON FUNCTION public.emenda_formalizar_solicitacao(uuid,text,text,numeric,text,text,uuid),
 public.emenda_registrar_ne(uuid,text,integer,numeric,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_iniciar_lancamento(uuid,text,text,integer,uuid),
 public.emenda_salvar_etapa(uuid,text,text,text,text,text,numeric),
 public.emenda_conferir_assinatura(uuid,text,text,text,text),
 public.emenda_formalizar_lancamento(uuid),
 public.emenda_registrar_ne_documental(uuid,text,integer,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_iniciar_lancamento(uuid,text,text,integer,uuid),
 public.emenda_salvar_etapa(uuid,text,text,text,text,text,numeric),
 public.emenda_conferir_assinatura(uuid,text,text,text,text),
 public.emenda_formalizar_lancamento(uuid),
 public.emenda_registrar_ne_documental(uuid,text,integer,numeric,text,text) TO authenticated;

COMMENT ON TABLE public.emenda_lancamentos IS 'Lançamentos independentes do empenho, com competências/parcelas previstas antes de qualquer reserva.';
COMMENT ON TABLE public.emenda_assinaturas_conferidas IS 'Conferência humana de evidências SEI; não equivale a assinatura digital.';
COMMIT;