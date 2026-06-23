-- Finalização: flag de reabertura (admin) para reeditar um lançamento concluído.
ALTER TABLE public.lancamentos_pagamento
  ADD COLUMN IF NOT EXISTS reaberto BOOLEAN NOT NULL DEFAULT false;
