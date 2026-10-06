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

  it("preserva as quatro colunas quando desconto e acerto vêm como hífen/zero", () => {
    const texto = `PORTARIA GM/MS Nº 12.207, DE 23 DE SETEMBRO DE 2026
      SC 420910 JOINVILLE MUNICIPAL 9.700,68 - 0 9.700,68
      SC 420900 JARAGUA DO SUL MUNICIPAL 999.999,99 111.111,11 22.222,22 911.111,10`;
    const r = extrairDadosPortariaGm(texto);
    expect([
      r.valor_homologado,
      r.desconto_saldo,
      r.acerto_contas,
      r.valor_transferido,
    ]).toEqual([9700.68, 0, 0, 9700.68]);
    expect(r.joinville_localizada).toBe(true);
  });

  it("não desloca acerto e transferido quando há desconto real", () => {
    const texto =
      "SC 420910 JOINVILLE MUNICIPAL 100.000,00 120.000,00 35.000,00 35.000,00 SC 420900 JARAGUA DO SUL MUNICIPAL 1,00 - - 1,00";
    const r = extrairDadosPortariaGm(texto);
    expect([
      r.valor_homologado,
      r.desconto_saldo,
      r.acerto_contas,
      r.valor_transferido,
    ]).toEqual([100000, 120000, 35000, 35000]);
  });
});
