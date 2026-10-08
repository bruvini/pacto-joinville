-- PVH · prestação de contas por parcela (aplicar após 20261008204500)
-- NÃO retrocria prestações de competências já encerradas.
-- Executar no SQL Editor do Lovable/Supabase, numa única transação.
BEGIN;

-- Um mesmo fluxo de prestação serve convênios e PVH, sem convênio fictício.
ALTER TABLE public.prestacoes_contas
  ALTER COLUMN lancamento_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pvh_pagamento_id uuid
    REFERENCES public.pvh_pagamentos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pvh_prazo_dias integer,
  ADD COLUMN IF NOT EXISTS pvh_data_limite date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_pvh_pagamento
  ON public.prestacoes_contas(pvh_pagamento_id);

ALTER TABLE public.prestacoes_contas
  DROP CONSTRAINT IF EXISTS pc_origem_exclusiva,
  ADD CONSTRAINT pc_origem_exclusiva CHECK (
    (lancamento_id IS NOT NULL) <> (pvh_pagamento_id IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS pc_pvh_snapshot_prazo,
  ADD CONSTRAINT pc_pvh_snapshot_prazo CHECK (
    (pvh_pagamento_id IS NULL AND pvh_prazo_dias IS NULL AND pvh_data_limite IS NULL)
    OR
    (pvh_pagamento_id IS NOT NULL AND pvh_prazo_dias > 0 AND pvh_data_limite IS NOT NULL)
  );

-- A UI pode criar prestação de convênio sob demanda, mas não pode
-- fabricar manualmente uma prestação PVH: somente RPC de encerramento.
DROP POLICY IF EXISTS "insert pc" ON public.prestacoes_contas;
CREATE POLICY "insert pc" ON public.prestacoes_contas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['acp','admin']::public.app_role[])
    AND pvh_pagamento_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.pc_proteger_origem_pvh()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.pvh_pagamento_id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.pvh_pagamentos pg
        JOIN public.pvh_competencias c ON c.id = pg.competencia_id
       WHERE pg.id = OLD.pvh_pagamento_id AND c.status = 'encerrada'
    ) THEN
      RAISE EXCEPTION
        'Não é permitido excluir prestação vinculada a competência PVH encerrada.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
    OR NEW.pvh_pagamento_id IS DISTINCT FROM OLD.pvh_pagamento_id
    OR NEW.pvh_prazo_dias IS DISTINCT FROM OLD.pvh_prazo_dias
    OR NEW.pvh_data_limite IS DISTINCT FROM OLD.pvh_data_limite
  ) THEN
    RAISE EXCEPTION 'Não é permitido alterar o vínculo e o prazo original da prestação.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pc_proteger_origem_pvh() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pc_proteger_origem_pvh ON public.prestacoes_contas;
CREATE TRIGGER trg_pc_proteger_origem_pvh
  BEFORE UPDATE OR DELETE ON public.prestacoes_contas
  FOR EACH ROW EXECUTE FUNCTION public.pc_proteger_origem_pvh();

-- Auditoria das ações PVH e convênios no mesmo histórico.
CREATE OR REPLACE FUNCTION public.log_prestacao_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  origem_comp uuid;
  anterior jsonb;
  novo jsonb;
  campo text;
  mudancas jsonb := '{}'::jsonb;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  IF TG_OP = 'DELETE' THEN
    IF OLD.pvh_pagamento_id IS NOT NULL THEN
      SELECT competencia_id INTO origem_comp
        FROM public.pvh_pagamentos WHERE id = OLD.pvh_pagamento_id;
    END IF;
    INSERT INTO public.historico_logs
      (lancamento_id,pvh_competencia_id,usuario_id,usuario_nome,acao)
    VALUES
      (OLD.lancamento_id,origem_comp,uid,uname,'Prestação de contas excluída');
    RETURN OLD;
  END IF;
  IF NEW.pvh_pagamento_id IS NOT NULL THEN
    SELECT competencia_id INTO origem_comp
      FROM public.pvh_pagamentos WHERE id = NEW.pvh_pagamento_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_logs
      (lancamento_id, pvh_competencia_id, usuario_id, usuario_nome, acao)
    VALUES
      (NEW.lancamento_id, origem_comp, uid, uname, 'Prestação de contas iniciada');
    RETURN NEW;
  END IF;
  anterior := to_jsonb(OLD);
  novo := to_jsonb(NEW);
  FOR campo IN SELECT jsonb_object_keys(novo) LOOP
    IF campo = ANY(ARRAY[
      'id','lancamento_id','pvh_pagamento_id','updated_at','created_at'
    ]) THEN CONTINUE; END IF;
    IF novo -> campo IS DISTINCT FROM anterior -> campo THEN
      mudancas := mudancas || jsonb_build_object(
        'pc_' || campo, jsonb_build_object(
          'de', anterior -> campo, 'para', novo -> campo
        )
      );
    END IF;
  END LOOP;
  IF mudancas <> '{}'::jsonb THEN
    INSERT INTO public.historico_logs
      (lancamento_id,pvh_competencia_id,usuario_id,usuario_nome,acao,detalhes)
    VALUES
      (NEW.lancamento_id,origem_comp,uid,uname,'Prestação de contas atualizada',mudancas);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_prestacao_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pc_audit ON public.prestacoes_contas;
