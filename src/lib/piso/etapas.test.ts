import { describe, it, expect } from "vitest";
import { etapaAtualPiso, competenciaValida } from "./etapas";

describe("piso etapas", () => {
  it("etapa atual é a primeira pendente", () => {
    expect(etapaAtualPiso({})).toBe(1);
    expect(etapaAtualPiso({ "1": true, "2": true })).toBe(3);
    expect(
      etapaAtualPiso(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), true]))),
    ).toBe(9);
  });
  it("valida competência", () => {
    expect(competenciaValida("05/2026")).toBe(true);
    expect(competenciaValida("13/2026")).toBe(false);
    expect(competenciaValida("5/2026")).toBe(false);
  });
});
