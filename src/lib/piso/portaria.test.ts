import { describe, expect, it } from "vitest";
import { extrairDadosPortariaGm } from "./portaria";

describe("extração da Portaria GM/MS", () => {
  it("reconhece o caso de setembro de 2026 e os quatro valores de Joinville", () => {
    const texto = `PORTARIA GM/MS Nº 12.207, DE 23 DE SETEMBRO DE 2026
      Publicação: 24/09/2026 | Edição: 181 | Seção: 1 | Página: 77
      SC 420910 JOINVILLE MUNICIPAL 5.000.000,00 100.000,00 25.000,00 4.925.000,00`;
    const r = extrairDadosPortariaGm(texto);
    expect(r.numero).toBe("12.207");
    expect(r.data_ato).toBe("2026-09-23");
    expect(r.data_publicacao).toBe("2026-09-24");
    expect([r.valor_homologado, r.desconto_saldo, r.acerto_contas, r.valor_transferido]).toEqual([
      5000000, 100000, 25000, 4925000,
    ]);
  });
});
