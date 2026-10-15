-- Complemento: seleção de parcelas com EC legado e CNES obtido do cadastro institucional.
-- Preserva todos os lançamentos, os encontros de 07/2026 e suas evidências.
BEGIN;
DO $pre$
BEGIN
 IF to_regprocedure('public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.ec_vincular_lancamento(uuid,uuid,uuid,text)') IS NULL
 OR to_regclass('public.eletivas_competencias') IS NULL THEN
  RAISE EXCEPTION 'Execute primeiro as migrations da Fase 6 e a complementar de vínculo.'
  USING ERRCODE='23514';
 END IF;
END;$pre$;

-- O CNES não deve ser solicitado ao fiscal durante a criação.
-- O cadastro mantém um vínculo explícito entre prestador cadastrado e CNES.
CREATE TABLE IF NOT EXISTS public.ec_cnes_instituicoes(
 prestador_id uuid PRIMARY KEY REFERENCES public.prestadores(id) ON DELETE RESTRICT,
 cnes text NOT NULL CHECK(cnes ~ '^[0-9]{7}$'),
 informado_em timestamptz NOT NULL DEFAULT now(),
 informacao text NOT NULL DEFAULT 'Cadastro institucional'
);
ALTER TABLE public.ec_cnes_instituicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_cnes_instituicoes_read ON public.ec_cnes_instituicoes;
CREATE POLICY ec_cnes_instituicoes_read ON public.ec_cnes_instituicoes
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL
 AND public.has_any_role(auth.uid(),ARRAY['admin','acp','aco']::public.app_role[]));
REVOKE ALL ON public.ec_cnes_instituicoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ec_cnes_instituicoes TO authenticated;

-- Para o HMSJ, CNES já verificado nas conciliações: 2436469.
-- Não altera cadastros de outras instituições nem faz suposição de CNES.
INSERT INTO public.ec_cnes_instituicoes(prestador_id,cnes,informacao)
SELECT p.id,'2436469','HMSJ — CNES consolidado nas fontes do Encontro de Contas'
FROM public.prestadores p
WHERE p.nome_instituicao ~* '(hospital municipal s[aã]o jos[eé]|^hmsj$)'
ON CONFLICT (prestador_id) DO NOTHING;

-- A relação abaixo intencionalmente inclui parcelas que já possuam Encontro.
-- Isso permite REUTILIZAR 07/2026, em vez de criar uma auditoria duplicada.
-- Valor atestado positivo NÃO desqualifica a parcela.
CREATE OR REPLACE FUNCTION public.ec_listar_parcelas_encontro()
RETURNS TABLE(
 lancamento_id uuid,prestador_id uuid,nome_instituicao text,
 convenio_id uuid,objeto text,competencia text,parcela text,descricao text,
 valor_atestado numeric,cnes_institucional text,
 encontro_id uuid,encontro_lancamento_id uuid,encontro_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $lista$
 SELECT l.id,l.prestador_id,p.nome_instituicao::text,l.convenio_id,cv.objeto::text,
  l.competencia::text,l.parcela::text,l.descricao::text,l.valor_atestado,
  COALESCE(reg.cnes,e.cnes)::text,e.id,e.lancamento_id,e.status::text
 FROM public.lancamentos_pagamento l
 JOIN public.prestadores p ON p.id=l.prestador_id
 JOIN public.convenios cv ON cv.id=l.convenio_id
   AND cv.prestador_id=l.prestador_id
 LEFT JOIN public.eletivas_competencias e ON
   e.prestador_id=l.prestador_id AND e.competencia=l.competencia
 LEFT JOIN public.ec_cnes_instituicoes reg ON reg.prestador_id=l.prestador_id
 WHERE auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(),
   ARRAY['admin','acp','aco']::public.app_role[])
   AND cv.modelo_fluxo='fluxo_1'
   AND l.competencia ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
   AND NOT l.concluido
   AND l.data_pagamento IS NULL
   AND l.link_comprovante_pagamento_sei IS NULL
   AND (e.id IS NULL OR e.lancamento_id=l.id OR
     (e.lancamento_id IS NULL AND e.status<>'encerrada'))
   AND COALESCE(reg.cnes,e.cnes) IS NOT NULL
 ORDER BY p.nome_instituicao,cv.objeto,l.competencia,l.parcela;
