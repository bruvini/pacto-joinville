import { linkValido } from "./sei";

/** Status do orçamento (UFI) efetivo — derivado dos dados, com bumps automáticos. Campo legado: status_aco. */
export function statusAcoEfetivo(l: any): string {
  if (l.numero_empenho && linkValido(l.link_empenho_sei)) return "empenhado";
  if (l.dotacao_orcamentaria && l.fonte_pagamento) return "orcamento_disponivel";
  return l.status_aco || "aguardando_indicacao";
}

/** Rótulo da etapa atual, derivado dos dados (coarse, para listas/dashboard).
 *  Retorna a ÚLTIMA etapa que possui pelo menos um dado preenchido —
 *  funciona também no Modo Retroativo, sem depender da sequência estar completa.
 *
 *  Precedência Etapa 6 × Etapa 7: só saltamos para "Anulação de Empenho"
 *  quando todos os subpassos observáveis da Etapa 6 (relatório técnico,
 *  certidões, atestado, solicitação de liberação, envio à SEFAZ e
 *  acompanhamento com data de pagamento) estiverem preenchidos. Enquanto
 *  qualquer subpasso da 6 estiver pendente, o processo permanece rotulado
 *  como "Liberação de Recurso" — mesmo que o operador já tenha adiantado
 *  o link da Solicitação de Anulação. */
