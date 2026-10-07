-- Regra configurável de defasagem do atesto por convênio.
-- 1 = fluxo padrão: atesto em M+1, acompanhamento até o 5º dia útil de M+2.
-- 2 = fluxo diferenciado: atesto em M+2, acompanhamento até o 5º dia útil de M+3.
-- O intervalo até 6 meses mantém a estrutura preparada para exceções futuras
-- sem acoplar a regra ao nome/objeto do convênio.

ALTER TABLE public.convenios
  ADD COLUMN IF NOT EXISTS prazo_atesto_meses smallint NOT NULL DEFAULT 1;

ALTER TABLE public.convenios
  DROP CONSTRAINT IF EXISTS convenios_prazo_atesto_meses_check;

ALTER TABLE public.convenios
  ADD CONSTRAINT convenios_prazo_atesto_meses_check
  CHECK (prazo_atesto_meses BETWEEN 1 AND 6);

COMMENT ON COLUMN public.convenios.prazo_atesto_meses IS
  'Defasagem entre a competência e o mês de atesto: 1=M+1 (padrão), 2=M+2 (diferenciado).';
