-- PACTO · Emendas Parlamentares · Fase 2. Aditiva à Fase 1.
-- SEM migração de movimentações em convenios/lancamentos_pagamento.
-- Todos os saldos são de acompanhamento do PACTO, não operações da SEFAZ.
BEGIN;

ALTER TABLE public.emendas
 ADD COLUMN valor_rendimento numeric(16,2) NOT NULL DEFAULT 0 CHECK (valor_rendimento >= 0),
 ADD COLUMN numero_portaria_municipal text,
 ADD COLUMN portaria_municipal_numero_sei text,
 ADD COLUMN portaria_municipal_link_sei text
  CHECK (portaria_municipal_link_sei IS NULL OR portaria_municipal_link_sei ~* '^https://[^[:space:]]+$');

CREATE TABLE public.emenda_competencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 competencia date NOT NULL CHECK (EXTRACT(DAY FROM competencia)=1),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (emenda_id,competencia),
 UNIQUE (id,emenda_id)
);

CREATE TABLE public.emenda_solicitacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 competencia_origem_id uuid NOT NULL,
 chave_idempotencia uuid NOT NULL,
 periodicidade text NOT NULL CHECK (periodicidade IN ('mensal','trimestral','anual')),
 numero_competencias int NOT NULL CHECK (numero_competencias IN (1,3,12)),
 valor_solicitado numeric(16,2) NOT NULL CHECK (valor_solicitado > 0),
 numero_sei_solicitacao text NOT NULL CHECK (length(btrim(numero_sei_solicitacao)) BETWEEN 1 AND 100),
 link_sei_solicitacao text NOT NULL CHECK (link_sei_solicitacao ~* '^https://[^[:space:]]+$'),
 data_solicitacao date NOT NULL DEFAULT CURRENT_DATE,
 status text NOT NULL DEFAULT 'aguardando_ne'
  CHECK (status IN ('aguardando_ne','emitida','cancelada','encerrada')),
 numero_ne text, exercicio_ne int CHECK (exercicio_ne BETWEEN 2000 AND 2100),
 valor_ne numeric(16,2) CHECK (valor_ne > 0),
 numero_sei_ne text, link_sei_ne text
  CHECK (link_sei_ne IS NULL OR link_sei_ne ~* '^https://[^[:space:]]+$'),
 data_emissao date, motivo_cancelamento text,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (emenda_id,chave_idempotencia),
 UNIQUE (id,emenda_id),
 FOREIGN KEY (competencia_origem_id,emenda_id)
  REFERENCES public.emenda_competencias(id,emenda_id),
 CONSTRAINT emenda_ne_campos_status CHECK (
   (status IN ('aguardando_ne','cancelada') AND numero_ne IS NULL AND valor_ne IS NULL)
   OR (status IN ('emitida','encerrada') AND numero_ne IS NOT NULL AND valor_ne IS NOT NULL
       AND exercicio_ne IS NOT NULL AND numero_sei_ne IS NOT NULL AND link_sei_ne IS NOT NULL
       AND data_emissao IS NOT NULL)
 ),
 CONSTRAINT emenda_periodicidade_competencias CHECK (
  (periodicidade='mensal' AND numero_competencias=1) OR
  (periodicidade='trimestral' AND numero_competencias=3) OR
  (periodicidade='anual' AND numero_competencias=12)
 )
);

CREATE TABLE public.emenda_competencias_filhas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 solicitacao_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 ordem int NOT NULL CHECK (ordem BETWEEN 1 AND 12),
 status text NOT NULL DEFAULT 'prevista'
  CHECK (status IN ('prevista','aguardando_liberacao','sem_execucao','concluida','cancelada')),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (solicitacao_id,competencia_id),
 UNIQUE (solicitacao_id,ordem),
 FOREIGN KEY (solicitacao_id,emenda_id)
   REFERENCES public.emenda_solicitacoes(id,emenda_id),
 FOREIGN KEY (competencia_id,emenda_id)
   REFERENCES public.emenda_competencias(id,emenda_id)
);

