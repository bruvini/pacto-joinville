import { describe, expect, it } from "vitest";
import { montarEvolucaoExecucao, variacaoPercentualCompetencia } from "./evolucao";

describe("evolução financeira por módulo", () => {
  it("decompõe o Piso em transferido + saldo a transferir para barra empilhada", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [],
      lancamentosTodos: [],
      piso: [
        {
          competencia: "09/2026",
          valor_homologado: 10000,
          valor_transferido: 7000,
        },
      ],
      cacon: [],
    });

    expect(dados).toHaveLength(1);
    expect(dados[0].pisoTransferido).toBe(7000);
    expect(dados[0].pisoAtransferir).toBe(3000);
    expect(dados[0].pisoHomologado).toBe(10000);
  });

  it("soma as duas parcelas de novembro sem confundir a 13ª com o mensal", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], cacon: [],
      piso: [
        { competencia: "11/2026", tipo_parcela: "mensal", valor_homologado: 1000, valor_transferido: 800 },
        { competencia: "11/2026", tipo_parcela: "decimo_terceiro", valor_homologado: 500, valor_transferido: 450 },
      ],
    });
    expect(dados).toHaveLength(1);
    expect(dados[0]).toMatchObject({
      pisoHomologado: 1500, pisoTransferido: 1250, pisoAtransferir: 250,
      pisoMensalTransferido: 800, pisoMensalAtransferir: 200,
      piso13Transferido: 450, piso13Atransferir: 50,
    });
  });

  it("não cria saldo negativo se a transferência superar o homologado", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [],
      lancamentosTodos: [],
      piso: [
        {
          competencia: "09/2026",
          valor_homologado: 100,
          valor_transferido: 120,
        },
      ],
      cacon: [],
    });

    expect(dados[0].pisoAtransferir).toBe(0);
  });

  it("decompõe PVH em pago + saldo a repassar", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [],
      lancamentosTodos: [],
      piso: [],
      cacon: [],
      pvh: [
        {
          competencia: "09/2026",
          pvh_participantes: [
            { valor_estadual: 1000, valor_pago: 700 },
            { valor_estadual: 500, valor_pago: 500 },
          ],
        },
      ],
    });

    expect(dados[0].pvhPublicado).toBe(1500);
    expect(dados[0].pvhPago).toBe(1200);
    expect(dados[0].pvhSaldo).toBe(300);
  });

  it("calcula a variação percentual do CACON contra a competência anterior", () => {
    expect(variacaoPercentualCompetencia(120, 100)).toBe(20);
    expect(variacaoPercentualCompetencia(80, 100)).toBe(-20);
    expect(variacaoPercentualCompetencia(100, 0)).toBeNull();
    expect(variacaoPercentualCompetencia(100, null)).toBeNull();
  });

});