CREATE TRIGGER trg_pc_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.prestacoes_contas
  FOR EACH ROW EXECUTE FUNCTION public.log_prestacao_audit();

CREATE OR REPLACE FUNCTION public.log_pc_interacao_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  lanc uuid;
  comp uuid;
  rotulo text;
BEGIN
  SELECT nome INTO uname FROM public.profiles WHERE id = uid;
  SELECT pc.lancamento_id, pg.competencia_id INTO lanc, comp
    FROM public.prestacoes_contas pc
    LEFT JOIN public.pvh_pagamentos pg ON pg.id = pc.pvh_pagamento_id
   WHERE pc.id = NEW.prestacao_id;
  rotulo := CASE NEW.tipo WHEN 'oficio' THEN 'Ofício registrado'
    WHEN 'resposta' THEN 'Resposta do prestador registrada'
    ELSE 'Interação registrada' END;
  INSERT INTO public.historico_logs
    (lancamento_id,pvh_competencia_id,usuario_id,usuario_nome,acao,detalhes)
  VALUES
    (lanc,comp,uid,COALESCE(uname,NEW.autor_nome),'PC · ' || rotulo,
     jsonb_build_object('descricao',NEW.descricao,'link_sei',NEW.link_sei));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_pc_interacao_audit() FROM PUBLIC, anon, authenticated;

-- Notificação ao responsável, inclusive quando o lançamento vem de PVH.
CREATE OR REPLACE FUNCTION public.notificar_atribuicao_pc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prestador text;
  competencia text;
BEGIN
  IF NEW.responsavel_id IS NULL OR NEW.responsavel_id IS NOT DISTINCT FROM OLD.responsavel_id THEN
    RETURN NEW;
  END IF;
  IF NEW.pvh_pagamento_id IS NOT NULL THEN
    SELECT pr.nome_instituicao, c.competencia INTO prestador, competencia
      FROM public.pvh_pagamentos pg
      JOIN public.pvh_competencias c ON c.id = pg.competencia_id
      JOIN public.pvh_participantes pp ON pp.id = pg.participante_id
      JOIN public.prestadores pr ON pr.id = pp.prestador_id
     WHERE pg.id = NEW.pvh_pagamento_id;
  ELSE
    SELECT pr.nome_instituicao, l.competencia INTO prestador, competencia
      FROM public.lancamentos_pagamento l
      LEFT JOIN public.prestadores pr ON pr.id = l.prestador_id
     WHERE l.id = NEW.lancamento_id;
  END IF;
  INSERT INTO public.notificacoes
    (user_id,titulo,mensagem,tipo,lancamento_id)
  VALUES (
    NEW.responsavel_id,'Prestação de contas atribuída a você',
    COALESCE(prestador,'Prestador') || ' · competência ' ||
    COALESCE(substring(competencia from '\d{2}/\d{4}'),'—') ||
    ' — você é o responsável pela análise desta prestação de contas.',
    'prazo_prestacao',NEW.lancamento_id
  );
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notificar_atribuicao_pc() FROM PUBLIC, anon, authenticated;

