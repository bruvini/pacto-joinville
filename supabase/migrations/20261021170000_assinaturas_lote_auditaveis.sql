-- Registro em lote de assinaturas EXISTENTES no SEI; não é assinatura digital.
-- Aplicar no SQL Editor do Lovable ANTES de utilizar a nova aba.
CREATE TABLE IF NOT EXISTS public.assinaturas_lote_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  tipo_documento text NOT NULL,
  registro_id uuid NOT NULL,
  bloco text NOT NULL,
  slot text NOT NULL,
  assinatura_id uuid NOT NULL,
  signatario_nome text NOT NULL,
  cargo text NOT NULL,
  link_sei text NOT NULL,
  confirmado_por uuid NOT NULL REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assinaturas_lote_evidencias_registro_idx
  ON public.assinaturas_lote_evidencias (tipo_documento, registro_id, bloco, slot);
ALTER TABLE public.assinaturas_lote_evidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assinaturas_lote_evidencias FROM anon, authenticated;
GRANT SELECT ON public.assinaturas_lote_evidencias TO authenticated;
DROP POLICY IF EXISTS "assinaturas_lote_evidencias_leitura" ON public.assinaturas_lote_evidencias;
CREATE POLICY "assinaturas_lote_evidencias_leitura" ON public.assinaturas_lote_evidencias
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles r
      WHERE r.user_id = (SELECT auth.uid()) AND r.role::text IN ('admin','acp','aco'))
  );

