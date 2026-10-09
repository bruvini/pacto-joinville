CREATE INDEX IF NOT EXISTS idx_historico_logs_data_hora ON public.historico_logs (data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_historico_logs_piso ON public.historico_logs (piso_competencia_id, data_hora DESC) WHERE piso_competencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_assinado_em ON public.assinaturas_etapa (assinado_em);