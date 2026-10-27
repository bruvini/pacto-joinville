/** Lead Time de lançamentos concluídos, em dias corridos, com marcos auditáveis. */
export type MarcoLeadTime = { lancamento_id: string; marco: string; ocorrido_em: string };
export function calcularLeadTimeReal(
  marcos: MarcoLeadTime[],
  idsEscopo: ReadonlySet<string>,
): {media: number | null; n: number} {
  const porLancamento = new Map<string, {criado?: number; concluido?: number}>();
  for (const item of marcos) {
    if (!idsEscopo.has(item.lancamento_id)) continue;
    if (item.marco !== "criado" && item.marco !== "concluido") continue;
    const instante = Date.parse(item.ocorrido_em);
    if (!Number.isFinite(instante)) continue;
    const obj = porLancamento.get(item.lancamento_id) ?? {};
    if (item.marco === "criado") obj.criado = Math.min(obj.criado ?? instante, instante);
    else obj.concluido = Math.max(obj.concluido ?? instante, instante);
    porLancamento.set(item.lancamento_id, obj);
  }
  const dias: number[] = [];
  for (const obj of porLancamento.values()) {
    if (obj.criado === undefined || obj.concluido === undefined || obj.concluido <= obj.criado) continue;
    dias.push((obj.concluido - obj.criado) / 86_400_000);
  }
  return {media: dias.length ? dias.reduce((s,d)=>s+d,0)/dias.length : null,n:dias.length};
}


export type ModuloLeadTime = "convenios" | "piso" | "cacon" | "pvh";
export type ResumoLeadTime = { media: number | null; n: number };
export type DetalheLeadTime = ResumoLeadTime & { id: ModuloLeadTime; nome: string };
export type ResultadoLeadTime = ResumoLeadTime & {
  real: true;
  porModulo: DetalheLeadTime[];
};
type RegistroComFim = {
  created_at?: string | null;
  status?: string | null;
  encerrada_em?: string | null;
  encaminhado_ses_ufi_em?: string | null;
};

/**
 * Média POR PROCESSO concluído, entre a criação e o fechamento auditável.
 * Não confunde média de duração das etapas (que podem ser paralelas)
 * com tempo transcorrido do processo inteiro.
 */
export function calcularDuracaoRegistros(
  registros: RegistroComFim[],
  statusFinal: string,
  campoFim: "encerrada_em" | "encaminhado_ses_ufi_em",
): ResumoLeadTime {
  const duracoes: number[] = [];
  for (const item of registros) {
    if (item.status !== statusFinal) continue;
    const inicio = Date.parse(item.created_at ?? "");
    const fim = Date.parse(item[campoFim] ?? "");
    if (Number.isFinite(inicio) && Number.isFinite(fim) && fim >= inicio)
      duracoes.push((fim - inicio) / 86_400_000);
  }
  return {
    media: duracoes.length ? duracoes.reduce((s, n) => s + n, 0) / duracoes.length : null,
    n: duracoes.length,
  };
}

export function calcularLeadTimeMultimodulo({
  marcosConvenios,
  idsConvenios,
  piso,
  cacon,
  pvh,
  modulo = "all",
}: {
  marcosConvenios: MarcoLeadTime[];
  idsConvenios: ReadonlySet<string>;
  piso: RegistroComFim[];
  cacon: RegistroComFim[];
  pvh: RegistroComFim[];
  modulo?: ModuloLeadTime | "all";
}): ResultadoLeadTime {
  const itens: DetalheLeadTime[] = [
    { id: "convenios", nome: "Convênios", ...calcularLeadTimeReal(marcosConvenios, idsConvenios) },
    { id: "piso", nome: "Piso da Enfermagem", ...calcularDuracaoRegistros(piso, "encerrada", "encerrada_em") },
    { id: "cacon", nome: "Dieta CACON", ...calcularDuracaoRegistros(cacon, "concluida", "encaminhado_ses_ufi_em") },
    { id: "pvh", nome: "PVH", ...calcularDuracaoRegistros(pvh, "encerrada", "encerrada_em") },
  ].filter(item => modulo === "all" || modulo === item.id);
  const n = itens.reduce((s, item) => s + item.n, 0);
  const somaPonderada = itens.reduce((s, item) => s + (item.media ?? 0) * item.n, 0);
  return { media: n ? somaPonderada / n : null, n, real: true, porModulo: itens };
}

export function calcularSlaEtapasConvenios(
  marcos: MarcoLeadTime[],
  idsEscopo: ReadonlySet<string>,
): { etapa: string; media: number | null; n: number }[] {
  const porLancamento = new Map<string, Record<string, number>>();
  for (const marco of marcos) {
    if (!idsEscopo.has(marco.lancamento_id)) continue;
    const data = Date.parse(marco.ocorrido_em);
    if (!Number.isFinite(data)) continue;
    const item = porLancamento.get(marco.lancamento_id) ?? {};
    item[marco.marco] = data;
    porLancamento.set(marco.lancamento_id, item);
  }
  const pares: [string, string, string][] = [
    ["criado", "e1_analise", "Etapa 1 · Análise Orçamentária (UFI)"],
    ["e1_analise", "e2_solicitacao", "Etapa 2 · Solicitação (ACP)"],
    ["e2_solicitacao", "e3_revisao", "Etapa 3 · Revisão (UFI)"],
    ["e3_revisao", "e4_sefaz", "Etapa 4 · Assinaturas e Envio (ACP)"],
    ["e4_sefaz", "e5_empenho", "Etapa 5 · Liberação de Orçamento (UFI)"],
    ["e5_empenho", "e6_pagamento", "Etapa 6 · Liberação/Liquidação (ACP)"],
    ["e6_pagamento", "concluido", "Etapa 7 · Conclusão"],
  ];
  return pares.map(([de, ate, etapa]) => {
    const dias: number[] = [];
    for (const marcos of porLancamento.values()) {
      if (marcos[de] != null && marcos[ate] != null && marcos[ate] >= marcos[de])
        dias.push((marcos[ate] - marcos[de]) / 86_400_000);
    }
    return {
      etapa,
      media: dias.length ? dias.reduce((s, n) => s + n, 0) / dias.length : null,
      n: dias.length,
    };
  });
}
