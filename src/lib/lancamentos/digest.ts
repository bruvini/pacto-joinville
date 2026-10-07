/** Utilitários do digest operacional da listagem de lançamentos.
 * Extraídos da rota para manter regra de negócio testável e o componente abaixo
 * do orçamento arquitetural.
 */

export const ETAPA_NOME: Record<number, string> = {
  1: "Análise de Orçamento",
  2: "Solicitação de Empenho",
  3: "Revisão da Coordenação da UFI",
  4: "Assinaturas e Envio (Solicitação)",
  5: "Liberação de Orçamento",
  6: "Liberação de Recurso",
  7: "Anulação de Empenho",
};

/** Reescreve a pendência "Falta/Pendente…" como AÇÃO imperativa para o Digest. */
export function paraAcao(texto: string): string {
  const t = texto.replace(/\s*\(Etapa \d+\)\s*$/, "").replace(/\s+na Etapa \d+\b/, "").trim();
  if (/^Falta preencher Número e Link SEI da Nota de Empenho/i.test(t)) return "Registrar Número e Link SEI da Nota de Empenho.";
  if (/^Falta assinatura d/i.test(t)) return t.replace(/^Falta assinatura d/i, "Colher assinatura d") + ".";
  if (/^Falta colher assinatura/i.test(t)) return t.replace(/^Falta colher/i, "Colher") + ".";
  if (/^Falta Link SEI/i.test(t)) return t.replace(/^Falta Link SEI/i, "Anexar o Link SEI") + ".";
  if (/^Falta preencher/i.test(t)) return t.replace(/^Falta preencher\s+(o |a )?/i, "Preencher ") + ".";
  if (/^Falta Justificativa/i.test(t)) return "Preencher a " + t.replace(/^Falta\s+/i, "") + ".";
  if (/^Falta\s+/i.test(t)) return t.replace(/^Falta\s+/i, "Concluir: ") + ".";
  if (/^Pendente registro de data de envio à SEFAZ/i.test(t)) return "Registrar a data de envio à SEFAZ.";
  if (/^Pendente envio para bloco de revisão/i.test(t)) return "Enviar a solicitação para o bloco de revisão.";
  if (/^Pendente\s+/i.test(t)) return t.replace(/^Pendente\s+/i, "Concluir: ") + ".";
  return t.endsWith(".") ? t : t + ".";
}

