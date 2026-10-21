import { describe, expect, it } from "vitest";
import { montarEvolucaoExecucao, resumirSerieMensal, variacaoPercentualCompetencia } from "./evolucao";

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

  it("resume média, mediana e variação pelo indicador de cada módulo (sem glosa/saldo)", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [
        { id: "c1", competencia: "01/2026", valor_atestado: 100, valor_solicitado: 180 },
        { id: "c2", competencia: "02/2026", valor_atestado: 200, valor_solicitado: 350 },
      ],
      lancamentosTodos: [],
      piso: [
        { competencia: "01/2026", tipo_parcela: "mensal", valor_homologado: 1000, valor_transferido: 80 },
        { competencia: "02/2026", tipo_parcela: "mensal", valor_homologado: 2000, valor_transferido: 120 },
        { competencia: "02/2026", tipo_parcela: "decimo_terceiro", valor_homologado: 200, valor_transferido: 80 },
      ],
      cacon: [],
      pvh: [
        { competencia: "01/2026", pvh_participantes: [{ valor_estadual: 600, valor_pago: 50 }] },
        { competencia: "02/2026", pvh_participantes: [{ valor_estadual: 700, valor_pago: 150 }] },
      ],
    });
    expect(resumirSerieMensal(dados.filter(p => p.temConvenio), "convenios")).toMatchObject({
      meses: 2, media: 150, mediana: 150, variacaoPct: 100,
      ultimaCompetencia: "02/2026", anteriorCompetencia: "01/2026",
    });
    expect(resumirSerieMensal(dados.filter(p => p.temPiso), "pisoTransferido")).toMatchObject({
      meses: 2, media: 140, mediana: 140, variacaoPct: 150,
    });
    expect(resumirSerieMensal(dados.filter(p => p.temPvh), "pvhPago")).toMatchObject({
      meses: 2, media: 100, mediana: 100, variacaoPct: 200,
    });
  });

  it("calcula média e mediana da produção auditada CACON, sem valores provisórios", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], piso: [], pvh: [],
      cacon: [
        { competencia: "01/2026", status: "concluida", valor_fornecido: 10 },
        { competencia: "02/2026", status: "concluida", valor_fornecido: 20 },
        { competencia: "03/2026", status: "concluida", valor_fornecido: 40 },
        { competencia: "04/2026", status: "aberta", valor_fornecido: 1000 },
      ],
    });
    expect(resumirSerieMensal(dados.filter(p => p.temCacon), "cacon")).toMatchObject({
      meses: 3, mediana: 20, variacaoPct: 100,
      ultimaCompetencia: "03/2026",
    });
    expect(resumirSerieMensal(dados.filter(p => p.temCacon), "cacon").media).toBeCloseTo(70 / 3);
  });

  it("considera zero de uma competência real e evita variação com base zero", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [],
      lancamentosTodos: [],
      piso: [
        { competencia: "01/2026", valor_homologado: 200, valor_transferido: 0 },
        { competencia: "03/2026", valor_homologado: 100, valor_transferido: 100 },
        { competencia: "04/2026", valor_homologado: 100, valor_transferido: 200 },
      ],
      cacon: [],
    });
    expect(resumirSerieMensal(dados.filter(p => p.temPiso), "pisoTransferido")).toMatchObject({
      meses: 3, media: 100, mediana: 100, variacaoPct: 100,
      ultimaCompetencia: "04/2026", anteriorCompetencia: "03/2026",
    });
    const dois = dados.filter(p => p.temPiso).slice(0, 2);
    expect(resumirSerieMensal(dois, "pisoTransferido").variacaoPct).toBe( null );
    expect(resumirSerieMensal([], "cacon")).toMatchObject({
      meses: 0, media: null, mediana: null, variacaoPct: null,
    });
  });

  it("calcula a variação percentual do CACON contra a competência anterior", () => {
    expect(variacaoPercentualCompetencia(120, 100)).toBe(20);
    expect(variacaoPercentualCompetencia(80, 100)).toBe(-20);
    expect(variacaoPercentualCompetencia(100, 0)).toBeNull();
    expect(variacaoPercentualCompetencia(100, null)).toBeNull();
  });

});
