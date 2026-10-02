/** Etapas do módulo Piso da Enfermagem (processo-mãe: competência mensal). */
export const PISO_ETAPAS = [
  { n: 1, titulo: "Preparar competência", desc: "Envio/retorno das instituições e Planilha de Carga" },
  { n: 2, titulo: "Portaria GM/MS", desc: "Auditoria InvestSUS e conciliação com a Portaria" },
  { n: 3, titulo: "Portaria municipal", desc: "Minuta, Memorando e Portaria publicada" },
  { n: 4, titulo: "Recurso", desc: "Crédito no FMS, saldo AFC e rateio" },
  { n: 5, titulo: "Empenho / liquidação", desc: "Obrigações, Solicitação de NE e Nota de Empenho" },
  { n: 6, titulo: "e-Pública", desc: "Subempenho/Liquidação e Aviso de Movimento" },
  { n: 7, titulo: "Pagamento", desc: "Programação e comprovante" },
  { n: 8, titulo: "Encerramento", desc: "Resumo e encerramento da competência" },
] as const;

export type EtapasConcluidas = Record<string, boolean>;

/** Etapa atual = primeira não concluída (ou 8 se todas concluídas). */
export function etapaAtualPiso(concluidas: EtapasConcluidas | null | undefined): number {
  for (const e of PISO_ETAPAS) if (!concluidas?.[String(e.n)]) return e.n;
  return 8;
}

export const STATUS_COMPETENCIA: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  encerrada: "Encerrada",
};

export const SITUACAO_PARTICIPANTE: Record<string, string> = {
  aguardando_envio: "Aguardando envio",
  enviado: "Enviado",
  retornado: "Retornado",
  sem_elegiveis: "Sem elegíveis",
};

/** Valida competência MM/AAAA. */
export function competenciaValida(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12 && Number(m[2]) >= 2020;
}
