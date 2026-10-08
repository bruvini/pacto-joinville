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
  // PVH: prazo imutável calculado na transação de encerramento.
  if (l.origem_prestacao === "pvh") {
    if (!l.pvh_data_limite) return null;
    const [ano, mes, dia] = String(l.pvh_data_limite).slice(0, 10).split("-").map(Number);
    return ano && mes && dia ? new Date(ano, mes - 1, dia) : null;
  }
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

// =====================================================================
// Esteira da Prestação de Contas (espelha o pipeline manual da equipe).
// A etapa corrente é DERIVADA dos dados (último marco preenchido) — mesma
// filosofia de `etapaCorrenteLabel` (src/lib/etapa.ts): robusta e compatível
// com preenchimento retroativo, sem depender de uma sequência perfeita.
// =====================================================================

export type EtapaPcSlug =
  | "recebimento" | "analise" | "diligencia" | "parecer_ses" | "cgm" | "baixa_contabil" | "encerrada";

/** Ordem canônica das etapas da esteira de PC (para stepper/indicadores). */
export const ESTEIRA_PC: { slug: EtapaPcSlug; label: string; curto: string }[] = [
  { slug: "recebimento",    label: "Recebimento",        curto: "Recebimento" },
  { slug: "analise",        label: "Análise",            curto: "Análise" },
  { slug: "diligencia",     label: "Diligências (Entidade)", curto: "Diligências" },
  { slug: "parecer_ses",    label: "Parecer Técnico (SES)",  curto: "Parecer SES" },
  { slug: "cgm",            label: "Controladoria (CGM)",    curto: "CGM" },
  { slug: "baixa_contabil", label: "Baixa Contábil",     curto: "Baixa" },
  { slug: "encerrada",      label: "Encerrada",          curto: "Encerrada" },
];

const IDX_PC: Record<EtapaPcSlug, number> = Object.fromEntries(ESTEIRA_PC.map((e, i) => [e.slug, i])) as any;

const preenchido = (v: any) => v !== null && v !== undefined && v !== "";

/**
 * Etapa corrente da esteira de PC, derivada do último marco com dado.
 * `pc` é o registro de prestacoes_contas (ou null se ainda não iniciado).
 */
export function etapaPrestacao(pc: any | null): { slug: EtapaPcSlug; label: string; idx: number } {
  const at = (slug: EtapaPcSlug) => ({ slug, label: ESTEIRA_PC[IDX_PC[slug]].label, idx: IDX_PC[slug] });
  if (!pc) return at("recebimento");
  if (pc.status === "aprovada" || pc.status === "reprovada") return at("encerrada");
  if (preenchido(pc.data_baixa_contabil) || preenchido(pc.situacao_baixa)) return at("baixa_contabil");
  if (preenchido(pc.data_enc_cgm) || preenchido(pc.data_retorno_cgm) || preenchido(pc.link_manifestacao_cgm_sei) || preenchido(pc.status_cgm)) return at("cgm");
  if (preenchido(pc.link_parecer_ses_sei) || preenchido(pc.data_parecer_ses)) return at("parecer_ses");
  if (preenchido(pc.link_relatorio_analise_sei) || preenchido(pc.data_envio_entidade) || preenchido(pc.data_retorno_entidade)) return at("diligencia");
  // Avanço para Análise exige a DATA DE RECEBIMENTO (nº do processo/link SEI sozinhos não avançam).
  if (preenchido(pc.data_recebimento) || pc.status === "recebida") return at("analise");
  return at("recebimento");
}

/** Rótulo macro da situação (espelha a coluna "Status" da planilha). */
export function statusMacroPrestacao(pc: any | null): string {
  const { slug } = etapaPrestacao(pc);
  switch (slug) {
    case "recebimento": return "Aguardando recebimento";
    case "analise": return "Em análise";
    case "diligencia":
      return preenchido(pc?.data_envio_entidade) && !preenchido(pc?.data_retorno_entidade)
        ? "Aguarda retorno — Entidade" : "Reanálise";
    case "parecer_ses": return "Parecer Técnico (SES)";
    case "cgm":
      return preenchido(pc?.data_enc_cgm) && !preenchido(pc?.data_retorno_cgm)
        ? "Aguarda retorno — CGM" : "Manifestação CGM";
    case "baixa_contabil": return "Baixa contábil";
    case "encerrada": return pc?.status === "reprovada" ? "Encerrada — reprovada" : "Encerrada — aprovada";
  }
}

export const STATUS_CGM_LABEL: Record<string, string> = {
  regular: "Regular",
  regular_ressalvas: "Regular com ressalvas",
  diligencias: "Diligências",
  irregular: "Irregular",
};
