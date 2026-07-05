import { linkValido } from "./sei";

/** Status ACO efetivo (derivado dos dados, com bumps automáticos). */
export function statusAcoEfetivo(l: any): string {
  if (l.numero_empenho && linkValido(l.link_empenho_sei)) return "empenhado";
  if (l.dotacao_orcamentaria && l.fonte_pagamento) return "orcamento_disponivel";
  return l.status_aco || "aguardando_indicacao";
}

/** Rótulo da etapa atual, derivado dos dados (coarse, para listas/dashboard). */
export function etapaCorrenteLabel(l: any): string {
  if (l.concluido || l.sefaz_etapa5_em) return "Concluído";
  if (Number(l.valor_atestado ?? 0) > 0 || l.sefaz_etapa4_em) return "Liberação de Recurso";
  if (l.numero_empenho && linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
  if (l.dotacao_orcamentaria && l.fonte_pagamento) return "Análise de Orçamento";
  return "Solicitação de Empenho";
}

export const ETAPA_LABELS = [
  "Solicitação de Empenho",
  "Análise de Orçamento",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Concluído",
];

/** Primeira competência (MM/AAAA) do lançamento como {mes, ano}. */
export function primeiraCompetencia(comp: string | null): { mes: number; ano: number } | null {
  const m = (comp ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? { mes: Number(m[1]), ano: Number(m[2]) } : null;
}

/** Em atraso: competência passada não concluída, ou competência atual além do dia limite. */
export function emAtraso(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
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
  const ls = lancs.filter((l) => l.convenio_id === conv.id);
  const concluidas = ls.filter((l) => l.concluido && Number(l.parcela) >= 1 && Number(l.parcela) <= esperadas).length;
  const taxa = esperadas > 0 ? Math.round((concluidas / esperadas) * 100) : null;
  return { total, esperadas, concluidas, taxa };
}

/** Lista de parcelas (1..total) com status: sem | andamento | concluido. */
export function statusParcelas(conv: any, lancs: any[]) {
  const total = Number(conv.total_parcelas ?? 0);
  const ls = lancs.filter((l) => l.convenio_id === conv.id);
  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const p = ls.filter((l) => String(l.parcela) === String(num));
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
  const doMes = lancs.filter((l) => l.convenio_id === conv.id && (l.competencia ?? "").includes(compAtual));
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
