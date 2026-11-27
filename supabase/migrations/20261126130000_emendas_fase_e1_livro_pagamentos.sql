-- PACTO Joinville / Emendas · E1
-- Livro de pagamento por subempenho, isolado do fluxo legado de liberações.
-- NÃO altera nem reaproveita emenda_blocos_pagamento (liberacao_id obrigatório).
BEGIN;

CREATE TABLE public.emenda_pagamento_parcelas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 sequencia integer NOT NULL CHECK(sequencia BETWEEN 1 AND 99999),
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_parc_sub_fk FOREIGN KEY(subempenho_id,emenda_id)
  REFERENCES public.emenda_subempenhos(id,emenda_id) ON DELETE RESTRICT,
 UNIQUE(id,emenda_id,subempenho_id),
 UNIQUE(emenda_id,chave_idempotencia),
 UNIQUE(subempenho_id,sequencia)
);

-- Cada nova programação/reprogramação é um documento imutável.
-- O valor vigente de uma parcela é o valor da ÚLTIMA programação por sequência.
CREATE TABLE public.emenda_pagamento_programacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 parcela_id uuid NOT NULL,
 sequencia integer NOT NULL CHECK(sequencia BETWEEN 1 AND 99999),
 tipo text NOT NULL CHECK(tipo IN ('inicial','reprogramacao','cancelamento')),
 valor_programado numeric(16,2) NOT NULL CHECK (
  valor_programado>=0 AND valor_programado=round(valor_programado,2)
 ),
 data_prevista date NOT NULL,
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 data_documento date NOT NULL,
 justificativa text,
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_prog_tipo_valor CHECK (
  (tipo='cancelamento' AND valor_programado=0)
  OR (tipo IN ('inicial','reprogramacao') AND valor_programado>0)
 ),
 CONSTRAINT emenda_pag_prog_motivo CHECK (
  (tipo='inicial' AND justificativa IS NULL) OR
  (tipo<>'inicial' AND length(btrim(coalesce(justificativa,'')))>=10)
 ),
 CONSTRAINT emenda_pag_prog_parcela_fk FOREIGN KEY(parcela_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_pagamento_parcelas(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(id,emenda_id,parcela_id),
 UNIQUE(emenda_id,chave_idempotencia),
 UNIQUE(parcela_id,sequencia)
);

-- Comprovante de transferência efetivamente realizada: no máximo um por cartão.
-- Pagamentos adicionais são registrados em outra parcela, nunca como overwrite.
CREATE TABLE public.emenda_pagamento_comprovantes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 parcela_id uuid NOT NULL,
 valor_pago numeric(16,2) NOT NULL CHECK(valor_pago>0 AND valor_pago=round(valor_pago,2)),
 data_pagamento date NOT NULL,
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 data_documento date NOT NULL,
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_comp_parcela_fk FOREIGN KEY(parcela_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_pagamento_parcelas(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(id,emenda_id,parcela_id),
 UNIQUE(parcela_id),
 UNIQUE(emenda_id,chave_idempotencia)
);

-- Devolução real e estorno administrativo têm semânticas diferentes no histórico.
-- Ambos reduzem o valor pago LÍQUIDO; não apagam o comprovante original.
CREATE TABLE public.emenda_pagamento_ajustes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 parcela_id uuid NOT NULL,
 comprovante_id uuid NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('devolucao','estorno')),
 valor numeric(16,2) NOT NULL CHECK(valor>0 AND valor=round(valor,2)),
 data_evento date NOT NULL,
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 data_documento date NOT NULL,
 motivo text NOT NULL CHECK(length(btrim(motivo))>=10),
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_ajuste_comp_fk FOREIGN KEY(comprovante_id,emenda_id,parcela_id)
  REFERENCES public.emenda_pagamento_comprovantes(id,emenda_id,parcela_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_pag_ajuste_parc_fk FOREIGN KEY(parcela_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_pagamento_parcelas(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(id,emenda_id,parcela_id),
 UNIQUE(emenda_id,chave_idempotencia)
);

-- Retificação documental modifica a REFERÊNCIA considerada vigente, não
-- altera a quantia original, o fato financeiro nem elimina o primeiro SEI.
-- Retificação de valor exige estorno/devolução documentado e nova parcela.
CREATE TABLE public.emenda_pagamento_retificacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 parcela_id uuid NOT NULL,
 programacao_id uuid,
 comprovante_id uuid,
 ajuste_id uuid,
 novo_numero_sei text NOT NULL CHECK(length(btrim(novo_numero_sei)) BETWEEN 1 AND 100),
 novo_link_sei text NOT NULL CHECK(novo_link_sei ~* '^https://[^[:space:]]+$'),
 nova_data_documento date NOT NULL,
 motivo text NOT NULL CHECK(length(btrim(motivo))>=10),
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_ret_alvo CHECK(num_nonnulls(programacao_id,comprovante_id,ajuste_id)=1),
 CONSTRAINT emenda_pag_ret_parc_fk FOREIGN KEY(parcela_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_pagamento_parcelas(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_pag_ret_prog_fk FOREIGN KEY(programacao_id,emenda_id,parcela_id)
  REFERENCES public.emenda_pagamento_programacoes(id,emenda_id,parcela_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_pag_ret_comp_fk FOREIGN KEY(comprovante_id,emenda_id,parcela_id)
  REFERENCES public.emenda_pagamento_comprovantes(id,emenda_id,parcela_id) ON DELETE RESTRICT,
 CONSTRAINT emenda_pag_ret_ajuste_fk FOREIGN KEY(ajuste_id,emenda_id,parcela_id)
  REFERENCES public.emenda_pagamento_ajustes(id,emenda_id,parcela_id) ON DELETE RESTRICT,
 UNIQUE(emenda_id,chave_idempotencia)
);

-- Quitação não é presumida: conciliação e reabertura são eventos documentados.
CREATE TABLE public.emenda_pagamento_conciliacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 sequencia integer NOT NULL CHECK(sequencia BETWEEN 1 AND 99999),
 evento text NOT NULL CHECK(evento IN ('conciliado','reaberto')),
 numero_sei text NOT NULL CHECK(length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK(link_sei ~* '^https://[^[:space:]]+$'),
 data_evento date NOT NULL,
 motivo text NOT NULL CHECK(length(btrim(motivo))>=10),
 valor_pago_liquido_snapshot numeric(16,2) NOT NULL CHECK(valor_pago_liquido_snapshot>=0),
 chave_idempotencia uuid NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_pag_conc_sub_fk FOREIGN KEY(subempenho_id,emenda_id)
  REFERENCES public.emenda_subempenhos(id,emenda_id) ON DELETE RESTRICT,
 UNIQUE(subempenho_id,sequencia),
 UNIQUE(emenda_id,chave_idempotencia)
);

CREATE INDEX emenda_pag_parc_sub_idx ON public.emenda_pagamento_parcelas(subempenho_id);
CREATE INDEX emenda_pag_prog_parcela_idx ON public.emenda_pagamento_programacoes(parcela_id,sequencia DESC);
CREATE INDEX emenda_pag_comp_sub_idx ON public.emenda_pagamento_comprovantes(subempenho_id);
CREATE INDEX emenda_pag_ajuste_comp_idx ON public.emenda_pagamento_ajustes(comprovante_id);
CREATE INDEX emenda_pag_ret_parc_idx ON public.emenda_pagamento_retificacoes(parcela_id);
CREATE INDEX emenda_pag_conc_sub_idx ON public.emenda_pagamento_conciliacoes(subempenho_id,sequencia DESC);

ALTER TABLE public.emenda_pagamento_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_pagamento_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_pagamento_comprovantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_pagamento_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_pagamento_retificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_pagamento_conciliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY emenda_pag_parcelas_read ON public.emenda_pagamento_parcelas
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pag_programacoes_read ON public.emenda_pagamento_programacoes
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pag_comprovantes_read ON public.emenda_pagamento_comprovantes
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pag_ajustes_read ON public.emenda_pagamento_ajustes
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pag_retificacoes_read ON public.emenda_pagamento_retificacoes
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_pag_conciliacoes_read ON public.emenda_pagamento_conciliacoes
 FOR SELECT TO authenticated
 USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

REVOKE ALL ON public.emenda_pagamento_parcelas,public.emenda_pagamento_programacoes,
 public.emenda_pagamento_comprovantes,public.emenda_pagamento_ajustes,
 public.emenda_pagamento_retificacoes,public.emenda_pagamento_conciliacoes
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_pagamento_parcelas,public.emenda_pagamento_programacoes,
 public.emenda_pagamento_comprovantes,public.emenda_pagamento_ajustes,
 public.emenda_pagamento_retificacoes,public.emenda_pagamento_conciliacoes
 TO authenticated;

CREATE TRIGGER audit_emenda_pag_parcelas AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_parcelas FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pag_programacoes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_programacoes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pag_comprovantes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_comprovantes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pag_ajustes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_ajustes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pag_retificacoes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_retificacoes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_pag_conciliacoes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_pagamento_conciliacoes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

COMMIT;
