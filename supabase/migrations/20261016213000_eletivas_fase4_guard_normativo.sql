-- FASE 4 — Mapa normativo por competência e guarda de AIH.
-- Matrizes completas: supabase/functions/_shared/eletivas-normativas.ts.
-- Não reprocessa dados anteriores nem altera atestos.
BEGIN;
CREATE OR REPLACE FUNCTION public.ec_norma_cib_competencia(p_competencia text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $norma$
 SELECT CASE
  WHEN p_competencia~'^(0[1-9]|1[0-2])/[0-9]{4}$'
   AND (split_part(p_competencia,'/',2)::integer*100+
        split_part(p_competencia,'/',1)::integer) BETWEEN 202504 AND 202508
   THEN '030/CIB/2025'
  WHEN p_competencia~'^(0[1-9]|1[0-2])/[0-9]{4}$'
   AND (split_part(p_competencia,'/',2)::integer*100+
        split_part(p_competencia,'/',1)::integer) BETWEEN 202509 AND 202607
   THEN '727/CIB/2025'
  WHEN p_competencia~'^(0[1-9]|1[0-2])/[0-9]{4}$'
   AND (split_part(p_competencia,'/',2)::integer*100+
        split_part(p_competencia,'/',1)::integer) BETWEEN 202608 AND 202612
   THEN '399/CIB/2026'
  ELSE NULL END;
$norma$;

CREATE OR REPLACE FUNCTION public.ec_guardar_regra_cib_v4()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard$
DECLARE comp text; esperado text; indicado text;
BEGIN
 -- Compatibilidade: registros anteriores à migração, sem versão CIB,
 -- seguem consultáveis, mas precisam ser recalculados para homologação.
 IF NEW.origem IS DISTINCT FROM 'parser_validado'
    OR NEW.detalhe->>'regra_normativa' IS NULL THEN
   RETURN NEW;
 END IF;
 SELECT competencia INTO comp FROM public.eletivas_competencias
 WHERE id=NEW.competencia_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Competência vinculada inexistente.' USING ERRCODE='23514';
 END IF;
 esperado:=public.ec_norma_cib_competencia(comp);
 indicado:=NEW.detalhe->>'regra_normativa';
 IF esperado IS NULL OR indicado IS DISTINCT FROM esperado THEN
  RAISE EXCEPTION 'Versão CIB divergente: competência %, esperada %, recebida %.',
   comp,coalesce(esperado,'indisponível'),indicado USING ERRCODE='23514';
 END IF;
 IF NEW.categoria='faec_mult' AND NEW.situacao='ok' AND (
   NEW.detalhe->>'classificacao_auditor' IS DISTINCT FROM 'ok'
   OR NEW.detalhe->>'publicacao_independente' IS DISTINCT FROM 'true'
   OR NEW.detalhe->>'base_independente_comprovada' IS DISTINCT FROM 'true'
 ) THEN
  RAISE EXCEPTION 'AIH FAEC sem composição normativa e publicação independente comprovadas não pode ser classificada OK.'
   USING ERRCODE='23514';
 END IF;
 IF NEW.categoria='mac_mult' AND NEW.situacao='ok' AND (
   NEW.detalhe->>'pendencia_normativa' IS DISTINCT FROM 'false'
   OR NEW.detalhe->>'base_independente_comprovada' IS DISTINCT FROM 'true'
   OR NEW.detalhe->>'exige_programacao_fpo'='true'
 ) THEN
  RAISE EXCEPTION 'Múltiplas MAC com pendência normativa ou FPO não podem ser classificadas OK.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS ec_normativa_fase4_guard ON public.eletivas_itens;
CREATE TRIGGER ec_normativa_fase4_guard
 BEFORE INSERT OR UPDATE OF categoria,situacao,detalhe ON public.eletivas_itens
 FOR EACH ROW EXECUTE FUNCTION public.ec_guardar_regra_cib_v4();
REVOKE ALL ON FUNCTION public.ec_norma_cib_competencia(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_norma_cib_competencia(text) TO authenticated;
COMMIT;
