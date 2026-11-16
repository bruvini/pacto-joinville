-- =============================================================================
-- PISO DA ENFERMAGEM · Múltiplas NEs por instituição e cadeias de subempenho
-- STATUS: PENDENTE DE REVISÃO — NÃO APLICADA. Mover para supabase/migrations/
-- (e regenerar types.ts) somente após aprovação.
--
-- Princípios:
--  * Aditiva: nenhuma tabela/coluna/linha é excluída; IDs existentes preservados.
--  * Não recalcula valores históricos nem reabre competências encerradas.
--  * O devido é contado UMA vez por participante: cada NE (piso_obrigacoes)
--    recebe uma alocação (valor_aplicado) e a soma das alocações ≤ devido.
--  * Cada cadeia de subempenho tem identidade persistente (piso_subempenhos);
--    a soma dos subempenhos de uma NE ≤ valor aplicável daquela NE.
--  * Concorrência: travas consultivas por participante / por NE.
--  * Legado: valor_aplicado NULL + única NE = valor_a_liquidar (fallback);
--    documentos com subempenho_id NULL formam a "cadeia legada".
-- =============================================================================
BEGIN;

-- 1) Alocação por NE ----------------------------------------------------------
ALTER TABLE public.piso_obrigacoes
  ADD COLUMN IF NOT EXISTS valor_aplicado numeric(14,2),
  ADD COLUMN IF NOT EXISTS cr_dotacao text,
  ADD COLUMN IF NOT EXISTS sequencia integer;

ALTER TABLE public.piso_obrigacoes
  DROP CONSTRAINT IF EXISTS piso_obrigacoes_valor_aplicado_nao_negativo;
ALTER TABLE public.piso_obrigacoes
  ADD CONSTRAINT piso_obrigacoes_valor_aplicado_nao_negativo
  CHECK (valor_aplicado IS NULL OR valor_aplicado >= 0);

COMMENT ON COLUMN public.piso_obrigacoes.valor_aplicado IS
  'Parcela desta NE aplicada ao devido da competência. NULL em registro legado de NE única = valor_a_liquidar.';
COMMENT ON COLUMN public.piso_obrigacoes.valor_a_liquidar IS
  'Snapshot do devido do participante (derivado). Com múltiplas NEs NÃO representa a necessidade da nota; use valor_aplicado.';

CREATE OR REPLACE FUNCTION public.piso_validar_alocacao_ne()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  devido numeric(14,2);
  situacao text;
  soma numeric(14,2);
BEGIN
  IF NEW.valor_aplicado IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_aloc:' || NEW.participante_id::text, 0));

  SELECT p.valor_devido, c.status INTO devido, situacao
    FROM public.piso_participantes p
    JOIN public.piso_competencias c ON c.id = p.competencia_id
   WHERE p.id = NEW.participante_id;

  IF situacao = 'encerrada' AND (TG_OP = 'INSERT'
     OR NEW.valor_aplicado IS DISTINCT FROM OLD.valor_aplicado) THEN
    RAISE EXCEPTION 'Competência encerrada: alocação não pode ser alterada.' USING ERRCODE = '42501';
  END IF;

  IF NEW.valor_empenhado IS NOT NULL AND NEW.valor_aplicado > NEW.valor_empenhado + 0.005 THEN
    RAISE EXCEPTION 'Valor aplicado (%) maior que o valor da NE (%).', NEW.valor_aplicado, NEW.valor_empenhado
      USING ERRCODE = '23514';
  END IF;

  IF devido IS NOT NULL THEN
    SELECT COALESCE(SUM(o.valor_aplicado), 0) INTO soma
      FROM public.piso_obrigacoes o
     WHERE o.participante_id = NEW.participante_id AND o.id <> NEW.id;
    IF soma + NEW.valor_aplicado > devido + 0.005 THEN
      RAISE EXCEPTION 'Soma das alocações (%) excede o devido da instituição (%).',
        soma + NEW.valor_aplicado, devido USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Não permitir reduzir a alocação abaixo do já subempenhado nesta NE.
  SELECT COALESCE(SUM(s.valor), 0) INTO soma
    FROM public.piso_subempenhos s WHERE s.obrigacao_id = NEW.id;
  IF soma > NEW.valor_aplicado + 0.005 THEN
    RAISE EXCEPTION 'Alocação (%) menor que o total já subempenhado na NE (%).', NEW.valor_aplicado, soma
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_alocacao_ne() FROM PUBLIC, anon, authenticated;

