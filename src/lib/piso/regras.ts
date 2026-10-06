/** Regras puras do módulo Piso da Enfermagem (validações de etapa e conciliação). */

export const centavos = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
export const iguaisCentavo = (a: number | null | undefined, b: number | null | undefined) =>
  centavos(a) === centavos(b);
export const dentroTolerancia = (
  a: number | null | undefined,
  b: number | null | undefined,
  tolerancia = 0.02,
) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= tolerancia;
export const soma = (xs: (number | null | undefined)[]) =>
  xs.reduce<number>((t, x) => t + centavos(x), 0) / 100;

/** URL do DOU: https + domínio in.gov.br + caminho /web/dou/. */
export function urlDouValida(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const url = new URL(u.trim());
    return (
      url.protocol === "https:" &&
      /(^|\.)in\.gov\.br$/i.test(url.hostname) &&
      url.pathname.includes("/web/dou/")
    );
  } catch {
    return false;
  }
}

export type MatrizSlot = { tipo_documento: string; slot_key: string; opcional: boolean };
export type Doc = {
  id: string;
  tipo: string;
  participante_id: string | null;
  obrigacao_id: string | null;
  numero_sei: string | null;
  link_sei: string | null;
  data_documento?: string | null;
  dados?: Record<string, unknown>;
};
export type Assin = { documento_id: string; slot: string };
export type Enc = { documento_id: string; acao: string; ocorrido_em: string };

export interface CtxPiso {
  comp: any;
  parts: any[];
  obrigs: any[];
  docs: Doc[];
  assinaturas: Assin[];
  matriz: MatrizSlot[];
  encaminhamentos: Enc[];
  arquivos?: any[];
  ocorrencias?: any[];
}

export function acharDoc(
  docs: Doc[],
  tipo: string,
  escopo: { participante_id?: string | null; obrigacao_id?: string | null } = {},
) {
  return docs.find(
    (d) =>
      d.tipo === tipo &&
      (d.participante_id ?? null) === (escopo.participante_id ?? null) &&
      (d.obrigacao_id ?? null) === (escopo.obrigacao_id ?? null),
  );
}

/** Documento completo = possui nº SEI ou link e todas as assinaturas obrigatórias da matriz. */
export function docCompleto(
  ctx: Pick<CtxPiso, "matriz" | "assinaturas">,
  doc: Doc | undefined,
): boolean {
  if (!doc || !(doc.numero_sei || doc.link_sei)) return false;
  return ctx.matriz
    .filter((m) => m.tipo_documento === doc.tipo && !m.opcional)
    .every((m) => ctx.assinaturas.some((a) => a.documento_id === doc.id && a.slot === m.slot_key));
}

export function encaminhado(encs: Enc[], docId: string | undefined): boolean {
  if (!docId) return false;
  const ult = encs
    .filter((e) => e.documento_id === docId)
    .sort((a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em))
    .at(-1);
  return ult?.acao === "encaminhado";
}

export const elegiveis = (parts: any[]) => parts.filter((p) => !p.sem_elegiveis);

export const DOC_LABEL: Record<string, string> = {
  minuta: "Minuta da Portaria",
  memorando: "Memorando",
  portaria_municipal: "Portaria municipal publicada",
  solicitacao_ne: "Solicitação de Nota de Empenho",
  nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Subempenho / Liquidação",
  aviso_liquidacao: "Aviso de Movimento",
  aviso_subempenho: "Aviso de Subempenho",
  programacao_pagamento: "Programação de pagamento",
  comprovante_pagamento: "Comprovante de pagamento",
};

