import { describe, expect, it } from "vitest";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  normalizarNumeroNePvh,
  notaEmpenhoProntaPvh,
  numeroNeValidoPvh,
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

  it("exige as cinco funções da solicitação", () => {
    const assinaturas = [
      { slot: "coord_orc", revogado_em: null },
      { slot: "fiscal", revogado_em: null },
      { slot: "gestao", revogado_em: null },
      { slot: "diretor_servicos_complementares", revogado_em: null },
      { slot: "diretor_financeiro", revogado_em: null },
    ];

    expect(assinaturasSolicitacaoEmpenhoCompletasPvh(assinaturas)).toBe(true);
    expect(
      assinaturasSolicitacaoEmpenhoCompletasPvh(
        assinaturas.filter((item) => item.slot !== "diretor_financeiro"),
      ),
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
});
