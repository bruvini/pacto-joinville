/**
 * Adaptação de parcelas da PVH ao universo da esteira de Prestação de Contas.
 * Não cria convênios nem lançamentos financeiros artificiais.
 * A origem real continua sendo pvh_pagamentos + prestacoes_contas.
 */
export type PrestacaoPvhVinculada = {
  id: string;
  pvh_pagamento_id: string;
  pvh_prazo_dias: number | null;
  pvh_data_limite: string | null;
};

export function lancamentosPrestacaoPvh(
  prestacoes: PrestacaoPvhVinculada[],
  pagamentos: any[],
) {
  const prestacaoPorPagamento = new Map(
    prestacoes.filter((pc) => pc.pvh_pagamento_id).map((pc) => [pc.pvh_pagamento_id, pc]),
  );

  // Uma PC por pagamento. Em caso de parcelas, a numeração é apenas visual.
  const pagamentosValidos = pagamentos.filter((pg) => prestacaoPorPagamento.has(pg.id));
  const pagamentosPorId = new Map<string, any>(pagamentosValidos.map((pg) => [pg.id, pg]));
  const porParticipante = new Map<string, string[]>();
  for (const pagamento of pagamentosValidos) {
    const chave = pagamento.participante_id;
    const lista = porParticipante.get(chave) ?? [];
    lista.push(pagamento.id);
    porParticipante.set(chave, lista);
  }
  for (const [chave, lista] of porParticipante) {
    lista.sort((a, b) => {
      const pgA = pagamentosPorId.get(a);
      const pgB = pagamentosPorId.get(b);
      return String(pgA?.data_pagamento ?? "").localeCompare(String(pgB?.data_pagamento ?? ""))
        || a.localeCompare(b);
    });
    porParticipante.set(chave, lista);
  }

  return pagamentosValidos.map((pg) => {
    const participante = Array.isArray(pg.pvh_participantes)
      ? pg.pvh_participantes[0] : pg.pvh_participantes;
    const prestador = Array.isArray(participante?.prestadores)
      ? participante.prestadores[0] : participante?.prestadores;
    const competencia = Array.isArray(pg.pvh_competencias)
      ? pg.pvh_competencias[0] : pg.pvh_competencias;
    const pc = prestacaoPorPagamento.get(pg.id)!;
    const numeroParcela = (porParticipante.get(pg.participante_id) ?? []).indexOf(pg.id) + 1;
    return {
      id: pg.id,
      pvh_pagamento_id: pg.id,
      pvh_competencia_id: pg.competencia_id,
      pvh_data_limite: pc.pvh_data_limite,
      pvh_prazo_dias: pc.pvh_prazo_dias ?? 30,
      prestador_id: participante?.prestador_id ?? null,
      prestadores: { nome_instituicao: prestador?.nome_instituicao ?? "Instituição" },
      convenio_id: null,
      descricao: "Programa de Valorização dos Hospitais (PVH)",
      competencia: competencia?.competencia ?? "",
      parcela: String(numeroParcela),
      valor_atestado: Number(pg.valor_pago ?? 0),
      data_pagamento: pg.data_pagamento,
      concluido: true,
      origem_prestacao: "pvh" as const,
    };
  });
}

export function convenioVisualPrestacao(lancamento: any, conveniosPorId: Record<string, any>) {
  if (lancamento?.origem_prestacao === "pvh") {
    return {
      objeto: "PVH · Programa de Valorização dos Hospitais",
      exige_prestacao_contas: true,
      prazo_prestacao_contas_dias: lancamento.pvh_prazo_dias || 30,
    };
  }
  return conveniosPorId[lancamento?.convenio_id] ?? null;
}
