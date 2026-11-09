-- PVH · Fase A — NE multicompetência: somente estrutura, segurança e legado.
-- NÃO muda motores de alocação, RPCs 2–4, valores emitidos ou saldos existentes.
-- Aplicar APENAS após backup restaurável verificado e teste em homologação.
BEGIN;

ALTER TABLE public.pvh_empenhos
  ADD COLUMN IF NOT EXISTS valor_solicitado numeric(16,2);

-- NÃO preencher registros antigos com valor_total: pedido ≠ valor emitido.
-- Não informado (NULL) é a única interpretação segura para o legado.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pvh_empenhos'::regclass
      AND conname = 'pvh_empenhos_valor_solicitado_positivo'
  ) THEN
    ALTER TABLE public.pvh_empenhos
      ADD CONSTRAINT pvh_empenhos_valor_solicitado_positivo
      CHECK (valor_solicitado IS NULL OR valor_solicitado > 0);
  END IF;
END;
$guard$;

-- Calendário de ABRANGÊNCIA da NE, distinto das AL0CAÇÕES monetárias.
-- Historica_alocacao: mês comprovado pelo vínculo financeiro legado.
-- Historica_origem_pendente: mês de criação da solicitação, NÃO prova
-- autorização para compartilhar a NE com outros meses.
-- Confirmada: escolha expressa a ser feita nas Fases B/C.
CREATE TABLE IF NOT EXISTS public.pvh_empenho_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empenho_id uuid NOT NULL
    REFERENCES public.pvh_empenhos(id) ON DELETE CASCADE,
  competencia text NOT NULL
    CHECK (competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
  origem_vinculo text NOT NULL DEFAULT 'confirmada'
    CHECK (origem_vinculo IN (
      'confirmada','historica_alocacao','historica_origem_pendente'
    )),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (empenho_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_pvh_ne_competencias_mes
  ON public.pvh_empenho_competencias (competencia, empenho_id);

-- Anulação CONTÁBIL do saldo residual (ato SEI), distinta da revogação
-- integral da NE e da exclusão de um rascunho.
-- Somente valores formalmente anulados serão inseridos; pendência de
-- anulação é um estado CALCULADO e não uma anulação fictícia.
CREATE TABLE IF NOT EXISTS public.pvh_empenho_anulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empenho_id uuid NOT NULL UNIQUE
    REFERENCES public.pvh_empenhos(id) ON DELETE RESTRICT,
  valor_anulado numeric(16,2) NOT NULL CHECK (valor_anulado > 0),
  data_anulacao date NOT NULL,
  numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) > 0),
  link_sei text NOT NULL
    CHECK (link_sei ~* '^https://[^[:space:]]+$'),
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pvh_ne_anulacoes_data
  ON public.pvh_empenho_anulacoes (data_anulacao DESC);

-- Migração SOMENTE dos meses efetivamente comprovados em alocações antigas.
-- ON CONFLICT DO NOTHING não reescreve decisões posteriormente confirmadas.
INSERT INTO public.pvh_empenho_competencias
  (empenho_id, competencia, origem_vinculo,
   observacao)
SELECT DISTINCT a.empenho_id, c.competencia, 'historica_alocacao',
       'Vínculo legado comprovado por alocação já registrada.'
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_participantes p ON p.id = a.participante_id
JOIN public.pvh_competencias c ON c.id = p.competencia_id
WHERE c.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
ON CONFLICT (empenho_id, competencia) DO NOTHING;

-- Origem histórica informativa, SEM inferir competências futuras.
INSERT INTO public.pvh_empenho_competencias
  (empenho_id, competencia, origem_vinculo, observacao)
SELECT DISTINCT e.id, c.competencia, 'historica_origem_pendente',
       'Mês de criação da solicitação. Abrangência futura não confirmada.'
FROM public.pvh_empenhos e
JOIN public.pvh_competencias c ON c.id = e.solicitacao_competencia_id
WHERE c.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
ON CONFLICT (empenho_id, competencia) DO NOTHING;

-- Privacidade e menor privilégio: fase A é só leitura no cliente.
-- Escritas de abrangência e anulações ocorrerão por RPCs autorizadas nas
-- fases B/C/E; nenhum operador poderá criar uma anulação por CRUD direto.
ALTER TABLE public.pvh_empenho_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvh_empenho_anulacoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pvh_empenho_competencias
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pvh_empenho_anulacoes
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pvh_empenho_competencias TO authenticated;
GRANT SELECT ON TABLE public.pvh_empenho_anulacoes TO authenticated;
GRANT ALL ON TABLE public.pvh_empenho_competencias TO service_role;
GRANT ALL ON TABLE public.pvh_empenho_anulacoes TO service_role;

DROP POLICY IF EXISTS pvh_ne_competencias_leitura
  ON public.pvh_empenho_competencias;
CREATE POLICY pvh_ne_competencias_leitura
  ON public.pvh_empenho_competencias FOR SELECT TO authenticated
  USING (public.has_any_role(
    (SELECT auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]
  ));

DROP POLICY IF EXISTS pvh_ne_anulacoes_leitura
  ON public.pvh_empenho_anulacoes;
CREATE POLICY pvh_ne_anulacoes_leitura
  ON public.pvh_empenho_anulacoes FOR SELECT TO authenticated
  USING (public.has_any_role(
    (SELECT auth.uid()), ARRAY['admin','acp','aco']::public.app_role[]
  ));

-- Auditoria de mudanças FUTURAS nas novas estruturas.
-- Legado inserido acima não gera centenas de eventos artificiais.
CREATE OR REPLACE FUNCTION public.pvh_ne_fase_a_auditar()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $audit$
DECLARE
  v_registro jsonb;
  v_empenho uuid;
  v_comp uuid;
  v_nome text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_registro := to_jsonb(OLD);
  ELSE
    v_registro := to_jsonb(NEW);
  END IF;

  v_empenho := (v_registro ->> 'empenho_id')::uuid;
  SELECT e.solicitacao_competencia_id INTO v_comp
  FROM public.pvh_empenhos e WHERE e.id = v_empenho;
  SELECT nome INTO v_nome FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.historico_logs
    (pvh_competencia_id, usuario_id, usuario_nome, acao, detalhes)
  VALUES (
    v_comp, auth.uid(), COALESCE(v_nome, 'Sistema'),
    'PVH · ' || lower(TG_OP) || ': ' || TG_TABLE_NAME,
    jsonb_build_object(
      'empenho_id', v_empenho,
      'antes', CASE WHEN TG_OP IN ('UPDATE','DELETE')
        THEN to_jsonb(OLD) ELSE NULL END,
      'depois', CASE WHEN TG_OP IN ('INSERT','UPDATE')
        THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$audit$;

REVOKE EXECUTE ON FUNCTION public.pvh_ne_fase_a_auditar()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pvh_ne_competencias_audit
  ON public.pvh_empenho_competencias;
CREATE TRIGGER trg_pvh_ne_competencias_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_empenho_competencias
  FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_fase_a_auditar();

DROP TRIGGER IF EXISTS trg_pvh_ne_anulacoes_audit
  ON public.pvh_empenho_anulacoes;
CREATE TRIGGER trg_pvh_ne_anulacoes_audit
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pvh_empenho_anulacoes
  FOR EACH ROW EXECUTE FUNCTION public.pvh_ne_fase_a_auditar();

COMMIT;
