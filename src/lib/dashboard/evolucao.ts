export type EvolucaoPonto = {
  comp: string;
  convenios: number;
  glosa: number;
  solicitadoConvenios: number;
  pisoHomologado: number;
  pisoTransferido: number;
  pisoAtransferir: number;
  pisoMensalTransferido: number;
  pisoMensalAtransferir: number;
  piso13Transferido: number;
  piso13Atransferir: number;
  cacon: number;
  pvhPublicado: number;
  pvhPago: number;
  pvhSaldo: number;
  temConvenio: boolean;
  temPiso: boolean;
  temCacon: boolean;
  temPvh: boolean;
};

const compKey = (c: string | null) => {
  const m = (c ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
};

const compLabel = (c: string | null) =>
  (c ?? "").split(",")[0].trim() || "—";

export function variacaoPercentualCompetencia(
  atual: number,
  anterior: number | null | undefined,
): number | null {
  if (anterior == null || !Number.isFinite(anterior) || anterior === 0) return null;
  if (!Number.isFinite(atual)) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function montarEvolucaoExecucao({
  lancamentosRaiz,
  lancamentosTodos,
  piso,
  cacon,
  pvh = [],
}: {
  lancamentosRaiz: any[];
  lancamentosTodos: any[];
  piso: any[];
  cacon: any[];
  pvh?: any[];
}): EvolucaoPonto[] {
  const map = new Map<number, EvolucaoPonto & { key: number }>();

  const ponto = (key: number, competencia: string) => {
    const atual = map.get(key);
    if (atual) return atual;
    const novo: EvolucaoPonto & { key: number } = {
      key,
      comp: compLabel(competencia),
      convenios: 0,
      glosa: 0,
      solicitadoConvenios: 0,
      pisoHomologado: 0,
      pisoTransferido: 0,
      pisoAtransferir: 0,
      pisoMensalTransferido: 0,
      pisoMensalAtransferir: 0,
      piso13Transferido: 0,
      piso13Atransferir: 0,
      cacon: 0,
      pvhPublicado: 0,
      pvhPago: 0,
      pvhSaldo: 0,
      temConvenio: false,
      temPiso: false,
      temCacon: false,
      temPvh: false,
    };
    map.set(key, novo);
    return novo;
  };

  const filhosPorPai = new Map<string, any[]>();
  for (const item of lancamentosTodos) {
    if (!item.parent_id) continue;
    const filhos = filhosPorPai.get(item.parent_id) ?? [];
    filhos.push(item);
    filhosPorPai.set(item.parent_id, filhos);
  }

  for (const lancamento of lancamentosRaiz) {
    const key = compKey(lancamento.competencia);
    if (!key) continue;

    let atestado = Number(lancamento.valor_atestado ?? 0);
    const filhos = filhosPorPai.get(lancamento.id) ?? [];
    if (filhos.length > 0) {
      atestado = filhos.reduce(
        (s, filho) => s + Number(filho.valor_atestado ?? 0),
        0,
      );
    }

    const solicitado = Number(lancamento.valor_solicitado ?? 0);
    const atual = ponto(key, lancamento.competencia);
    atual.temConvenio = true;
    atual.solicitadoConvenios += solicitado;
    atual.convenios += atestado;
    atual.glosa += Math.max(0, solicitado - atestado);
  }

  for (const competencia of piso) {
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temPiso = true;
    const homologado = Number(competencia.valor_homologado ?? 0);
    const transferido = Number(competencia.valor_transferido ?? 0);
    const saldo = Math.max(0, homologado - transferido);
    atual.pisoHomologado += homologado;
    atual.pisoTransferido += transferido;
    atual.pisoAtransferir += saldo;
    if (competencia.tipo_parcela === "decimo_terceiro") {
      atual.piso13Transferido += transferido;
      atual.piso13Atransferir += saldo;
    } else {
      atual.pisoMensalTransferido += transferido;
      atual.pisoMensalAtransferir += saldo;
    }
  }

  for (const competencia of cacon) {
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temCacon = true;
    atual.cacon += Number(competencia.valor_fornecido ?? 0);
  }

  for (const competencia of pvh) {
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temPvh = true;
    const participantes = competencia.pvh_participantes ?? [];
    const publicado = participantes.reduce(
      (s: number, participante: any) =>
        s + Number(participante.valor_estadual ?? 0),
      0,
    );
    const pago = participantes.reduce(
      (s: number, participante: any) =>
        s + Number(participante.valor_pago ?? 0),
      0,
    );
    atual.pvhPublicado += publicado;
    atual.pvhPago += pago;
    atual.pvhSaldo += Math.max(0, publicado - pago);
  }

  return [...map.values()].sort((a, b) => a.key - b.key);
}
