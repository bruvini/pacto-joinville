-- Eletivas HMSJ | Fase 3: prova documental FPO distinta do parâmetro oficial,
-- auditoria de normas especiais e proteção contra falso "OK" em múltiplas.
-- Migration incremental. Exige fases 0, 1 e correção do app_role V2 aplicadas.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.eletivas_competencias') IS NULL
   OR to_regclass('public.eletivas_itens') IS NULL
   OR to_regprocedure('public.ec_valor_item(text,text,text,numeric,numeric)') IS NULL
   OR to_regtype('public.app_role') IS NULL THEN
   RAISE EXCEPTION 'Instale primeiro as migrations anteriores do Encontro de Contas.'
     USING ERRCODE='23514';
 END IF;
END;
$preflight$;

-- A tabela oficial da SES é apenas parâmetro; documentação da programação
-- efetiva do prestador precisa ser registrada separadamente, com vigência e SEI.
CREATE TABLE IF NOT EXISTS public.eletivas_fpo_programacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 procedimento varchar(9) NOT NULL CHECK (procedimento ~ '^[0-9]{9}$'),
 competencia_programacao varchar(7) NOT NULL
   CHECK (competencia_programacao ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
 vigencia_inicio date NOT NULL,
 vigencia_fim date NOT NULL,
 valor_federal_unitario numeric(14,2) NOT NULL CHECK(valor_federal_unitario>=0),
 documento_sei text NOT NULL CHECK(length(trim(documento_sei))>=5),
 link_sei text NOT NULL CHECK(link_sei ~* '^https?://'),
 fundamento text NOT NULL CHECK(length(trim(fundamento))>=10),
 autor uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ec_fpo_periodo_valido CHECK(vigencia_fim>=vigencia_inicio),
 CONSTRAINT ec_fpo_documento_unico UNIQUE(competencia_id,procedimento,competencia_programacao,documento_sei)
);
CREATE INDEX IF NOT EXISTS ec_fpo_programacao_comp_idx
  ON public.eletivas_fpo_programacoes(competencia_id,procedimento);

-- Deliberações especiais podem conter CNES, mas não justificam valor sem
-- regra identificada por competência e ato. A natureza de apoio é explícita.
CREATE TABLE IF NOT EXISTS public.eletivas_atos_especiais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 arquivo_id uuid REFERENCES public.eletivas_arquivos(id) ON DELETE RESTRICT,
 aba text NOT NULL CHECK(length(trim(aba))>0),
 norma text NOT NULL CHECK(length(trim(norma))>0),
 vigencia_inicio date,
 vigencia_fim date,
 fundamento text NOT NULL DEFAULT '',
 regra_comprovada boolean NOT NULL DEFAULT false,
 documento_sei text,
 autor uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ec_ato_vigencia CHECK(vigencia_fim IS NULL OR vigencia_inicio IS NULL
    OR vigencia_fim>=vigencia_inicio),
 CONSTRAINT ec_ato_evidencia CHECK(NOT regra_comprovada OR
    (length(trim(COALESCE(documento_sei,'')))>=5 AND length(trim(fundamento))>=10))
);
CREATE INDEX IF NOT EXISTS ec_ato_comp_idx ON public.eletivas_atos_especiais(competencia_id);

-- Publicação financeira por AIH exige fonte distinta da soma dos filhos SES.
-- O valor fica documentado e só entra no motor em nova pré-conciliação.
CREATE TABLE IF NOT EXISTS public.eletivas_publicacoes_aih (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia_id uuid NOT NULL REFERENCES public.eletivas_competencias(id) ON DELETE RESTRICT,
 aih varchar(13) NOT NULL CHECK(aih ~ '^[0-9]{13}$'),
 valor_publicado numeric(14,2) NOT NULL CHECK(valor_publicado>=0),
 documento_sei text NOT NULL CHECK(length(trim(documento_sei))>=5),
 link_sei text NOT NULL CHECK(link_sei ~* '^https?://'),
 fundamento text NOT NULL CHECK(length(trim(fundamento))>=10),
 autor uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ec_publicacao_aih_fonte_unica UNIQUE(competencia_id,aih,documento_sei)
);
CREATE INDEX IF NOT EXISTS ec_publicacao_aih_comp_idx
 ON public.eletivas_publicacoes_aih(competencia_id,aih);
ALTER TABLE public.eletivas_fpo_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eletivas_publicacoes_aih ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eletivas_atos_especiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ec_fpo_leitura ON public.eletivas_fpo_programacoes;
CREATE POLICY ec_fpo_leitura ON public.eletivas_fpo_programacoes
 FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL
  AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
DROP POLICY IF EXISTS ec_fpo_inserir ON public.eletivas_fpo_programacoes;
CREATE POLICY ec_fpo_inserir ON public.eletivas_fpo_programacoes
 FOR INSERT TO authenticated WITH CHECK (
  autor=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]));