CREATE INDEX emenda_competencias_mes_idx ON public.emenda_competencias(emenda_id,competencia DESC);
CREATE INDEX emenda_solicitacoes_estado_idx ON public.emenda_solicitacoes(emenda_id,status,created_at DESC);
CREATE INDEX emenda_filhas_comp_idx ON public.emenda_competencias_filhas(competencia_id,status);
CREATE INDEX emenda_filhas_solic_idx ON public.emenda_competencias_filhas(solicitacao_id,ordem);

-- As quatro tabelas só podem ser alteradas por RPCs com verificação de papel e
-- serialização na linha da emenda. Leituras para os papéis já autorizados.
ALTER TABLE public.emenda_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_competencias_filhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emenda_competencias,public.emenda_solicitacoes,
 public.emenda_competencias_filhas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_competencias,public.emenda_solicitacoes,
 public.emenda_competencias_filhas TO authenticated;
CREATE POLICY emenda_competencias_read ON public.emenda_competencias
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_solicitacoes_read ON public.emenda_solicitacoes
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_competencias_filhas_read ON public.emenda_competencias_filhas
 FOR SELECT TO authenticated USING
 (public.has_any_role((select auth.uid()),ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

-- Auditoria dos três domínios, pelo trigger de histórico da Fase 1.
CREATE TRIGGER emenda_audit_competencias AFTER INSERT OR UPDATE ON public.emenda_competencias
 FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_audit_solicitacoes AFTER INSERT OR UPDATE ON public.emenda_solicitacoes
 FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_audit_filhas AFTER INSERT OR UPDATE ON public.emenda_competencias_filhas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();

CREATE OR REPLACE FUNCTION public.emenda_validar_cadastro()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE compromisso numeric(16,2);
DECLARE teto numeric(16,2);
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR
    NEW.valor_autorizado_inicial IS DISTINCT FROM OLD.valor_autorizado_inicial OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
   THEN RAISE EXCEPTION 'Valor original imutável: utilize ajuste formal.'
     USING ERRCODE='23514'; END IF;
  -- Após iniciar a execução, vínculos institucionais não podem ser trocados.
  IF (NEW.prestador_id IS DISTINCT FROM OLD.prestador_id OR
      NEW.convenio_id IS DISTINCT FROM OLD.convenio_id OR
      NEW.termo_aditivo_id IS DISTINCT FROM OLD.termo_aditivo_id) AND
      EXISTS(SELECT 1 FROM public.emenda_solicitacoes WHERE emenda_id=OLD.id)
   THEN RAISE EXCEPTION 'Vínculos não podem ser alterados depois da primeira solicitação.';
  END IF;
  -- Redução de rendimento só é permitida se ainda cobrir reservas e NEs.
  IF NEW.valor_rendimento IS DISTINCT FROM OLD.valor_rendimento THEN
   SELECT COALESCE(sum(CASE WHEN s.status='aguardando_ne' THEN s.valor_solicitado
                            WHEN s.status IN ('emitida','encerrada') THEN s.valor_ne ELSE 0 END),0)
     INTO compromisso FROM public.emenda_solicitacoes s WHERE s.emenda_id=OLD.id;
   SELECT NEW.valor_autorizado_inicial + NEW.valor_rendimento + COALESCE(sum(a.variacao),0)
     INTO teto FROM public.emendas e LEFT JOIN public.emenda_ajustes_valor a ON a.emenda_id=e.id
     WHERE e.id=OLD.id GROUP BY e.id;
   IF teto < compromisso THEN
    RAISE EXCEPTION 'Rendimento reduziria o limite abaixo das reservas e empenhos ativos.'
      USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW.convenio_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.convenios c
  WHERE c.id=NEW.convenio_id AND c.prestador_id=NEW.prestador_id
 ) THEN RAISE EXCEPTION 'Convênio não pertence à instituição.'; END IF;
 IF NEW.termo_aditivo_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.termos_aditivos t
  WHERE t.id=NEW.termo_aditivo_id AND t.convenio_id=NEW.convenio_id
 ) THEN RAISE EXCEPTION 'Termo aditivo não pertence ao convênio.'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$fn$;

