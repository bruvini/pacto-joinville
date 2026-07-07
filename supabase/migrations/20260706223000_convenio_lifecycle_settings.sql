-- Adiciona a coluna exige_relatorio_analise na tabela public.convenios
ALTER TABLE public.convenios ADD COLUMN IF NOT EXISTS exige_relatorio_analise BOOLEAN NOT NULL DEFAULT TRUE;

-- Adiciona a coluna convenio_id na tabela public.historico_logs para auditoria de ciclo de vida de convenios
ALTER TABLE public.historico_logs ADD COLUMN IF NOT EXISTS convenio_id UUID REFERENCES public.convenios(id) ON DELETE CASCADE;