DROP POLICY IF EXISTS ec_fpo_atualizar ON public.eletivas_fpo_programacoes;
CREATE POLICY ec_fpo_atualizar ON public.eletivas_fpo_programacoes
 FOR UPDATE TO authenticated
 USING (public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]))
 WITH CHECK (autor=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]));

DROP POLICY IF EXISTS ec_pub_aih_leitura ON public.eletivas_publicacoes_aih;
CREATE POLICY ec_pub_aih_leitura ON public.eletivas_publicacoes_aih
 FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL
  AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
DROP POLICY IF EXISTS ec_pub_aih_inserir ON public.eletivas_publicacoes_aih;
CREATE POLICY ec_pub_aih_inserir ON public.eletivas_publicacoes_aih
 FOR INSERT TO authenticated WITH CHECK(
   autor=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]));

DROP POLICY IF EXISTS ec_ato_leitura ON public.eletivas_atos_especiais;
CREATE POLICY ec_ato_leitura ON public.eletivas_atos_especiais
 FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL
  AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
DROP POLICY IF EXISTS ec_ato_atualizar ON public.eletivas_atos_especiais;
CREATE POLICY ec_ato_atualizar ON public.eletivas_atos_especiais
 FOR UPDATE TO authenticated
 USING (public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]))
 WITH CHECK (autor=auth.uid()
   AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]));

DROP POLICY IF EXISTS ec_ato_inserir ON public.eletivas_atos_especiais;
CREATE POLICY ec_ato_inserir ON public.eletivas_atos_especiais
 FOR INSERT TO authenticated WITH CHECK (
  autor=auth.uid() AND public.has_any_role(auth.uid(),ARRAY['admin','acp']::public.app_role[]));

REVOKE ALL ON public.eletivas_fpo_programacoes,public.eletivas_atos_especiais FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.eletivas_fpo_programacoes TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.eletivas_atos_especiais TO authenticated;
REVOKE ALL ON public.eletivas_publicacoes_aih FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.eletivas_publicacoes_aih TO authenticated;

-- Histórico auditável de qualquer alteração. Sem dados de pacientes ou CPF.
CREATE OR REPLACE FUNCTION public.ec_auditar_evidencia_fase3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $ev$
DECLARE registro jsonb; v_comp uuid;
BEGIN
 registro := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_comp := (registro->>'competencia_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias
   WHERE id=v_comp AND status='encerrada') THEN
   RAISE EXCEPTION 'Competência encerrada: documentos FPO/atos especiais não podem ser alterados.'
     USING ERRCODE='23514';
 END IF;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(v_comp,TG_TABLE_NAME||'_'||lower(TG_OP),
   jsonb_build_object('id',registro->>'id','procedimento',registro->>'procedimento',
     'norma',registro->>'norma','aih',registro->>'aih',
     'valor_publicado',registro->>'valor_publicado',
     'documento_sei',registro->>'documento_sei',
     'competencia_programacao',registro->>'competencia_programacao',
     'regra_comprovada',registro->'regra_comprovada'),auth.uid());
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$ev$;
DROP TRIGGER IF EXISTS ec_fpo_historico ON public.eletivas_fpo_programacoes;
CREATE TRIGGER ec_fpo_historico AFTER INSERT OR UPDATE OR DELETE
 ON public.eletivas_fpo_programacoes
 FOR EACH ROW EXECUTE FUNCTION public.ec_auditar_evidencia_fase3();
DROP TRIGGER IF EXISTS ec_pub_aih_historico ON public.eletivas_publicacoes_aih;
CREATE TRIGGER ec_pub_aih_historico AFTER INSERT
 ON public.eletivas_publicacoes_aih
 FOR EACH ROW EXECUTE FUNCTION public.ec_auditar_evidencia_fase3();
DROP TRIGGER IF EXISTS ec_ato_historico ON public.eletivas_atos_especiais;
CREATE TRIGGER ec_ato_historico AFTER INSERT OR UPDATE OR DELETE
 ON public.eletivas_atos_especiais
 FOR EACH ROW EXECUTE FUNCTION public.ec_auditar_evidencia_fase3();

-- A pré-conciliação roda no navegador. O banco valida o comprovante por AIH
-- antes de aceitar que a linha alegue uma publicação independente.
CREATE OR REPLACE FUNCTION public.ec_conferir_publicacao_declarada()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $pub$
BEGIN
 IF NEW.categoria='faec_mult'
   AND NEW.origem='parser_local'
   AND (NEW.detalhe->>'publicacao_independente')='true'
   AND NOT EXISTS (
     SELECT 1 FROM public.eletivas_publicacoes_aih a
     WHERE a.competencia_id=NEW.competencia_id
       AND a.aih=NEW.aih
       AND a.valor_publicado=NEW.valor_publicado
       AND a.documento_sei=NEW.detalhe->>'evidencia_publicacao'
   ) THEN
    RAISE EXCEPTION 'Publicação FAEC declarada não corresponde ao comprovante SEI cadastrado para esta AIH.'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$pub$;
