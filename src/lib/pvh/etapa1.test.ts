import { describe, expect, it } from "vitest";
import { etapa1ProntaPvh } from "./etapa1";

const completa = {
  numeroPortaria: "SES Nº 3186",
  dataPortaria: "2026-09-21",
  linkOficial: "https://saude.sc.gov.br/portaria",
  valores: [1240000, 1775502.09],
};

describe("conclusão da Etapa 1 do PVH", () => {
  it("só libera conclusão com todos os requisitos", () => {
    expect(etapa1ProntaPvh(completa)).toBe(true);
  });

  it("bloqueia sem identificação, data, link ou valores positivos", () => {
    expect(etapa1ProntaPvh({ ...completa, numeroPortaria: "" })).toBe(false);
    expect(etapa1ProntaPvh({ ...completa, dataPortaria: "" })).toBe(false);
    expect(etapa1ProntaPvh({ ...completa, linkOficial: "" })).toBe(false);
    expect(etapa1ProntaPvh({ ...completa, valores: [1240000, 0] })).toBe(false);
    expect(etapa1ProntaPvh({ ...completa, valores: [] })).toBe(false);
  });
});
