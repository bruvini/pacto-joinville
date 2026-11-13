/** Chave do número SEI para um campo de link de documento no lançamento. */
export function numeroSeiDeLink(campo: string): string {
  if (!/^link_[a-z_]+$/.test(campo)) {
    throw new Error("Campo de documento SEI desconhecido.");
  }
  const documento = campo.slice(5).replace(/_sei$/, "");
  return `numero_sei_${documento}`;
}

export const linksSeiLancamento = [
  "link_solicitacao_sei",
  "link_empenho_sei",
  "link_relatorio_tecnico_sei",
  "link_relatorio_analise_sei",
  "link_certidoes_sei",
  "link_solicitacao_liberacao_sei",
  "link_subempenho_sei",
  "link_programacao_pagamento_sei",
  "link_comprovante_pagamento_sei",
  "link_solicitacao_anulacao",
  "link_anulacao_sei",
  "link_minuta_sei",
  "link_memorando_sei",
  "link_portaria_sei",
  "link_solicitacao_liquidacao_sei",
  "link_aviso_liquidacao_sei",
] as const;

/** Inclui os números no mesmo UPDATE que já grava os links SEI. */
export function numerosSeiLancamento(lancamento: Record<string, unknown>): Record<string, string | null> {
  return Object.fromEntries(linksSeiLancamento.map((link) => {
    const campo = numeroSeiDeLink(link);
    return [campo, String(lancamento[campo] ?? "").trim() || null];
  }));
}
