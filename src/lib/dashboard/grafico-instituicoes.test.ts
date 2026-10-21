import { describe, expect, it } from "vitest";
import { montarEvolucaoExecucao } from "./evolucao";
import { montarGraficoInstituicoes } from "./grafico-instituicoes";

describe("barras verticais por instituição", () => {
  it("exibe uma série por instituição em cada competência e não duplica os totais", () => {
    const pontos = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], piso: [], cacon: [],
      pvh: [
        { competencia: "01/2026", pvh_participantes: [
          { prestador_id: "b", prestadores: { nome_instituicao: "Hospital Beta" },
            valor_estadual: 70, valor_pago: 50 },
          { prestador_id: "a", prestadores: { nome_instituicao: "Hospital Alfa" },
            valor_estadual: 30, valor_pago: 20 },
        ] },
        { competencia: "02/2026", pvh_participantes: [
          { prestador_id: "a", prestadores: { nome_instituicao: "Hospital Alfa" },
            valor_estadual: 40, valor_pago: 40 },
        ] },
      ],
    }).filter(p => p.temPvh);
    const { series, dados } = montarGraficoInstituicoes(pontos, "pvh");
    expect(series.map(s => s.nome)).toEqual(["Hospital Alfa", "Hospital Beta"]);
    expect(dados[0]).toMatchObject({
      comp: "01/2026", pago_0: 20, saldo_0: 10, pago_1: 50, saldo_1: 20,
    });
    expect(dados[1]).toMatchObject({
      comp: "02/2026", pago_0: 40, saldo_0: 0, pago_1: 0, saldo_1: 0,
    });
    for (let i = 0; i < dados.length; i++) {
      const soma = series.reduce((s, serie) => s + Number(dados[i][serie.pagoKey]), 0);
      expect(soma).toBe(pontos[i].pvhPago);
    }
  });

  it("agrupa mensal e 13ª do Piso pela mesma instituição e mesmo mês", () => {
    const pontos = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], cacon: [], pvh: [],
      piso: [
        { competencia: "11/2026", tipo_parcela: "mensal",
          valor_homologado: 30, valor_transferido: 20,
          piso_participantes: [{ prestador_id: "h", valor_devido: 30,
            prestadores: { nome_instituicao: "Hospital" },
            piso_obrigacoes: [{ valor_pago: 20 }] }] },
        { competencia: "11/2026", tipo_parcela: "decimo_terceiro",
          valor_homologado: 60, valor_transferido: 40,
          piso_participantes: [{ prestador_id: "h", valor_devido: 60,
            prestadores: { nome_instituicao: "Hospital" },
            piso_obrigacoes: [{ valor_pago: 40 }] }] },
      ],
    }).filter(p => p.temPiso);
    const { series, dados } = montarGraficoInstituicoes(pontos, "piso");
    expect(series.map(s => s.nome)).toEqual(["Hospital"]);
    expect(dados).toMatchObject([{ comp: "11/2026", pago_0: 60, saldo_0: 30 }]);
  });
});
