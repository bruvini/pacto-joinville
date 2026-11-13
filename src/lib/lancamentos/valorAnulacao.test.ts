import { describe, expect, it } from "vitest";
import { valorAnulacaoParaCopiar } from "./valorAnulacao";

describe("Convênios · copiar valor da anulação", () => {
  it("preserva centavos e elimina símbolo de moeda e separador de milhar", () => {
    expect(valorAnulacaoParaCopiar(1533179.25)).toBe("1533179,25");
    expect(valorAnulacaoParaCopiar(0.17)).toBe("0,17");
    expect(valorAnulacaoParaCopiar(500)).toBe("500,00");
  });
  it("copia sempre duas casas decimais e não confunde zero", () => {
    expect(valorAnulacaoParaCopiar(0)).toBe("0,00");
    expect(valorAnulacaoParaCopiar(100.5)).toBe("100,50");
  });
  it("bloqueia valores inválidos", () => {
    expect(() => valorAnulacaoParaCopiar(Number.NaN)).toThrow();
    expect(() => valorAnulacaoParaCopiar(-1)).toThrow();
    expect(() => valorAnulacaoParaCopiar(Infinity)).toThrow();
  });
});
