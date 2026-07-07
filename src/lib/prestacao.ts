import { primeiraCompetencia } from "./etapa";
import { linkValido } from "./sei";

/** Pagamento liberado = comprovante de pagamento anexado ou processo concluído. */
export function pagamentoLiberado(l: any): boolean {
  return !!l.concluido || linkValido(l.link_comprovante_pagamento_sei);
}

/**
 * Prazo limite da prestação de contas: DATA DO PAGAMENTO + prazo (dias) do convênio.
 * Fallback (lançamentos antigos sem data de pagamento): fim do mês da competência + prazo.
 */
export function prazoLimitePrestacao(l: any, convenio: any): Date | null {
  let dias = Number(convenio?.prazo_prestacao_contas_dias ?? 0);
  if (!dias && convenio?.exige_prestacao_contas !== false) {
    dias = 30;
  }
  if (!dias) return null;
  let base: Date | null = null;
  if (l.data_pagamento) {
    const [y, m, d] = String(l.data_pagamento).slice(0, 10).split("-").map(Number);
    if (y && m && d) base = new Date(y, m - 1, d);
  }
  if (!base) {
    const c = primeiraCompetencia(l.competencia);
    if (!c) return null;
    base = new Date(c.ano, c.mes, 0); // último dia do mês da competência
  }
  const out = new Date(base);
  out.setDate(out.getDate() + dias);
  return out;
}

export type SituacaoPrestacao = {
  nivel: "ok" | "info" | "alerta" | "grave" | "neutro";
  label: string;
  prazo: Date | null;
  dias: number | null; // >0 faltam, <0 atrasada (dias corridos)
};

const diasEntre = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);

/**
 * Situação da prestação de contas de um lançamento pago.
 * `pc` é o registro de prestacoes_contas (ou null se ainda não criado).
 */
export function situacaoPrestacao(l: any, convenio: any, pc: any | null, hoje: Date = new Date()): SituacaoPrestacao {
  const prazo = prazoLimitePrestacao(l, convenio);
  const dias = prazo ? diasEntre(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), prazo) : null;
  const status = pc?.status ?? "aguardando";
  if (status === "aprovada") return { nivel: "ok", label: "Aprovada", prazo, dias };
  if (status === "reprovada") return { nivel: "grave", label: "Reprovada — com pendências", prazo, dias };
  if (status === "recebida") return { nivel: "info", label: "Recebida — em análise", prazo, dias };
  // Aguardando o prestador entregar
  if (!prazo) return { nivel: "neutro", label: "Aguardando (sem prazo cadastrado no convênio)", prazo, dias };
  if (dias !== null && dias < 0) return { nivel: "grave", label: `Atrasada há ${-dias} dia(s)`, prazo, dias };
  if (dias !== null && dias === 0) return { nivel: "alerta", label: "Vence Hoje", prazo, dias };
  if (dias !== null && dias <= 7) return { nivel: "alerta", label: `Vence em ${dias} dia(s)`, prazo, dias };
  return { nivel: "info", label: `No prazo — faltam ${dias} dia(s)`, prazo, dias };
}

export const STATUS_PRESTACAO_LABEL: Record<string, string> = {
  aguardando: "Aguardando prestador",
  recebida: "Recebida — em análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada — com pendências",
};
