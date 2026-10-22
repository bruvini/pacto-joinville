import { valorAuditadoCacon } from "@/lib/dashboard/cacon-financeiro";
import { saldosAnulacaoPiso } from "@/lib/piso/anulacao";

export type ValoresPorInstituicao = {
  id: string;
  nome: string;
  pago: number;
  saldo: number;
};

/** O valor financeiro pertence ao prestador: nunca distribuir total por proporção. */
export type MapaValoresInstituicao = Record<string, ValoresPorInstituicao>;

function nomePrestador(item: any): string {
  const prestador = Array.isArray(item?.prestadores) ? item.prestadores[0] : item?.prestadores;
  return String(prestador?.nome_instituicao ?? "Instituição não identificada");
}

function agregarInstituicao(
  mapa: MapaValoresInstituicao, id: string, nome: string, pago: number, saldo: number,
) {
  if (!mapa[id]) mapa[id] = { id, nome, pago: 0, saldo: 0 };
  mapa[id].pago += pago;
  mapa[id].saldo += saldo;
}

export type EvolucaoPonto = {
  comp: string;
  convenios: number;
  glosa: number;
  solicitadoConvenios: number;
  pisoHomologado: number;
  pisoTransferido: number;
  pisoAtransferir: number;
  pisoAnulacaoPrevista: number;
  pisoAnulacaoEfetiva: number;
  pisoMensalTransferido: number;
  pisoMensalAtransferir: number;
  piso13Transferido: number;
  piso13Atransferir: number;
  cacon: number;
  pvhPublicado: number;
  pvhPago: number;
  pvhSaldo: number;
  pisoInstituicoes: MapaValoresInstituicao;
  pvhInstituicoes: MapaValoresInstituicao;
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

/** Estatísticas apenas das competências que pertencem à série exibida (inclui zero real).
 * Os pontos já chegam em ordem cronológica de montarEvolucaoExecucao.
 * Com duas competências, a variação é entre as duas últimas — nunca
 * entre meses vazios criados artificialmente por outros módulos.
 */
export type CampoResumoFinanceiro = "convenios" | "pisoTransferido" | "cacon" | "pvhPago";

export type ResumoSerieMensal = {
  meses: number;
  media: number | null;
  mediana: number | null;
  variacaoPct: number | null;
  ultimaCompetencia: string | null;
  anteriorCompetencia: string | null;
  ultimoValor: number | null;
  anteriorValor: number | null;
};

export function resumirSerieMensal(
  pontos: EvolucaoPonto[],
  campo: CampoResumoFinanceiro,
): ResumoSerieMensal {
  const validos = pontos
    .map((ponto) => ({ competencia: ponto.comp, valor: ponto[campo] }))
    .filter(({ valor }) => Number.isFinite(valor) && valor >= 0);
  const valores = validos.map(({ valor }) => valor);
  const meses = valores.length;
  const ordenados = [...valores].sort((a, b) => a - b);
  const media = meses ? valores.reduce((soma, v) => soma + v, 0) / meses : null;
  const mediana = meses
    ? meses % 2
      ? ordenados[Math.floor(meses / 2)]
      : (ordenados[meses / 2 - 1] + ordenados[meses / 2]) / 2
    : null;
  const ultimo = validos.at(-1) ?? null;
  const anterior = validos.at(-2) ?? null;
  return {
    meses,
    media,
    mediana,
    variacaoPct: ultimo && anterior
      ? variacaoPercentualCompetencia(ultimo.valor, anterior.valor)
      : null,
    ultimaCompetencia: ultimo?.competencia ?? null,
    anteriorCompetencia: anterior?.competencia ?? null,
    ultimoValor: ultimo?.valor ?? null,
    anteriorValor: anterior?.valor ?? null,
  };
}

export function montarEvolucaoExecucao({
  lancamentosRaiz,
  lancamentosTodos,
  piso,
  cacon,
  pvh = [],
  prestadorId = "all",
}: {
  lancamentosRaiz: any[];
  lancamentosTodos: any[];
  piso: any[];
  cacon: any[];
  pvh?: any[];
  prestadorId?: string;
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
      pisoAnulacaoPrevista: 0,
      pisoAnulacaoEfetiva: 0,
      pisoMensalTransferido: 0,
      pisoMensalAtransferir: 0,
      piso13Transferido: 0,
      piso13Atransferir: 0,
      cacon: 0,
      pvhPublicado: 0,
      pvhPago: 0,
      pvhSaldo: 0,
      pisoInstituicoes: {},
      pvhInstituicoes: {},
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
    const participantes = (competencia.piso_participantes ?? []).filter(
      (p: any) => prestadorId === "all" || p.prestador_id === prestadorId,
    );
    let pagoDiscriminado = 0;
    let saldoDiscriminado = 0;
    for (const participante of participantes) {
      const saldos = saldosAnulacaoPiso(participante.piso_obrigacoes ?? []);
      atual.pisoAnulacaoPrevista += saldos.reduce((s, v)=>s+v.previsto,0);
      atual.pisoAnulacaoEfetiva += saldos.reduce((s,v)=>s+Number(v.anulado??0),0);
      const pago = (participante.piso_obrigacoes ?? []).reduce(
        (s: number, obrigacao: any) => s + Number(obrigacao.valor_pago ?? 0), 0,
      );
      const saldo = Math.max(0, Number(participante.valor_devido ?? 0) - pago);
      pagoDiscriminado += pago;
      saldoDiscriminado += saldo;
      agregarInstituicao(
        atual.pisoInstituicoes,
        String(participante.prestador_id ?? participante.id),
        nomePrestador(participante),
        pago, saldo,
      );
    }
    // Para histórico sem detalhe, conservar o valor lançado como não discriminado.
    // Se um prestador estiver selecionado, não apropriar a ele valores gerais.
    const homologado = prestadorId === "all"
      ? Number(competencia.valor_homologado ?? 0)
      : participantes.reduce((s: number, p: any) => s + Number(p.valor_devido ?? 0), 0);
    const transferido = prestadorId === "all"
      ? Number(competencia.valor_transferido ?? 0)
      : pagoDiscriminado;
    const saldo = Math.max(0, homologado - transferido);
    if (prestadorId === "all") {
      const naoDiscriminadoPago = Math.max(0, transferido - pagoDiscriminado);
      const naoDiscriminadoSaldo = Math.max(0, saldo - saldoDiscriminado);
      if (naoDiscriminadoPago > 0 || naoDiscriminadoSaldo > 0) {
        agregarInstituicao(
          atual.pisoInstituicoes,
          "nao-discriminado",
          "Sem detalhamento institucional",
          naoDiscriminadoPago, naoDiscriminadoSaldo,
        );
      }
    }
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
    const valor = valorAuditadoCacon(competencia);
    if (valor === null) continue;
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temCacon = true;
    atual.cacon += valor;
  }

  for (const competencia of pvh) {
    const key = compKey(competencia.competencia);
    if (!key) continue;
    const atual = ponto(key, competencia.competencia);
    atual.temPvh = true;
    const participantes = (competencia.pvh_participantes ?? []).filter(
      (p: any) => prestadorId === "all" || p.prestador_id === prestadorId,
    );
    let publicado = 0;
    let pago = 0;
    for (const participante of participantes) {
      const previsto = Number(participante.valor_estadual ?? 0);
      const creditado = Number(participante.valor_pago ?? 0);
      publicado += previsto;
      pago += creditado;
      agregarInstituicao(
        atual.pvhInstituicoes,
        String(participante.prestador_id ?? participante.id),
        nomePrestador(participante),
        creditado, Math.max(0, previsto - creditado),
      );
    }
    atual.pvhPublicado += publicado;
    atual.pvhPago += pago;
    atual.pvhSaldo += Math.max(0, publicado - pago);
  }

  return [...map.values()].sort((a, b) => a.key - b.key);
}
