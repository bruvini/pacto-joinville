-- Data de início da vigência do convênio (para validar competências).
ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS data_inicio_vigencia DATE;