export function getPendenciasLancamento(l: any, assinaturas: any[], teto: number, convenio: any, revisaoEfetiva?: string): { texto: string; critical: boolean; etapa: number }[] {
  const pends: { texto: string; critical: boolean; etapa: number }[] = [];
  const fluxo2 = (convenio?.modelo_fluxo ?? l.convenios?.modelo_fluxo) === "fluxo_2";
  // Etapa 3 é ato do Pai: o filho herda a aprovação (não conta como retido).
  const revisaoStatus = revisaoEfetiva ?? l.revisao_status;
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  const anular = atest > 0 ? Math.max(0, solic - atest) : 0;
  
  const linkValido = (url: string | null) => !!url && (url.startsWith("http://") || url.startsWith("https://"));
  
  // Etapa 1: Análise Orçamentária
  const s1 = !!l.dotacao_orcamentaria && !!l.fonte_pagamento;
  if (!s1) {
    pends.push({ texto: "Pendente indicação de Dotação Orçamentária e Fonte de Pagamento", critical: true, etapa: 1 });
  }

  // Etapa 2: Solicitação
  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const isMulti = !l.parent_id && comps.length > 1;
  let justificativasCompletas = true;
  if (isMulti) {
    const pcArr = Array.isArray(l.parcelas_competencia) ? l.parcelas_competencia : [];
    const parcelasExcedentes = teto > 0 ? pcArr.filter((p: any) => Number(p.valor ?? 0) > teto) : [];
    justificativasCompletas = parcelasExcedentes.every((p: any) => !!(p.justificativa_teto && String(p.justificativa_teto).trim()));
  } else {
    const excede = teto > 0 && solic > teto;
    justificativasCompletas = !excede || !!(l.justificativa_teto && String(l.justificativa_teto).trim());
  }

  const temSolic = solic > 0;
  const temSei = linkValido(l.link_solicitacao_sei);
  const temRevisao = !!l.em_bloco_revisao;

  const s2 = temSolic && temSei && temRevisao && justificativasCompletas;
  if (!s2) {
    const isEtapaAtual = s1;
    if (!temSolic) pends.push({ texto: "Falta preencher o Valor Solicitado", critical: isEtapaAtual, etapa: 2 });
    if (!temSei) pends.push({ texto: "Falta Link SEI da Solicitação de Empenho", critical: isEtapaAtual, etapa: 2 });
    if (!temRevisao) pends.push({ texto: "Pendente envio para bloco de revisão", critical: isEtapaAtual, etapa: 2 });
    if (!justificativasCompletas) pends.push({ texto: "Falta Justificativa do Teto Excedente", critical: isEtapaAtual, etapa: 2 });
  }

  // Etapa 3: Revisão (usa o status efetivo — filho herda do pai)
  const s3 = revisaoStatus === "aprovado";
  if (!s3) {
    const isEtapaAtual = s1 && s2;
    pends.push({
      texto: revisaoStatus === "negado"
        ? "Revisão negada pelo Coordenador (ajuste a Solicitação)"
        : "Aguardando aprovação da revisão pelo Coordenador de Orçamentos",
      critical: isEtapaAtual, 
      etapa: 3 
    });
  }

  // Etapa 4: Assinaturas da Solicitação (bloco etapa1)
  const ass1 = assinaturas.filter((a) => a.bloco === "etapa1");
  const slotsE1 = [
    { key: "coord_orc", label: "Coordenador de Orçamentos" },
    { key: "fiscal", label: "Fiscal" },
    { key: "gerente", label: "Gerente ou Coordenador ACP" },
    { key: "diretor", label: "Diretor de Serviços Complementares" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" },
  ];
  // Fluxo 2 — Etapa 4 exige exclusivamente Coord. Orçamentos, Fiscal, Membro da Comissão e Financeira/Saúde.
  const slotsAss4 = fluxo2 ? [
    { key: "coord_orc", label: "Coordenador de Orçamentos" },
    { key: "fiscal", label: "Fiscal" },
    { key: "comissao", label: "Membro da Comissão de Gestão e Controle de Despesa" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" },
  ] : slotsE1;
  const faltamAss1: string[] = [];
  slotsAss4.forEach((s) => {
    const ok = ass1.some((a) => a.slot === s.key);
    if (!ok) faltamAss1.push(s.label);
  });
  const temSefaz1 = !!l.sefaz_etapa1_em;
  const s4 = faltamAss1.length === 0 && temSefaz1;
  if (!s4) {
    const isEtapaAtual = s1 && s2 && s3;
    faltamAss1.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 4`, critical: isEtapaAtual, etapa: 4 });
    });
    if (!temSefaz1) {
      pends.push({ texto: "Pendente registro de data de envio à SEFAZ na Etapa 4", critical: isEtapaAtual, etapa: 4 });
    }
  }

  // Etapa 5: Liberação de Orçamento
  const temEmp = !!l.numero_empenho;
  const temEmpSei = linkValido(l.link_empenho_sei);
  const ass2 = assinaturas.filter((a) => a.bloco === "libera_orc");
  const slotsE2 = [
    { key: "sefaz", label: "Membro da SEFAZ" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" }
  ];
  const faltamAss2: string[] = [];
  slotsE2.forEach((s) => {
    const ok = ass2.some((a) => a.slot === s.key);
    if (!ok) faltamAss2.push(s.label);
  });
  const s5 = temEmp && temEmpSei && faltamAss2.length === 0;
  if (!s5) {
    const isEtapaAtual = s1 && s2 && s3 && s4;
    if (!temEmp || !temEmpSei) {
      pends.push({ texto: "Falta preencher Número e Link SEI da Nota de Empenho (Etapa 5)", critical: isEtapaAtual, etapa: 5 });
    }
    faltamAss2.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 5`, critical: isEtapaAtual, etapa: 5 });
    });
  }

  // Etapa 6 — Fluxo 2: Liquidação de Despesa (8 subpassos). Sem Etapa 7 (anulação).
  if (fluxo2) {
    const isEtapaAtual = s1 && s2 && s3 && s4 && s5;
    const assF = (b: string) => assinaturas.filter((a) => a.bloco === b);
    const temMinutaAss = assF("f2_minuta").some((a) => a.slot === "gerente") && assF("f2_minuta").some((a) => a.slot === "diretor");
    const temMemoAss = assF("f2_memorando").some((a) => a.slot === "fiscal") && assF("f2_memorando").some((a) => a.slot === "gerente");
    const temLiqAss = assF("f2_liquidacao").some((a) => a.slot === "fiscal") && assF("f2_liquidacao").some((a) => a.slot === "comissao");
    const temAvisoAss = assF("f2_aviso").some((a) => a.slot === "fiscal") && assF("f2_aviso").some((a) => a.slot === "comissao");
    if (!linkValido(l.link_minuta_sei)) pends.push({ texto: "Falta Link SEI da Minuta na Etapa 6 (Liquidação de Despesa)", critical: isEtapaAtual, etapa: 6 });
    if (!temMinutaAss) pends.push({ texto: "Falta assinatura conjunta (Gerente ACP + Diretor de Serviços Complementares) na Minuta (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_memorando_sei)) pends.push({ texto: "Falta Link SEI do Memorando na Etapa 6 (Liquidação de Despesa)", critical: isEtapaAtual, etapa: 6 });
    if (!temMemoAss) pends.push({ texto: "Falta assinatura (Fiscal + Gerente/Coordenador ACP) no Memorando (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!l.minuta_enc_ses) pends.push({ texto: "Pendente confirmar Minuta encaminhada para SES.UPA e SES.UPA.APA (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_portaria_sei)) pends.push({ texto: "Falta Link SEI da Portaria de Divulgação de Recursos na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_solicitacao_liquidacao_sei)) pends.push({ texto: "Falta Link SEI da Solicitação de Subempenho/Liquidação na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!(Number(l.valor_liquidado ?? 0) > 0)) pends.push({ texto: "Falta preencher o Valor Liquidado na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temLiqAss) pends.push({ texto: "Falta assinatura (Fiscal + Membro da Comissão) na Solicitação de Liquidação (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_aviso_liquidacao_sei)) pends.push({ texto: "Falta Link SEI do Aviso de Movimento (Empenho em Liquidação) na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temAvisoAss) pends.push({ texto: "Falta assinatura (Fiscal + Membro da Comissão) no Aviso de Movimento (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!l.aviso_enc_sefaz) pends.push({ texto: "Pendente confirmar Aviso enviado para SEFAZ.UAF.ADE (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_subempenho_sei)) pends.push({ texto: "Falta Link SEI do Aviso de Movimento · Subempenho na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_programacao_pagamento_sei)) pends.push({ texto: "Falta Link SEI da Programação de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_comprovante_pagamento_sei)) pends.push({ texto: "Falta Link SEI do Comprovante de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!l.data_pagamento) pends.push({ texto: "Falta preencher a Data de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    return pends;
  }

  // Etapa 6: Liberação de Recurso
  const exigeRelAna = convenio?.exige_relatorio_analise !== false;
  const temRelTec = linkValido(l.link_relatorio_tecnico_sei);
  const temRelAna = !exigeRelAna || linkValido(l.link_relatorio_analise_sei);
  const temCert = linkValido(l.link_certidoes_sei);
  const assRelTec = assinaturas.filter((a) => a.bloco === "rel_tecnico");
  const assRelAna = assinaturas.filter((a) => a.bloco === "rel_analise");
  const assEtapa4 = assinaturas.filter((a) => a.bloco === "etapa4");

  const faltamRelTecAss = assRelTec.length < 3;
  const faltamRelAnaAss = exigeRelAna && assRelAna.length < 1;
  const slotsE4 = [
    { key: "fiscal", label: "Fiscal" },
    { key: "gerente", label: "Gerente ou Coordenador ACP" },
    { key: "diretor", label: "Diretor de Serviços Complementares" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" }
  ];
  const faltamAss4: string[] = [];
  slotsE4.forEach((s) => {
    const ok = assEtapa4.some((a) => a.slot === s.key);
    if (!ok) faltamAss4.push(s.label);
  });

  const temAtest = atest > 0;
  const temSolLib = linkValido(l.link_solicitacao_liberacao_sei);
  const temSefaz4 = !!l.sefaz_etapa4_em;
  const temSub = linkValido(l.link_subempenho_sei);
  const temProg = linkValido(l.link_programacao_pagamento_sei);
  const temCompr = linkValido(l.link_comprovante_pagamento_sei);
  const temDtPag = !!l.data_pagamento;

  const s6 = temRelTec && temRelAna && temCert && !faltamRelTecAss && !faltamRelAnaAss
    && temAtest && temSolLib && faltamAss4.length === 0 && temSefaz4 
    && temSub && temProg && temCompr && temDtPag;
    
  if (!s6) {
    const isEtapaAtual = s1 && s2 && s3 && s4 && s5;
    if (!temRelTec) pends.push({ texto: "Pendente Link SEI do Relatório Técnico na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (exigeRelAna && !linkValido(l.link_relatorio_analise_sei)) pends.push({ texto: "Pendente Link SEI do Relatório de Análise na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temCert) pends.push({ texto: "Pendente Link SEI de Certidões na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (faltamRelTecAss) pends.push({ texto: `Falta colher assinaturas dos Fiscais no Relatório Técnico na Etapa 6 (obtido ${assRelTec.length}/3)`, critical: isEtapaAtual, etapa: 6 });
    if (exigeRelAna && faltamRelAnaAss) pends.push({ texto: "Falta colher assinatura do Fiscal no Relatório de Análise na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temAtest) pends.push({ texto: "Falta preencher o Valor Atestado na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temSolLib) pends.push({ texto: "Falta Link SEI da Solicitação de Liberação na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    faltamAss4.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 6`, critical: isEtapaAtual, etapa: 6 });
    });
    if (!temSefaz4) pends.push({ texto: "Pendente registro de data de envio à SEFAZ na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temSub) pends.push({ texto: "Falta Link SEI do Subempenho na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temProg) pends.push({ texto: "Falta Link SEI da Programação de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temCompr) pends.push({ texto: "Falta Link SEI do Comprovante de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temDtPag) pends.push({ texto: "Falta preencher a Data de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
  }

  // Etapa 7: Anulação (opcional). Nunca por competência filha — a anulação do
  // empenho é feita uma única vez no processo pai, sobre o valor total.
  const precisaAnular = s6 && anular > 0 && !l.parent_id;
  if (precisaAnular) {
    const temSolAnul = linkValido(l.link_solicitacao_anulacao);
    const temAnulSei = linkValido(l.link_anulacao_sei);
    const assEtapa5 = assinaturas.filter((a) => a.bloco === "etapa5");
    const faltamAss5: string[] = [];
    slotsE1.forEach((s) => {
      const ok = assEtapa5.some((a) => a.slot === s.key);
      if (!ok) faltamAss5.push(s.label);
    });
    const temSefaz5 = !!l.sefaz_etapa5_em;

    const s7 = temSolAnul && temAnulSei && faltamAss5.length === 0 && temSefaz5;
    if (!s7) {
      const isEtapaAtual = s1 && s2 && s3 && s4 && s5 && s6;
      if (!temSolAnul) pends.push({ texto: "Falta Link SEI da Solicitação de Anulação na Etapa 7", critical: isEtapaAtual, etapa: 7 });
      if (!temAnulSei) pends.push({ texto: "Falta Link SEI da Nota de Anulação (Aviso de Movimento) na Etapa 7", critical: isEtapaAtual, etapa: 7 });
      faltamAss5.forEach((label) => {
        pends.push({ texto: `Falta assinatura do ${label} na Etapa 7`, critical: isEtapaAtual, etapa: 7 });
      });
      if (!temSefaz5) pends.push({ texto: "Pendente registro de data de envio à SEFAZ da Anulação na Etapa 7", critical: isEtapaAtual, etapa: 7 });
    }
  }

  return pends;
}
