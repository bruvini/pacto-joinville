export const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Moeda compacta para eixos de gráfico: R$ 1,2 mi / R$ 350 mil. */
export const brlCompact = (n: number | null | undefined) => {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return brl(v);
};

export const dateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const dateOnly = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR");
};

export const etapaLabel: Record<string, string> = {
  solicitacao_empenho: "Solicitação de Empenho",
  nota_empenho: "Nota de Empenho",
  solicitacao_anulacao: "Solicitação de Anulação",
  anulacao_executada: "Anulação Executada",
};

export const statusAcoLabel: Record<string, string> = {
  aguardando_indicacao: "Aguardando Indicação",
  aguardando_descontingenciamento: "Aguardando Descontingenciamento",
  orcamento_disponivel: "Orçamento Disponível",
  empenhado: "Empenhado",
};