$lista$;
REVOKE ALL ON FUNCTION public.ec_listar_parcelas_encontro() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_listar_parcelas_encontro() TO authenticated;

-- Mesmo no caso de competência nova, o CNES é obtido do prestador.
-- O argumento legado p_cnes permanece na assinatura para compatibilidade,
-- mas é IGNORADO: não pode injetar um CNES arbitrário no cadastro.
CREATE OR REPLACE FUNCTION public.ec_criar_competencia_vinculada(
 p_prest uuid,p_convenio uuid,p_lanc uuid,p_cnes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $criar$
DECLARE comp text;novo uuid;cnes_oficial text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
 ARRAY['admin','acp']::public.app_role[]) THEN
  RAISE EXCEPTION 'Somente ACP/Admin pode criar o Encontro de Contas.'
   USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.lancamentos_pagamento WHERE id=p_lanc FOR UPDATE;
 comp:=public.ec_validar_lancamento_elegivel(p_lanc,p_prest,p_convenio);
 SELECT c.cnes INTO cnes_oficial FROM public.ec_cnes_instituicoes c
  WHERE c.prestador_id=p_prest;
 IF cnes_oficial IS NULL THEN
   RAISE EXCEPTION 'Instituição sem CNES cadastrado; solicite cadastro institucional.'
    USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eletivas_competencias e
   WHERE e.lancamento_id=p_lanc OR
      (e.prestador_id=p_prest AND e.competencia=comp)) THEN
    RAISE EXCEPTION 'Já existe encontro para esta competência. Abra o encontro existente.'
     USING ERRCODE='23505';
 END IF;
 PERFORM pg_catalog.set_config('app.ec_criacao_vinculada',p_lanc::text,true);
 INSERT INTO public.eletivas_competencias(
    competencia,prestador_id,cnes,lancamento_id,criado_por)
 VALUES(comp,p_prest,cnes_oficial,p_lanc,auth.uid())
 RETURNING id INTO novo;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(novo,'encontro_criado_via_lancamento',jsonb_build_object(
 'lancamento_id',p_lanc,'convenio_id',p_convenio,
 'prestador_id',p_prest,'competencia',comp,'cnes',cnes_oficial),auth.uid());
 RETURN novo;
END;$criar$;
REVOKE ALL ON FUNCTION public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_criar_competencia_vinculada(uuid,uuid,uuid,text)
 TO authenticated;

-- Observação é metadado informativo, não altera fonte, valor, decisão ou
-- identidade da competência já auditada. Toda edição fica auditada.
CREATE OR REPLACE FUNCTION public.ec_atualizar_observacao_competencia(
 p_comp uuid,p_observacao text,p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $obs$
DECLARE c public.eletivas_competencias%ROWTYPE;texto text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),
 ARRAY['admin','acp']::public.app_role[]) THEN
   RAISE EXCEPTION 'Edição limitada a ACP/Admin.' USING ERRCODE='42501';
 END IF;
 IF length(btrim(COALESCE(p_motivo,'')))<15 THEN
   RAISE EXCEPTION 'Informe motivo de edição (15 caracteres).'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM public.eletivas_competencias
   WHERE id=p_comp FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Encontro inexistente.' USING ERRCODE='23514'; END IF;
 IF c.status='encerrada' THEN
   RAISE EXCEPTION 'Encontro encerrado: reabertura formal antes de edição.'
     USING ERRCODE='23514';
 END IF;
 texto:=NULLIF(left(btrim(COALESCE(p_observacao,'')),1000),'');
 IF texto IS NOT DISTINCT FROM c.observacao THEN RETURN; END IF;
 UPDATE public.eletivas_competencias SET observacao=texto WHERE id=c.id;
 INSERT INTO public.eletivas_eventos(competencia_id,tipo,dados,autor)
 VALUES(c.id,'observacao_encontro_editada',jsonb_build_object(
  'anterior',c.observacao,'atual',texto,'motivo',btrim(p_motivo)),auth.uid());
END;$obs$;
REVOKE ALL ON FUNCTION public.ec_atualizar_observacao_competencia(uuid,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_atualizar_observacao_competencia(uuid,text,text)
 TO authenticated;

COMMIT;