-- 2) Cadeias de subempenho ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.piso_subempenhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.piso_competencias(id) ON DELETE RESTRICT,
  participante_id uuid NOT NULL REFERENCES public.piso_participantes(id) ON DELETE RESTRICT,
  obrigacao_id uuid NOT NULL REFERENCES public.piso_obrigacoes(id) ON DELETE RESTRICT,
  sequencia integer NOT NULL DEFAULT 1,
  valor numeric(14,2),
  observacao text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piso_subempenhos_valor_positivo CHECK (valor IS NULL OR valor > 0),
  CONSTRAINT piso_subempenhos_seq_unica UNIQUE (obrigacao_id, sequencia)
);
CREATE INDEX IF NOT EXISTS idx_piso_subempenhos_comp ON public.piso_subempenhos(competencia_id);
CREATE INDEX IF NOT EXISTS idx_piso_subempenhos_obrig ON public.piso_subempenhos(obrigacao_id);

GRANT SELECT, INSERT, UPDATE ON public.piso_subempenhos TO authenticated;
GRANT ALL ON public.piso_subempenhos TO service_role;
ALTER TABLE public.piso_subempenhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piso subempenhos leitura" ON public.piso_subempenhos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'acp') OR public.has_role(auth.uid(),'aco'));
CREATE POLICY "piso subempenhos insert" ON public.piso_subempenhos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'acp') OR public.has_role(auth.uid(),'aco'));
CREATE POLICY "piso subempenhos update" ON public.piso_subempenhos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'acp') OR public.has_role(auth.uid(),'aco'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'acp') OR public.has_role(auth.uid(),'aco'));
-- Sem DELETE para usuários: cadeias são preservadas para auditoria.

CREATE TRIGGER trg_piso_subempenhos_upd BEFORE UPDATE ON public.piso_subempenhos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.piso_validar_subempenho()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  o record;
  qtd integer;
  aplicavel numeric(14,2);
  soma numeric(14,2);
  situacao text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('piso_sub:' || NEW.obrigacao_id::text, 0));
  SELECT ob.*, p.competencia_id AS comp_id INTO o
    FROM public.piso_obrigacoes ob
    JOIN public.piso_participantes p ON p.id = ob.participante_id
   WHERE ob.id = NEW.obrigacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NE não encontrada.' USING ERRCODE = '23503'; END IF;
  IF o.participante_id <> NEW.participante_id OR o.comp_id <> NEW.competencia_id THEN
    RAISE EXCEPTION 'Subempenho deve pertencer à mesma instituição/competência da NE.' USING ERRCODE = '23514';
  END IF;
  SELECT status INTO situacao FROM public.piso_competencias WHERE id = NEW.competencia_id;
  IF situacao = 'encerrada' THEN
    RAISE EXCEPTION 'Competência encerrada.' USING ERRCODE = '42501';
  END IF;
  IF NEW.valor IS NULL THEN RETURN NEW; END IF; -- rascunho

  SELECT count(*) INTO qtd FROM public.piso_obrigacoes WHERE participante_id = o.participante_id;
  aplicavel := COALESCE(o.valor_aplicado, CASE WHEN qtd = 1 THEN o.valor_a_liquidar END);
  IF aplicavel IS NULL THEN
    RAISE EXCEPTION 'Informe o valor aplicado à competência na NE antes de subempenhar.' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM(s.valor), 0) INTO soma
    FROM public.piso_subempenhos s WHERE s.obrigacao_id = NEW.obrigacao_id AND s.id <> NEW.id;
  IF soma + NEW.valor > aplicavel + 0.005 THEN
    RAISE EXCEPTION 'Soma dos subempenhos (%) excede o valor aplicável da NE (%).', soma + NEW.valor, aplicavel
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_subempenho() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_piso_validar_subempenho
  BEFORE INSERT OR UPDATE OF valor, obrigacao_id, participante_id, competencia_id
  ON public.piso_subempenhos FOR EACH ROW EXECUTE FUNCTION public.piso_validar_subempenho();

DROP TRIGGER IF EXISTS trg_piso_validar_alocacao_ne ON public.piso_obrigacoes;
CREATE TRIGGER trg_piso_validar_alocacao_ne
  BEFORE INSERT OR UPDATE OF valor_aplicado, valor_empenhado
  ON public.piso_obrigacoes FOR EACH ROW EXECUTE FUNCTION public.piso_validar_alocacao_ne();