-- Usa a tabela de avisos já existente, com origem exclusiva e dedupe por PC.
ALTER TABLE public.prestacao_prazo_avisos
  ALTER COLUMN lancamento_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS prestacao_id uuid
    REFERENCES public.prestacoes_contas(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prestacao_avisos_pc_marco
  ON public.prestacao_prazo_avisos(prestacao_id,marco)
  WHERE prestacao_id IS NOT NULL;
ALTER TABLE public.prestacao_prazo_avisos
  DROP CONSTRAINT IF EXISTS pc_aviso_origem_exclusiva,
  ADD CONSTRAINT pc_aviso_origem_exclusiva CHECK (
    (lancamento_id IS NOT NULL) <> (prestacao_id IS NOT NULL)
  );

-- A RPC continua usando as mesmas validações financeiras da Etapa 7.
CREATE OR REPLACE FUNCTION public.pvh_encerrar_competencia(
  p_comp uuid,
  p_conferido boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comp public.pvh_competencias%ROWTYPE;
  v_etapa integer;
  v_estado numeric;
  v_municipio numeric;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Somente Administração/ACP pode encerrar a competência PVH.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conferido IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirme a conferência financeira antes de encerrar.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_comp
    FROM public.pvh_competencias
   WHERE id = p_comp FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência PVH não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  IF v_comp.status = 'encerrada' THEN
    RAISE EXCEPTION 'Esta competência já está encerrada.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_etapa IN 1..6 LOOP
    IF COALESCE((v_comp.etapas_concluidas ->> v_etapa::text)::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'A Etapa % precisa estar concluída.', v_etapa
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF cardinality(COALESCE(v_comp.etapas_reconferir, '{}'::integer[])) > 0 THEN
    RAISE EXCEPTION 'Existem etapas aguardando reconferência.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(valor_estadual), 0),
         COALESCE(SUM(valor_municipal), 0)
    INTO v_estado, v_municipio
    FROM public.pvh_participantes
   WHERE competencia_id = p_comp;

  IF NOT EXISTS (SELECT 1 FROM public.pvh_participantes WHERE competencia_id = p_comp)
     OR v_estado <= 0
     OR v_municipio <= 0
     OR ABS(v_estado - v_municipio) >= 0.01
     OR v_comp.recurso_fms_data IS NULL
     OR v_comp.recurso_fms_valor IS NULL
     OR ABS(v_comp.recurso_fms_valor - v_estado) >= 0.01
  THEN
    RAISE EXCEPTION 'Os valores oficiais, municipais e o crédito FMS não estão conciliados.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pvh_participantes p
     WHERE p.competencia_id = p_comp
       AND (
         COALESCE(p.valor_estadual, 0) <= 0
         OR COALESCE(p.valor_municipal, 0) <= 0
         OR ABS(p.valor_estadual - p.valor_municipal) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(a.valor_alocado)
               FROM public.pvh_empenho_alocacoes a
              WHERE a.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(s.valor)
               FROM public.pvh_subempenhos s
               JOIN public.pvh_empenho_alocacoes a ON a.id = s.alocacao_id
              WHERE a.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE((
             SELECT SUM(pg.valor_pago)
               FROM public.pvh_pagamentos pg
              WHERE pg.participante_id = p.id
           ), 0) - p.valor_municipal
         ) >= 0.01
         OR ABS(
           COALESCE(p.valor_pago, 0) -
           COALESCE((
             SELECT SUM(pg.valor_pago)
               FROM public.pvh_pagamentos pg
              WHERE pg.participante_id = p.id
           ), 0)
         ) >= 0.01
       )
  ) THEN
    RAISE EXCEPTION
      'Há divergência financeira por instituição (Estado, Município, NE, subempenho ou pagamento).'
      USING ERRCODE = '23514';
  END IF;

  -- Gera exatamente uma prestação por parcela paga, em transação com o
  -- encerramento. O prazo é congelado conforme o snapshot do participante.
  IF EXISTS (
    SELECT 1
      FROM public.pvh_pagamentos pg
      JOIN public.pvh_participantes p ON p.id = pg.participante_id
     WHERE pg.competencia_id = p_comp
       AND p.exige_prestacao_contas
       AND (pg.data_pagamento IS NULL OR COALESCE(pg.valor_pago, 0) <= 0)
  ) THEN
    RAISE EXCEPTION
      'Há parcela de pagamento sem data/valor para geração da prestação de contas.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.prestacoes_contas (
    pvh_pagamento_id, pvh_prazo_dias, pvh_data_limite, status
  )
  SELECT pg.id,
         COALESCE(NULLIF(p.prazo_prestacao_contas_dias, 0), 30),
         pg.data_pagamento + COALESCE(NULLIF(p.prazo_prestacao_contas_dias, 0), 30),
         'aguardando'
    FROM public.pvh_pagamentos pg
    JOIN public.pvh_participantes p ON p.id = pg.participante_id
   WHERE pg.competencia_id = p_comp
     AND p.exige_prestacao_contas
  ON CONFLICT (pvh_pagamento_id) DO NOTHING;

  IF (
    SELECT count(*)
      FROM public.pvh_pagamentos pg
      JOIN public.pvh_participantes p ON p.id = pg.participante_id
     WHERE pg.competencia_id = p_comp AND p.exige_prestacao_contas
  ) <> (
    SELECT count(*)
      FROM public.prestacoes_contas pc
      JOIN public.pvh_pagamentos pg ON pg.id = pc.pvh_pagamento_id
     WHERE pg.competencia_id = p_comp
  ) THEN
    RAISE EXCEPTION 'Nem todas as parcelas com prestação obrigatória foram vinculadas.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.pvh_competencias
     SET status = 'encerrada',
         encerrada_em = now(),
         encerrada_por = auth.uid(),
         etapas_concluidas = jsonb_set(
           COALESCE(etapas_concluidas, '{}'::jsonb),
           '{7}', 'true'::jsonb, true
         )
   WHERE id = p_comp;
