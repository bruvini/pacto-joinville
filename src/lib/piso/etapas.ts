/** Etapas do módulo Piso da Enfermagem (processo-mãe: parcela mensal ou 13ª anual).
 * 7A = chave interna 10. Nunca renumerar as etapas 8 e 9 históricas.
 */
export const ETAPA_ANULACAO_PISO = {
  n: 10, titulo: "Anulação de empenho", desc: "Solicitação assinada, envio à SEFAZ e aviso de anulação",
} as const;

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

export function etapasVisiveisPiso(tipo: TipoFluxoPiso, requerAnulacao = false) {
  const base = tipo === "decimo_terceiro" ? ETAPAS_PISO_13 : PISO_ETAPAS;
  return requerAnulacao
    ? [...base.slice(0, -2), ETAPA_ANULACAO_PISO, ...base.slice(-2)]
    : [...base];
}

export function numeroVisualEtapaPiso(n: number, tipo: TipoFluxoPiso) {
  if (n === 10) return "7A";
  return tipo === "decimo_terceiro" ? n - 1 : n;
}

export function etapaAplicavelPiso(n: number, tipo: TipoFluxoPiso, requerAnulacao = false) {
  if (n === 10) return requerAnulacao;
  return n >= 1 && n <= 9 && (tipo !== "decimo_terceiro" || n >= 2);
}

/** Etapa atual = primeira não concluída (ou 9 se todas concluídas). */
export function etapaAtualPiso(
  concluidas: EtapasConcluidas | null | undefined,
  tipo?: TipoFluxoPiso,
  requerAnulacao = false,
): number {
  for (const e of etapasVisiveisPiso(tipo, requerAnulacao))
    if (!concluidas?.[String(e.n)]) return e.n;
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
  // Etapa 6 só sustenta pagamento/notificação se a 5 seguir válida.
  const liberada = [5, 6].every(n =>
    Boolean(concluidas?.[String(n)]) && !bloqueios.has(n));
  return { pagamento: liberada, notificacao: liberada };
}

/** Dependências diretas; não inferir precedência pela posição visual da etapa. */
export function prerequisitosEtapaPiso(n: number, tipo?: TipoFluxoPiso, requerAnulacao = false): number[] {
  const decimoTerceiro = tipo === "decimo_terceiro";
  if (n === 1 || n === 5) return [];
  if (n === 2) return decimoTerceiro ? [] : [1];
  if (n === 3) return [2];
  if (n === 4) return [3];
  if (n === 6) return [5];
  if (n === 7) return [6];
  if (n === 10) return [7];
  if (n === 8) return requerAnulacao ? [6, 10] : [6];
  if (n === 9) return [
    ...(decimoTerceiro ? [2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8]),
    ...(requerAnulacao ? [10] : []),
  ];
  return [];
}

/** Inclui todos os ancestrais do grafo para impedir avanço sobre etapas
 * concluídas historicamente, mas com um pré-requisito ancestral reaberto. */
export function prerequisitosTransitivosEtapaPiso(n: number, tipo?: TipoFluxoPiso, requerAnulacao = false): number[] {
  const vistos = new Set<number>();
  const visitar = (etapa: number) => {
    for (const anterior of prerequisitosEtapaPiso(etapa, tipo, requerAnulacao)) {
      if (vistos.has(anterior)) continue;
      vistos.add(anterior);
      visitar(anterior);
    }
  };
  visitar(n);
  return [...vistos].sort((a, b) => a - b);
}

export function etapaLiberadaPiso(
  n: number,
  concluidas: EtapasConcluidas | null | undefined,
  reconferir: number[] | null | undefined = [],
  tipo?: TipoFluxoPiso,
  requerAnulacao = false,
): boolean {
  if (!etapaAplicavelPiso(n, tipo, requerAnulacao)) return false;

  const bloqueios = new Set(reconferir ?? []);
  if (concluidas?.[String(n)] || bloqueios.has(n)) return true;
  if (n === 1 || n === 5 || (n === 2 && tipo === "decimo_terceiro")) return true;

  const requisitos = prerequisitosTransitivosEtapaPiso(n, tipo, requerAnulacao);
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
