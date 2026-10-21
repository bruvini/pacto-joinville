import type { EvolucaoPonto, MapaValoresInstituicao } from "./evolucao";

export type ModuloGraficoInstituicoes = "piso" | "pvh";

const PALETA = [
  "var(--primary)", "var(--success)", "var(--aco)", "var(--warning)",
  "#8959bb", "#0e99a1", "#d96287", "#9b7d3c",
] as const;

export type SerieGraficoInstituicao = {
  id: string;
  nome: string;
  pagoKey: string;
  saldoKey: string;
  cor: string;
};

export type PontoGraficoInstituicoes = { comp: string; [key: string]: string | number };

export function montarGraficoInstituicoes(
  pontos: EvolucaoPonto[],
  modulo: ModuloGraficoInstituicoes,
) {
  const campo: keyof EvolucaoPonto =
    modulo === "piso" ? "pisoInstituicoes" : "pvhInstituicoes";
  const nomes = new Map<string, string>();
  for (const ponto of pontos) {
    const instituicoes = ponto[campo] as MapaValoresInstituicao;
    for (const instituicao of Object.values(instituicoes)) {
      nomes.set(instituicao.id, instituicao.nome);
    }
  }
  const ordenadas = [...nomes].sort(([idA, a], [idB, b]) =>
    (idA === "nao-discriminado" ? 1 : idB === "nao-discriminado" ? -1 :
      a.localeCompare(b, "pt-BR")) || idA.localeCompare(idB),
  );
  const series: SerieGraficoInstituicao[] = ordenadas.map(([id, nome], indice) => ({
    id, nome, pagoKey: `pago_${indice}`, saldoKey: `saldo_${indice}`,
    cor: PALETA[indice % PALETA.length],
  }));
  const dados: PontoGraficoInstituicoes[] = pontos.map((ponto) => {
    const registro: PontoGraficoInstituicoes = { comp: ponto.comp };
    const instituicoes = ponto[campo] as MapaValoresInstituicao;
    for (const serie of series) {
      const valores = instituicoes[serie.id];
      registro[serie.pagoKey] = valores?.pago ?? 0;
      registro[serie.saldoKey] = valores?.saldo ?? 0;
    }
    return registro;
  });
  return { series, dados };
}
