-- Emendas: fluxo documentado das notas, parcelas e anulação, seguindo Convênios.
-- Segurança: acesso RPC autenticado ACP/Admin, RLS leitura, gravações exclusivamente por RPC.
BEGIN;
CREATE TABLE public.emenda_fluxo_documentos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id),
 lancamento_id uuid NOT NULL REFERENCES public.emenda_lancamentos(id),
 contexto text NOT NULL,
 competencia_id uuid,
 dados jsonb NOT NULL DEFAULT '{}'::jsonb,
 enviado_em timestamptz,
 enviado_por uuid,
 liberacao_id uuid REFERENCES public.emenda_liberacoes(id),
 pagamento_id uuid REFERENCES public.emenda_blocos_pagamento(id),
 anulacao_id uuid REFERENCES public.emenda_anulacoes(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 reaberto_em timestamptz,
 CONSTRAINT emenda_fluxo_contexto_check CHECK(contexto='ne' OR contexto='anulacao' OR contexto ~ '^lib:[0-9a-f-]{36}$'),
 UNIQUE(lancamento_id,contexto)
);
CREATE INDEX emenda_fluxo_documentos_lancamento_idx ON public.emenda_fluxo_documentos(lancamento_id);
CREATE TABLE public.emenda_fluxo_assinaturas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 emenda_id uuid NOT NULL REFERENCES public.emendas(id),
 documento_id uuid NOT NULL REFERENCES public.emenda_fluxo_documentos(id) ON DELETE RESTRICT,
 papel text NOT NULL CHECK (papel IN ('sefaz','fiscal','gerente','coordenador','diretor','financeira','secretaria')),
 nome text NOT NULL,
 cargo text NOT NULL,
 signatario_config_id uuid REFERENCES public.assinaturas_config(id) ON DELETE SET NULL,
 confirmado_por uuid NOT NULL DEFAULT auth.uid(),
 confirmado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(documento_id,papel)
);
ALTER TABLE public.emenda_fluxo_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emenda_fluxo_assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY emenda_fluxo_documentos_leitura ON public.emenda_fluxo_documentos
 FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['admin'::public.app_role,'acp'::public.app_role]));
CREATE POLICY emenda_fluxo_assinaturas_leitura ON public.emenda_fluxo_assinaturas
 FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['admin'::public.app_role,'acp'::public.app_role]));
GRANT SELECT ON public.emenda_fluxo_documentos,public.emenda_fluxo_assinaturas TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.emenda_fluxo_documentos,public.emenda_fluxo_assinaturas FROM PUBLIC,anon,authenticated;
CREATE TRIGGER emenda_fluxo_documentos_audit AFTER INSERT OR UPDATE OR DELETE ON public.emenda_fluxo_documentos
 FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();
CREATE TRIGGER emenda_fluxo_assinaturas_audit AFTER INSERT OR UPDATE OR DELETE ON public.emenda_fluxo_assinaturas
 FOR EACH ROW EXECUTE FUNCTION public.emenda_registrar_historico();

