-- ============================================================================
-- HERANÇA DE STATUS Etapa 3 (Revisão da Coordenação da UFI) — Pai → Filhos
-- A revisão é um ato coordenador único do Processo Pai; os sublançamentos
-- (filhos, parent_id) devem herdar a aprovação automaticamente, com trilha de
-- auditoria imutável e sem sobrescrever ação humana já registrada no filho.
-- ============================================================================

-- Trigger: ao APROVAR a revisão de um Pai, propaga 'aprovado' aos filhos
-- pendentes (nunca sobrescreve 'negado' — ação humana prevalece).
CREATE OR REPLACE FUNCTION public.herdar_revisao_filhos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD;
  uid UUID := auth.uid();
  unome TEXT;
BEGIN
  IF NEW.parent_id IS NULL
     AND NEW.revisao_status = 'aprovado'
     AND NEW.revisao_status IS DISTINCT FROM COALESCE(OLD.revisao_status, 'pendente') THEN
    SELECT nome INTO unome FROM public.profiles WHERE id = uid;
    FOR c IN
      SELECT id, COALESCE(revisao_status, 'pendente') AS anterior
      FROM public.lancamentos_pagamento
      WHERE parent_id = NEW.id
        AND COALESCE(revisao_status, 'pendente') NOT IN ('aprovado', 'negado')
    LOOP
      UPDATE public.lancamentos_pagamento SET revisao_status = 'aprovado' WHERE id = c.id;
      INSERT INTO public.historico_logs (lancamento_id, usuario_id, usuario_nome, acao, detalhes)
      VALUES (c.id, uid, COALESCE(unome, 'Sistema'),
        'Status de etapa herdado do processo pai',
        jsonb_build_object(
          'etapa', 'Revisão da Coordenação da UFI',
          'valor_antigo', c.anterior,
          'valor_novo', 'Concluída (Herdada)',
          'origem_pai', NEW.id::text,
          'aprovado_por', COALESCE(unome, uid::text)
        ));
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_herdar_revisao ON public.lancamentos_pagamento;
CREATE TRIGGER trg_herdar_revisao
  AFTER UPDATE OF revisao_status ON public.lancamentos_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.herdar_revisao_filhos();

-- Correção retroativa: filhos ainda pendentes cujo pai já está aprovado.
-- Não altera filhos 'negado' (rejeitados/diligência) nem já 'aprovado'.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT f.id, COALESCE(f.revisao_status, 'pendente') AS anterior, f.parent_id
    FROM public.lancamentos_pagamento f
    JOIN public.lancamentos_pagamento p ON p.id = f.parent_id
    WHERE p.revisao_status = 'aprovado'
      AND COALESCE(f.revisao_status, 'pendente') NOT IN ('aprovado', 'negado')
  LOOP
    UPDATE public.lancamentos_pagamento SET revisao_status = 'aprovado' WHERE id = c.id;
    INSERT INTO public.historico_logs (lancamento_id, usuario_nome, acao, detalhes)
    VALUES (c.id, 'Sistema — correção retroativa',
      'Status de etapa herdado do processo pai',
      jsonb_build_object(
        'etapa', 'Revisão da Coordenação da UFI',
        'valor_antigo', c.anterior,
        'valor_novo', 'Concluída (Herdada)',
        'origem_pai', c.parent_id::text,
        'origem', 'Correção retroativa do sistema — ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
      ));
  END LOOP;
END $$;
