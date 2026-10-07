export type EvolucaoPonto = {
  comp: string;
  convenios: number;
  glosa: number;
  solicitadoConvenios: number;
  pisoHomologado: number;
  pisoTransferido: number;
  cacon: number;
  temConvenio: boolean;
  temPiso: boolean;
  temCacon: boolean;
};

const compKey = (c: string | null) => {
  const m = (c ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
};

const compLabel = (c: string | null) =>
  (c ?? "").split(",")[0].trim() || "—";

export function montarEvolucaoExecucao({
  lancamentosRaiz,
  lancamentosTodos,
  piso,
  cacon,
}: {
  lancamentosRaiz: any[];
  lancamentosTodos: any[];
  piso: any[];
  cacon: any[];
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
      cacon: 0,
      temConvenio: false,
      temPiso: false,
      temCacon: false,
    };
    map.set(key, novo);
    return novo;
  };

  for (const lancamento of lancamentosRaiz) {
    const key = compKey(lancamento.competencia);
    if (!key) continue;

    let atestado = Number(lancamento.valor_atestado ?? 0);
    const filhos = lancamentosTodos.filter(
      (item) => item.parent_id === lancamento.id,
    );
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
    atual.pisoHomologado += Number(competencia.valor_homologado ?? 0);
    atual.pisoTransferido += Number(competencia.valor_transferido ?? 0);
  }

  for (const competencia of cacon) {
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temCacon = true;
    atual.cacon += Number(competencia.valor_fornecido ?? 0);
  }

  return [...map.values()].sort((a, b) => a.key - b.key);
}
