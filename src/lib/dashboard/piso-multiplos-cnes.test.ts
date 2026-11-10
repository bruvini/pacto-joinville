import { describe, expect, it } from "vitest";
import { montarEvolucaoExecucao } from "./evolucao";
import { montarGraficoInstituicoes } from "./grafico-instituicoes";

const cnesBanco = [
  { id: "bo-cnes-3678385", prestador_id: "banco-olhos", cnes: "3678385",
    valor_devido: 160.25, prestadores: { nome_instituicao: "Banco de Olhos de Joinville" },
    piso_obrigacoes: [{ valor_pago: null }] },
  { id: "bo-cnes-7728557", prestador_id: "banco-olhos", cnes: "7728557",
    valor_devido: 9364.43, prestadores: { nome_instituicao: "Banco de Olhos de Joinville" },
    piso_obrigacoes: [{ valor_pago: null }] },
];
const bethesda = { id: "bethesda", prestador_id: "bethesda",
  cnes: "2521296", valor_devido: 352,
  prestadores: { nome_instituicao: "Instituição Bethesda" },
  piso_obrigacoes: [{ valor_pago: null }] };

const montar = (piso: any[]) =>
  montarEvolucaoExecucao({
    lancamentosRaiz: [], lancamentosTodos: [], cacon: [], pvh: [], piso,
  });

describe("Piso — instituição única com múltiplos CNES no gráfico executivo", () => {
  it("consolida 3678385 e 7728557 no Banco de Olhos sem barra sem detalhamento, sem atribuir transferência global", () => {
    const pontos = montar([{
      competencia: "10/2026", tipo_parcela: "mensal",
      valor_homologado: 9876.68, valor_transferido: 1762.40,
      piso_participantes: [...cnesBanco, bethesda],
    }]).filter(p => p.temPiso);
    expect(pontos).toHaveLength(1);
    expect(pontos[0].pisoInstituicoes["banco-olhos"]).toMatchObject({
      nome: "Banco de Olhos de Joinville", pago: 0, saldo: 9524.68,
    });
    expect(pontos[0].pisoInstituicoes["bethesda"]).toMatchObject({
      nome: "Instituição Bethesda", pago: 0, saldo: 352,
    });
    expect(pontos[0].pisoInstituicoes["nao-discriminado"]).toBeUndefined();
    expect(pontos[0].pisoTransferido).toBe(1762.4);
    expect(pontos[0].pisoTransferidoSemVinculo).toBe(1762.4);

    const { series, dados } = montarGraficoInstituicoes(pontos, "piso");
    expect(series.map(s => s.nome)).toEqual([
      "Banco de Olhos de Joinville", "Instituição Bethesda",
    ]);
    expect(dados).toMatchObject([{
      comp: "10/2026", pago_0: 0, saldo_0: 9524.68,
      pago_1: 0, saldo_1: 352,
    }]);
    expect(series.reduce((sum, serie) =>
      sum + Number(dados[0][serie.pagoKey]) + Number(dados[0][serie.saldoKey]), 0
    )).toBeCloseTo(9876.68, 2);
  });

  it("somente valores pagos identificados nos dois CNES compõem o transferido do Banco de Olhos", () => {
    const participantes = [
      { ...cnesBanco[0], valor_devido: 100, piso_obrigacoes: [{ valor_pago: 60 }] },
      { ...cnesBanco[1], valor_devido: 200, piso_obrigacoes: [{ valor_pago: 70 }] },
    ];
    const pontos = montar([{
      competencia: "09/2026", tipo_parcela: "mensal",
      valor_homologado: 300, valor_transferido: 130,
      piso_participantes: participantes,
    }]);
    expect(pontos[0].pisoInstituicoes["banco-olhos"]).toMatchObject({
      nome: "Banco de Olhos de Joinville", pago: 130, saldo: 170,
    });
    expect(pontos[0].pisoTransferidoSemVinculo).toBe(0);
    expect(montarGraficoInstituicoes(pontos, "piso").series).toHaveLength(1);
  });

  it("soma parcelas mensais e 13ª por prestador, mantendo competência isolada", () => {
    const pontos = montar([
      { competencia: "11/2026", tipo_parcela: "mensal",
        valor_homologado: 160.25, valor_transferido: 100,
        piso_participantes: [{ ...cnesBanco[0], piso_obrigacoes: [{ valor_pago: 100 }] }] },
      { competencia: "11/2026", tipo_parcela: "decimo_terceiro",
        valor_homologado: 9364.43, valor_transferido: 200,
        piso_participantes: [{ ...cnesBanco[1], piso_obrigacoes: [{ valor_pago: 200 }] }] },
    ]);
    expect(pontos).toHaveLength(1);
    expect(pontos[0].pisoInstituicoes["banco-olhos"]).toMatchObject({
      pago: 300, saldo: 9224.68,
    });
    expect(montarGraficoInstituicoes(pontos, "piso").series).toHaveLength(1);
  });
});
