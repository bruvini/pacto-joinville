-- PACTO · Emendas parlamentares · fluxo sequencial e Fase 4
-- PRÉ-REQUISITO: Fases 1, 2 e 3 aplicadas. Migration única, transacional e aditiva.
-- Ações representam conferências de documentos e registros administrativos internos;
-- não realizam pagamentos nem emissão de empenhos na SEFAZ.
BEGIN;

-- Dotação/fonte: sem documento SEI nesta etapa, mas com confirmação humana
-- de registro no bloco da Coordenação de Orçamentos.
ALTER TABLE public.emenda_etapas_documentais
  ALTER COLUMN numero_sei DROP NOT NULL,
  ALTER COLUMN link_sei DROP NOT NULL,
  ADD COLUMN coord_orcamentos_confirmada boolean NOT NULL DEFAULT false;
ALTER TABLE public.emenda_etapas_documentais
  ADD CONSTRAINT emenda_etapas_sei_e_orcamentos CHECK (
    (etapa='dotacao' AND coord_orcamentos_confirmada AND
      nullif(btrim(coalesce(dotacao,'')),'') IS NOT NULL AND
      nullif(btrim(coalesce(fonte,'')),'') IS NOT NULL)
    OR (etapa IN ('autorizacao','solicitacao') AND numero_sei IS NOT NULL
      AND numero_sei <> '' AND link_sei ~* '^https://[^[:space:]]+$')
  ) NOT VALID;

-- Gate adicional: a formalização não pode contornar o atesto do bloco de
-- Coordenação de Orçamentos, inclusive em lançamentos de versões anteriores.
CREATE FUNCTION public.emenda_validar_formalizacao_orcamentos()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF NEW.status IN ('formalizado','emitido') AND OLD.status='rascunho'
  AND NOT EXISTS (SELECT 1 FROM public.emenda_etapas_documentais
    WHERE lancamento_id=NEW.id AND etapa='dotacao' AND coord_orcamentos_confirmada)
 THEN RAISE EXCEPTION 'Confirme o registro da dotação no bloco de Orçamentos antes de formalizar.';
 END IF;
 RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_validar_formalizacao_orcamentos() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER gate_emenda_formalizacao_orcamentos
 BEFORE UPDATE OF status ON public.emenda_lancamentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_validar_formalizacao_orcamentos();

CREATE TABLE public.emenda_comprovantes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 tipo text NOT NULL CHECK (tipo IN ('atesto','relatorio','nota_fiscal','outro')),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 descricao text,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id)
);
CREATE TABLE public.emenda_liberacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 tipo text NOT NULL CHECK (tipo IN ('original','complementar')),
 valor numeric(16,2) NOT NULL CHECK (valor>0),
 data_liberacao date NOT NULL,
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id)
);
CREATE UNIQUE INDEX emenda_liberacao_original_unica
 ON public.emenda_liberacoes(lancamento_id,competencia_id) WHERE tipo='original';
CREATE TABLE public.emenda_blocos_pagamento (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 liberacao_id uuid NOT NULL REFERENCES public.emenda_liberacoes(id) ON DELETE RESTRICT,
 identificacao text NOT NULL CHECK (length(btrim(identificacao))>0),
 valor numeric(16,2) NOT NULL CHECK (valor>0),
 data_pagamento date NOT NULL,
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id)
);
CREATE TABLE public.emenda_encerramentos_sem_execucao (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 justificativa text NOT NULL CHECK(length(btrim(justificativa))>=10),
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei))>0),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lancamento_id,competencia_id),
 FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id)
);

CREATE INDEX emenda_comprovantes_lookup ON public.emenda_comprovantes(emenda_id,lancamento_id,competencia_id);
CREATE INDEX emenda_liberacoes_lookup ON public.emenda_liberacoes(emenda_id,lancamento_id,competencia_id);
CREATE INDEX emenda_pagamentos_lookup ON public.emenda_blocos_pagamento(emenda_id,liberacao_id);
CREATE INDEX emenda_sem_execucao_lookup ON public.emenda_encerramentos_sem_execucao(emenda_id,lancamento_id);

