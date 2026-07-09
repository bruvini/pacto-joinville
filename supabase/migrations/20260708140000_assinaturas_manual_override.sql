-- Overrides para os signatários de texto livre (Membros da SEFAZ / Comissão).
-- Permite corrigir a grafia (nome_novo) ou ocultar (oculto) um nome da lista de
-- SUGESTÕES de autocomplete, SEM alterar o histórico imutável em assinaturas_etapa.

CREATE TABLE IF NOT EXISTS public.assinaturas_manual_override (
  nome_original TEXT PRIMARY KEY,
  nome_novo TEXT,
  oculto BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assinaturas_manual_override ENABLE ROW LEVEL SECURITY;

-- Mesma política dos demais catálogos de assinatura (a tela é admin-only no roteamento).
DO $$ BEGIN
  CREATE POLICY "Auth read amo" ON public.assinaturas_manual_override FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Auth write amo" ON public.assinaturas_manual_override FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.assinaturas_manual_override IS
  'Correções de grafia / ocultação da lista de sugestões dos signatários manuais (texto livre). Não afeta o histórico de assinaturas_etapa.';
