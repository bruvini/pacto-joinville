-- PACTO · Emendas · Fase C1: distribuição explícita de cada NE por competência.
-- Compatível com Fases A e B. Nenhum backfill ou rateio automático.
BEGIN;

CREATE TABLE public.emenda_ne_competencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 lancamento_id uuid NOT NULL,
 solicitacao_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 valor_alocado numeric(16,2) NOT NULL CHECK (valor_alocado>0),
 status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','cancelada')),
 motivo_revisao text,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_ne_comp_emenda_fk FOREIGN KEY (emenda_id)
  REFERENCES public.emendas(id) ON DELETE RESTRICT,
 CONSTRAINT emenda_ne_comp_lancamento_fk FOREIGN KEY (lancamento_id,emenda_id)
  REFERENCES public.emenda_lancamentos(id,emenda_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_ne_comp_ne_fk FOREIGN KEY (solicitacao_id,emenda_id)
  REFERENCES public.emenda_solicitacoes(id,emenda_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_ne_comp_mes_fk FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_ne_comp_revisao_check CHECK (
  motivo_revisao IS NULL OR length(btrim(motivo_revisao)) BETWEEN 10 AND 2000
 ),
 UNIQUE(solicitacao_id,competencia_id)
);

CREATE INDEX emenda_ne_comp_emenda_competencia_idx
 ON public.emenda_ne_competencias(emenda_id,competencia_id);
CREATE INDEX emenda_ne_comp_lancamento_idx
 ON public.emenda_ne_competencias(lancamento_id,status);

ALTER TABLE public.emenda_ne_competencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY emenda_ne_competencias_leitura ON public.emenda_ne_competencias
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
  ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

REVOKE ALL ON public.emenda_ne_competencias FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_ne_competencias TO authenticated;

CREATE TRIGGER audit_emenda_ne_competencias
 AFTER INSERT OR UPDATE OR DELETE ON public.emenda_ne_competencias
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

COMMIT;
