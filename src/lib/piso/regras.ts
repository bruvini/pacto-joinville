/** Regras puras do módulo Piso da Enfermagem (validações de etapa e conciliação). */

export const centavos = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
export const iguaisCentavo = (a: number | null | undefined, b: number | null | undefined) => centavos(a) === centavos(b);
export const soma = (xs: (number | null | undefined)[]) => xs.reduce<number>((t, x) => t + centavos(x), 0) / 100;

/** URL do DOU: https + domínio in.gov.br + caminho /web/dou/. */
export function urlDouValida(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" && /(^|\.)in\.gov\.br$/i.test(url.hostname) && url.pathname.includes("/web/dou/");
  } catch {
    return false;
  }
}

export type MatrizSlot = { tipo_documento: string; slot_key: string; opcional: boolean };
export type Doc = { id: string; tipo: string; participante_id: string | null; obrigacao_id: string | null; numero_sei: string | null; link_sei: string | null };
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
}

export function acharDoc(docs: Doc[], tipo: string, escopo: { participante_id?: string | null; obrigacao_id?: string | null } = {}) {
  return docs.find(
    (d) => d.tipo === tipo && (d.participante_id ?? null) === (escopo.participante_id ?? null) && (d.obrigacao_id ?? null) === (escopo.obrigacao_id ?? null),
  );
}

/** Documento completo = possui nº SEI ou link e todas as assinaturas obrigatórias da matriz. */
export function docCompleto(ctx: Pick<CtxPiso, "matriz" | "assinaturas">, doc: Doc | undefined): boolean {
  if (!doc || !(doc.numero_sei || doc.link_sei)) return false;
  return ctx.matriz
    .filter((m) => m.tipo_documento === doc.tipo && !m.opcional)
    .every((m) => ctx.assinaturas.some((a) => a.documento_id === doc.id && a.slot === m.slot_key));
}

export function encaminhado(encs: Enc[], docId: string | undefined): boolean {
  if (!docId) return false;
  const ult = encs.filter((e) => e.documento_id === docId).sort((a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em)).at(-1);
  return ult?.acao === "encaminhado";
}

export const elegiveis = (parts: any[]) => parts.filter((p) => !p.sem_elegiveis && p.situacao !== "sem_elegiveis");

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
  const nome = (pid: string) => parts.find((x) => x.id === pid)?.prestadores?.nome_instituicao ?? "Instituição";
  const docsObrig = (tipos: string[]) => {
    for (const o of obrigs) for (const t of tipos) if (!docCompleto(ctx, acharDoc(docs, t, { obrigacao_id: o.id }))) p.push(`${nome(o.participante_id)}: ${DOC_LABEL[t]} incompleto(a)`);
  };
  switch (n) {
    case 1:
      if (parts.length === 0) p.push("Inclua ao menos uma instituição.");
      for (const x of parts) if (!["retornado", "sem_elegiveis"].includes(x.situacao)) p.push(`${nome(x.id)}: aguardando retorno`);
      for (const x of parts) if (x.data_envio && x.data_retorno && x.data_retorno < x.data_envio) p.push(`${nome(x.id)}: retorno anterior ao envio`);
      break;
    case 2:
      if (!c.portaria_gm_numero) p.push("Informe o número da Portaria GM/MS.");
      if (!c.portaria_gm_data_publicacao) p.push("Informe a data de publicação.");
      if (!urlDouValida(c.portaria_gm_url_dou)) p.push("URL do DOU inválida (https, in.gov.br, /web/dou/).");
      if (c.valor_homologado == null) p.push("Informe o valor homologado.");
      if (c.valor_apurado_investsus == null) p.push("Informe o valor apurado no InvestSUS.");
      if (c.valor_homologado != null && c.valor_apurado_investsus != null && !iguaisCentavo(c.valor_homologado, c.valor_apurado_investsus) && !c.justificativa_conciliacao?.trim())
        p.push("Valores divergentes: registre a justificativa formal.");
      break;
    case 3:
      for (const t of ["minuta", "memorando", "portaria_municipal"]) if (!docCompleto(ctx, acharDoc(docs, t))) p.push(`${DOC_LABEL[t]} incompleto(a)`);
      if (c.total_publicado_municipal == null) p.push("Informe o total publicado.");
      else if (!iguaisCentavo(c.total_publicado_municipal, c.valor_homologado)) p.push("Total publicado difere do valor homologado.");
      break;
    case 4: {
      if (!c.credito_fms_data || c.credito_fms_valor == null) p.push("Registre data e valor do crédito no FMS.");
      for (const x of eleg) {
        if (x.valor_devido == null) p.push(`${nome(x.id)}: informe o valor devido`);
        else if (!iguaisCentavo(soma([x.valor_recurso_atual, x.valor_saldo_afc]), x.valor_devido)) p.push(`${nome(x.id)}: recurso atual + saldo AFC ≠ valor devido`);
      }
      const totalDevido = soma(eleg.map((x) => x.valor_devido));
      if (c.total_publicado_municipal != null && !iguaisCentavo(totalDevido, c.total_publicado_municipal)) p.push("Soma do rateio difere do total publicado.");
      const usoAtual = soma(eleg.map((x) => x.valor_recurso_atual));
      if (c.credito_fms_valor != null && centavos(usoAtual) > centavos(c.credito_fms_valor)) p.push("Rateio do recurso atual excede o crédito no FMS.");
      const usoAfc = soma(eleg.map((x) => x.valor_saldo_afc));
      if (centavos(usoAfc) > centavos(c.saldo_afc_anterior)) p.push("Rateio do saldo AFC excede o saldo disponível.");
      break;
    }
    case 5:
      for (const x of eleg) {
        const os = obrigs.filter((o) => o.participante_id === x.id);
        if (os.length === 0) p.push(`${nome(x.id)}: cadastre ao menos uma obrigação`);
        else if (!iguaisCentavo(soma(os.map((o) => o.valor_a_liquidar)), x.valor_devido)) p.push(`${nome(x.id)}: soma das obrigações ≠ valor devido`);
      }
      for (const o of obrigs) if (o.saldo_disponivel != null && centavos(o.valor_a_liquidar) > centavos(o.saldo_disponivel)) p.push(`${nome(o.participante_id)}: valor a liquidar excede o saldo`);
      docsObrig(["solicitacao_ne", "nota_empenho"]);
      break;
    case 6:
      docsObrig(["solicitacao_liquidacao", "aviso_liquidacao"]);
      for (const o of obrigs) if (!encaminhado(ctx.encaminhamentos, acharDoc(docs, "aviso_liquidacao", { obrigacao_id: o.id })?.id)) p.push(`${nome(o.participante_id)}: Aviso de Movimento não encaminhado`);
      break;
    case 7:
      docsObrig(["aviso_subempenho", "programacao_pagamento", "comprovante_pagamento"]);
      for (const o of obrigs) {
        if (!o.data_pagamento) p.push(`${nome(o.participante_id)}: informe a data de pagamento`);
        if (!iguaisCentavo(o.valor_pago, o.valor_a_liquidar)) p.push(`${nome(o.participante_id)}: valor pago ≠ valor a liquidar`);
      }
      break;
    case 8:
      for (let k = 1; k <= 7; k++) if (!c.etapas_concluidas?.[String(k)]) p.push(`Etapa ${k} não concluída`);
      if ((c.etapas_reconferir ?? []).length) p.push("Há etapas marcadas para reconferência.");
      break;
  }
  return p;
}
