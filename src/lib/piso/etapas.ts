/** Etapas do módulo Piso da Enfermagem (processo-mãe: parcela mensal ou 13ª anual). */
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
export type TipoFluxoPiso = "mensal" | "decimo_terceiro" | string | null | undefined;

export const ETAPAS_PISO_13 = [
  { n: 2, titulo: "Cálculo e Portaria Federal", desc: "Média anual por CNES conferida com a Portaria GM/MS específica da 13ª" },
  { n: 3, titulo: "Atos municipais", desc: "Minuta, Memorando e publicação da Portaria Municipal" },
  ...PISO_ETAPAS.filter((e) => e.n >= 4),
];

export function etapasVisiveisPiso(tipo: TipoFluxoPiso) {
  return tipo === "decimo_terceiro" ? ETAPAS_PISO_13 : PISO_ETAPAS;
}

export function numeroVisualEtapaPiso(n: number, tipo: TipoFluxoPiso) {
  return tipo === "decimo_terceiro" ? n - 1 : n;
}

export function etapaAplicavelPiso(n: number, tipo: TipoFluxoPiso) {
  return tipo !== "decimo_terceiro" || n >= 2;
}

/** Etapa atual = primeira não concluída (ou 9 se todas concluídas). */
export function etapaAtualPiso(
  concluidas: EtapasConcluidas | null | undefined,
  tipo?: TipoFluxoPiso,
): number {
  for (const e of etapasVisiveisPiso(tipo)) if (!concluidas?.[String(e.n)]) return e.n;
  return 9;
}

/**
 * Pagamento (7) e Notificação (8) abrem juntos após a etapa 6.
 * O fluxo orçamentário 5→6→(7,8) pode avançar independentemente
 * dos atos 1→2→3→4; ambos convergem apenas no encerramento 9.
 */
export function etapasOperacionaisLiberadasPiso(
  concluidas: EtapasConcluidas | null | undefined,
  reconferir: number[] | null | undefined = [],
  tipo?: TipoFluxoPiso,
): { pagamento: boolean; notificacao: boolean } {
  const bloqueios = new Set(reconferir ?? []);
  const liberada = Boolean(concluidas?.["6"]) && !bloqueios.has(6);
  return { pagamento: liberada, notificacao: liberada };
}

/** Dependências diretas; não inferir precedência pela posição visual da etapa. */
export function prerequisitosEtapaPiso(n: number, tipo?: TipoFluxoPiso): number[] {
  const decimoTerceiro = tipo === "decimo_terceiro";
  if (n === 1 || n === 5) return [];
  if (n === 2) return decimoTerceiro ? [] : [1];
  if (n === 3) return [2];
  if (n === 4) return [3];
  if (n === 6) return [5];
  if (n === 7 || n === 8) return [6];
  if (n === 9) return decimoTerceiro
    ? [2, 3, 4, 5, 6, 7, 8]
    : [1, 2, 3, 4, 5, 6, 7, 8];
  return [];
}

export function etapaLiberadaPiso(
  n: number,
  concluidas: EtapasConcluidas | null | undefined,
  reconferir: number[] | null | undefined = [],
  tipo?: TipoFluxoPiso,
): boolean {
  if (n < 1 || n > 9 || !etapaAplicavelPiso(n, tipo)) return false;

  const bloqueios = new Set(reconferir ?? []);
  if (concluidas?.[String(n)] || bloqueios.has(n)) return true;
  if (n === 1 || n === 5 || (n === 2 && tipo === "decimo_terceiro")) return true;

  const requisitos = prerequisitosEtapaPiso(n, tipo);
  return requisitos.every(
    (etapa) =>
      Boolean(concluidas?.[String(etapa)]) && !bloqueios.has(etapa),
  );
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