export function etapaCorrenteLabel(l: any): string {
  if (l.concluido) return "Concluído";

  // Fluxo 2 (Liquidação Direta): sem etapa de anulação. A Etapa 6 é a
  // "Liquidação de Despesa" e é a última fase antes da conclusão.
  const fluxo2 = l.convenios?.modelo_fluxo === "fluxo_2" || l.modelo_fluxo === "fluxo_2";
  if (fluxo2) {
    if (
      linkValido(l.link_minuta_sei) || linkValido(l.link_memorando_sei) ||
      linkValido(l.link_portaria_sei) || linkValido(l.link_solicitacao_liquidacao_sei) ||
      Number(l.valor_liquidado ?? 0) > 0 || linkValido(l.link_aviso_liquidacao_sei) ||
      linkValido(l.link_subempenho_sei) || linkValido(l.link_programacao_pagamento_sei) ||
      linkValido(l.link_comprovante_pagamento_sei) || l.data_pagamento
    ) return "Liquidação de Despesa";
    if (l.numero_empenho || linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
    if (l.sefaz_etapa1_em) return "Assinaturas e Envio";
    if (l.dotacao_orcamentaria || l.fonte_pagamento) return "Análise de Orçamento";
    return "Solicitação de Empenho";
  }

  const etapa6Completa =
    linkValido(l.link_relatorio_tecnico_sei) &&
    linkValido(l.link_certidoes_sei) &&
    Number(l.valor_atestado ?? 0) > 0 &&
    linkValido(l.link_solicitacao_liberacao_sei) &&
    !!l.sefaz_etapa4_em &&
    linkValido(l.link_subempenho_sei) &&
    linkValido(l.link_programacao_pagamento_sei) &&
    linkValido(l.link_comprovante_pagamento_sei) &&
    !!l.data_pagamento;

  if (etapa6Completa && (l.link_solicitacao_anulacao || l.link_anulacao_sei || l.sefaz_etapa5_em)) {
    return "Anulação de Empenho";
  }
  if (
    Number(l.valor_atestado ?? 0) > 0 ||
    l.sefaz_etapa4_em ||
    l.link_relatorio_tecnico_sei ||
    l.link_relatorio_analise_sei ||
    l.link_certidoes_sei ||
    l.link_solicitacao_liberacao_sei ||
    l.link_subempenho_sei ||
    l.link_programacao_pagamento_sei ||
    l.link_comprovante_pagamento_sei ||
    l.data_pagamento ||
    l.link_solicitacao_anulacao ||
    l.link_anulacao_sei ||
    l.sefaz_etapa5_em
  ) return "Liberação de Recurso";
  if (l.numero_empenho || linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
  if (l.sefaz_etapa1_em) return "Assinaturas e Envio";
  if (l.dotacao_orcamentaria || l.fonte_pagamento) return "Análise de Orçamento";
  return "Solicitação de Empenho";
}

/** Versão explícita para uso no Modo Retroativo — hoje idêntica à `etapaCorrenteLabel`,
 *  mantida como API estável para chamadas condicionadas a `sistema_config.modo_retroativo`. */
export function etapaCorrenteLabelRetro(l: any): string {
  return etapaCorrenteLabel(l);
}

export const ETAPA_LABELS = [
  "Solicitação de Empenho",
  "Análise de Orçamento",
  "Assinaturas e Envio",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Anulação de Empenho",
  "Concluído",
];

/** Ordem canônica das colunas da Esteira do Processo (Dashboard). */
export const ETAPA_PIPELINE: { slug: string; label: string; curto: string }[] = [
  { slug: "solicitacao",       label: "Solicitação de Empenho",   curto: "Solicitação" },
  { slug: "analise_orcamento", label: "Análise de Orçamento",     curto: "Análise" },
  { slug: "assinaturas",       label: "Assinaturas e Envio",      curto: "Assinaturas" },
  { slug: "liberacao_orc",     label: "Liberação de Orçamento",   curto: "Lib. Orçamento" },
  { slug: "liberacao_rec",     label: "Liberação de Recurso",     curto: "Lib. Recurso" },
  { slug: "anulacao",          label: "Anulação de Empenho",      curto: "Anulação" },
  { slug: "concluido",         label: "Concluído",                curto: "Concluídos" },
];


/** Primeira competência (MM/AAAA) do lançamento como {mes, ano}. */
export function primeiraCompetencia(comp: string | null): { mes: number; ano: number } | null {
  const m = (comp ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? { mes: Number(m[1]), ano: Number(m[2]) } : null;
}

// =====================================================================
// CRONÔMETROS DESACOPLADOS POR FASE
// A rotina real é: empenho ANTECIPADO (etapas 1–5) e apuração/pagamento
// POSTERIOR (etapa 6), em meses diferentes. Cada fase tem o SEU relógio — a
// incompletude da etapa 6 nunca "atrasa" a etapa 5, e vice-versa.
//
// Exemplo (competência de referência 05/2026):
//  A) Empenho (1–5): monitorado a partir de 04/2026 (respeitando dia_inicio);
//     ideal concluir dentro de 05/2026. Vira CRÍTICO se 06/2026 chegar sem empenho.
//  B) Pagamento (6): NÃO cobra em 04–05/2026 (produção ainda aberta). A cobrança
//     abre em 01/06/2026; prazo fatal = 5º dia útil de 07/2026 (M+2).
//  C) Anulação (7): janela ideal de 15 dias corridos após a Data do Pagamento.
// =====================================================================

const empenhoConcluido = (l: any) => !!l.numero_empenho && linkValido(l.link_empenho_sei);
const etapa6Concluida = (l: any) => !!l.concluido || linkValido(l.link_comprovante_pagamento_sei);
const precisaAnular = (l: any) =>
  Number(l.valor_solicitado ?? 0) > 0 && Number(l.valor_atestado ?? 0) > 0 && Number(l.valor_solicitado) > Number(l.valor_atestado);
const anulacaoConcluida = (l: any) => linkValido(l.link_anulacao_sei);

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasCorridos = (de: Date, ate: Date) => Math.floor((soData(ate).getTime() - soData(de).getTime()) / 86400000);
const fimDoMes = (ano: number, mes: number) => new Date(ano, mes, 0); // mes 1-12 → último dia
const idxMes = (ano: number, mes: number) => ano * 12 + (mes - 1);
const nomeMesAno = (ano: number, mes: number) => `${String(mes).padStart(2, "0")}/${ano}`;

/** N-ésimo dia útil (segunda a sexta; sem feriados) de um mês (mes 1-12). */
export function nthDiaUtil(ano: number, mes: number, n: number): Date {
  const d = new Date(ano, mes - 1, 1);
  let uteis = 0;
  while (d.getMonth() === mes - 1) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) { uteis += 1; if (uteis === n) return new Date(d); }
    d.setDate(d.getDate() + 1);
  }
  return fimDoMes(ano, mes); // fallback: mês sem n dias úteis
}

/** Etapa vigente (1–5) da fase de empenho + rótulo, derivada dos campos. */
export function etapaEmpenhoAtual(l: any): { num: number; nome: string } {
  if (!l.dotacao_orcamentaria || !l.fonte_pagamento) return { num: 1, nome: "Análise de Orçamento" };
  if (!(Number(l.valor_solicitado ?? 0) > 0) || !linkValido(l.link_solicitacao_sei) || !l.em_bloco_revisao) return { num: 2, nome: "Solicitação de Empenho" };
  if (l.revisao_status !== "aprovado") return { num: 3, nome: "Revisão da Coordenação" };
  if (!l.sefaz_etapa1_em) return { num: 4, nome: "Assinaturas e Envio" };
  return { num: 5, nome: "Liberação de Orçamento (Empenho)" };
}

export type FasePrazo = "empenho" | "pagamento" | "anulacao" | "concluido";
export type NivelPrazo = "ok" | "preventivo" | "alerta" | "critico" | "neutro";
export type StatusPrazo = {
  fase: FasePrazo;
  nivel: NivelPrazo;
  prazo: Date | null;
  dias: number | null; // dias corridos até o prazo: >0 faltam, 0 hoje, <0 vencido
  motivo: string;
};

/**
 * Motor de prazos por fase (Cronômetros A/B/C). Retorna a FASE ATIVA do
 * lançamento e o nível de urgência do relógio DELA — nunca mistura fases.
 */
export function statusPrazoLancamento(l: any, convenio: any, hoje: Date = new Date()): StatusPrazo {
  if (l.concluido) return { fase: "concluido", nivel: "ok", prazo: null, dias: null, motivo: "Processo concluído" };
  const c = primeiraCompetencia(l.competencia);

  // Pagamentos complementares / sem competência válida: fora do calendário de aging.
  if (convenio?.pagamento_pontual || !c) {
    const fase: FasePrazo = !empenhoConcluido(l) ? "empenho" : !etapa6Concluida(l) ? "pagamento" : "concluido";
    return { fase, nivel: "neutro", prazo: null, dias: null, motivo: "Pagamento complementar — sem prazo cronológico" };
  }
  const compRef = nomeMesAno(c.ano, c.mes);
  const mHoje = idxMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const mComp = idxMes(c.ano, c.mes);

  // ---- CRONÔMETRO A · Empenho (etapas 1–5) ----
  if (!empenhoConcluido(l)) {
    const et = etapaEmpenhoAtual(l);
    const prazo = fimDoMes(c.ano, c.mes); // ideal: concluir dentro do mês da competência
    if (mHoje > mComp) {
      return { fase: "empenho", nivel: "critico", prazo, dias: diasCorridos(hoje, prazo), motivo: `Empenho da competência ${compRef} em atraso na Etapa ${et.num} (${et.nome})` };
    }
    if (mHoje === mComp) {
      const fim = Number(convenio?.dia_fim_execucao ?? 0);
      const limite = fim ? new Date(c.ano, c.mes - 1, fim) : prazo;
      const dias = diasCorridos(hoje, limite);
      if (dias < 0) return { fase: "empenho", nivel: "alerta", prazo: limite, dias, motivo: `Empenho da competência ${compRef} passou do dia limite — conclua a Etapa ${et.num} (${et.nome})` };
      if (dias <= 3) return { fase: "empenho", nivel: "alerta", prazo: limite, dias, motivo: `Empenho da competência ${compRef} vence em ${dias}d — Etapa ${et.num} (${et.nome})` };
      return { fase: "empenho", nivel: "preventivo", prazo: limite, dias, motivo: `Empenho da competência ${compRef} em andamento — Etapa ${et.num} (${et.nome})` };
    }
    // mHoje < mComp: janela de monitoramento (mês anterior) ou antes
    const ini = Number(convenio?.dia_inicio_execucao ?? 0);
    if (mHoje === mComp - 1 && ini && hoje.getDate() >= ini) {
      return { fase: "empenho", nivel: "preventivo", prazo, dias: diasCorridos(hoje, prazo), motivo: `Inicie o empenho da competência ${compRef} — Etapa ${et.num} (${et.nome})` };
    }
    return { fase: "empenho", nivel: "ok", prazo, dias: diasCorridos(hoje, prazo), motivo: `Empenho da competência ${compRef} dentro do prazo` };
  }

  // ---- CRONÔMETRO B · Atesto e Pagamento (etapa 6) ----
  if (!etapa6Concluida(l)) {
    const abertura = new Date(c.ano, c.mes, 1); // dia 1 do mês seguinte (M+1)
    const iM2 = mComp + 2;
    const anoM2 = Math.floor(iM2 / 12);
    const mesM2 = (iM2 % 12) + 1;
    const prazo = nthDiaUtil(anoM2, mesM2, 5); // 5º dia útil de M+2
    const alvo = nomeMesAno(anoM2, mesM2);
    if (soData(hoje) < soData(abertura)) {
      // Bloqueio temporal preventivo: a produção do mês ainda não fechou — sem cobrança.
      return { fase: "pagamento", nivel: "neutro", prazo, dias: diasCorridos(hoje, prazo), motivo: `Atesto da competência ${compRef} inicia em 01/${nomeMesAno(abertura.getFullYear(), abertura.getMonth() + 1)}` };
    }
    const dias = diasCorridos(hoje, prazo);
    if (dias < 0) return { fase: "pagamento", nivel: "critico", prazo, dias, motivo: `Pagamento da competência ${compRef} em atraso — passou do 5º dia útil de ${alvo}` };
    if (dias <= 2) return { fase: "pagamento", nivel: "alerta", prazo, dias, motivo: `Pagamento da competência ${compRef} vence em ${dias}d — 5º dia útil de ${alvo}` };
    return { fase: "pagamento", nivel: "preventivo", prazo, dias, motivo: `Apurar e pagar a competência ${compRef} até o 5º dia útil de ${alvo}` };
  }

  // ---- CRONÔMETRO C · Anulação (etapa 7) ----
  if (precisaAnular(l) && !anulacaoConcluida(l)) {
    if (l.data_pagamento) {
      const base = new Date(`${String(l.data_pagamento).slice(0, 10)}T12:00:00`);
      const prazo = new Date(base); prazo.setDate(prazo.getDate() + 15);
      const dias = diasCorridos(hoje, prazo);
      if (dias < 0) return { fase: "anulacao", nivel: "alerta", prazo, dias, motivo: `Anulação da competência ${compRef} sugerida — passou de 15d após o pagamento` };
      return { fase: "anulacao", nivel: "preventivo", prazo, dias, motivo: `Anular saldo da competência ${compRef} — janela ideal de 15d (faltam ${dias}d)` };
    }
    return { fase: "anulacao", nivel: "preventivo", prazo: null, dias: null, motivo: `Anular saldo da competência ${compRef}` };
  }

  return { fase: "concluido", nivel: "ok", prazo: null, dias: null, motivo: "Aguardando conclusão formal" };
}

/** Motivo textual da pendência/atraso da fase ativa (para Aging/alertas). */
export function motivoPrazoLancamento(l: any, convenio: any, hoje: Date = new Date()): string {
  return statusPrazoLancamento(l, convenio, hoje).motivo;
}

/** Em atraso (crítico): o relógio da FASE ATIVA estourou. */
export function emAtraso(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
  // Pai com múltiplas competências e empenho já feito: o atraso é controlado nos filhos.
  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!l.parent_id && comps.length > 1 && empenhoConcluido(l)) return false;
  return statusPrazoLancamento(l, convenio, hoje).nivel === "critico";
}