END;
$$;


-- A RPC será executada como proprietário, sem abrir inserção PVH à UI.
REVOKE ALL ON FUNCTION public.pvh_encerrar_competencia(uuid,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_encerrar_competencia(uuid,boolean)
  TO authenticated, service_role;

-- Alertas PVH D-7, D-3 e vencimento, com idempotência por parcela.
CREATE OR REPLACE FUNCTION public.pvh_verificar_prazos_prestacao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  dias integer;
  marco text;
  titulo text;
  mensagem text;
  enviados integer := 0;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(), ARRAY['admin','acp']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para verificar prazos de prestação PVH.'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT pc.id, pc.pvh_data_limite, pc.responsavel_id,
           p.nome_instituicao, c.competencia
      FROM public.prestacoes_contas pc
      JOIN public.pvh_pagamentos pg ON pg.id = pc.pvh_pagamento_id
      JOIN public.pvh_competencias c ON c.id = pg.competencia_id
      JOIN public.pvh_participantes pp ON pp.id = pg.participante_id
      JOIN public.prestadores p ON p.id = pp.prestador_id
     WHERE pc.status = 'aguardando'
  LOOP
    dias := r.pvh_data_limite - current_date;
    marco := CASE
      WHEN dias <= 0 THEN 'd0'
      WHEN dias <= 3 THEN 'd3'
      WHEN dias <= 7 THEN 'd7'
      ELSE NULL
    END;
    IF marco IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.prestacao_prazo_avisos(prestacao_id,marco)
    VALUES (r.id,marco)
    ON CONFLICT (prestacao_id,marco) WHERE prestacao_id IS NOT NULL
      DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;

    titulo := CASE WHEN marco = 'd0'
      THEN 'Prestação PVH: prazo VENCIDO'
      ELSE 'Prestação PVH: vence em ' || dias || ' dia(s)'
    END;
    mensagem := r.nome_instituicao || ' · PVH ' || r.competencia ||
      ' — prestação de contas com prazo em ' ||
      to_char(r.pvh_data_limite,'DD/MM/YYYY') || '.';
    PERFORM public.notificar_prestacao(
      NULL::uuid, r.responsavel_id, titulo, mensagem
    );
    enviados := enviados + 1;
  END LOOP;
  RETURN enviados;
END;
$$;
REVOKE ALL ON FUNCTION public.pvh_verificar_prazos_prestacao()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvh_verificar_prazos_prestacao()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
