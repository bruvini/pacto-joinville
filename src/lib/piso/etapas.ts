/** Etapas do módulo Piso da Enfermagem (processo-mãe: competência mensal). */
export const PISO_ETAPAS = [
  {
    n: 1,
    titulo: "Preparar a competência",
    desc: "Coleta, auditoria das cargas e atualização no InvestSUS",
  },
  { n: 2, titulo: "Auditar e conciliar", desc: "Saída do InvestSUS e Portaria GM/MS" },
  { n: 3, titulo: "Portaria municipal", desc: "Construção, Memorando e publicação" },
  { n: 4, titulo: "Confirmar o recurso", desc: "Crédito recebido no FMS" },
  { n: 5, titulo: "Empenho / liquidação", desc: "Obrigações, Solicitação de NE e Nota de Empenho" },
  {
    n: 6,
    titulo: "e-Pública",
    desc: "Solicitação de Subempenho/Liquidação e Avisos de Movimento",
  },
  { n: 7, titulo: "Pagamento", desc: "Programação e comprovante" },
  {
    n: 8,
    titulo: "Notificação por e-mail",
    desc: "Comunicação do pagamento às instituições e registro do processo SEI",
  },
  { n: 9, titulo: "Encerramento", desc: "Resumo e encerramento da competência" },
] as const;

export type EtapasConcluidas = Record<string, boolean>;

/** Etapa atual = primeira não concluída (ou 9 se todas concluídas). */
export function etapaAtualPiso(concluidas: EtapasConcluidas | null | undefined): number {
  for (const e of PISO_ETAPAS) if (!concluidas?.[String(e.n)]) return e.n;
  return 9;
}

/**
 * As etapas 7 (Pagamento) e 8 (Notificação por e-mail) são liberadas em paralelo
 * quando as etapas 1–6 estiverem concluídas e sem reconferência pendente.
 */
export function etapasOperacionaisLiberadasPiso(
  concluidas: EtapasConcluidas | null | undefined,
  reconferir: number[] | null | undefined = [],
): { pagamento: boolean; notificacao: boolean } {
  const bloqueios = new Set(reconferir ?? []);
  const baseConcluida = [1, 2, 3, 4, 5, 6].every(
    (n) => Boolean(concluidas?.[String(n)]) && !bloqueios.has(n),
  );
  return { pagamento: baseConcluida, notificacao: baseConcluida };
}

export function etapaLiberadaPiso(
  n: number,
  concluidas: EtapasConcluidas | null | undefined,
  reconferir: number[] | null | undefined = [],
): boolean {
  if (n < 1 || n > 9) return false;
  if (concluidas?.[String(n)] || (reconferir ?? []).includes(n)) return true;
  if (n === 1) return true;

  const paralelas = etapasOperacionaisLiberadasPiso(concluidas, reconferir);
  if (n === 7) return paralelas.pagamento;
  if (n === 8) return paralelas.notificacao;

  return n === etapaAtualPiso(concluidas);
}

export const STATUS_COMPETENCIA: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  encerrada: "Encerrada",
};

export const SITUACAO_PARTICIPANTE: Record<string, string> = {
  aguardando_envio: "Aguardando envio",
  enviado: "Aguardando retorno",
  retornado: "Retornado",
  sem_elegiveis: "Retorno sem elegíveis",
};

/** Valida competência MM/AAAA. */
export function competenciaValida(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12 && Number(m[2]) >= 2020;
}
