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

  it("mostra previsão e efetivação de anulação do Piso sem deduzir transferência", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [],lancamentosTodos: [],cacon: [],
      piso:[{ competencia:"10/2026",valor_homologado:9876.68,valor_transferido:9876.68,
        piso_participantes:[{prestador_id:"boj",valor_devido:9524.68,piso_obrigacoes:[
          {id:"o1",participante_id:"p1",valor_empenhado:15000,valor_a_liquidar:9524.68,
            valor_anulado:5475.32,valor_pago:9524.68}]}]}],
    });
    expect(dados[0]).toMatchObject({
      pisoAnulacaoPrevista:5475.32,pisoAnulacaoEfetiva:5475.32,
      pisoTransferido:9876.68,
    });
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

  it("desdobra o Piso por prestador usando obrigações realmente pagas", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], cacon: [], pvh: [],
      piso: [{
        competencia: "11/2026", valor_transferido: 120, valor_homologado: 180,
        piso_participantes: [
          { id: "a", prestador_id: "hospital-a", valor_devido: 100,
            prestadores: { nome_instituicao: "Hospital A" },
            piso_obrigacoes: [{ valor_pago: 80 }] },
          { id: "b", prestador_id: "hospital-b", valor_devido: 80,
            prestadores: { nome_instituicao: "Hospital B" },
            piso_obrigacoes: [{ valor_pago: 40 }] },
        ],
      }],
    });
    expect(dados[0].pisoInstituicoes["hospital-a"]).toMatchObject({
      nome: "Hospital A", pago: 80, saldo: 20,
    });
    expect(dados[0].pisoInstituicoes["hospital-b"]).toMatchObject({
      nome: "Hospital B", pago: 40, saldo: 40,
    });
    expect(dados[0].pisoTransferido).toBe(120);
  });

  it("não atribui a uma instituição diferenças sem prestador identificável", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], cacon: [], pvh: [],
      piso: [{
        competencia: "09/2026", valor_transferido: 150, valor_homologado: 150,
        piso_participantes: [{ prestador_id: "a", valor_devido: 100,
          piso_obrigacoes: [{ valor_pago: 100 }] }],
      }],
    });
    expect(dados[0].pisoInstituicoes["a"].pago).toBe(100);
    expect(dados[0].pisoInstituicoes["nao-discriminado"].pago).toBe(50);
    const apenasPrestador = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], cacon: [], pvh: [],
      piso: [{ competencia: "09/2026", valor_transferido: 150, valor_homologado: 150,
        piso_participantes: [{ prestador_id: "a", valor_devido: 100,
          piso_obrigacoes: [{ valor_pago: 100 }] }] }],
      prestadorId: "a",
    });
    expect(apenasPrestador[0].pisoTransferido).toBe(100);
    expect(apenasPrestador[0].pisoInstituicoes["nao-discriminado"]).toBeUndefined();
  });

  it("desdobra o PVH por instituição e respeita o filtro de prestador", () => {
    const dados = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], piso: [], cacon: [],
      pvh: [{
        competencia: "10/2026",
        pvh_participantes: [
          { prestador_id: "h1", valor_estadual: 200, valor_pago: 150,
            prestadores: { nome_instituicao: "Hospital 1" } },
          { prestador_id: "h2", valor_estadual: 300, valor_pago: 100,
            prestadores: { nome_instituicao: "Hospital 2" } },
        ],
      }],
    });
    expect(dados[0].pvhInstituicoes["h1"]).toMatchObject({
      pago: 150, saldo: 50, nome: "Hospital 1",
    });
    expect(dados[0].pvhInstituicoes["h2"]).toMatchObject({
      pago: 100, saldo: 200, nome: "Hospital 2",
    });
    const filtrado = montarEvolucaoExecucao({
      lancamentosRaiz: [], lancamentosTodos: [], piso: [], cacon: [],
      pvh: [{
        competencia: "10/2026",
        pvh_participantes: [
          { prestador_id: "h1", valor_estadual: 200, valor_pago: 150 },
          { prestador_id: "h2", valor_estadual: 300, valor_pago: 100 },
        ],
      }],
      prestadorId: "h1",
    });
    expect(filtrado[0].pvhPago).toBe(150);
    expect(Object.keys(filtrado[0].pvhInstituicoes)).toEqual(["h1"]);
  });

  it("calcula a variação percentual do CACON contra a competência anterior", () => {
    expect(variacaoPercentualCompetencia(120, 100)).toBe(20);
    expect(variacaoPercentualCompetencia(80, 100)).toBe(-20);
    expect(variacaoPercentualCompetencia(100, 0)).toBeNull();
    expect(variacaoPercentualCompetencia(100, null)).toBeNull();
  });

});