/** Completude do contrato: parcelas esperadas até hoje (exclui o 1º mês) vs concluídas. */
export function completudeConvenio(conv: any, lancs: any[], hoje: Date = new Date()) {
  const total = Number(conv.total_parcelas ?? 0);
  // "T12:00:00" evita o deslize de fuso: data-só (YYYY-MM-DD) é parseada como UTC
  // e viraria o dia anterior no horário de Brasília (ex.: dia 1º contava no mês anterior).
  const vig = conv.data_inicio_vigencia ? new Date(`${String(conv.data_inicio_vigencia).slice(0, 10)}T12:00:00`) : null;
  const monthsDiff = vig ? Math.max(0, (hoje.getFullYear() - vig.getFullYear()) * 12 + (hoje.getMonth() - vig.getMonth())) : 0;
  const esperadas = Math.min(total, monthsDiff);
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const ls = lancs.filter((l) => l.convenio_id === conv.id && !idsComFilhos.has(l.id));
  const concluidas = ls.filter((l) => l.concluido && Number(l.parcela) >= 1 && Number(l.parcela) <= esperadas).length;
  const taxa = esperadas > 0 ? Math.round((concluidas / esperadas) * 100) : null;
  return { total, esperadas, concluidas, taxa };
}

/** Lista de parcelas (1..total) com status: sem | andamento | concluido. */
export function statusParcelas(conv: any, lancs: any[]) {
  const total = Number(conv.total_parcelas ?? 0);
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const ls = lancs.filter((l) => l.convenio_id === conv.id && !idsComFilhos.has(l.id));
  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const p = ls.filter((l) => {
      const parts = String(l.parcela ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return parts.includes(String(num));
    });
    if (p.length === 0) return { num, status: "sem" as const, etapa: "" };
    if (p.some((l) => l.concluido)) return { num, status: "concluido" as const, etapa: "" };
    return { num, status: "andamento" as const, etapa: etapaCorrenteLabel(p[0]) };
  });
}