ALTER TABLE public.emenda_comprovantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_liberacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_blocos_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_encerramentos_sem_execucao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emenda_comprovantes,public.emenda_liberacoes,
 public.emenda_blocos_pagamento,public.emenda_encerramentos_sem_execucao
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_comprovantes,public.emenda_liberacoes,
 public.emenda_blocos_pagamento,public.emenda_encerramentos_sem_execucao TO authenticated;
CREATE POLICY emenda_comprovantes_select ON public.emenda_comprovantes
 FOR SELECT TO authenticated USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_liberacoes_select ON public.emenda_liberacoes
 FOR SELECT TO authenticated USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pagamentos_select ON public.emenda_blocos_pagamento
 FOR SELECT TO authenticated USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_sem_execucao_select ON public.emenda_encerramentos_sem_execucao
 FOR SELECT TO authenticated USING (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE TRIGGER audit_emenda_comprovantes AFTER INSERT ON public.emenda_comprovantes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_liberacoes AFTER INSERT ON public.emenda_liberacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pagamentos AFTER INSERT ON public.emenda_blocos_pagamento
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_encerramentos AFTER INSERT ON public.emenda_encerramentos_sem_execucao
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

-- Uniformiza permissão: somente chamadas por RPC e papéis com autorização operacional.
CREATE FUNCTION public.emenda_confirmar_dotacao(
 p_lancamento uuid,p_dotacao text,p_fonte text,p_confirmado boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; retorno uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização para confirmar dotação.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' THEN RAISE EXCEPTION 'Lançamento já formalizado.'; END IF;
 IF p_confirmado IS DISTINCT FROM true OR nullif(btrim(coalesce(p_dotacao,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_fonte,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Informe dotação e fonte e confirme o bloco da Coordenação de Orçamentos.'; END IF;
 INSERT INTO public.emenda_etapas_documentais
  (emenda_id,lancamento_id,etapa,numero_sei,link_sei,dotacao,fonte,coord_orcamentos_confirmada)
 VALUES(l.emenda_id,p_lancamento,'dotacao',NULL,NULL,btrim(p_dotacao),btrim(p_fonte),true)
 ON CONFLICT(lancamento_id,etapa) DO UPDATE SET
  dotacao=excluded.dotacao,fonte=excluded.fonte,numero_sei=NULL,link_sei=NULL,
  coord_orcamentos_confirmada=true,conferido_por=ator,conferido_em=now()
 RETURNING id INTO retorno;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=p_lancamento;
 DELETE FROM public.emenda_etapas_documentais
  WHERE lancamento_id=p_lancamento AND etapa IN ('autorizacao','solicitacao');
 RETURN retorno;
END;$f$;

-- Substitui a antiga RPC pública de etapa; não aceita dotação sem confirmação.
CREATE FUNCTION public.emenda_salvar_etapa_documental(
 p_lancamento uuid,p_etapa text,p_numero_sei text,p_link_sei text,
 p_valor numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; retorno uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'rascunho' OR p_etapa NOT IN ('autorizacao','solicitacao')
 THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
 IF nullif(btrim(coalesce(p_numero_sei,'')),'') IS NULL
   OR coalesce(p_link_sei,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link HTTPS do SEI são obrigatórios.'; END IF;
 IF p_etapa='autorizacao' AND NOT EXISTS (
  SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento
   AND etapa='dotacao' AND coord_orcamentos_confirmada)
 THEN RAISE EXCEPTION 'Confirme primeiro a dotação no bloco de Orçamentos.'; END IF;
 IF p_etapa='solicitacao' AND NOT EXISTS (
  SELECT 1 FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='autorizacao')
 THEN RAISE EXCEPTION 'Conclua primeiro a autorização financeira.'; END IF;
 IF p_etapa='solicitacao' AND (p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2))
 THEN RAISE EXCEPTION 'Valor de solicitação inválido.'; END IF;
 INSERT INTO public.emenda_etapas_documentais
  (emenda_id,lancamento_id,etapa,numero_sei,link_sei,valor_solicitado)
 VALUES(l.emenda_id,p_lancamento,p_etapa,btrim(p_numero_sei),btrim(p_link_sei),
  CASE WHEN p_etapa='solicitacao' THEN p_valOR ELSE NULL END)
 ON CONFLICT(lancamento_id,etapa) DO UPDATE SET
  numero_sei=excluded.numero_sei,link_sei=excluded.link_sei,
  valor_solicitado=excluded.valor_solicitado,conferido_por=ator,conferido_em=now()
 RETURNING id INTO retorno;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=p_lancamento;
 IF p_etapa='autorizacao' THEN
  DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=p_lancamento AND etapa='solicitacao';
 END IF;
 RETURN retorno;
END;$f$;

-- Protege as próximas ações contra lançamentos sem nota emitida, encerramentos
-- ou operações concorrentes. Cada registro exige evidência SEI e autoria.
CREATE FUNCTION public.emenda_registrar_comprovante(
 p_lancamento uuid,p_competencia uuid,p_tipo text,p_numero text,p_link text,p_descricao text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' THEN RAISE EXCEPTION 'A NE deve estar registrada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses
   WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência não pertence ao lançamento.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao
   WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência encerrada sem execução.'; END IF;
 IF p_tipo NOT IN ('atesto','relatorio','nota_fiscal','outro') OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Tipo, número e link SEI são obrigatórios.'; END IF;
 INSERT INTO public.emenda_comprovantes(emenda_id,lancamento_id,competencia_id,tipo,numero_sei,link_sei,descricao)
 VALUES(l.emenda_id,p_lancamento,p_competencia,p_tipo,btrim(p_numero),btrim(p_link),nullif(btrim(p_descricao),''))
 RETURNING id INTO r;
 RETURN r;
END;$f$;

CREATE FUNCTION public.emenda_registrar_liberacao(
 p_lancamento uuid,p_competencia uuid,p_tipo text,p_valor numeric,
 p_data date,p_numero text,p_link text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; nota numeric;
  total numeric; original_existe boolean; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' OR l.solicitacao_id IS NULL
 THEN RAISE EXCEPTION 'Registre a NE antes das liberações.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses
  WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência não vinculada ao lançamento.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao
  WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência encerrada sem execução.'; END IF;
 IF p_tipo NOT IN ('original','complementar') OR p_data IS NULL OR p_data>CURRENT_DATE
  OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Tipo, valor, data e SEI da liberação são obrigatórios.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.emenda_liberacoes
  WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia AND tipo='original')
 INTO original_existe;
 IF (p_tipo='original' AND original_existe) OR (p_tipo='complementar' AND NOT original_existe)
 THEN RAISE EXCEPTION 'Primeiro registro deve ser original; somente uma original por competência.'; END IF;
 SELECT valor_ne INTO nota FROM public.emenda_solicitacoes WHERE id=l.solicitacao_id AND status IN ('emitida','encerrada');
 IF nota IS NULL THEN RAISE EXCEPTION 'NE não confirmada.'; END IF;
 SELECT coalesce(sum(valor),0) INTO total FROM public.emenda_liberacoes WHERE lancamento_id=p_lancamento;
 IF total+p_valor>nota THEN
  RAISE EXCEPTION 'Total das liberações ultrapassaria o valor da NE do lançamento.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_liberacoes(emenda_id,lancamento_id,competencia_id,tipo,valor,data_liberacao,numero_sei,link_sei)
 VALUES(l.emenda_id,p_lancamento,p_competencia,p_tipo,p_valor,p_data,btrim(p_numero),btrim(p_link))
 RETURNING id INTO r;
 RETURN r;
END;$f$;

CREATE FUNCTION public.emenda_registrar_bloco_pagamento(
 p_liberacao uuid,p_identificacao text,p_valor numeric,p_data date,p_numero text,p_link text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); lib public.emenda_liberacoes%ROWTYPE; l public.emenda_lancamentos%ROWTYPE;
 total numeric; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização.' USING ERRCODE='42501'; END IF;
 SELECT * INTO lib FROM public.emenda_liberacoes WHERE id=p_liberacao;
 IF NOT FOUND THEN RAISE EXCEPTION 'Liberação inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=lib.emenda_id FOR UPDATE;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=lib.lancamento_id;
 IF l.status<>'emitido' THEN RAISE EXCEPTION 'NE não registrada.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_encerramentos_sem_execucao
   WHERE lancamento_id=lib.lancamento_id AND competencia_id=lib.competencia_id)
 THEN RAISE EXCEPTION 'Competência encerrada sem execução.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_comprovantes WHERE lancamento_id=lib.lancamento_id
   AND competencia_id=lib.competencia_id)
 THEN RAISE EXCEPTION 'É obrigatório registrar um documento comprobatório antes do pagamento.'; END IF;
 IF p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2) OR p_data IS NULL
  OR p_data<lib.data_liberacao OR p_data>CURRENT_DATE
  OR nullif(btrim(coalesce(p_identificacao,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Identificação, valor, data e documento SEI do pagamento são obrigatórios.'; END IF;
 SELECT coalesce(sum(valor),0) INTO total FROM public.emenda_blocos_pagamento WHERE liberacao_id=p_liberacao;
 IF total+p_valor>lib.valor THEN
  RAISE EXCEPTION 'Total pago ultrapassaria esta liberação.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.emenda_blocos_pagamento
 (emenda_id,lancamento_id,competencia_id,liberacao_id,identificacao,valor,data_pagamento,numero_sei,link_sei)
 VALUES(lib.emenda_id,lib.lancamento_id,lib.competencia_id,p_liberacao,
  btrim(p_identificacao),p_valor,p_data,btrim(p_numero),btrim(p_link)) RETURNING id INTO r;
 RETURN r;
END;$f$;

CREATE FUNCTION public.emenda_encerrar_competencia_sem_execucao(
 p_lancamento uuid,p_competencia uuid,p_justificativa text,p_numero text,p_link text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ator uuid:=auth.uid(); l public.emenda_lancamentos%ROWTYPE; r uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem autorização.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF l.status<>'emitido' OR l.solicitacao_id IS NULL
 THEN RAISE EXCEPTION 'Registre a NE antes de encerrar a competência sem execução.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses
  WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Competência não pertence ao lançamento.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_liberacoes
  WHERE lancamento_id=p_lancamento AND competencia_id=p_competencia)
 THEN RAISE EXCEPTION 'Já há liberação registrada nesta competência; encerramento sem execução não permitido.'; END IF;
 IF length(btrim(coalesce(p_justificativa,'')))<10
  OR nullif(btrim(coalesce(p_numero,'')),'') IS NULL
  OR coalesce(p_link,'') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Justificativa e documento SEI são obrigatórios.'; END IF;
 INSERT INTO public.emenda_encerramentos_sem_execucao
  (emenda_id,lancamento_id,competencia_id,justificativa,numero_sei,link_sei)
 VALUES(l.emenda_id,p_lancamento,p_competencia,btrim(p_justificativa),btrim(p_numero),btrim(p_link))
 RETURNING id INTO r;
 UPDATE public.emenda_competencias_filhas SET status='sem_execucao'
 WHERE solicitacao_id=l.solicitacao_id AND competencia_id=p_competencia;
 -- Importante: não libera NE nem reserva automaticamente; exige instrumento próprio.
 RETURN r;
END;$f$;

-- Não permitir usar o fluxo antigo para registrar dotação sem conferência.
REVOKE ALL ON FUNCTION public.emenda_salvar_etapa(uuid,text,text,text,text,text,numeric)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emenda_confirmar_dotacao(uuid,text,text,boolean),
 public.emenda_salvar_etapa_documental(uuid,text,text,text,numeric),
 public.emenda_registrar_comprovante(uuid,uuid,text,text,text,text),
 public.emenda_registrar_liberacao(uuid,uuid,text,numeric,date,text,text),
 public.emenda_registrar_bloco_pagamento(uuid,text,numeric,date,text,text),
 public.emenda_encerrar_competencia_sem_execucao(uuid,uuid,text,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_confirmar_dotacao(uuid,text,text,boolean),
 public.emenda_salvar_etapa_documental(uuid,text,text,text,numeric),
 public.emenda_registrar_comprovante(uuid,uuid,text,text,text,text),
 public.emenda_registrar_liberacao(uuid,uuid,text,numeric,date,text,text),
 public.emenda_registrar_bloco_pagamento(uuid,text,numeric,date,text,text),
 public.emenda_encerrar_competencia_sem_execucao(uuid,uuid,text,text,text)
 TO authenticated;
COMMIT;