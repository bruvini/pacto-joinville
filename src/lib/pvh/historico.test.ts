import { describe, expect, it } from "vitest";
import {
  formatarEventoHistoricoPvh,
  ordenarHistoricoPvh,
  rotuloTipoDocumentoPvh,
} from "./historico";

const participantes = [
  {
    id: "part-1",
    prestador_id: "prest-1",
    prestadores: { nome_instituicao: "Hospital Municipal São José" },
  },
];

describe("histórico PVH em linguagem administrativa", () => {
  it("traduz inclusão de participante e remove identificadores técnicos", () => {
    const evento = formatarEventoHistoricoPvh(
      {
        acao: "PVH · insert: pvh_participantes",
        detalhes: {
          depois: {
            id: "part-1",
            competencia_id: "comp-1",
            prestador_id: "prest-1",
            valor_estadual: 1234.56,
            notificar_email: true,
            exige_prestacao_contas: false,
          },
        },
      },
      { participantes },
    );

    expect(evento.titulo).toBe(
      "Instituição incluída na competência · Hospital Municipal São José",
    );
    expect(evento.titulo).not.toContain("_");
    expect(evento.detalhes.join(" ")).toContain("Valor publicado pelo Estado");
    expect(evento.detalhes.join(" ")).not.toContain("prestador_id");
    expect(evento.detalhes.join(" ")).not.toContain("competencia_id");
  });

  it("explica alteração de competência mostrando somente mudanças úteis", () => {
    const evento = formatarEventoHistoricoPvh(
      {
        acao: "PVH · update: pvh_competencias",
        detalhes: {
          antes: {
            id: "comp-1",
            competencia: "09/2026",
            status: "preparacao",
            recurso_fms_valor: null,
          },
          depois: {
            id: "comp-1",
            competencia: "09/2026",
            status: "ativa",
            recurso_fms_valor: 1000,
          },
        },
      },
      { competencia: { competencia: "09/2026" } },
    );

    expect(evento.titulo).toBe("Competência PVH atualizada · 09/2026");
    expect(evento.detalhes.some((item) => item.startsWith("Situação:"))).toBe(true);
    expect(
      evento.detalhes.some((item) => item.includes("Valor creditado no FMS")),
    ).toBe(true);
  });

  it("traduz os tipos documentais sem underscore", () => {
    expect(rotuloTipoDocumentoPvh("minuta_portaria_municipal")).toBe(
      "Minuta da Portaria Municipal",
    );
    expect(rotuloTipoDocumentoPvh("memorando_portaria_municipal")).toBe(
      "Memorando de encaminhamento",
    );
  });

  it("ordena o relatório do evento inicial para os posteriores", () => {
    const logs = ordenarHistoricoPvh([
      {
        id: "2",
        data_hora: "2026-10-08T13:58:00Z",
        acao: "PVH · insert: pvh_participantes",
      },
      {
        id: "1",
        data_hora: "2026-10-08T13:58:00Z",
        acao: "PVH · insert: pvh_competencias",
      },
    ]);

    expect(logs.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
