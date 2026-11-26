-- PACTO / Emendas · Fase B1 — fundação financeira aditiva.
-- Dependência: migrations de Emendas até 29/10 e proteção Fase A.
-- Sem backfill, UPDATE, DELETE ou inferência de documentos financeiros históricos.
BEGIN;

CREATE TABLE public.emenda_subempenhos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 lancamento_id uuid NOT NULL,
 competencia_id uuid NOT NULL,
 solicitacao_id uuid NOT NULL,
 sequencia integer NOT NULL CHECK (sequencia BETWEEN 1 AND 99999),
 chave_idempotencia uuid NOT NULL,
 valor_solicitado numeric(16,2) NOT NULL CHECK (valor_solicitado > 0),
 valor_subempenhado numeric(16,2),
 status text NOT NULL DEFAULT 'rascunho'
  CHECK (status IN ('rascunho','solicitado','em_liquidacao','subempenhado','cancelado')),
 motivo_cancelamento text,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_status_valor CHECK (
  (status='subempenhado' AND valor_subempenhado IS NOT NULL AND valor_subempenhado>0)
  OR (status<>'subempenhado' AND valor_subempenhado IS NULL)
 ),
 CONSTRAINT emenda_sub_motivo_cancelamento CHECK (
  (status='cancelado' AND length(btrim(coalesce(motivo_cancelamento,'')))>=10)
  OR (status<>'cancelado' AND motivo_cancelamento IS NULL)
 ),
 CONSTRAINT emenda_sub_emenda_fk FOREIGN KEY (emenda_id)
  REFERENCES public.emendas(id) ON DELETE RESTRICT,
 CONSTRAINT emenda_sub_lancamento_emenda_fk FOREIGN KEY (lancamento_id,emenda_id)
  REFERENCES public.emenda_lancamentos(id,emenda_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_sub_competencia_fk FOREIGN KEY (lancamento_id,competencia_id)
  REFERENCES public.emenda_lancamento_meses(lancamento_id,competencia_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_sub_ne_fk FOREIGN KEY (solicitacao_id,emenda_id)
  REFERENCES public.emenda_solicitacoes(id,emenda_id) ON DELETE RESTRICT,
 UNIQUE (emenda_id,chave_idempotencia),
 UNIQUE (lancamento_id,competencia_id,sequencia),
 UNIQUE (id,emenda_id),
 UNIQUE (id,emenda_id,lancamento_id,competencia_id)
);

CREATE INDEX emenda_sub_ne_competencia_idx
 ON public.emenda_subempenhos(solicitacao_id,competencia_id);
CREATE INDEX emenda_sub_lancamento_idx
 ON public.emenda_subempenhos(lancamento_id,status);

-- Cada documento pertence a uma solicitação individual, não à competência inteira.
-- O Aviso de Movimento é evidência de valor efetivo; o pedido não é sua confirmação.
CREATE TABLE public.emenda_subempenho_documentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 tipo text NOT NULL CHECK (
  tipo IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')
 ),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 data_documento date NOT NULL,
 valor_documentado numeric(16,2),
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_doc_valor CHECK (
  (tipo='aviso_subempenho' AND valor_documentado IS NOT NULL AND valor_documentado>0)
  OR (tipo<>'aviso_subempenho' AND valor_documentado IS NULL)
 ),
 CONSTRAINT emenda_sub_doc_sub_fk FOREIGN KEY (subempenho_id,emenda_id)
  REFERENCES public.emenda_subempenhos(id,emenda_id) ON DELETE RESTRICT,
 UNIQUE (subempenho_id,tipo)
);
CREATE INDEX emenda_sub_documentos_emenda_idx
 ON public.emenda_subempenho_documentos(emenda_id,subempenho_id);

-- Os pagamentos legados continuam sem subempenho associado (NULL).
-- A Fase E implementará a nova liquidação de parcelas sem liberação legado.
ALTER TABLE public.emenda_blocos_pagamento
 ADD COLUMN subempenho_id uuid,
 ADD COLUMN programacao_numero_sei text,
 ADD COLUMN programacao_link_sei text,
 ADD COLUMN data_programacao date,
 ADD COLUMN valor_programado numeric(16,2),
 ADD CONSTRAINT emenda_pagamentos_subempenho_fk
  FOREIGN KEY(subempenho_id,emenda_id,lancamento_id,competencia_id)
  REFERENCES public.emenda_subempenhos(id,emenda_id,lancamento_id,competencia_id)
  ON DELETE RESTRICT,
 ADD CONSTRAINT emenda_pagamento_programacao_numero_check
  CHECK (programacao_numero_sei IS NULL OR length(btrim(programacao_numero_sei)) BETWEEN 1 AND 100),
 ADD CONSTRAINT emenda_pagamento_programacao_link_check
  CHECK (programacao_link_sei IS NULL OR programacao_link_sei ~* '^https://[^[:space:]]+$'),
 ADD CONSTRAINT emenda_pagamento_valor_programado_check
  CHECK (valor_programado IS NULL OR (valor_programado>0 AND valor_programado=round(valor_programado,2)));
CREATE INDEX emenda_pagamentos_subempenho_idx
 ON public.emenda_blocos_pagamento(subempenho_id)
 WHERE subempenho_id IS NOT NULL;

ALTER TABLE public.emenda_subempenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_subempenho_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY emenda_subempenhos_read ON public.emenda_subempenhos
 FOR SELECT TO authenticated
 USING (public.has_any_role((SELECT auth.uid()),
  ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_sub_docs_read ON public.emenda_subempenho_documentos
 FOR SELECT TO authenticated
 USING (public.has_any_role((SELECT auth.uid()),
  ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

REVOKE ALL ON public.emenda_subempenhos,public.emenda_subempenho_documentos
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_subempenhos,public.emenda_subempenho_documentos
 TO authenticated;

-- Mesmo instrumento de auditoria já usado nos lançamentos de Emendas.
CREATE TRIGGER audit_emenda_subempenhos
 AFTER INSERT OR UPDATE OR DELETE ON public.emenda_subempenhos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_sub_documentos
 AFTER INSERT OR UPDATE OR DELETE ON public.emenda_subempenho_documentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

-- A tabela de pagamentos existente auditava apenas INSERT.
-- Preparar trilha de alterações documentais para a Fase E.
CREATE TRIGGER audit_emenda_pagamentos_update
 AFTER UPDATE ON public.emenda_blocos_pagamento
 FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

COMMIT;