DROP TRIGGER IF EXISTS ec_pub_aih_comprovante_guard ON public.eletivas_itens;
CREATE TRIGGER ec_pub_aih_comprovante_guard BEFORE INSERT
 ON public.eletivas_itens FOR EACH ROW
 EXECUTE FUNCTION public.ec_conferir_publicacao_declarada();

-- Igualdade entre valores derivados não equivale a comprovação de pagamento.
-- Nunca admitir valor "pendente" no resumo ou na função SQL de encerramento.
CREATE OR REPLACE FUNCTION public.ec_valor_item(
 p_categoria text,p_situacao text,p_decisao text,p_publicado numeric,p_esperado numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $valor$
 SELECT CASE
   WHEN p_categoria='faec_fxmac' OR p_situacao='pendente' THEN 0::numeric
   WHEN p_situacao IN ('ok','info') OR p_decisao='aceito' THEN p_publicado
   WHEN p_decisao='erro' OR p_publicado<=0 THEN 0::numeric
   WHEN p_esperado>0 THEN least(p_publicado,p_esperado)
   ELSE p_publicado
 END;
$valor$;

CREATE OR REPLACE FUNCTION public.ec_impedir_aceite_sem_evidencia()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF NEW.decisao IS DISTINCT FROM OLD.decisao AND NEW.decisao='aceito' THEN
   IF NEW.situacao='pendente'
     OR (NEW.categoria='faec_mult'
       AND (NEW.detalhe->>'publicacao_independente') IS DISTINCT FROM 'true')
     OR (NEW.categoria='mac_mult'
       AND (NEW.detalhe->>'base_independente_comprovada') IS DISTINCT FROM 'true')
     OR (NEW.detalhe->>'exige_programacao_fpo')='true' THEN
      RAISE EXCEPTION 'Evidência independente insuficiente: registrar análise ou ofício; não aceitar como pago.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS ec_aceite_evidencia_guard ON public.eletivas_itens;
CREATE TRIGGER ec_aceite_evidencia_guard BEFORE UPDATE
 ON public.eletivas_itens FOR EACH ROW EXECUTE FUNCTION public.ec_impedir_aceite_sem_evidencia();

-- A trava age no UPDATE de encerramento, sem reescrever a RPC ec_encerrar e
-- sem remover nenhuma validação fiscal/doc já aplicada nas Fases anteriores.
CREATE OR REPLACE FUNCTION public.ec_impedir_encerramento_sem_evidencia()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $closing$
BEGIN
 IF NEW.status='encerrada' AND OLD.status IS DISTINCT FROM NEW.status THEN
   IF EXISTS (
     SELECT 1 FROM public.eletivas_itens i WHERE i.competencia_id=NEW.id
       AND (
         (
           (i.situacao='pendente'
             OR (i.categoria='faec_mult' AND
               (i.detalhe->>'publicacao_independente') IS DISTINCT FROM 'true')
             OR (i.categoria='mac_mult' AND
               (i.detalhe->>'base_independente_comprovada') IS DISTINCT FROM 'true'))
           AND (COALESCE(i.decisao,'') NOT IN ('erro','oficio')
                OR length(trim(COALESCE(i.justificativa,'')))<10)
         )
         OR (
           (i.detalhe->>'exige_programacao_fpo')='true'
           AND COALESCE(i.decisao,'') <> 'erro'
           AND NOT EXISTS(
             SELECT 1 FROM public.eletivas_fpo_programacoes e
             WHERE e.competencia_id=NEW.id AND e.procedimento=i.procedimento
               AND e.vigencia_inicio <=
                 (date_trunc('month',to_date('01/'||NEW.competencia,'DD/MM/YYYY'))
                 + interval '1 month - 1 day')::date
               AND e.vigencia_fim >= to_date('01/'||NEW.competencia,'DD/MM/YYYY')
           )
         )
       )
   ) THEN
      RAISE EXCEPTION 'Fase 3: múltiplas sem prova devem ter decisão fundamentada (ofício/erro); faixa federal exige FPO documental ou erro reconhecido. Análise em aberto impede o fechamento.'
        USING ERRCODE='23514';
   END IF;
   IF EXISTS(
     SELECT 1 FROM public.eletivas_atos_especiais a
     WHERE a.competencia_id=NEW.id AND NOT a.regra_comprovada
   ) THEN
     RAISE EXCEPTION 'Fase 3: existem atos especiais sem regra comprovada. Registrar fundamentação antes de encerrar.'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$closing$;
DROP TRIGGER IF EXISTS ec_ato_final_guard ON public.eletivas_competencias;
CREATE TRIGGER ec_ato_final_guard BEFORE UPDATE OF status
 ON public.eletivas_competencias
 FOR EACH ROW EXECUTE FUNCTION public.ec_impedir_encerramento_sem_evidencia();
COMMIT;
