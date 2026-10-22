-- Piso da Enfermagem: valor a liquidar é derivado do rateio do InvestSUS,
-- mas somente após o total das instituições elegíveis fechar com a Portaria.
-- Sem reescrever competências encerradas e sem converter estimativa em anulação.
BEGIN;

-- Preserva a proibição de escrita do valor derivado pelo navegador.
CREATE OR REPLACE FUNCTION public.piso_derivar_valor_obrigacao()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE
  devido numeric(14,2);
  homologado numeric(14,2);
  total numeric(14,2);
  pendentes integer;
  quantidade integer;
  papel text := COALESCE(auth.role(), '');
  manutencao boolean := current_user IN ('postgres','supabase_admin');
BEGIN
  SELECT p.valor_devido, c.valor_homologado
  INTO devido,homologado
  FROM public.piso_participantes p
  JOIN public.piso_competencias c ON c.id=p.competencia_id
  WHERE p.id=NEW.participante_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante da obrigação não encontrado.' USING ERRCODE='23503';
  END IF;

  IF TG_OP='INSERT' THEN
    SELECT COALESCE(SUM(p.valor_devido),0),
           count(*) FILTER (WHERE p.valor_devido IS NULL),
           count(*)
    INTO total,pendentes,quantidade
    FROM public.piso_participantes p
    WHERE p.competencia_id=(SELECT competencia_id FROM public.piso_participantes WHERE id=NEW.participante_id)
      AND NOT p.sem_elegiveis;
    -- Uma NE aberta antes da Portaria não homologa o rateio do InvestSUS.
    NEW.valor_a_liquidar :=
      CASE WHEN homologado IS NOT NULL AND quantidade>0 AND pendentes=0
              AND abs(total-homologado)<=0.02
           THEN devido ELSE NULL END;
    RETURN NEW;
  END IF;
  IF NOT manutencao AND papel<>'service_role'
    AND NEW.valor_a_liquidar IS DISTINCT FROM OLD.valor_a_liquidar THEN
    RAISE EXCEPTION 'O valor a liquidar é derivado do valor devido e não pode ser alterado diretamente.'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.piso_derivar_valor_obrigacao()
  FROM PUBLIC,anon,authenticated;

-- Ao confirmar a Portaria ou atualizar o rateio ministerial, refletir o valor
-- por instituição na obrigação financeira sem digitação paralela.
CREATE OR REPLACE FUNCTION public.piso_sincronizar_obrigacoes_conciliadas(p_comp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $sync$
DECLARE
  homologado numeric(14,2);
  situacao text;
  total numeric(14,2);
  pendentes integer;
  quantidade integer;
BEGIN
  SELECT c.valor_homologado,c.status INTO homologado,situacao
  FROM public.piso_competencias c WHERE c.id=p_comp;
  IF NOT FOUND OR situacao='encerrada' OR homologado IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(p.valor_devido),0),
         count(*) FILTER (WHERE p.valor_devido IS NULL),
         count(*)
    INTO total,pendentes,quantidade
  FROM public.piso_participantes p
  WHERE p.competencia_id=p_comp AND NOT p.sem_elegiveis;

  IF quantidade=0 OR pendentes>0 OR abs(total-homologado)>0.02 THEN RETURN; END IF;

  UPDATE public.piso_obrigacoes o
     SET valor_a_liquidar=p.valor_devido
    FROM public.piso_participantes p
   WHERE o.participante_id=p.id
     AND p.competencia_id=p_comp
     AND NOT p.sem_elegiveis
     AND o.valor_a_liquidar IS DISTINCT FROM p.valor_devido;
END;
$sync$;
REVOKE ALL ON FUNCTION public.piso_sincronizar_obrigacoes_conciliadas(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.piso_disparar_sincronizacao_empenho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$
BEGIN
  IF TG_TABLE_NAME='piso_competencias' THEN
    PERFORM public.piso_sincronizar_obrigacoes_conciliadas(NEW.id);
  ELSE
    PERFORM public.piso_sincronizar_obrigacoes_conciliadas(NEW.competencia_id);
  END IF;
  RETURN NEW;
END;
$trigger$;
REVOKE ALL ON FUNCTION public.piso_disparar_sincronizacao_empenho()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_piso_sync_obrigacoes_homologado ON public.piso_competencias;
CREATE TRIGGER trg_piso_sync_obrigacoes_homologado
AFTER UPDATE OF valor_homologado ON public.piso_competencias
FOR EACH ROW WHEN (OLD.valor_homologado IS DISTINCT FROM NEW.valor_homologado)
EXECUTE FUNCTION public.piso_disparar_sincronizacao_empenho();

DROP TRIGGER IF EXISTS trg_piso_sync_obrigacoes_investsus ON public.piso_participantes;
CREATE TRIGGER trg_piso_sync_obrigacoes_investsus
AFTER UPDATE OF valor_devido ON public.piso_participantes
FOR EACH ROW WHEN (OLD.valor_devido IS DISTINCT FROM NEW.valor_devido)
EXECUTE FUNCTION public.piso_disparar_sincronizacao_empenho();

-- Conciliação retroativa estritamente das competências ABERTAS e que já
-- têm homologação válida. Sem editar encerradas nem preencher outubro
-- enquanto o valor homologado permanece pendente.
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.piso_competencias
    WHERE status<>'encerrada' AND valor_homologado IS NOT NULL
  LOOP
    PERFORM public.piso_sincronizar_obrigacoes_conciliadas(r.id);
  END LOOP;
END;
$backfill$;
COMMIT;
