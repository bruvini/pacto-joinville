import { describe, expect, it } from "vitest";
import { valorAnulacaoParaCopiar } from "./valorAnulacao";

describe("Convênios · copiar valor da anulação", () => {
  it("preserva centavos, símbolo de moeda e separador de milhares", () => {
    expect(valorAnulacaoParaCopiar(1533179.25)).toBe("R$ 1.533.179,25");
    expect(valorAnulacaoParaCopiar(0.17)).toBe("R$ 0,17");
    expect(valorAnulacaoParaCopiar(500)).toBe("R$ 500,00");
  });
  it("copia sempre duas casas decimais e não confunde zero", () => {
    expect(valorAnulacaoParaCopiar(0)).toBe("R$ 0,00");
    expect(valorAnulacaoParaCopiar(100.5)).toBe("R$ 100,50");
  });
  it("bloqueia valores inválidos", () => {
    expect(() => valorAnulacaoParaCopiar(Number.NaN)).toThrow();
    expect(() => valorAnulacaoParaCopiar(-1)).toThrow();
    expect(() => valorAnulacaoParaCopiar(Infinity)).toThrow();
  });
});
