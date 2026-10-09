import { describe, expect, it } from "vitest";
import {
  cadeiaSubempenhoCompletaPvh,
  coberturaSubempenhoFechadaPvh,
  patchAutosaveSubempenhoPvh,
  saldoSubempenharPvh,
  statusSubetapasSubempenhoPvh,
  totalSubempenhadoPvh,
} from "./subempenhos";

describe("fluxos de subempenho do PVH", () => {
  it("fecha uma NE com um único fluxo", () => {
    const fluxos = [{ valor: 600000 }];
    expect(totalSubempenhadoPvh(fluxos)).toBe(600000);
    expect(saldoSubempenharPvh(600000, fluxos)).toBe(0);
    expect(coberturaSubempenhoFechadaPvh(600000, fluxos)).toBe(true);
  });

  it("não considera concluída uma NE com mais de um fluxo interno", () => {
    const fluxos = [{ valor: 400000 }, { valor: 240000 }];
    expect(totalSubempenhadoPvh(fluxos)).toBe(640000);
    expect(saldoSubempenharPvh(640000, fluxos)).toBe(0);
    expect(coberturaSubempenhoFechadaPvh(640000, fluxos)).toBe(false);
  });

  it("mantém a NE pendente enquanto houver saldo sem fluxo", () => {
    const fluxos = [{ valor: 400000 }];
    expect(saldoSubempenharPvh(640000, fluxos)).toBe(240000);
    expect(coberturaSubempenhoFechadaPvh(640000, fluxos)).toBe(false);
  });

  it("conclui as três subetapas somente com evidências completas", () => {
    const sub = {
      id: "s1",
      valor: 100,
      solicitacao_sei_numero: "123",
      solicitacao_sei_link: "https://sei.joinville.sc.gov.br/a",
      movimento_liquidacao_sei_numero: "456",
      movimento_liquidacao_sei_link: "https://sei.joinville.sc.gov.br/b",
      movimento_liquidacao_encaminhado_sefaz: true,
      movimento_subempenho_sei_numero: "789",
      movimento_subempenho_sei_link: "https://sei.joinville.sc.gov.br/c",
      movimento_subempenho_data: "2026-10-08",
    };
    const assinaturas = [
      {
        subempenho_id: "s1",
        documento_tipo: "solicitacao",
        slot: "comissao",
        revogado_em: null,
      },
      {
        subempenho_id: "s1",
        documento_tipo: "movimento_liquidacao",
        slot: "comissao",
        revogado_em: null,
      },
    ];

    expect(statusSubetapasSubempenhoPvh(sub, assinaturas)).toMatchObject({
      solicitacao: true,
      liquidacao: true,
      subempenho: true,
      completas: 3,
    });
    expect(cadeiaSubempenhoCompletaPvh(sub, assinaturas)).toBe(true);
  });

  it("não conclui o Aviso de Movimento — Subempenho sem a data", () => {
    const sub = {
      id: "s1",
      valor: 100,
      solicitacao_sei_numero: "123",
      solicitacao_sei_link: "https://sei.joinville.sc.gov.br/a",
      movimento_liquidacao_sei_numero: "456",
      movimento_liquidacao_sei_link: "https://sei.joinville.sc.gov.br/b",
      movimento_liquidacao_encaminhado_sefaz: true,
      movimento_subempenho_sei_numero: "789",
      movimento_subempenho_sei_link: "https://sei.joinville.sc.gov.br/c",
      movimento_subempenho_data: null,
    };
    const assinaturas = [
      {
        subempenho_id: "s1",
        documento_tipo: "solicitacao",
        slot: "comissao",
        revogado_em: null,
      },
      {
        subempenho_id: "s1",
        documento_tipo: "movimento_liquidacao",
        slot: "comissao",
        revogado_em: null,
      },
    ];

    expect(statusSubetapasSubempenhoPvh(sub, assinaturas).subempenho).toBe(false);
    expect(cadeiaSubempenhoCompletaPvh(sub, assinaturas)).toBe(false);
  });


  it("persiste número e link SEI no mesmo patch ao trocar de acordeão", () => {
    const vazio = {
      solicitacao_sei_numero: "",
      solicitacao_sei_link: "",
      movimento_liquidacao_sei_numero: "",
      movimento_liquidacao_sei_link: "",
      movimento_subempenho_sei_numero: "",
      movimento_subempenho_sei_link: "",
      movimento_subempenho_data: "",
    };

    expect(
      patchAutosaveSubempenhoPvh(
        {
          ...vazio,
          solicitacao_sei_numero: " 31024567 ",
          solicitacao_sei_link: " https://sei.joinville.sc.gov.br/sei/a ",
        },
        vazio,
      ),
    ).toEqual({
      solicitacao_sei_numero: "31024567",
      solicitacao_sei_link: "https://sei.joinville.sc.gov.br/sei/a",
    });
  });

  it("não regrava campos da Etapa 4 quando o valor local já coincide com o persistido", () => {
    const persistido = {
      solicitacao_sei_numero: "31024567",
      solicitacao_sei_link: "https://sei.joinville.sc.gov.br/sei/a",
      movimento_liquidacao_sei_numero: "",
      movimento_liquidacao_sei_link: "",
      movimento_subempenho_sei_numero: "",
      movimento_subempenho_sei_link: "",
      movimento_subempenho_data: "",
    };

    expect(
      patchAutosaveSubempenhoPvh({ ...persistido }, persistido),
    ).toEqual({});
  });

  it("inclui a data recém-selecionada no patch ao trocar de input", () => {
    const vazio = {
      solicitacao_sei_numero: "",
      solicitacao_sei_link: "",
      movimento_liquidacao_sei_numero: "",
      movimento_liquidacao_sei_link: "",
      movimento_subempenho_sei_numero: "",
      movimento_subempenho_sei_link: "",
      movimento_subempenho_data: "",
    };
    const editado = {
      ...vazio,
      movimento_subempenho_sei_numero: "30753624",
      movimento_subempenho_data: "2026-08-25",
    };
    expect(patchAutosaveSubempenhoPvh(editado, vazio)).toEqual({
      movimento_subempenho_sei_numero: "30753624",
      movimento_subempenho_data: "2026-08-25",
    });
  });

});
