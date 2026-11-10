import { describe, expect, it } from "vitest";
import {
  anulacaoDaNePvh, construirExtratoNePvh, validarAnulacaoResidualPvh,
} from "./anulacao";

const dadosValidos = {
  valorInformado: "500,00",
  saldo: 500,
  data: "2026-11-09",
  numeroSei: "31476089",
  linkSei: "https://sei.joinville.sc.gov.br/sei/controlador.php?id_documento=1",
  motivo: "Anulação do saldo não utilizado da NE",
  declaracao: true,
};

describe("PVH Fase E — anulação contábil residual", () => {
  it("exige correspondência exata com o saldo disponível", () => {
    expect(validarAnulacaoResidualPvh(dadosValidos)).toEqual({ valor: 500, erros: [] });
    const errado = validarAnulacaoResidualPvh({
      ...dadosValidos, valorInformado: "499,99",
    });
    expect(errado.erros.join(" ")).toContain("coincidir exatamente");
  });

  it("não aceita datas inexistentes, ato sem SEI ou declaração ausente", () => {
    const dados = validarAnulacaoResidualPvh({
      ...dadosValidos, data: "2026-02-31",
      numeroSei: "", linkSei: "javascript:alert(1)",
      motivo: "curto", declaracao: false,
    });
    expect(dados.erros.length).toBe(5);
  });

  it("distingue ausência de ato de uma anulação efetivamente registrada", () => {
    expect(anulacaoDaNePvh({ pvh_empenho_anulacoes: [] })).toBeNull();
    expect(anulacaoDaNePvh({ pvh_empenho_anulacoes: null })).toBeNull();
    expect(anulacaoDaNePvh({
      pvh_empenho_anulacoes: [{
        valor_anulado: 500, data_anulacao: "2026-11-09",
        numero_sei: "31476089",link_sei: dadosValidos.linkSei,
        motivo: dadosValidos.motivo,
      }],
    })?.valor_anulado).toBe(500);
  });

  it("extrato preserva valor original e uso global, sem contar a NE por mês", () => {
    const csv = construirExtratoNePvh([{
      id: "ne1",ano: 2026,prestadores: { nome_instituicao: "HMSJ" },
      status: "ativo",numero_ne:"6604/2026",nota_empenho_sei_numero:"31103833",
      valor_total: 1000,
      pvh_empenho_alocacoes: [
        { id:"a1",participante_id:"p1",valor_alocado:200 },
        { id:"a2",participante_id:"p2",valor_alocado:300 },
      ],
      pvh_empenho_anulacoes: [{
        valor_anulado:500,data_anulacao:"2026-11-09",numero_sei:"31476089",
        link_sei:dadosValidos.linkSei,motivo:dadosValidos.motivo,
      }],
    }], 2026);
    const linhas = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain('"1000,00"');
    expect(linhas[1]).toContain('"500,00"');
    expect(linhas[1]).toContain('"0,00"');
    expect(linhas[1]).toContain("Anulação contabilizada");
    expect(linhas[1]).toContain("31476089");
  });

  it("exportação de texto não executa fórmulas fornecidas por usuários", () => {
    const csv = construirExtratoNePvh([{
      id: "ne2", ano: 2026,prestadores: { nome_instituicao:"=SUM(1+1)" },
      status: "ativo", numero_ne: "1/2026", valor_total: 50,
      pvh_empenho_alocacoes: [],
      pvh_empenho_anulacoes: null,
    }], 2026);
    expect(csv).toContain('"\'=SUM(1+1)"');
  });
});
