export const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  nota_tecnica: "Nota Técnica",
  solicitacao_anulacao: "Solicitação de Anulação",
  anulacao_executada: "Anulação Executada",
};

export const statusAcoLabel: Record<string, string> = {
  aguardando_indicacao: "Aguardando Indicação",
  aguardando_descontingenciamento: "Aguardando Descontingenciamento",
  orcamento_disponivel: "Orçamento Disponível",
  empenhado: "Empenhado",
};
