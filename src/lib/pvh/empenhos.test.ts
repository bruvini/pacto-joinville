import { describe, expect, it } from "vitest";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  empenhoDisponivelParaReaproveitamentoPvh,
  empenhoOrfaoSemUsoPvh,
  empenhoRelacionadoCompetenciaPvh,
  normalizarNumeroNePvh,
  notaEmpenhoProntaPvh,
  numeroNeValidoPvh,
  saldoDisponivelEmpenhoPvh,
  solicitacaoEmpenhoProntaPvh,
} from "./empenhos";

describe("Etapa 3 do PVH", () => {
  it("normaliza número da NE com o exercício da competência", () => {
    expect(normalizarNumeroNePvh("4086", 2026)).toBe("4086/2026");
    expect(normalizarNumeroNePvh("4086 / 2026", 2026)).toBe("4086/2026");
    expect(numeroNeValidoPvh("4086/2026", 2026)).toBe(true);
    expect(numeroNeValidoPvh("4086/2025", 2026)).toBe(false);
  });

  it("só considera a solicitação pronta com SEI, link, data, dotação e fonte", () => {
    expect(
      solicitacaoEmpenhoProntaPvh({
        solicitacao_sei_numero: "31001234",
        solicitacao_sei_link: "https://sei.joinville.sc.gov.br/documento",
        solicitacao_data: "2026-10-08",
        cr_dotacao: "1234",
        fonte_recurso: "1.500.1002",
      }),
    ).toBe(true);

    expect(
      solicitacaoEmpenhoProntaPvh({
        solicitacao_sei_numero: "31001234",
        solicitacao_sei_link: "",
        solicitacao_data: "2026-10-08",
        cr_dotacao: "1234",
        fonte_recurso: "1.500.1002",
      }),
    ).toBe(false);
  });

  it("exige somente Coordenador de Orçamentos, Comissão e Diretor Financeiro", () => {
    const obrigatorias = [
      { slot: "coord_orc", revogado_em: null },
      { slot: "comissao", revogado_em: null },
      { slot: "diretor_financeiro", revogado_em: null },
    ];

    expect(assinaturasSolicitacaoEmpenhoCompletasPvh(obrigatorias)).toBe(true);

    expect(
      assinaturasSolicitacaoEmpenhoCompletasPvh([
        ...obrigatorias,
        { slot: "fiscal", revogado_em: null },
        { slot: "gestao", revogado_em: null },
        { slot: "diretor_servicos_complementares", revogado_em: null },
      ]),
    ).toBe(true);

    expect(
      assinaturasSolicitacaoEmpenhoCompletasPvh(
        obrigatorias.filter((item) => item.slot !== "comissao"),
      ),
    ).toBe(false);

    expect(
      assinaturasSolicitacaoEmpenhoCompletasPvh([
        { slot: "fiscal", revogado_em: null },
        { slot: "gestao", revogado_em: null },
        { slot: "diretor_servicos_complementares", revogado_em: null },
      ]),
    ).toBe(false);
  });

  it("só libera a NE com número, valor e rastreio SEI", () => {
    expect(
      notaEmpenhoProntaPvh(
        {
          numero_ne: "4086/2026",
          valor_total: 1416115.56,
          nota_empenho_sei_numero: "31009999",
          nota_empenho_sei_link: "https://sei.joinville.sc.gov.br/ne",
        },
        2026,
      ),
    ).toBe(true);

    expect(
      notaEmpenhoProntaPvh(
        {
          numero_ne: "4086/2026",
          valor_total: 0,
          nota_empenho_sei_numero: "31009999",
          nota_empenho_sei_link: "https://sei.joinville.sc.gov.br/ne",
        },
        2026,
      ),
    ).toBe(false);
  });

  it("não trata NE global do prestador como lançamento da competência atual", () => {
    const empenho = {
      id: "e1",
      solicitacao_competencia_id: "comp-antiga",
      status: "ativo",
      numero_ne: "6016/2026",
      valor_total: 1775502.09,
      pvh_empenho_alocacoes: [],
    };

    expect(
      empenhoRelacionadoCompetenciaPvh(empenho, "comp-nova", "part-novo"),
    ).toBe(false);
    expect(
      empenhoDisponivelParaReaproveitamentoPvh(
        empenho,
        "comp-nova",
        "part-novo",
      ),
    ).toBe(true);
  });

  it("considera a NE parte da competência somente pela origem ou por alocação efetiva", () => {
    const originadaAqui = {
      id: "e1",
      solicitacao_competencia_id: "comp-atual",
      status: "ativo",
      numero_ne: "4545/2026",
      valor_total: 1240000,
      pvh_empenho_alocacoes: [],
    };
    const reutilizadaAqui = {
      id: "e2",
      solicitacao_competencia_id: "comp-anterior",
      status: "ativo",
      numero_ne: "4083/2026",
      valor_total: 3000000,
      pvh_empenho_alocacoes: [
        { participante_id: "part-atual", valor_alocado: 1240000 },
      ],
    };

    expect(
      empenhoRelacionadoCompetenciaPvh(
        originadaAqui,
        "comp-atual",
        "part-atual",
      ),
    ).toBe(true);
    expect(
      empenhoRelacionadoCompetenciaPvh(
        reutilizadaAqui,
        "comp-atual",
        "part-atual",
      ),
    ).toBe(true);
    expect(saldoDisponivelEmpenhoPvh(reutilizadaAqui)).toBe(1760000);
  });

  it("identifica com segurança um empenho órfão e sem uso", () => {
    expect(
      empenhoOrfaoSemUsoPvh({
        id: "e1",
        solicitacao_competencia_id: null,
        status: "ativo",
        numero_ne: "6016/2026",
        valor_total: 100,
        pvh_empenho_alocacoes: [],
      }),
    ).toBe(true);

    expect(
      empenhoOrfaoSemUsoPvh({
        id: "e2",
        solicitacao_competencia_id: null,
        status: "ativo",
        numero_ne: "6017/2026",
        valor_total: 100,
        pvh_empenho_alocacoes: [
          { participante_id: "p1", valor_alocado: 50 },
        ],
      }),
    ).toBe(false);
  });

});