CREATE FUNCTION public.emenda_fluxo_validar(p_lancamento uuid,p_contexto text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE l public.emenda_lancamentos%ROWTYPE; ator uuid:=auth.uid(); c uuid;
BEGIN
 IF ator IS NULL OR NOT public.has_any_role(ator,ARRAY['admin'::public.app_role,'acp'::public.app_role])
 THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Lançamento indisponível.'; END IF;
 PERFORM 1 FROM public.emendas WHERE id=l.emenda_id FOR UPDATE;
 IF p_contexto='ne' THEN
  IF l.status NOT IN ('formalizado','emitido') THEN RAISE EXCEPTION 'Solicitação deve estar formalizada.'; END IF;
 ELSIF p_contexto='anulacao' THEN
  IF l.status<>'emitido' THEN RAISE EXCEPTION 'NE não emitida.'; END IF;
 ELSIF p_contexto LIKE 'lib:%' THEN
  IF l.status<>'emitido' THEN RAISE EXCEPTION 'NE não emitida.'; END IF;
  BEGIN c:=substring(p_contexto,5)::uuid; EXCEPTION WHEN invalid_text_representation THEN
   RAISE EXCEPTION 'Competência inválida.'; END;
  IF NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses WHERE lancamento_id=p_lancamento AND competencia_id=c)
  THEN RAISE EXCEPTION 'Competência fora do lançamento.'; END IF;
 ELSE RAISE EXCEPTION 'Contexto desconhecido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'NE encerrada; edição proibida.'; END IF;
 RETURN l.emenda_id;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_validar(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.emenda_fluxo_salvar(p_lancamento uuid,p_contexto text,p_campo text,p_valor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE em uuid; r public.emenda_fluxo_documentos%ROWTYPE; c uuid; livre boolean:=false;
BEGIN
 em:=public.emenda_fluxo_validar(p_lancamento,p_contexto);
 IF p_contexto='ne' THEN livre:=p_campo IN ('numero_ne','valor_ne','numero_sei','link_sei');
 ELSIF p_contexto='anulacao' THEN livre:=p_campo IN ('solicitacao_numero','solicitacao_link','aviso_numero','aviso_link');
 ELSE livre:=p_campo IN ('comprovante_numero','comprovante_link','valor_executado',
  'solicitacao_numero','solicitacao_link','aviso_numero','aviso_link',
  'programacao_numero','programacao_link','pagamento_numero','pagamento_link','data_pagamento','data_liberacao'); END IF;
 IF NOT livre THEN RAISE EXCEPTION 'Campo não permitido.'; END IF;
 IF p_campo LIKE '%link' OR p_campo='link_sei' THEN
  IF nullif(btrim(coalesce(p_valor,'')),'') IS NOT NULL AND p_valor !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Link SEI precisa ser HTTPS.'; END IF;
 END IF;
 IF p_campo IN ('valor_ne','valor_executado') AND nullif(btrim(coalesce(p_valor,'')),'') IS NOT NULL THEN
  IF p_valor !~ '^[0-9]+(\.[0-9]{1,2})?$' OR p_valor::numeric<=0
  THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
 END IF;
 IF p_campo IN ('data_pagamento','data_liberacao') AND nullif(p_valor,'') IS NOT NULL AND
   (p_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p_valor::date>CURRENT_DATE)
 THEN RAISE EXCEPTION 'Data de pagamento inválida.'; END IF;
 c:=CASE WHEN p_contexto LIKE 'lib:%' THEN substring(p_contexto,5)::uuid ELSE NULL END;
 INSERT INTO public.emenda_fluxo_documentos(emenda_id,lancamento_id,contexto,competencia_id)
 VALUES(em,p_lancamento,p_contexto,c) ON CONFLICT(lancamento_id,contexto) DO NOTHING;
 SELECT * INTO r FROM public.emenda_fluxo_documentos
  WHERE lancamento_id=p_lancamento AND contexto=p_contexto FOR UPDATE;
 IF (p_contexto='ne' AND r.reaberto_em IS NULL AND EXISTS(SELECT 1 FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=p_lancamento AND s.numero_ne IS NOT NULL))
 OR (r.enviado_em IS NOT NULL AND p_campo NOT IN ('aviso_numero','aviso_link','programacao_numero',
                                                 'programacao_link','pagamento_numero','pagamento_link','data_pagamento'))
 OR (r.pagamento_id IS NOT NULL OR r.anulacao_id IS NOT NULL)
 OR (r.liberacao_id IS NOT NULL AND p_campo IN ('comprovante_numero','comprovante_link',
      'valor_executado','solicitacao_numero','solicitacao_link','aviso_numero','aviso_link'))
 THEN RAISE EXCEPTION 'Etapa consolidada. Correções exigem reabertura administrativa e conferência documental.'; END IF;
 UPDATE public.emenda_fluxo_documentos SET dados=jsonb_set(dados,ARRAY[p_campo],to_jsonb(coalesce(p_valor,'')),true),
  atualizado_em=now() WHERE id=r.id;
 -- Qualquer alteração documental antes do envio requer nova conferência de assinaturas,
 -- mas nunca apaga fatos externos registrados.
 IF p_campo IN ('numero_ne','valor_ne','numero_sei','link_sei','comprovante_numero','comprovante_link',
                'valor_executado','solicitacao_numero','solicitacao_link')
 AND r.enviado_em IS NULL THEN
  DELETE FROM public.emenda_fluxo_assinaturas WHERE documento_id=r.id;
 END IF;
 RETURN r.id;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_salvar(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_salvar(uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_assinar(p_documento uuid,p_papel text,p_signatario uuid DEFAULT NULL,p_manual text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; cfg public.assinaturas_config%ROWTYPE;
 nome text; cargo text; permitido boolean; r uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.enviado_em IS NOT NULL OR d.pagamento_id IS NOT NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'Assinaturas já consolidadas.'; END IF;
 IF d.contexto='ne' THEN permitido:=p_papel IN ('sefaz','financeira','secretaria');
 ELSE permitido:=p_papel IN ('fiscal','gerente','coordenador','diretor','financeira','secretaria'); END IF;
 IF NOT permitido THEN RAISE EXCEPTION 'Papel inválido para o documento.'; END IF;
 IF p_papel='sefaz' THEN
  nome:=btrim(coalesce(p_manual,'')); cargo:='Membro da SEFAZ';
  IF length(nome)<3 OR length(nome)>160 THEN RAISE EXCEPTION 'Informe o nome do membro da SEFAZ.'; END IF;
 ELSE
  SELECT * INTO cfg FROM public.assinaturas_config WHERE id=p_signatario AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signatário não cadastrado ou inativo.'; END IF;
  cargo:=cfg.cargo; nome:=cfg.nome_servidor;
  permitido:=CASE p_papel
    WHEN 'fiscal' THEN cargo='Fiscal'
    WHEN 'gerente' THEN cargo='Gerente'
    WHEN 'coordenador' THEN cargo IN ('Coordenador ACP','Coordenador')
    WHEN 'diretor' THEN cargo='Diretor de Serviços Complementares'
    WHEN 'financeira' THEN cargo='Diretoria Financeira'
    WHEN 'secretaria' THEN cargo='Secretária de Saúde'
    ELSE false END;
  IF NOT permitido THEN RAISE EXCEPTION 'Cargo não habilitado para este campo.'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas WHERE documento_id=d.id AND nome=nome AND papel<>p_papel)
 THEN RAISE EXCEPTION 'O mesmo signatário não pode ocupar dois campos.'; END IF;
 INSERT INTO public.emenda_fluxo_assinaturas(emenda_id,documento_id,papel,nome,cargo,signatario_config_id)
 VALUES(d.emenda_id,d.id,p_papel,nome,cargo,p_signatario)
 ON CONFLICT(documento_id,papel) DO UPDATE SET
 nome=excluded.nome,cargo=excluded.cargo,signatario_config_id=excluded.signatario_config_id,
 confirmado_por=auth.uid(),confirmado_em=now()
 RETURNING id INTO r;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_assinar(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_assinar(uuid,text,uuid,text) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_remover_assinatura(p_assinatura uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE;
BEGIN
 SELECT f.* INTO d FROM public.emenda_fluxo_documentos f JOIN public.emenda_fluxo_assinaturas a ON a.documento_id=f.id WHERE a.id=p_assinatura;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 IF d.enviado_em IS NOT NULL OR d.pagamento_id IS NOT NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'Assinaturas já consolidadas.'; END IF;
 DELETE FROM public.emenda_fluxo_assinaturas WHERE id=p_assinatura;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_remover_assinatura(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_remover_assinatura(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_assinaturas_ok(p_documento uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT CASE
 WHEN d.contexto='ne' THEN
   EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel='sefaz')
   AND EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel IN ('financeira','secretaria'))
 ELSE
   EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel='fiscal')
   AND EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel IN ('gerente','coordenador'))
   AND EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel='diretor')
   AND EXISTS(SELECT 1 FROM public.emenda_fluxo_assinaturas s WHERE s.documento_id=d.id AND s.papel IN ('financeira','secretaria'))
 END FROM public.emenda_fluxo_documentos d WHERE d.id=p_documento;
$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_assinaturas_ok(uuid) FROM PUBLIC,anon,authenticated;

-- Retificação cadastral de NE sem qualquer execução financeira, com auditoria.
CREATE FUNCTION public.emenda_fluxo_reabrir_ne(p_lancamento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE em uuid; d public.emenda_fluxo_documentos%ROWTYPE;
BEGIN
 em:=public.emenda_fluxo_validar(p_lancamento,'ne');
 SELECT * INTO d FROM public.emenda_fluxo_documentos
 WHERE lancamento_id=p_lancamento AND contexto='ne' FOR UPDATE;
 IF NOT FOUND OR d.reaberto_em IS NOT NULL THEN RAISE EXCEPTION 'Nota indisponível para retificação.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_liberacoes WHERE lancamento_id=p_lancamento)
    OR EXISTS(SELECT 1 FROM public.emenda_blocos_pagamento WHERE lancamento_id=p_lancamento)
    OR EXISTS(SELECT 1 FROM public.emenda_anulacoes WHERE lancamento_id=p_lancamento)
    OR EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=p_lancamento)
 THEN RAISE EXCEPTION 'NE com execução registrada; retificação automática bloqueada.'; END IF;
 DELETE FROM public.emenda_fluxo_assinaturas WHERE documento_id=d.id;
 UPDATE public.emenda_fluxo_documentos SET reaberto_em=now(),atualizado_em=now() WHERE id=d.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_reabrir_ne(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_reabrir_ne(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_ne(p_lancamento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE em uuid; d public.emenda_fluxo_documentos%ROWTYPE; val numeric; ne text; ano int; r uuid; existente uuid;
BEGIN
 em:=public.emenda_fluxo_validar(p_lancamento,'ne');
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE lancamento_id=p_lancamento AND contexto='ne' FOR UPDATE;
 IF NOT FOUND OR NOT public.emenda_fluxo_assinaturas_ok(d.id) THEN RAISE EXCEPTION 'Faltam assinaturas da NE.'; END IF;
 ne:=nullif(btrim(d.dados->>'numero_ne'),''); val:=nullif(d.dados->>'valor_ne','')::numeric;
 IF ne IS NULL OR val IS NULL OR val<=0 OR nullif(btrim(d.dados->>'numero_sei'),'') IS NULL
  OR coalesce(d.dados->>'link_sei','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número, valor, SEI e link da NE são obrigatórios.'; END IF;
 ano:=CASE WHEN ne ~ '/20[0-9]{2}$' THEN substring(ne from '(20[0-9]{2})$')::int ELSE extract(year FROM CURRENT_DATE)::int END;
 SELECT s.id INTO existente FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id
   WHERE l.id=p_lancamento AND s.numero_ne IS NOT NULL;
 IF existente IS NOT NULL AND d.reaberto_em IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.emenda_liberacoes WHERE lancamento_id=p_lancamento)
     OR EXISTS(SELECT 1 FROM public.emenda_blocos_pagamento WHERE lancamento_id=p_lancamento)
     OR EXISTS(SELECT 1 FROM public.emenda_anulacoes WHERE lancamento_id=p_lancamento)
   THEN RAISE EXCEPTION 'NE com execução: exige retificação formal fora deste fluxo.'; END IF;
   IF val>(SELECT s.valor_ne+coalesce(e.saldo_disponivel,0) FROM public.emenda_solicitacoes s
      JOIN public.emendas_resumo e ON e.id=s.emenda_id WHERE s.id=existente)
   THEN RAISE EXCEPTION 'Retificação ultrapassaria o saldo da emenda.'; END IF;
   UPDATE public.emenda_solicitacoes SET
     numero_ne=CASE WHEN ne ~ '/20[0-9]{2}$' THEN regexp_replace(ne,'/20[0-9]{2}$','') ELSE ne END,
     exercicio_ne=ano,valor_ne=val,numero_sei_ne=btrim(d.dados->>'numero_sei'),
     link_sei_ne=btrim(d.dados->>'link_sei'),updated_at=now() WHERE id=existente;
   UPDATE public.emenda_fluxo_documentos SET reaberto_em=NULL WHERE id=d.id;
   RETURN existente;
 END IF;
 IF existente IS NOT NULL THEN RETURN existente; END IF;
 r:=public.emenda_registrar_ne_documental(p_lancamento,
  CASE WHEN ne ~ '/20[0-9]{2}
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_enviar(p_documento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; lan public.emenda_lancamentos%ROWTYPE; val numeric; usado numeric; ne numeric;
 c integer; total int; liberacao uuid; comp uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto='ne' OR d.enviado_em IS NOT NULL THEN RAISE EXCEPTION 'Etapa já enviada ou inválida.'; END IF;
 IF NOT public.emenda_fluxo_assinaturas_ok(d.id) THEN RAISE EXCEPTION 'Assinaturas obrigatórias pendentes.'; END IF;
 IF nullif(btrim(d.dados->>'solicitacao_numero'),'') IS NULL OR
  coalesce(d.dados->>'solicitacao_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Solicitação de liberação/anulação SEI obrigatória.'; END IF;
 IF d.contexto='anulacao' THEN
  SELECT count(*) INTO total FROM public.emenda_lancamento_meses WHERE lancamento_id=d.lancamento_id;
  SELECT count(*) INTO c FROM public.emenda_fluxo_documentos WHERE lancamento_id=d.lancamento_id
    AND contexto LIKE 'lib:%' AND pagamento_id IS NOT NULL;
  IF c<>total THEN RAISE EXCEPTION 'Conclua todas as competências antes da anulação.'; END IF;
 ELSE
  -- Enviar à SEFAZ não equivale a liberar recurso financeiro.
  -- A liberação será registrada apenas após o Aviso de Movimento/Subempenho.
  val:=nullif(d.dados->>'valor_executado','')::numeric;
  SELECT valor_ne INTO ne FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
  SELECT coalesce(sum(valor),0) INTO usado FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
  IF val IS NULL OR val<=0 OR val>ne-usado OR nullif(btrim(d.dados->>'comprovante_numero'),'') IS NULL
     OR coalesce(d.dados->>'comprovante_link','') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Comprovante ou valor executado inválido / acima do saldo empenhado.'; END IF;
 END IF;
 UPDATE public.emenda_fluxo_documentos SET enviado_em=now(),enviado_por=auth.uid(),atualizado_em=now() WHERE id=d.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_enviar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_enviar(uuid) TO authenticated;

-- Aviso de Movimento é evidência da liberação; o simples envio não é.
CREATE FUNCTION public.emenda_fluxo_registrar_aviso(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; val numeric; liberacao uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento não localizado.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto NOT LIKE 'lib:%' OR d.enviado_em IS NULL THEN
  RAISE EXCEPTION 'Solicitação ainda não enviada à SEFAZ.UAF.ADE.'; END IF;
 IF d.liberacao_id IS NOT NULL THEN RETURN d.liberacao_id; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR
    coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Aviso de Movimento/Subempenho obrigatório.'; END IF;
 val:=nullif(d.dados->>'valor_executado','')::numeric;
 IF val IS NULL OR val<=0 THEN RAISE EXCEPTION 'Valor executado inválido.'; END IF;
 PERFORM public.emenda_registrar_comprovante(d.lancamento_id,d.competencia_id,'atesto',
   d.dados->>'comprovante_numero',d.dados->>'comprovante_link',NULL);
 liberacao:=public.emenda_registrar_liberacao(d.lancamento_id,d.competencia_id,'original',
   val,coalesce(nullif(d.dados->>'data_liberacao','')::date,CURRENT_DATE),
   d.dados->>'aviso_numero',d.dados->>'aviso_link');
 UPDATE public.emenda_fluxo_documentos SET liberacao_id=liberacao,atualizado_em=now() WHERE id=d.id;
 RETURN liberacao;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_registrar_aviso(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_registrar_aviso(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_pagamento(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; valor numeric; dt date;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto NOT LIKE 'lib:%' OR d.liberacao_id IS NULL OR d.enviado_em IS NULL
  OR d.pagamento_id IS NOT NULL THEN RAISE EXCEPTION 'Liberação não disponível para registrar pagamento.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'programacao_numero'),'') IS NULL OR coalesce(d.dados->>'programacao_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'pagamento_numero'),'') IS NULL OR coalesce(d.dados->>'pagamento_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(d.dados->>'data_pagamento','') IS NULL
 THEN RAISE EXCEPTION 'Preencha todos os comprovantes e a data do pagamento.'; END IF;
 dt:=(d.dados->>'data_pagamento')::date;valor:=(d.dados->>'valor_executado')::numeric;
 r:=public.emenda_registrar_bloco_pagamento(d.liberacao_id,
   'Pagamento da competência vinculada',valor,dt,
   d.dados->>'pagamento_numero',d.dados->>'pagamento_link');
 UPDATE public.emenda_fluxo_documentos SET pagamento_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_anulacao(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; ne numeric; lib numeric; anu numeric; residual numeric;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto<>'anulacao' OR d.enviado_em IS NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'A anulação não está disponível.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link do Aviso de Movimento de anulação obrigatórios.'; END IF;
 SELECT s.valor_ne INTO ne FROM public.emenda_solicitacoes s JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO lib FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO anu FROM public.emenda_anulacoes WHERE lancamento_id=d.lancamento_id;
 residual:=round(ne-lib-anu,2);
 IF residual<=0 THEN RAISE EXCEPTION 'Nenhum saldo residual a anular.'; END IF;
 r:=public.emenda_anular_residual(d.lancamento_id,residual,
   'Anulação do saldo residual não liberado ao final da execução das competências.',
   d.dados->>'aviso_numero',d.dados->>'aviso_link');
 UPDATE public.emenda_fluxo_documentos SET anulacao_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) TO authenticated;
-- Notas emitidas antes desta fase continuam auditadas e são exibidas no formulário.
-- A assinatura da NE será conferida no PACTO antes de iniciar o novo fluxo da parcela.
INSERT INTO public.emenda_fluxo_documentos(emenda_id,lancamento_id,contexto,dados)
SELECT l.emenda_id,l.id,'ne',jsonb_build_object(
 'numero_ne',concat(s.numero_ne,'/',s.exercicio_ne),
 'valor_ne',s.valor_ne::text,
 'numero_sei',s.numero_sei_ne,
 'link_sei',s.link_sei_ne)
FROM public.emenda_lancamentos l JOIN public.emenda_solicitacoes s ON s.id=l.solicitacao_id
WHERE s.numero_ne IS NOT NULL AND l.excluido_em IS NULL
ON CONFLICT(lancamento_id,contexto) DO NOTHING;

COMMIT;
 THEN regexp_replace(ne,'/20[0-9]{2}
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_enviar(p_documento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; lan public.emenda_lancamentos%ROWTYPE; val numeric; usado numeric; ne numeric;
 c integer; total int; liberacao uuid; comp uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto='ne' OR d.enviado_em IS NOT NULL THEN RAISE EXCEPTION 'Etapa já enviada ou inválida.'; END IF;
 IF NOT public.emenda_fluxo_assinaturas_ok(d.id) THEN RAISE EXCEPTION 'Assinaturas obrigatórias pendentes.'; END IF;
 IF nullif(btrim(d.dados->>'solicitacao_numero'),'') IS NULL OR
  coalesce(d.dados->>'solicitacao_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Solicitação de liberação/anulação SEI obrigatória.'; END IF;
 IF d.contexto='anulacao' THEN
  SELECT count(*) INTO total FROM public.emenda_lancamento_meses WHERE lancamento_id=d.lancamento_id;
  SELECT count(*) INTO c FROM public.emenda_fluxo_documentos WHERE lancamento_id=d.lancamento_id
    AND contexto LIKE 'lib:%' AND pagamento_id IS NOT NULL;
  IF c<>total THEN RAISE EXCEPTION 'Conclua todas as competências antes da anulação.'; END IF;
 ELSE
  val:=nullif(d.dados->>'valor_executado','')::numeric;
  SELECT valor_ne INTO ne FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
  SELECT coalesce(sum(valor),0) INTO usado FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
  IF val IS NULL OR val<=0 OR val>ne-usado OR nullif(btrim(d.dados->>'comprovante_numero'),'') IS NULL
     OR coalesce(d.dados->>'comprovante_link','') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Comprovante ou valor executado inválido / acima do saldo empenhado.'; END IF;
  comp:=d.competencia_id;
  PERFORM public.emenda_registrar_comprovante(d.lancamento_id,comp,'atesto',
    d.dados->>'comprovante_numero',d.dados->>'comprovante_link',NULL);
  liberacao:=public.emenda_registrar_liberacao(d.lancamento_id,comp,'original',val,CURRENT_DATE,
    d.dados->>'solicitacao_numero',d.dados->>'solicitacao_link');
  UPDATE public.emenda_fluxo_documentos SET liberacao_id=liberacao WHERE id=d.id;
 END IF;
 UPDATE public.emenda_fluxo_documentos SET enviado_em=now(),enviado_por=auth.uid(),atualizado_em=now() WHERE id=d.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_enviar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_enviar(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_pagamento(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; valor numeric; dt date;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto NOT LIKE 'lib:%' OR d.liberacao_id IS NULL OR d.enviado_em IS NULL
  OR d.pagamento_id IS NOT NULL THEN RAISE EXCEPTION 'Liberação não disponível para registrar pagamento.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'programacao_numero'),'') IS NULL OR coalesce(d.dados->>'programacao_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'pagamento_numero'),'') IS NULL OR coalesce(d.dados->>'pagamento_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(d.dados->>'data_pagamento','') IS NULL
 THEN RAISE EXCEPTION 'Preencha todos os comprovantes e a data do pagamento.'; END IF;
 dt:=(d.dados->>'data_pagamento')::date;valor:=(d.dados->>'valor_executado')::numeric;
 r:=public.emenda_registrar_bloco_pagamento(d.liberacao_id,
   'Pagamento da competência vinculada',valor,dt,
   d.dados->>'pagamento_numero',d.dados->>'pagamento_link');
 UPDATE public.emenda_fluxo_documentos SET pagamento_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_anulacao(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; ne numeric; lib numeric; anu numeric; residual numeric;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto<>'anulacao' OR d.enviado_em IS NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'A anulação não está disponível.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link do Aviso de Movimento de anulação obrigatórios.'; END IF;
 SELECT s.valor_ne INTO ne FROM public.emenda_solicitacoes s JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO lib FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO anu FROM public.emenda_anulacoes WHERE lancamento_id=d.lancamento_id;
 residual:=round(ne-lib-anu,2);
 IF residual<=0 THEN RAISE EXCEPTION 'Nenhum saldo residual a anular.'; END IF;
 r:=public.emenda_anular_residual(d.lancamento_id,residual,
   'Anulação do saldo residual não liberado ao final da execução das competências.',
   d.dados->>'aviso_numero',d.dados->>'aviso_link');
 UPDATE public.emenda_fluxo_documentos SET anulacao_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) TO authenticated;
COMMIT;
,'') ELSE ne END,
  ano,val,btrim(d.dados->>'numero_sei'),btrim(d.dados->>'link_sei'));
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_ne(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_enviar(p_documento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; lan public.emenda_lancamentos%ROWTYPE; val numeric; usado numeric; ne numeric;
 c integer; total int; liberacao uuid; comp uuid;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto='ne' OR d.enviado_em IS NOT NULL THEN RAISE EXCEPTION 'Etapa já enviada ou inválida.'; END IF;
 IF NOT public.emenda_fluxo_assinaturas_ok(d.id) THEN RAISE EXCEPTION 'Assinaturas obrigatórias pendentes.'; END IF;
 IF nullif(btrim(d.dados->>'solicitacao_numero'),'') IS NULL OR
  coalesce(d.dados->>'solicitacao_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Solicitação de liberação/anulação SEI obrigatória.'; END IF;
 IF d.contexto='anulacao' THEN
  SELECT count(*) INTO total FROM public.emenda_lancamento_meses WHERE lancamento_id=d.lancamento_id;
  SELECT count(*) INTO c FROM public.emenda_fluxo_documentos WHERE lancamento_id=d.lancamento_id
    AND contexto LIKE 'lib:%' AND pagamento_id IS NOT NULL;
  IF c<>total THEN RAISE EXCEPTION 'Conclua todas as competências antes da anulação.'; END IF;
 ELSE
  val:=nullif(d.dados->>'valor_executado','')::numeric;
  SELECT valor_ne INTO ne FROM public.emenda_solicitacoes s
   JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
  SELECT coalesce(sum(valor),0) INTO usado FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
  IF val IS NULL OR val<=0 OR val>ne-usado OR nullif(btrim(d.dados->>'comprovante_numero'),'') IS NULL
     OR coalesce(d.dados->>'comprovante_link','') !~* '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Comprovante ou valor executado inválido / acima do saldo empenhado.'; END IF;
  comp:=d.competencia_id;
  PERFORM public.emenda_registrar_comprovante(d.lancamento_id,comp,'atesto',
    d.dados->>'comprovante_numero',d.dados->>'comprovante_link',NULL);
  liberacao:=public.emenda_registrar_liberacao(d.lancamento_id,comp,'original',val,CURRENT_DATE,
    d.dados->>'solicitacao_numero',d.dados->>'solicitacao_link');
  UPDATE public.emenda_fluxo_documentos SET liberacao_id=liberacao WHERE id=d.id;
 END IF;
 UPDATE public.emenda_fluxo_documentos SET enviado_em=now(),enviado_por=auth.uid(),atualizado_em=now() WHERE id=d.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_enviar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_enviar(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_pagamento(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; valor numeric; dt date;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto NOT LIKE 'lib:%' OR d.liberacao_id IS NULL OR d.enviado_em IS NULL
  OR d.pagamento_id IS NOT NULL THEN RAISE EXCEPTION 'Liberação não disponível para registrar pagamento.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'programacao_numero'),'') IS NULL OR coalesce(d.dados->>'programacao_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(btrim(d.dados->>'pagamento_numero'),'') IS NULL OR coalesce(d.dados->>'pagamento_link','') !~* '^https://[^[:space:]]+$'
 OR nullif(d.dados->>'data_pagamento','') IS NULL
 THEN RAISE EXCEPTION 'Preencha todos os comprovantes e a data do pagamento.'; END IF;
 dt:=(d.dados->>'data_pagamento')::date;valor:=(d.dados->>'valor_executado')::numeric;
 r:=public.emenda_registrar_bloco_pagamento(d.liberacao_id,
   'Pagamento da competência vinculada',valor,dt,
   d.dados->>'pagamento_numero',d.dados->>'pagamento_link');
 UPDATE public.emenda_fluxo_documentos SET pagamento_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_pagamento(uuid) TO authenticated;

CREATE FUNCTION public.emenda_fluxo_finalizar_anulacao(p_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE d public.emenda_fluxo_documentos%ROWTYPE; r uuid; ne numeric; lib numeric; anu numeric; residual numeric;
BEGIN
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 PERFORM public.emenda_fluxo_validar(d.lancamento_id,d.contexto);
 SELECT * INTO d FROM public.emenda_fluxo_documentos WHERE id=p_documento FOR UPDATE;
 IF d.contexto<>'anulacao' OR d.enviado_em IS NULL OR d.anulacao_id IS NOT NULL
 THEN RAISE EXCEPTION 'A anulação não está disponível.'; END IF;
 IF nullif(btrim(d.dados->>'aviso_numero'),'') IS NULL OR coalesce(d.dados->>'aviso_link','') !~* '^https://[^[:space:]]+$'
 THEN RAISE EXCEPTION 'Número e link do Aviso de Movimento de anulação obrigatórios.'; END IF;
 SELECT s.valor_ne INTO ne FROM public.emenda_solicitacoes s JOIN public.emenda_lancamentos l ON l.solicitacao_id=s.id WHERE l.id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO lib FROM public.emenda_liberacoes WHERE lancamento_id=d.lancamento_id;
 SELECT coalesce(sum(valor),0) INTO anu FROM public.emenda_anulacoes WHERE lancamento_id=d.lancamento_id;
 residual:=round(ne-lib-anu,2);
 IF residual<=0 THEN RAISE EXCEPTION 'Nenhum saldo residual a anular.'; END IF;
 r:=public.emenda_anular_residual(d.lancamento_id,residual,
   'Anulação do saldo residual não liberado ao final da execução das competências.',
   d.dados->>'aviso_numero',d.dados->>'aviso_link');
 UPDATE public.emenda_fluxo_documentos SET anulacao_id=r,atualizado_em=now() WHERE id=d.id;
 RETURN r;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_finalizar_anulacao(uuid) TO authenticated;
-- Reabertura documental da solicitação sem NE. A reserva antiga é cancelada
-- antes de gerar uma nova chave idempotente. Os eventos anteriores ficam no audit trail.
CREATE FUNCTION public.emenda_fluxo_reabrir_solicitacao(p_lancamento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE l public.emenda_lancamentos%ROWTYPE; em uuid;
BEGIN
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento inexistente.'; END IF;
 em:=public.emenda_fluxo_validar(p_lancamento,'ne');
 SELECT * INTO l FROM public.emenda_lancamentos WHERE id=p_lancamento FOR UPDATE;
 IF l.status<>'formalizado' OR l.solicitacao_id IS NULL
 THEN RAISE EXCEPTION 'A solicitação deve estar formalizada, mas sem NE emitida.'; END IF;
 IF EXISTS(SELECT 1 FROM public.emenda_solicitacoes WHERE id=l.solicitacao_id AND numero_ne IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.emenda_liberacoes WHERE lancamento_id=l.id)
 OR EXISTS(SELECT 1 FROM public.emenda_conciliacoes_ne WHERE lancamento_id=l.id)
 THEN RAISE EXCEPTION 'Documentos financeiros já emitidos: alteração exige procedimento formal.'; END IF;
 PERFORM public.emenda_cancelar_solicitacao(l.solicitacao_id,
   'Reabertura controlada da solicitação para retificação documental.');
 DELETE FROM public.emenda_fluxo_assinaturas WHERE documento_id IN
   (SELECT id FROM public.emenda_fluxo_documentos WHERE lancamento_id=l.id AND contexto='ne');
 DELETE FROM public.emenda_fluxo_documentos WHERE lancamento_id=l.id AND contexto='ne';
 DELETE FROM public.emenda_envios_sefaz WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_assinaturas_conferidas WHERE lancamento_id=l.id;
 DELETE FROM public.emenda_etapas_documentais WHERE lancamento_id=l.id AND etapa='solicitacao';
 UPDATE public.emenda_lancamentos SET status='rascunho',solicitacao_id=NULL,
    chave_idempotencia=gen_random_uuid(),updated_at=now() WHERE id=l.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.emenda_fluxo_reabrir_solicitacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emenda_fluxo_reabrir_solicitacao(uuid) TO authenticated;

COMMIT;