/** Alerta de situação da competência atual por convênio (Fase 6). */
export function statusCompetencia(conv: any, lancs: any[], hoje: Date = new Date()): { nivel: "ok" | "info" | "alerta" | "grave"; titulo: string; msg: string } | null {
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const compAtual = `${mm}/${hoje.getFullYear()}`;
  const dia = hoje.getDate();
  const ini = Number(conv.dia_inicio_execucao ?? 0);
  const fim = Number(conv.dia_fim_execucao ?? 0);
  const titulo = `${conv._nome ?? "Convênio"}${conv.objeto ? ` · ${conv.objeto}` : ""}`;
  
  // Filtra fora os lançamentos pai que possuem filhos na lista (pois a análise de atraso/andamento de cada competência
  // individual deve ocorrer nos filhos).
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const lancsFiltrados = lancs.filter(l => !idsComFilhos.has(l.id));

  const doMes = lancsFiltrados.filter((l) => l.convenio_id === conv.id && (l.competencia ?? "").includes(compAtual));
  if (doMes.length > 0) {
    if (doMes.every((l) => l.concluido)) return { nivel: "ok", titulo, msg: `Processo de ${compAtual} concluído. Parabéns!` };
    if (fim && dia > fim) return { nivel: "grave", titulo, msg: `Processo de ${compAtual} pendente e fora do prazo (limite dia ${fim}).` };
    if (fim && dia >= ini) return { nivel: "alerta", titulo, msg: `Processo de ${compAtual} em andamento — faltam ${fim - dia} dia(s) para o prazo.` };
    return { nivel: "alerta", titulo, msg: `Processo de ${compAtual} em andamento.` };
  }
  // Sem lançamento na competência atual
  if (ini && dia < ini) {
    const faltam = ini - dia;
    if (faltam <= 7) return { nivel: "info", titulo, msg: `Faltam ${faltam} dia(s) para iniciar o processo de ${compAtual} (começa dia ${ini}). Comece com antecedência.` };
    return null;
  }
  if (fim && dia > fim) return { nivel: "grave", titulo, msg: `Nada lançado para ${compAtual} e já passou do prazo (limite dia ${fim}).` };
  if (ini && dia >= ini) return { nivel: "alerta", titulo, msg: `Já deveríamos estar realizando o processo de ${compAtual} (iniciou dia ${ini}).` };
  return null;
}

/** Vencendo em breve (alerta): o relógio da fase ativa está próximo do limite. */
export function vencendoEmBreve(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
  return statusPrazoLancamento(l, convenio, hoje).nivel === "alerta";
}

/** Status efetivo do convênio calculando expiração de vigência de forma dinâmica. */
export function statusConvenioEfetivo(c: any, hoje: Date = new Date()): "ativo" | "suspenso" | "encerrado" {
  if (!c) return "ativo";
  if (c.status_convenio === "encerrado" || c.status_convenio === "suspenso") {
    return c.status_convenio;
  }
  if (c.pagamento_pontual) {
    return "ativo";
  }
  if (c.data_inicio_vigencia && c.total_parcelas) {
    const inicio = new Date(c.data_inicio_vigencia + "T12:00:00");
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + Number(c.total_parcelas));
    if (hoje > fim) {
      return "encerrado";
    }
  }
  return "ativo";
}