-- Limite inclui os rendimentos cadastrados. Reservas e NEs são compromissos
-- mutuamente exclusivos: conversão não desconta o valor duas vezes.
CREATE OR REPLACE VIEW public.emendas_resumo WITH (security_invoker=true) AS
SELECT e.id,e.numero,e.exercicio,e.prestador_id,e.situacao,e.valor_autorizado_inicial,
  (e.valor_autorizado_inicial+e.valor_rendimento+COALESCE(a.ajustes,0))
    AS valor_autorizado_vigente,
  COALESCE(a.total_ajustes,0)::integer AS total_ajustes,
  e.valor_rendimento,
  COALESCE(s.reservado,0)::numeric(16,2) AS valor_reservado,
  COALESCE(s.empenhado,0)::numeric(16,2) AS valor_empenhado,
  (e.valor_autorizado_inicial+e.valor_rendimento+COALESCE(a.ajustes,0)
   -COALESCE(s.reservado,0)-COALESCE(s.empenhado,0))::numeric(16,2) AS saldo_disponivel
FROM public.emendas e
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(variacao),0) AS ajustes,count(*)::integer AS total_ajustes
  FROM public.emenda_ajustes_valor WHERE emenda_id=e.id
) a ON true
LEFT JOIN LATERAL (
 SELECT COALESCE(sum(valor_solicitado) FILTER(WHERE status='aguardando_ne'),0) reservado,
        COALESCE(sum(valor_ne) FILTER(WHERE status IN ('emitida','encerrada')),0) empenhado
 FROM public.emenda_solicitacoes WHERE emenda_id=e.id
) s ON true;

