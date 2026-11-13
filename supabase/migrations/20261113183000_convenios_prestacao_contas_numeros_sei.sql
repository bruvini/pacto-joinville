-- Convênios / prestação de contas: número do documento SEI para cada link.
-- Colunas opcionais; não alterar etapas, status nem qualquer dado anterior.
BEGIN;
ALTER TABLE public.prestacoes_contas
  ADD COLUMN IF NOT EXISTS numero_sei_prestacao text,
  ADD COLUMN IF NOT EXISTS numero_sei_relatorio_analise text,
  ADD COLUMN IF NOT EXISTS numero_sei_parecer_ses text,
  ADD COLUMN IF NOT EXISTS numero_sei_manifestacao_cgm text;
ALTER TABLE public.prestacoes_contas_interacoes
  ADD COLUMN IF NOT EXISTS numero_sei text;
NOTIFY pgrst, 'reload schema';
COMMIT;