CREATE OR REPLACE FUNCTION public.registrar_assinatura_lote(
  p_tipo text, p_registro uuid, p_bloco text, p_slot text,
  p_nome text, p_cargo text, p_link_sei text, p_confirmado boolean,
  p_assinado_em timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  u uuid := auth.uid();
  adm boolean := false;
  acp boolean := false;
  aco boolean := false;
  doc_url text;
  competencia_status text;
  entidade text;
  papel text := '';
  fluxo_modelo text := '';
  cargos text[];
  manual boolean := false;
  limite int := 1;
  assinaturas_ativas int := 0;
  novo_id uuid;
  registro jsonb;
  prefixo text;
  normalizado text := btrim(coalesce(p_link_sei,''));
  nome text := btrim(coalesce(p_nome,''));
  cargo text := btrim(coalesce(p_cargo,''));
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Autenticação obrigatória.'; END IF;
  SELECT
    coalesce(bool_or(role::text='admin'),false),
    coalesce(bool_or(role::text='acp'),false),
    coalesce(bool_or(role::text='aco'),false)
    INTO adm,acp,aco
  FROM public.user_roles WHERE user_id=u;
  IF NOT (adm OR acp OR aco) THEN RAISE EXCEPTION 'Perfil sem autorização.'; END IF;
  IF p_confirmado IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme a assinatura no documento SEI.'; END IF;
  IF length(nome) < 3 OR length(nome)>160 OR length(cargo)<2 OR length(cargo)>120
    THEN RAISE EXCEPTION 'Nome/cargo inválido.'; END IF;
  IF normalizado !~* '^https://[^ /]+\.[^ /]+/[^ ]+' OR length(normalizado)>2000
    OR normalizado ~* '[@[:cntrl:]]'
    THEN RAISE EXCEPTION 'Link SEI HTTPS inválido.'; END IF;
  IF p_assinado_em IS NULL OR p_assinado_em>now() OR p_assinado_em<'2020-01-01'::timestamptz
    THEN RAISE EXCEPTION 'Informe data/hora válida da assinatura conforme SEI.'; END IF;
  IF p_tipo NOT IN ('convenios','piso','pvh_solicitacao','pvh_documento','pvh_subempenho')
    THEN RAISE EXCEPTION 'Tipo de documento não suportado.'; END IF;
  -- Mesmo documento + mesmo slot é serializado para evitar duplicidades.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(concat_ws(':', p_tipo, p_registro, p_bloco), 0)
  );

  IF p_tipo = 'convenios' THEN
    IF p_bloco NOT IN ('etapa1','libera_orc','etapa4','etapa5','f2_minuta',
      'f2_memorando','f2_liquidacao','f2_aviso','rel_tecnico','rel_analise')
      THEN RAISE EXCEPTION 'Bloco inválido.'; END IF;
    IF NOT (adm OR (p_bloco='libera_orc' AND aco) OR (p_bloco<>'libera_orc' AND acp))
      THEN RAISE EXCEPTION 'Perfil sem permissão para este bloco.'; END IF;
    SELECT to_jsonb(l) INTO registro FROM public.lancamentos_pagamento l WHERE l.id=p_registro;
    IF registro IS NULL OR coalesce((registro->>'concluido')::boolean,false)
      THEN RAISE EXCEPTION 'Lançamento indisponível ou concluído.'; END IF;
    IF EXISTS (SELECT 1 FROM public.lancamentos_pagamento x WHERE x.parent_id=p_registro)
      THEN RAISE EXCEPTION 'Lançamento-mãe com parcelas; use o registro correspondente.'; END IF;
    SELECT cv.modelo_fluxo INTO fluxo_modelo FROM public.convenios cv
    WHERE cv.id=(registro->>'convenio_id')::uuid;
    IF (fluxo_modelo='fluxo_2' AND p_bloco IN ('etapa4','rel_tecnico','rel_analise')) OR
       (coalesce(fluxo_modelo,'')<>'fluxo_2' AND p_bloco LIKE 'f2_%')
      THEN RAISE EXCEPTION 'Bloco incompatível com o fluxo do convênio.'; END IF;
    IF p_bloco='etapa1' AND
       ((fluxo_modelo='fluxo_2' AND p_slot NOT IN ('coord_orc','fiscal','comissao','financeira')) OR
        (coalesce(fluxo_modelo,'')<>'fluxo_2' AND p_slot NOT IN ('coord_orc','fiscal','gerente','diretor','financeira')))
      THEN RAISE EXCEPTION 'Slot incompatível com o fluxo do convênio.'; END IF;
    doc_url := CASE p_bloco
      WHEN 'etapa1' THEN registro->>'link_solicitacao_sei'
      WHEN 'libera_orc' THEN registro->>'link_empenho_sei'
      WHEN 'etapa4' THEN registro->>'link_solicitacao_liberacao_sei'
      WHEN 'etapa5' THEN registro->>'link_solicitacao_anulacao'
      WHEN 'f2_minuta' THEN registro->>'link_minuta_sei'
      WHEN 'f2_memorando' THEN registro->>'link_memorando_sei'
      WHEN 'f2_liquidacao' THEN registro->>'link_solicitacao_liquidacao_sei'
      WHEN 'f2_aviso' THEN registro->>'link_aviso_liquidacao_sei'
      WHEN 'rel_tecnico' THEN registro->>'link_relatorio_tecnico_sei'
      WHEN 'rel_analise' THEN registro->>'link_relatorio_analise_sei' END;
    cargos := CASE p_slot
      WHEN 'coord_orc' THEN ARRAY['Coordenador de Orçamentos']
      WHEN 'fiscal' THEN ARRAY['Fiscal']
      WHEN 'gerente' THEN ARRAY['Gerente','Coordenador ACP','Coordenador']
      WHEN 'diretor' THEN ARRAY['Diretor de Serviços Complementares']
      WHEN 'financeira' THEN ARRAY['Diretoria Financeira','Secretária de Saúde']
      WHEN 'sefaz' THEN ARRAY['SEFAZ']
      WHEN 'comissao' THEN ARRAY['Membro da Comissão de Gestão e Controle de Despesa']
      WHEN 'extra' THEN ARRAY['Fiscal','Gerente','Coordenador ACP'] ELSE ARRAY[]::text[] END;
    IF (p_bloco='etapa1' AND p_slot NOT IN ('coord_orc','fiscal','gerente','diretor','financeira','comissao'))
      OR (p_bloco='libera_orc' AND p_slot NOT IN ('sefaz','financeira'))
      OR (p_bloco IN ('etapa4','etapa5') AND p_slot NOT IN ('fiscal','gerente','diretor','financeira'))
      OR (p_bloco='f2_minuta' AND p_slot NOT IN ('gerente','diretor'))
      OR (p_bloco IN ('f2_memorando','f2_liquidacao','f2_aviso') AND p_slot NOT IN ('fiscal','gerente','comissao'))
      OR (p_bloco='rel_tecnico' AND p_slot NOT IN ('fiscal','extra'))
      OR (p_bloco='rel_analise' AND p_slot <> 'fiscal')
      THEN RAISE EXCEPTION 'Slot incompatível com o bloco.'; END IF;
    IF p_bloco='rel_tecnico' AND p_slot='fiscal' THEN limite:=2; END IF;
    -- A Etapa 4 possui precedência própria; não antecipar assinaturas posteriores.
    IF p_bloco='etapa1' AND p_slot <> 'coord_orc' AND NOT EXISTS (
      SELECT 1 FROM public.assinaturas_etapa
      WHERE lancamento_id=p_registro AND bloco=p_bloco AND slot='coord_orc'
    ) THEN RAISE EXCEPTION 'Registre primeiro a assinatura do Coordenador de Orçamentos.'; END IF;
    IF p_bloco='etapa1' AND p_slot NOT IN ('coord_orc','fiscal') AND NOT EXISTS (
      SELECT 1 FROM public.assinaturas_etapa
      WHERE lancamento_id=p_registro AND bloco=p_bloco AND slot='fiscal'
    ) THEN RAISE EXCEPTION 'Registre a assinatura do Fiscal antes das demais.'; END IF;
    manual := p_slot IN ('sefaz','comissao');
    SELECT count(*) INTO assinaturas_ativas FROM public.assinaturas_etapa
      WHERE lancamento_id=p_registro AND bloco=p_bloco AND slot=p_slot;
    IF EXISTS (SELECT 1 FROM public.assinaturas_etapa
       WHERE lancamento_id=p_registro AND bloco=p_bloco AND servidor_nome=nome)
      THEN RAISE EXCEPTION 'Nome já registrado neste bloco.'; END IF;
  ELSIF p_tipo='piso' THEN
    SELECT to_jsonb(d), c.status INTO registro,competencia_status
      FROM public.piso_documentos d JOIN public.piso_competencias c ON c.id=d.competencia_id
      WHERE d.id=p_registro;
    IF registro IS NULL OR competencia_status='encerrada' THEN
      RAISE EXCEPTION 'Documento ausente ou competência encerrada.'; END IF;
    IF NOT (adm OR acp OR aco) THEN RAISE EXCEPTION 'Perfil sem autorização no Piso.'; END IF;
    IF p_bloco <> registro->>'tipo' THEN RAISE EXCEPTION 'Tipo do documento diverge.'; END IF;
    doc_url := registro->>'link_sei';
    SELECT m.cargos, m.manual INTO cargos, manual FROM public.piso_assinatura_matriz m
      WHERE m.tipo_documento=p_bloco AND m.slot_key=p_slot;
    IF NOT FOUND THEN RAISE EXCEPTION 'Slot não previsto na matriz do Piso.'; END IF;
    IF manual THEN
      cargo := CASE WHEN p_slot='comissao' THEN 'Membro da Comissão de Gestão e Controle de Despesa'
        ELSE 'SEFAZ' END;
    END IF;
    SELECT count(*) INTO assinaturas_ativas FROM public.piso_documento_assinaturas
      WHERE documento_id=p_registro AND slot=p_slot;
    IF EXISTS (SELECT 1 FROM public.piso_documento_assinaturas
       WHERE documento_id=p_registro AND servidor_nome=nome)
      THEN RAISE EXCEPTION 'Nome já registrado no documento.'; END IF;
  ELSIF p_tipo='pvh_solicitacao' THEN
    SELECT to_jsonb(e),c.status INTO registro,competencia_status
      FROM public.pvh_empenhos e
      JOIN public.pvh_competencias c ON c.id=e.solicitacao_competencia_id
      WHERE e.id=p_registro;
    IF registro IS NULL OR competencia_status='encerrada'
      THEN RAISE EXCEPTION 'Solicitação ausente ou encerrada.'; END IF;
    IF coalesce((registro->>'solicitacao_enviada_sefaz')::boolean,false)
      THEN RAISE EXCEPTION 'Solicitação já encaminhada à SEFAZ.'; END IF;
    IF p_bloco<>'solicitacao_ne' THEN RAISE EXCEPTION 'Bloco inválido.'; END IF;
    doc_url := registro->>'solicitacao_sei_link';
    cargos := CASE p_slot
      WHEN 'coord_orc' THEN ARRAY['Coordenador de Orçamentos']
      WHEN 'fiscal' THEN ARRAY['Fiscal']
      WHEN 'gestao' THEN ARRAY['Gerente','Coordenador ACP','Coordenador']
      WHEN 'diretor_servicos_complementares' THEN ARRAY['Diretor de Serviços Complementares']
      WHEN 'comissao' THEN ARRAY['Membro da Comissão de Gestão e Controle de Despesa']
      WHEN 'diretor_financeiro' THEN ARRAY['Diretor Financeiro','Diretoria Financeira']
      ELSE ARRAY[]::text[] END;
    manual := p_slot='comissao';
    SELECT count(*) INTO assinaturas_ativas FROM public.pvh_empenho_solicitacao_assinaturas
      WHERE empenho_id=p_registro AND slot=p_slot AND revogado_em IS NULL;
    IF EXISTS (SELECT 1 FROM public.pvh_empenho_solicitacao_assinaturas
       WHERE empenho_id=p_registro AND servidor_nome=nome AND revogado_em IS NULL)
      THEN RAISE EXCEPTION 'Signatário já registrado.'; END IF;
  ELSIF p_tipo='pvh_documento' THEN
    SELECT to_jsonb(d),c.status INTO registro,competencia_status
      FROM public.pvh_documentos d JOIN public.pvh_competencias c ON c.id=d.competencia_id
      WHERE d.id=p_registro;
    IF registro IS NULL OR competencia_status='encerrada'
      THEN RAISE EXCEPTION 'Documento PVH ausente/encerrado.'; END IF;
    IF p_bloco<>registro->>'tipo_codigo' OR p_bloco NOT IN ('minuta_portaria_municipal','memorando_portaria_municipal')
      THEN RAISE EXCEPTION 'Tipo PVH não assinável.'; END IF;
    doc_url := registro->>'link_documento';
    cargos := CASE p_slot
      WHEN 'fiscal' THEN ARRAY['Fiscal']
      WHEN 'gestao' THEN ARRAY['Gerente','Coordenador ACP','Coordenador']
      WHEN 'diretor_servicos_complementares' THEN ARRAY['Diretor de Serviços Complementares']
      ELSE ARRAY[]::text[] END;
    IF p_bloco='memorando_portaria_municipal' AND p_slot='diretor_servicos_complementares'
      THEN RAISE EXCEPTION 'Slot inválido para memorando.'; END IF;
    papel := CASE p_slot WHEN 'fiscal' THEN 'Fiscal'
      WHEN 'gestao' THEN 'Gerente ou Coordenador'
      ELSE 'Diretor de Serviços Complementares' END;
    SELECT count(*) INTO assinaturas_ativas FROM public.pvh_documento_assinaturas
      WHERE documento_id=p_registro AND slot=p_slot AND revogado_em IS NULL;
    IF EXISTS (SELECT 1 FROM public.pvh_documento_assinaturas
       WHERE documento_id=p_registro AND assinante_nome=nome AND revogado_em IS NULL)
      THEN RAISE EXCEPTION 'Signatário já registrado.'; END IF;
  ELSE
    SELECT to_jsonb(s),c.status INTO registro,competencia_status
      FROM public.pvh_subempenhos s
      JOIN public.pvh_empenho_alocacoes a ON a.id=s.alocacao_id
      JOIN public.pvh_participantes p ON p.id=a.participante_id
      JOIN public.pvh_competencias c ON c.id=p.competencia_id
      WHERE s.id=p_registro;
    IF registro IS NULL OR competencia_status='encerrada'
      THEN RAISE EXCEPTION 'Subempenho ausente/encerrado.'; END IF;
    IF p_bloco NOT IN ('solicitacao','movimento_liquidacao') OR p_slot NOT IN ('fiscal','comissao')
      THEN RAISE EXCEPTION 'Documento ou slot inválido.'; END IF;
    doc_url := CASE WHEN p_bloco='solicitacao' THEN registro->>'solicitacao_sei_link'
      ELSE registro->>'movimento_liquidacao_sei_link' END;
    cargos := CASE WHEN p_slot='fiscal' THEN ARRAY['Fiscal']
      ELSE ARRAY['Membro da Comissão de Gestão e Controle de Despesa'] END;
    manual := p_slot='comissao';
    SELECT count(*) INTO assinaturas_ativas FROM public.pvh_subempenho_assinaturas
      WHERE subempenho_id=p_registro AND documento_tipo=p_bloco AND slot=p_slot AND revogado_em IS NULL;
    IF EXISTS (SELECT 1 FROM public.pvh_subempenho_assinaturas
       WHERE subempenho_id=p_registro AND documento_tipo=p_bloco
         AND assinante_nome=nome AND revogado_em IS NULL)
      THEN RAISE EXCEPTION 'Signatário já registrado.'; END IF;
  END IF;

  IF doc_url IS NULL OR btrim(doc_url) = '' OR
    btrim(replace(replace(doc_url,'&amp;','&'),'&#38;','&')) <> normalizado
    THEN RAISE EXCEPTION 'Evidência SEI deve ser exatamente o link do documento cadastrado.'; END IF;
  IF NOT (cargo = ANY(coalesce(cargos,ARRAY[]::text[])))
    THEN RAISE EXCEPTION 'Cargo incompatível com slot.'; END IF;
  IF NOT manual AND NOT EXISTS (
    SELECT 1 FROM public.assinaturas_config cf
    WHERE cf.ativo = true AND cf.nome_servidor = nome AND cf.cargo = cargo
  ) THEN RAISE EXCEPTION 'Signatário não consta ativo em Configurações.'; END IF;
  IF assinaturas_ativas >= limite THEN RAISE EXCEPTION 'Slot já preenchido; recarregue a lista.'; END IF;
  SELECT pr.nome INTO entidade FROM public.profiles pr WHERE pr.id=u;
  entidade := coalesce(entidade,u::text);

  IF p_tipo='convenios' THEN
    INSERT INTO public.assinaturas_etapa(lancamento_id,bloco,slot,servidor_nome,cargo,assinado_por,assinado_em)
    VALUES (p_registro,p_bloco,p_slot,nome,cargo,u,p_assinado_em) RETURNING id INTO novo_id;
  ELSIF p_tipo='piso' THEN
    INSERT INTO public.piso_documento_assinaturas(documento_id,slot,servidor_nome,cargo,assinado_por,assinado_em)
    VALUES (p_registro,p_slot,nome,cargo,u,p_assinado_em) RETURNING id INTO novo_id;
  ELSIF p_tipo='pvh_solicitacao' THEN
    INSERT INTO public.pvh_empenho_solicitacao_assinaturas
      (empenho_id,slot,servidor_nome,cargo,assinado_por,assinado_por_nome,assinado_em)
    VALUES (p_registro,p_slot,nome,cargo,u,entidade,p_assinado_em) RETURNING id INTO novo_id;
  ELSIF p_tipo='pvh_documento' THEN
    INSERT INTO public.pvh_documento_assinaturas
      (documento_id,slot,papel_funcao,cargo,assinante_nome,registrado_por,registrado_por_nome,assinado_em)
    VALUES (p_registro,p_slot,papel,cargo,nome,u,entidade,p_assinado_em) RETURNING id INTO novo_id;
  ELSE
    INSERT INTO public.pvh_subempenho_assinaturas
      (subempenho_id,documento_tipo,slot,assinante_nome,cargo,registrado_por,registrado_por_nome,assinado_em)
    VALUES (p_registro,p_bloco,p_slot,nome,cargo,u,entidade,p_assinado_em) RETURNING id INTO novo_id;
  END IF;

  INSERT INTO public.assinaturas_lote_evidencias
    (modulo,tipo_documento,registro_id,bloco,slot,assinatura_id,signatario_nome,cargo,link_sei,confirmado_por)
  VALUES (CASE WHEN p_tipo='convenios' THEN 'convenios' WHEN p_tipo='piso' THEN 'piso' ELSE 'pvh' END,
          p_tipo,p_registro,p_bloco,p_slot,novo_id,nome,cargo,normalizado,u);
  RETURN pg_catalog.jsonb_build_object('status','registrada','assinatura_id',novo_id,'evidencia',normalizado);
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_assinatura_lote(text,uuid,text,text,text,text,text,boolean,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_assinatura_lote(text,uuid,text,text,text,text,text,boolean,timestamptz) TO authenticated;