CREATE OR REPLACE FUNCTION public.emenda_abrir_competencia(p_emenda uuid,p_competencia text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid:=auth.uid(); comp date; result uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
  THEN RAISE EXCEPTION 'Sem autorização para abrir competência.' USING ERRCODE='42501'; END IF;
 IF p_competencia IS NULL OR p_competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
  THEN RAISE EXCEPTION 'Informe competência MM/AAAA.'; END IF;
 comp:=pg_catalog.make_date(substring(p_competencia from 4 for 4)::int,
                           substring(p_competencia from 1 for 2)::int,1);
 PERFORM 1 FROM public.emendas WHERE id=p_emenda AND situacao IN ('ativa','cadastrada') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda inexistente, suspensa ou encerrada.'; END IF;
 INSERT INTO public.emenda_competencias(emenda_id,competencia)
 VALUES(p_emenda,comp) ON CONFLICT(emenda_id,competencia) DO NOTHING;
 SELECT id INTO result FROM public.emenda_competencias
 WHERE emenda_id=p_emenda AND competencia=comp;
 RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.emenda_formalizar_solicitacao(
 p_emenda uuid,p_competencia text,p_periodicidade text,p_valor numeric,
 p_numero_sei text,p_link_sei text,p_chave uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid:=auth.uid(); primeira date; mes date; v_emenda public.emendas%ROWTYPE;
DECLARE teto numeric; comprometido numeric; ciclos int; i int; origem uuid; global_id uuid;
DECLARE nova uuid; existente uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
  THEN RAISE EXCEPTION 'Sem autorização para registrar solicitação.' USING ERRCODE='42501'; END IF;
 IF p_chave IS NULL THEN RAISE EXCEPTION 'Chave de idempotência obrigatória.'; END IF;
 IF p_competencia IS NULL OR p_competencia !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
  THEN RAISE EXCEPTION 'Competência deve ser MM/AAAA.'; END IF;
 ciclos:=CASE p_periodicidade WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3
   WHEN 'anual' THEN 12 ELSE NULL END;
 IF ciclos IS NULL THEN RAISE EXCEPTION 'Periodicidade não reconhecida.'; END IF;
 IF p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
  THEN RAISE EXCEPTION 'Valor solicitado inválido.'; END IF;
 IF length(btrim(COALESCE(p_numero_sei,'')))=0 OR
   COALESCE(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Número e link HTTPS do SEI são obrigatórios.'; END IF;
 primeira:=pg_catalog.make_date(substring(p_competencia from 4 for 4)::int,
                                substring(p_competencia from 1 for 2)::int,1);
 SELECT * INTO v_emenda FROM public.emendas WHERE id=p_emenda FOR UPDATE;
 IF NOT FOUND OR v_emenda.situacao NOT IN ('cadastrada','ativa')
  THEN RAISE EXCEPTION 'Emenda inexistente ou inativa.'; END IF;
 SELECT id INTO existente FROM public.emenda_solicitacoes
   WHERE emenda_id=p_emenda AND chave_idempotencia=p_chave;
 IF existente IS NOT NULL THEN RETURN existente; END IF;
 SELECT v_emenda.valor_autorizado_inicial+v_emenda.valor_rendimento+
    COALESCE(sum(variacao),0) INTO teto
   FROM public.emenda_ajustes_valor WHERE emenda_id=p_emenda;
 SELECT COALESCE(sum(CASE WHEN status='aguardando_ne' THEN valor_solicitado
  WHEN status IN ('emitida','encerrada') THEN valor_ne ELSE 0 END),0)
   INTO comprometido FROM public.emenda_solicitacoes WHERE emenda_id=p_emenda;
 IF p_valor>teto-comprometido THEN
   RAISE EXCEPTION 'Saldo insuficiente: disponível R$ %.',to_char(teto-comprometido,'FM999G999G999G990D00')
   USING ERRCODE='23514'; END IF;

 INSERT INTO public.emenda_competencias(emenda_id,competencia)
 VALUES(p_emenda,primeira) ON CONFLICT(emenda_id,competencia) DO NOTHING;
 SELECT id INTO origem FROM public.emenda_competencias WHERE emenda_id=p_emenda AND competencia=primeira;
 INSERT INTO public.emenda_solicitacoes
 (emenda_id,competencia_origem_id,chave_idempotencia,periodicidade,numero_competencias,
  valor_solicitado,numero_sei_solicitacao,link_sei_solicitacao)
 VALUES(p_emenda,origem,p_chave,p_periodicidade,ciclos,
   p_valor,btrim(p_numero_sei),btrim(p_link_sei)) RETURNING id INTO nova;
 FOR i IN 0..(ciclos-1) LOOP
  mes:=(primeira + make_interval(months=>i))::date;
  IF extract(year FROM mes)>2100 THEN RAISE EXCEPTION 'Competência fora do período permitido.'; END IF;
  INSERT INTO public.emenda_competencias(emenda_id,competencia)
    VALUES(p_emenda,mes) ON CONFLICT(emenda_id,competencia) DO NOTHING;
  SELECT id INTO global_id FROM public.emenda_competencias
    WHERE emenda_id=p_emenda AND competencia=mes;
  INSERT INTO public.emenda_competencias_filhas(emenda_id,solicitacao_id,competencia_id,ordem)
    VALUES(p_emenda,nova,global_id,i+1);
 END LOOP;
 RETURN nova;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.emenda_registrar_ne(
 p_solicitacao uuid,p_numero_ne text,p_exercicio int,p_valor numeric,
 p_numero_sei text,p_link_sei text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid:=auth.uid(); e_id uuid; nota public.emenda_solicitacoes%ROWTYPE;
DECLARE limite numeric; outras numeric;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
  THEN RAISE EXCEPTION 'Sem autorização para registrar nota de empenho.' USING ERRCODE='42501'; END IF;
 SELECT emenda_id INTO e_id FROM public.emenda_solicitacoes WHERE id=p_solicitacao;
 IF e_id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=e_id AND situacao IN ('ativa','cadastrada') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda inativa.'; END IF;
 SELECT * INTO nota FROM public.emenda_solicitacoes WHERE id=p_solicitacao FOR UPDATE;
 IF nota.status='emitida' THEN
  IF nota.numero_ne=p_numero_ne AND nota.exercicio_ne=p_exercicio AND nota.valor_ne=p_valor
    AND nota.numero_sei_ne=p_numero_sei AND nota.link_sei_ne=p_link_sei
   THEN RETURN p_solicitacao; END IF;
  RAISE EXCEPTION 'Nota já registrada. Correções exigem procedimento formal.'; END IF;
 IF nota.status<>'aguardando_ne' THEN RAISE EXCEPTION 'Solicitação não admite emissão da nota.'; END IF;
 IF length(btrim(COALESCE(p_numero_ne,'')))=0 OR p_exercicio NOT BETWEEN 2000 AND 2100
   OR p_valor IS NULL OR p_valor<=0 OR p_valor<>round(p_valor,2)
   OR length(btrim(COALESCE(p_numero_sei,'')))=0
   OR COALESCE(p_link_sei,'') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Número, exercício, valor e evidência SEI da NE são obrigatórios.'; END IF;
 SELECT e.valor_autorizado_inicial+e.valor_rendimento+COALESCE(sum(a.variacao),0)
   INTO limite FROM public.emendas e
   LEFT JOIN public.emenda_ajustes_valor a ON a.emenda_id=e.id
   WHERE e.id=e_id GROUP BY e.id;
 SELECT COALESCE(sum(CASE WHEN status='aguardando_ne' THEN valor_solicitado
     WHEN status IN ('emitida','encerrada') THEN valor_ne ELSE 0 END),0)
  INTO outras FROM public.emenda_solicitacoes WHERE emenda_id=e_id AND id<>p_solicitacao;
 IF outras+p_valor>limite THEN
   RAISE EXCEPTION 'Valor da NE ultrapassa o saldo da emenda após outras reservas e empenhos.'
   USING ERRCODE='23514'; END IF;
 UPDATE public.emenda_solicitacoes SET status='emitida',numero_ne=btrim(p_numero_ne),
   exercicio_ne=p_exercicio,valor_ne=p_valor,numero_sei_ne=btrim(p_numero_sei),
   link_sei_ne=btrim(p_link_sei),data_emissao=CURRENT_DATE,updated_at=now()
 WHERE id=p_solicitacao;
 UPDATE public.emenda_competencias_filhas SET status='aguardando_liberacao'
  WHERE solicitacao_id=p_solicitacao AND status='prevista';
 RETURN p_solicitacao;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.emenda_cancelar_solicitacao(
 p_solicitacao uuid,p_justificativa text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid:=auth.uid(); e_id uuid; status_atual text;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
  THEN RAISE EXCEPTION 'Sem autorização para cancelar solicitação.' USING ERRCODE='42501'; END IF;
 IF length(btrim(COALESCE(p_justificativa,'')))<10 THEN
   RAISE EXCEPTION 'Justifique o cancelamento com ao menos 10 caracteres.'; END IF;
 SELECT emenda_id INTO e_id FROM public.emenda_solicitacoes WHERE id=p_solicitacao;
 IF e_id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=e_id FOR UPDATE;
 SELECT status INTO status_atual FROM public.emenda_solicitacoes
  WHERE id=p_solicitacao FOR UPDATE;
 IF status_atual<>'aguardando_ne' THEN
   RAISE EXCEPTION 'Somente solicitações sem Nota de Empenho podem ser canceladas nesta fase.'; END IF;
 UPDATE public.emenda_solicitacoes SET status='cancelada',
   motivo_cancelamento=btrim(p_justificativa),updated_at=now() WHERE id=p_solicitacao;
 UPDATE public.emenda_competencias_filhas SET status='cancelada'
  WHERE solicitacao_id=p_solicitacao;
 RETURN p_solicitacao;
END;
$fn$;

-- Ajuste formal agora considera também rendimento e não pode reduzir o limite
-- abaixo dos compromissos (reservas + NEs) da emenda.
CREATE OR REPLACE FUNCTION public.emenda_registrar_ajuste(
  p_emenda_id uuid,p_variacao numeric,p_motivo text,
  p_documento_sei_numero text,p_documento_sei_link text
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ator uuid:=auth.uid(); anterior numeric(16,2); novo numeric(16,2); compromisso numeric(16,2);
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
  THEN RAISE EXCEPTION 'Sem autorização para ajustar emendas.' USING ERRCODE='42501'; END IF;
 IF p_variacao IS NULL OR p_variacao=0 OR p_variacao<>round(p_variacao,2)
  THEN RAISE EXCEPTION 'Ajuste inválido.'; END IF;
 IF length(btrim(COALESCE(p_motivo,'')))<10 OR
    length(btrim(COALESCE(p_documento_sei_numero,'')))=0 OR
    COALESCE(p_documento_sei_link,'') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Justificativa e documento SEI são obrigatórios.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=p_emenda_id AND situacao<>'encerrada' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emenda inexistente ou encerrada.'; END IF;
 SELECT e.valor_autorizado_inicial+e.valor_rendimento+COALESCE(sum(a.variacao),0)
 INTO anterior FROM public.emendas e
 LEFT JOIN public.emenda_ajustes_valor a ON a.emenda_id=e.id
 WHERE e.id=p_emenda_id GROUP BY e.id;
 novo:=anterior+p_variacao;
 SELECT COALESCE(sum(CASE WHEN status='aguardando_ne' THEN valor_solicitado
    WHEN status IN ('emitida','encerrada') THEN valor_ne ELSE 0 END),0)
  INTO compromisso FROM public.emenda_solicitacoes WHERE emenda_id=p_emenda_id;
 IF novo<compromisso THEN RAISE EXCEPTION 'Ajuste deixaria saldo negativo perante reservas e empenhos.'; END IF;
 INSERT INTO public.emenda_ajustes_valor
 (emenda_id,valor_anterior,variacao,valor_novo,motivo,documento_sei_numero,documento_sei_link,registrado_por)
 VALUES(p_emenda_id,anterior,p_variacao,novo,btrim(p_motivo),
 btrim(p_documento_sei_numero),btrim(p_documento_sei_link),ator);
 RETURN novo;
END;
$fn$;

REVOKE ALL ON FUNCTION public.emenda_abrir_competencia(uuid,text),
 public.emenda_formalizar_solicitacao(uuid,text,text,numeric,text,text,uuid),
 public.emenda_registrar_ne(uuid,text,integer,numeric,text,text),
 public.emenda_cancelar_solicitacao(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_abrir_competencia(uuid,text),
 public.emenda_formalizar_solicitacao(uuid,text,text,numeric,text,text,uuid),
 public.emenda_registrar_ne(uuid,text,integer,numeric,text,text),
 public.emenda_cancelar_solicitacao(uuid,text) TO authenticated;

COMMENT ON TABLE public.emenda_solicitacoes IS 'Solicitação/nota principal; valor da NE registrado uma vez. Financeiro apenas de acompanhamento.';
COMMENT ON TABLE public.emenda_competencias IS 'Competências globais únicas por emenda e mês.';
COMMENT ON TABLE public.emenda_competencias_filhas IS 'Competências vinculadas a uma solicitação; valores não são rateados.';
COMMIT;