-- 3) Documentos repetíveis por cadeia ----------------------------------------
ALTER TABLE public.piso_documentos
  ADD COLUMN IF NOT EXISTS subempenho_id uuid REFERENCES public.piso_subempenhos(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_piso_documentos_subempenho ON public.piso_documentos(subempenho_id);

-- Novo índice único inclui a cadeia; registros legados (subempenho_id NULL)
-- continuam únicos exatamente como antes.
CREATE UNIQUE INDEX IF NOT EXISTS piso_documentos_escopo_tipo_cadeia ON public.piso_documentos (
  competencia_id,
  COALESCE(participante_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(obrigacao_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(subempenho_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  tipo);
-- Remove somente o índice antigo (estrutura; nenhum dado é apagado).
DROP INDEX IF EXISTS public.piso_documentos_escopo_tipo;

CREATE OR REPLACE FUNCTION public.piso_validar_documento_cadeia()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE s record;
BEGIN
  IF NEW.subempenho_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.piso_subempenhos WHERE id = NEW.subempenho_id;
  IF NOT FOUND OR s.obrigacao_id IS DISTINCT FROM NEW.obrigacao_id
     OR s.competencia_id <> NEW.competencia_id THEN
    RAISE EXCEPTION 'Documento de subempenho fora do escopo da cadeia.' USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo NOT IN ('solicitacao_liquidacao','aviso_liquidacao','aviso_subempenho') THEN
    RAISE EXCEPTION 'Tipo % não é repetível por cadeia de subempenho.', NEW.tipo USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_documento_cadeia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_piso_validar_documento_cadeia
  BEFORE INSERT OR UPDATE OF subempenho_id, obrigacao_id, tipo
  ON public.piso_documentos FOR EACH ROW EXECUTE FUNCTION public.piso_validar_documento_cadeia();

-- 4) Conclusão das etapas 5 e 7 por soma (somente transições novas) ---------
CREATE OR REPLACE FUNCTION public.piso_validar_somas_conclusao()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE r record;
BEGIN
  IF NEW.etapas_concluidas ->> '5' = 'true'
     AND OLD.etapas_concluidas ->> '5' IS DISTINCT FROM 'true' THEN
    FOR r IN
      SELECT p.id, p.valor_devido,
             count(o.id) AS qtd,
             SUM(o.valor_aplicado) AS soma_aplicada,
             bool_or(o.valor_aplicado IS NULL) AS algum_nulo,
             MAX(o.valor_a_liquidar) AS legado
        FROM public.piso_participantes p
        LEFT JOIN public.piso_obrigacoes o ON o.participante_id = p.id
       WHERE p.competencia_id = NEW.id AND NOT p.sem_elegiveis
       GROUP BY p.id, p.valor_devido
    LOOP
      CONTINUE WHEN r.valor_devido IS NULL OR r.qtd = 0;
      IF r.qtd = 1 AND r.algum_nulo THEN CONTINUE; END IF; -- legado NE única
      IF r.algum_nulo OR abs(COALESCE(r.soma_aplicada,0) - r.valor_devido) > 0.005 THEN
        RAISE EXCEPTION 'Etapa 5: soma aplicada das NEs difere do devido de uma instituição.'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  IF NEW.etapas_concluidas ->> '7' = 'true'
     AND OLD.etapas_concluidas ->> '7' IS DISTINCT FROM 'true' THEN
    FOR r IN
      SELECT p.id, p.valor_devido, SUM(o.valor_pago) AS pago
        FROM public.piso_participantes p
        JOIN public.piso_obrigacoes o ON o.participante_id = p.id
       WHERE p.competencia_id = NEW.id AND NOT p.sem_elegiveis
       GROUP BY p.id, p.valor_devido
    LOOP
      IF r.valor_devido IS NOT NULL AND abs(COALESCE(r.pago,0) - r.valor_devido) > 0.005 THEN
        RAISE EXCEPTION 'Etapa 7: total pago difere do devido de uma instituição.' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_validar_somas_conclusao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_piso_validar_somas_conclusao ON public.piso_competencias;
CREATE TRIGGER trg_piso_validar_somas_conclusao
  BEFORE UPDATE OF etapas_concluidas ON public.piso_competencias
  FOR EACH ROW EXECUTE FUNCTION public.piso_validar_somas_conclusao();

-- 5) Auditoria: reaproveita piso_audit se existir com assinatura genérica.
DO $a$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'piso_audit' AND pronargs = 0) THEN
    EXECUTE 'CREATE TRIGGER trg_piso_subempenhos_audit AFTER INSERT OR UPDATE ON public.piso_subempenhos
             FOR EACH ROW EXECUTE FUNCTION public.piso_audit()';
  END IF;
END;
$a$;

COMMIT;
