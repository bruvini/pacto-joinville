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

/** Em atraso: passou do dia limite do prazo do convênio e não concluído. */
export function emAtraso(l: any, convenio: any): boolean {
  if (l.concluido) return false;
  const fim = Number(convenio?.dia_fim_execucao ?? 0);
  if (!fim) return false;
  return new Date().getDate() > fim;
}

/** Vencendo em breve: dentro de ~2 dias do limite do prazo. */
export function vencendoEmBreve(l: any, convenio: any): boolean {
  if (l.concluido) return false;
  const fim = Number(convenio?.dia_fim_execucao ?? 0);
  if (!fim) return false;
  const hoje = new Date().getDate();
  return hoje <= fim && fim - hoje <= 2;
}