/** Lista de pendências que impedem concluir a etapa n. */
export function pendenciasEtapa(n: number, ctx: CtxPiso): string[] {
  const { comp: c, parts, obrigs, docs } = ctx;
  const p: string[] = [];
  const eleg = elegiveis(parts);
  const nome = (pid: string) =>
    parts.find((x) => x.id === pid)?.prestadores?.nome_instituicao ?? "Instituição";
  const docsObrig = (tipos: string[]) => {
    for (const o of obrigs)
      for (const t of tipos)
        if (!docCompleto(ctx, acharDoc(docs, t, { obrigacao_id: o.id })))
          p.push(`${nome(o.participante_id)}: ${DOC_LABEL[t]} incompleto(a)`);
  };
  switch (n) {
    case 1:
      if (parts.length === 0) p.push("Inclua ao menos uma instituição.");
      for (const x of parts) {
        if (!x.data_envio) p.push(`${nome(x.id)}: informe a data do envio`);
        if (!x.data_retorno) p.push(`${nome(x.id)}: informe a data do retorno`);
        if (x.data_envio && x.data_retorno && x.data_retorno < x.data_envio)
          p.push(`${nome(x.id)}: retorno anterior ao envio`);
        const temPlanilha = (ctx.arquivos ?? []).some(
          (a) => a.participante_id === x.id && a.categoria === "planilha_carga",
        );
        if (x.data_retorno && !x.sem_elegiveis && (!temPlanilha || !x.auditoria_resumo))
          p.push(`${nome(x.id)}: Planilha de Carga ainda não auditada`);
      }
      if (!c.investsus_carga_em) p.push("Informe a data da carga/atualização no InvestSUS.");
      if (!c.investsus_confirmacao_em) p.push("Informe a confirmação final do InvestSUS.");
      if (c.investsus_carga_em) {
        const ultimoRetorno = parts
          .map((x) => x.data_retorno)
          .filter(Boolean)
          .sort()
          .at(-1);
        if (ultimoRetorno && c.investsus_carga_em < ultimoRetorno)
          p.push("Carga no InvestSUS anterior ao último retorno institucional.");
      }
      if (
        c.investsus_carga_em &&
        c.investsus_confirmacao_em &&
        c.investsus_confirmacao_em < c.investsus_carga_em
      )
        p.push("Confirmação do InvestSUS anterior à carga.");
      break;
    case 2:
      if (!(ctx.arquivos ?? []).some((a) => a.categoria === "investsus"))
        p.push("Anexe e audite a planilha exportada do InvestSUS.");
      if (
        (c.investsus_auditoria?.conciliacao?.criticas ?? 0) > 0 &&
        !(c.conciliacao_excecao_por && c.justificativa_conciliacao?.trim())
      )
        p.push(
          "A conciliação possui críticas bloqueantes; corrija ou registre continuidade excepcional.",
        );
      if (!(ctx.arquivos ?? []).some((a) => a.categoria === "portaria_gm"))
        p.push("Anexe o PDF da Portaria GM/MS.");
      if (!c.portaria_gm_numero) p.push("Informe o número da Portaria GM/MS.");
      if (!c.portaria_gm_data_publicacao) p.push("Informe a data de publicação.");
      if (!urlDouValida(c.portaria_gm_url_dou))
        p.push("URL do DOU inválida (https, in.gov.br, /web/dou/).");
      if (c.valor_homologado == null) p.push("Informe o valor homologado.");
      if (c.valor_apurado_investsus == null) p.push("Informe o valor apurado no InvestSUS.");
      if (
        c.valor_homologado != null &&
        c.valor_apurado_investsus != null &&
        !dentroTolerancia(c.valor_homologado, c.valor_apurado_investsus)
      )
        p.push("Total do InvestSUS difere do valor homologado da Portaria.");
      if (
        c.valor_homologado != null &&
        c.valor_transferido != null &&
        !dentroTolerancia(
          Number(c.valor_homologado) - Number(c.desconto_saldo ?? 0) + Number(c.acerto_contas ?? 0),
          c.valor_transferido,
        )
      )
        p.push("Homologado - desconto + acerto não fecha com o valor transferido.");
      if (Math.abs(Number(c.desconto_saldo ?? 0)) > 0.005 && !c.desconto_identificacao?.trim())
        p.push("Identifique o saldo descontado.");
      if (Math.abs(Number(c.acerto_contas ?? 0)) > 0.005 && !c.acerto_identificacao?.trim())
        p.push("Identifique o acerto de contas.");
      break;
    case 3:
      for (const t of ["minuta", "memorando", "portaria_municipal"])
        if (!docCompleto(ctx, acharDoc(docs, t))) p.push(`${DOC_LABEL[t]} incompleto(a)`);
      if (!c.municipal_config?.processo?.trim()) p.push("Informe o processo SEI das Portarias.");
      if (!c.municipal_config?.autoridade?.trim()) p.push("Informe o nome da autoridade.");
      if (!c.municipal_config?.cargo?.trim()) p.push("Informe o cargo da autoridade.");
      if (!(c.municipal_config?.destinatarios ?? []).length)
        p.push("Inclua ao menos um destinatário do Memorando.");
      else if (
        c.municipal_config.destinatarios.some(
          (d: any) => !d.nome?.trim() || !d.cargo?.trim() || !d.unidade?.trim(),
        )
      )
        p.push("Complete nome, cargo e unidade SEI de todos os destinatários.");
      if (c.total_publicado_municipal == null) p.push("Total publicado ainda não foi calculado.");
      else if (!dentroTolerancia(c.total_publicado_municipal, c.valor_apurado_investsus))
        p.push("Total publicado difere do InvestSUS.");
      {
        const minuta = acharDoc(docs, "minuta"),
          memo = acharDoc(docs, "memorando"),
          portaria = acharDoc(docs, "portaria_municipal"),
          consulta = c.municipal_config?.consulta_investsus;
        if (!consulta) p.push("Informe a data da consulta ao InvestSUS.");
        if (c.portaria_gm_data_publicacao && consulta && consulta < c.portaria_gm_data_publicacao)
          p.push("Consulta ao InvestSUS anterior à publicação federal.");
        if (consulta && minuta?.data_documento && minuta.data_documento < consulta)
          p.push("Minuta anterior à consulta ao InvestSUS.");
        if (
          c.portaria_gm_data_publicacao &&
          minuta?.data_documento &&
          minuta.data_documento < c.portaria_gm_data_publicacao
        )
          p.push("Minuta anterior à publicação federal.");
        if (
          minuta?.data_documento &&
          memo?.data_documento &&
          memo.data_documento < minuta.data_documento
        )
          p.push("Memorando anterior à Minuta.");
        if (
          memo?.data_documento &&
          portaria?.data_documento &&
          portaria.data_documento < memo.data_documento
        )
          p.push("Publicação municipal anterior ao Memorando.");
      }
      break;
    case 4: {
      if (!c.credito_fms_data || c.credito_fms_valor == null || !c.credito_fms_referencia?.trim())
        p.push("Registre data, valor e referência do crédito no FMS.");
      if (
        c.credito_fms_valor != null &&
        c.valor_transferido != null &&
        !dentroTolerancia(c.credito_fms_valor, c.valor_transferido) &&
        !c.justificativa_credito?.trim()
      )
        p.push("Crédito difere do valor transferido; registre justificativa documental.");
      const pubMunicipal = acharDoc(docs, "portaria_municipal")?.data_documento;
      if (pubMunicipal && c.credito_fms_data && c.credito_fms_data < pubMunicipal)
        p.push("Crédito no FMS anterior à publicação municipal.");
      break;
    }
    case 5:
      for (const x of eleg) {
        const os = obrigs.filter((o) => o.participante_id === x.id);
        if (os.length === 0) p.push(`${nome(x.id)}: cadastre ao menos uma obrigação`);
        else if (!iguaisCentavo(soma(os.map((o) => o.valor_a_liquidar)), x.valor_devido))
          p.push(`${nome(x.id)}: soma das obrigações ≠ valor devido`);
      }
      for (const o of obrigs)
        if (!o.processo_sei?.trim())
          p.push(`${nome(o.participante_id)}: informe o processo anual da obrigação`);
        else {
          if (!o.exercicio) p.push(`${nome(o.participante_id)}: informe o exercício da NE`);
          if (!o.fonte?.trim()) p.push(`${nome(o.participante_id)}: informe a fonte da NE`);
          if (o.saldo_disponivel == null)
            p.push(`${nome(o.participante_id)}: informe o saldo disponível da NE`);
          if (o.valor_a_liquidar == null)
            p.push(`${nome(o.participante_id)}: informe o valor a liquidar`);
          if (
            o.saldo_disponivel != null &&
            centavos(o.valor_a_liquidar) > centavos(o.saldo_disponivel)
          )
            p.push(`${nome(o.participante_id)}: valor a liquidar excede o saldo`);
        }
      docsObrig(["solicitacao_ne", "nota_empenho"]);
      break;
    case 6:
      docsObrig(["solicitacao_liquidacao", "aviso_liquidacao"]);
      for (const o of obrigs) {
        if (!o.data_solicitacao_liquidacao)
          p.push(`${nome(o.participante_id)}: informe a data da solicitação de liquidação`);
        if (!o.data_movimento_liquidacao)
          p.push(`${nome(o.participante_id)}: informe a data do movimento em liquidação`);
        if (
          !o.movimento_transmitido ||
          !encaminhado(
            ctx.encaminhamentos,
            acharDoc(docs, "aviso_liquidacao", { obrigacao_id: o.id })?.id,
          )
        )
          p.push(`${nome(o.participante_id)}: movimento ainda não transmitido/encaminhado`);
        if (
          o.data_solicitacao_liquidacao &&
          o.data_movimento_liquidacao &&
          o.data_movimento_liquidacao < o.data_solicitacao_liquidacao
        )
          p.push(`${nome(o.participante_id)}: movimento anterior à solicitação`);
      }
      break;
    case 7:
      docsObrig(["aviso_subempenho", "programacao_pagamento", "comprovante_pagamento"]);
      for (const o of obrigs) {
        if (!o.data_pagamento) p.push(`${nome(o.participante_id)}: informe a data de pagamento`);
        if (!o.data_programacao)
          p.push(`${nome(o.participante_id)}: informe a data da programação`);
        if (o.valor_pago == null) p.push(`${nome(o.participante_id)}: informe o valor pago`);
        if (
          o.data_programacao &&
          o.data_movimento_liquidacao &&
          o.data_programacao < o.data_movimento_liquidacao
        )
          p.push(`${nome(o.participante_id)}: programação anterior ao movimento`);
        if (o.data_pagamento && o.data_programacao && o.data_pagamento < o.data_programacao)
          p.push(`${nome(o.participante_id)}: pagamento anterior à programação`);
        if (!dentroTolerancia(o.valor_pago, o.valor_a_liquidar))
          p.push(`${nome(o.participante_id)}: valor pago ≠ valor a liquidar`);
      }
      break;
    case 8:
      for (let k = 1; k <= 7; k++)
        if (!c.etapas_concluidas?.[String(k)]) p.push(`Etapa ${k} não concluída`);
      if ((c.etapas_reconferir ?? []).length) p.push("Há etapas marcadas para reconferência.");
      if (pendenciasEtapa(7, ctx).length)
        p.push("Há obrigações financeiras ou pagamentos ainda não conciliados.");
      if (!c.relatorio_gerado_em) p.push("Gere o Relatório Executivo antes de encerrar.");
      break;
  }
  return p;
}
