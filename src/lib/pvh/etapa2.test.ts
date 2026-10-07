import { describe, expect, it } from "vitest";
import {
  alertasNormativosDocumentoPvh,
  conciliacaoEtapa2Pvh,
  etapa2ProntaPvh,
  TIPO_MEMORANDO_PVH,
  TIPO_MINUTA_PVH,
  TIPO_PORTARIA_MUNICIPAL_PVH,
} from "./etapa2";

const docs = [
  {
    id: "minuta",
    tipo_codigo: TIPO_MINUTA_PVH,
    numero_sei: "31000001",
    link_documento: "https://sei.joinville.sc.gov.br/minuta",
  },
  {
    id: "memo",
    tipo_codigo: TIPO_MEMORANDO_PVH,
    numero_sei: "31000002",
    link_documento: "https://sei.joinville.sc.gov.br/memorando",
  },
  {
    id: "portaria",
    tipo_codigo: TIPO_PORTARIA_MUNICIPAL_PVH,
    numero: "232/2026",
    data_documento: "2026-09-25",
    link_documento: "https://joinville.sc.gov.br/portaria",
  },
];

const assinaturas = [
  { documento_id: "minuta", revogado_em: null },
  { documento_id: "memo", revogado_em: null },
];

describe("Etapa 2 do PVH", () => {
  it("concilia por instituição e não esconde compensações no total", () => {
    const resultado = conciliacaoEtapa2Pvh([
      { id: "a", valor_estadual: 100, valor_municipal: 110 },
      { id: "b", valor_estadual: 200, valor_municipal: 190 },
    ]);

    expect(resultado.diferencaTotal).toBe(0);
    expect(resultado.possuiDivergencia).toBe(true);
    expect(resultado.itens.every((item) => !item.conciliado)).toBe(true);
  });

  it("exige documentos, assinaturas, valores e justificativa quando houver divergência", () => {
    const participantes = [
      { id: "a", valor_estadual: 100, valor_municipal: 100 },
      { id: "b", valor_estadual: 200, valor_municipal: 200 },
    ];

    expect(
      etapa2ProntaPvh({
        participantes,
        documentos: docs,
        assinaturas,
        justificativaDivergencia: "",
      }),
    ).toBe(true);

    expect(
      etapa2ProntaPvh({
        participantes: [{ id: "a", valor_estadual: 100, valor_municipal: 90 }],
        documentos: docs,
        assinaturas,
        justificativaDivergencia: "",
      }),
    ).toBe(false);

    expect(
      etapa2ProntaPvh({
        participantes: [{ id: "a", valor_estadual: 100, valor_municipal: 90 }],
        documentos: docs,
        assinaturas,
        justificativaDivergencia: "Ajuste formal publicado no ato municipal.",
      }),
    ).toBe(true);
  });

  it("avisa referência normativa incompatível sem reescrever o histórico", () => {
    expect(
      alertasNormativosDocumentoPvh({
        competencia: "09/2026",
        normativaCompetenciaId: "nova",
        normativaDocumentoId: "antiga",
        referenciaTexto: "Deliberação 745/CIB/2023",
      }),
    ).toHaveLength(2);

    expect(
      alertasNormativosDocumentoPvh({
        competencia: "09/2026",
        normativaCompetenciaId: "nova",
        normativaDocumentoId: "nova",
        referenciaTexto: "Deliberação 416/CIB/2026, de 17/07/2026",
      })[0],
    ).toContain("17/06/2026");
  });
});
