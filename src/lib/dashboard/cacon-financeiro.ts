/** Métricas do CACON: somente produção realmente conferida. */
export type CompetenciaFinanceiraCacon = {
  competencia: string;
  status?: string | null;
  valor_fornecido?: number | string | null;
  extracao?: { confirmada_em?: string | null; status?: string | null } | null;
};

export function valorAuditadoCacon(c: CompetenciaFinanceiraCacon): number | null {
  // Uma competência aberta não pode entrar como produção auditada só porque
  // um valor provisório foi preenchido. Zero explícito é válido.
  const confirmada = c.status === "concluida" ||
    Boolean(c.extracao?.confirmada_em) || c.extracao?.status === "confirmada";
  if (!confirmada || c.valor_fornecido == null) return null;
  const valor = Number(c.valor_fornecido);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100) / 100;
}

export function resumirProducaoCacon(competencias: CompetenciaFinanceiraCacon[]) {
  const valores = competencias
    .map(valorAuditadoCacon)
    .filter((valor): valor is number => valor !== null);
  const centavos = valores.reduce((s, valor) => s + Math.round(valor * 100), 0);
  const totalAuditado = centavos / 100;
  return {
    totalAuditado,
    competenciasAuditadas: valores.length,
    mediaPorCompetenciaAuditada: valores.length ? totalAuditado / valores.length : 0,
  };
}
