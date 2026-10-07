import { describe, expect, it } from "vitest";
import { lancamentoAcimaTeto, tetoMensalEfetivo } from "./limites";

describe("limites financeiros do lançamento", () => {
  it("usa teto do termo aditivo quando houver", () => {
    const termos = new Map([
      ["ta", { id: "ta", valor_total: 1500 }],
    ]);
    expect(
      tetoMensalEfetivo(
        { termo_aditivo_id: "ta" },
        { teto_mensal: 1000 },
        termos,
      ),
    ).toBe(1500);
  });

  it("faz fallback para teto mensal do convênio", () => {
    expect(
      lancamentoAcimaTeto(
        { valor_solicitado: 1100 },
        { teto_mensal: 1000 },
        new Map(),
      ),
    ).toBe(true);
  });
});
