import { linkValido } from "./sei";

/** Status do orçamento (UFI) efetivo — derivado dos dados, com bumps automáticos. Campo legado: status_aco. */
export function statusAcoEfetivo(l: any): string {
  if (l.numero_empenho && linkValido(l.link_empenho_sei)) return "empenhado";
  if (l.dotacao_orcamentaria && l.fonte_pagamento) return "orcamento_disponivel";
  return l.status_aco || "aguardando_indicacao";
}

/** Rótulo da etapa atual, derivado dos dados (coarse, para listas/dashboard).
 *  Retorna a ÚLTIMA etapa que possui pelo menos um dado preenchido —
 *  funciona também no Modo Retroativo, sem depender da sequência estar completa. */
export function etapaCorrenteLabel(l: any): string {
  if (l.concluido) return "Concluído";
  // Etapa 7 — Anulação de Empenho
  if (l.link_solicitacao_anulacao || l.link_anulacao_sei || l.sefaz_etapa5_em) return "Anulação de Empenho";
  // Etapa 6 — Liberação de Recurso (qualquer artefato)
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
    l.data_pagamento
  ) return "Liberação de Recurso";
  // Etapa 5 — Liberação de Orçamento
  if (l.numero_empenho || linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
  // Etapa 4 — Assinaturas / envio da solicitação
  if (l.sefaz_etapa1_em) return "Assinaturas e Envio";
  // Etapa 1 — Análise de Orçamento
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

/** Em atraso: competência passada não concluída, ou competência atual além do dia limite. */
export function emAtraso(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
  // Se for um processo pai com múltiplas competências e já com empenho (ou seja, filhos criados),
  // o atraso deve ser controlado individualmente nos filhos, não no pai.
  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!l.parent_id && comps.length > 1 && l.numero_empenho && linkValido(l.link_empenho_sei)) {
    return false;
  }
  const fim = Number(convenio?.dia_fim_execucao ?? 0);
  const c = primeiraCompetencia(l.competencia);
  const ny = hoje.getFullYear();
  const nm = hoje.getMonth() + 1;
  if (c) {
    if (c.ano < ny || (c.ano === ny && c.mes < nm)) return true; // competência passada e não concluída
    if (c.ano === ny && c.mes === nm) return fim ? hoje.getDate() > fim : false;
    return false; // competência futura
  }
  return fim ? hoje.getDate() > fim : false;
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

/** Vencendo em breve: dentro de ~2 dias do limite do prazo. */
export function vencendoEmBreve(l: any, convenio: any): boolean {
  if (l.concluido) return false;
  const fim = Number(convenio?.dia_fim_execucao ?? 0);
  if (!fim) return false;
  const hoje = new Date().getDate();
  return hoje <= fim && fim - hoje <= 2;
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
