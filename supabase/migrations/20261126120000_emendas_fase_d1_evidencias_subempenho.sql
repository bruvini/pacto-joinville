-- PACTO · Emendas · D1: evidências de assinatura, encaminhamento e conclusão.
-- Requer Fases B e C. Nenhuma alteração de valores ou documentos já existentes.
BEGIN;

CREATE TABLE public.emenda_subempenho_matrizes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id) ON DELETE RESTRICT,
 tipo text NOT NULL CHECK (tipo IN ('solicitacao_liquidacao','movimento_liquidacao','aviso_subempenho')),
 versao integer NOT NULL CHECK (versao>0),
 grupos_obrigatorios text[] NOT NULL,
 exige_encaminhamento boolean NOT NULL,
 destino_encaminhamento text,
 referencia_sei text NOT NULL CHECK (length(btrim(referencia_sei)) BETWEEN 1 AND 100),
 referencia_link_sei text NOT NULL CHECK (referencia_link_sei ~* '^https://[^[:space:]]+$'),
 justificativa text NOT NULL CHECK (length(btrim(justificativa))>=10),
 ativa boolean NOT NULL DEFAULT true,
 homologada_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 homologada_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_matriz_grupos CHECK (cardinality(grupos_obrigatorios)<=10),
 CONSTRAINT emenda_sub_matriz_destino CHECK (
  (exige_encaminhamento AND length(btrim(coalesce(destino_encaminhamento,'')))>=3)
  OR (NOT exige_encaminhamento AND destino_encaminhamento IS NULL)
 ),
 UNIQUE (emenda_id,tipo,versao),
 UNIQUE (id,emenda_id)
);
CREATE UNIQUE INDEX emenda_sub_matriz_unica_ativa
 ON public.emenda_subempenho_matrizes(emenda_id,tipo) WHERE ativa;
CREATE INDEX emenda_sub_matriz_consulta_idx
 ON public.emenda_subempenho_matrizes(emenda_id,tipo,ativa);

-- Snapshot da matriz aplicável ao documento. Documentos anteriores permanecem intactos.
ALTER TABLE public.emenda_subempenho_documentos
 ADD COLUMN politica_id uuid,
 ADD CONSTRAINT emenda_sub_documento_politica_fk
  FOREIGN KEY(politica_id,emenda_id)
  REFERENCES public.emenda_subempenho_matrizes(id,emenda_id) ON DELETE RESTRICT,
 ADD CONSTRAINT emenda_sub_documento_composite_unique
  UNIQUE(id,emenda_id,subempenho_id);

CREATE TABLE public.emenda_subempenho_assinaturas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 documento_id uuid NOT NULL,
 grupo text NOT NULL CHECK (length(btrim(grupo)) BETWEEN 2 AND 80),
 signatario_nome text NOT NULL CHECK (length(btrim(signatario_nome)) BETWEEN 3 AND 160),
 cargo_signatario text NOT NULL CHECK (length(btrim(cargo_signatario)) BETWEEN 3 AND 160),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 data_assinatura date NOT NULL,
 registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_ass_doc_fk FOREIGN KEY(documento_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_subempenho_documentos(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(documento_id,grupo)
);

CREATE TABLE public.emenda_subempenho_encaminhamentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 documento_id uuid NOT NULL,
 destino text NOT NULL CHECK (length(btrim(destino))>=3),
 numero_sei text NOT NULL CHECK (length(btrim(numero_sei)) BETWEEN 1 AND 100),
 link_sei text NOT NULL CHECK (link_sei ~* '^https://[^[:space:]]+$'),
 data_encaminhamento date NOT NULL,
 confirmado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 confirmado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_env_doc_fk FOREIGN KEY(documento_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_subempenho_documentos(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(documento_id)
);

CREATE TABLE public.emenda_subempenho_conclusoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL,
 subempenho_id uuid NOT NULL,
 documento_id uuid NOT NULL,
 status_resultante text NOT NULL CHECK (status_resultante IN ('solicitado','em_liquidacao','subempenhado')),
 concluido_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 concluido_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT emenda_sub_concl_doc_fk FOREIGN KEY(documento_id,emenda_id,subempenho_id)
  REFERENCES public.emenda_subempenho_documentos(id,emenda_id,subempenho_id) ON DELETE RESTRICT,
 UNIQUE(documento_id)
);

CREATE INDEX emenda_sub_ass_sub_idx ON public.emenda_subempenho_assinaturas(subempenho_id);
CREATE INDEX emenda_sub_env_sub_idx ON public.emenda_subempenho_encaminhamentos(subempenho_id);
CREATE INDEX emenda_sub_concl_sub_idx ON public.emenda_subempenho_conclusoes(subempenho_id);

ALTER TABLE public.emenda_subempenho_matrizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_subempenho_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_subempenho_encaminhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_subempenho_conclusoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY emenda_sub_matrizes_read ON public.emenda_subempenho_matrizes
 FOR SELECT TO authenticated USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_sub_ass_read ON public.emenda_subempenho_assinaturas
 FOR SELECT TO authenticated USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_sub_env_read ON public.emenda_subempenho_encaminhamentos
 FOR SELECT TO authenticated USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));
CREATE POLICY emenda_sub_concl_read ON public.emenda_subempenho_conclusoes
 FOR SELECT TO authenticated USING(public.has_any_role((SELECT auth.uid()),
 ARRAY['admin'::public.app_role,'acp'::public.app_role,'aco'::public.app_role]));

REVOKE ALL ON public.emenda_subempenho_matrizes,public.emenda_subempenho_assinaturas,
 public.emenda_subempenho_encaminhamentos,public.emenda_subempenho_conclusoes
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emenda_subempenho_matrizes,public.emenda_subempenho_assinaturas,
 public.emenda_subempenho_encaminhamentos,public.emenda_subempenho_conclusoes
 TO authenticated;

CREATE TRIGGER audit_emenda_sub_matrizes AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_subempenho_matrizes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_sub_ass AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_subempenho_assinaturas FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_sub_env AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_subempenho_encaminhamentos FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();
CREATE TRIGGER audit_emenda_sub_concl AFTER INSERT OR UPDATE OR DELETE
 ON public.emenda_subempenho_conclusoes FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento();

COMMIT;
