-- Análise assistida de documentos financeiros. APENAS parecer para revisão,
-- sem atualizar atesto, nota de empenho, liquidação ou pagamento.
-- Depende do Supabase Auth e da função public.has_any_role do projeto.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auditoria_pagamento_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos_pagamento(id) ON DELETE RESTRICT,
  nome_arquivo text NOT NULL CHECK (char_length(nome_arquivo) BETWEEN 1 AND 240),
  storage_path text NOT NULL UNIQUE,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 12582912),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  enviado_por uuid NOT NULL REFERENCES auth.users(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','processando','concluido','erro')),
  resumo_ia text,
  campos_extraidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  divergencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_lancamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  modelo_ia text,
  modo_leitura text,
  erro text,
  revisado_por uuid REFERENCES auth.users(id),
  revisado_em timestamptz,
  revisao_observacao text,
  CONSTRAINT aud_pag_storage_path_check
    CHECK (storage_path LIKE lancamento_id::text || '/%')
);
CREATE INDEX IF NOT EXISTS idx_aud_pag_lancamento
  ON public.auditoria_pagamento_documentos(lancamento_id,enviado_em DESC);

ALTER TABLE public.auditoria_pagamento_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auditoria_pagamento_documentos FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT ON public.auditoria_pagamento_documentos TO authenticated;
GRANT ALL ON public.auditoria_pagamento_documentos TO service_role;

DROP POLICY IF EXISTS "aud pag leitura" ON public.auditoria_pagamento_documentos;
CREATE POLICY "aud pag leitura" ON public.auditoria_pagamento_documentos
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));
DROP POLICY IF EXISTS "aud pag inserir" ON public.auditoria_pagamento_documentos;
CREATE POLICY "aud pag inserir" ON public.auditoria_pagamento_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
    AND enviado_por = auth.uid() AND status = 'pendente'
    AND resumo_ia IS NULL AND erro IS NULL
    AND campos_extraidos = '[]'::jsonb AND divergencias = '[]'::jsonb
    AND snapshot_lancamento = '{}'::jsonb
    AND modelo_ia IS NULL AND modo_leitura IS NULL
    AND revisado_por IS NULL AND revisado_em IS NULL
    AND revisao_observacao IS NULL
  );
-- Nenhum UPDATE/DELETE por navegador: mudanças de processamento e revisão
-- são feitas em funções de servidor com autenticação e papéis verificados.

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('auditoria-pagamentos','auditoria-pagamentos',false,12582912,
        ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE
  SET public=false,file_size_limit=12582912,
      allowed_mime_types=ARRAY['application/pdf']::text[];

DROP POLICY IF EXISTS "aud pag storage leitura" ON storage.objects;
CREATE POLICY "aud pag storage leitura" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='auditoria-pagamentos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp','aco']::app_role[]));
DROP POLICY IF EXISTS "aud pag storage inserir" ON storage.objects;
CREATE POLICY "aud pag storage inserir" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='auditoria-pagamentos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','acp']::app_role[])
    AND storage.extension(name) = 'pdf');
-- O arquivo original nunca é apagado/alterado pela aplicação.
COMMENT ON TABLE public.auditoria_pagamento_documentos IS
  'Parecer preliminar da IA para conferência humana; PDF original imutável e privado.';

COMMIT;
