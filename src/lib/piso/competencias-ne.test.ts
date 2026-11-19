import { describe, expect, it } from "vitest";
import { adicionarCompetenciaNe, competenciaNeValida, formatarCompetenciaNe, ordenarCompetenciasNe, removerCompetenciaNe } from "./competencias-ne";
describe("competências livres da NE", () => {
  it("aceita meses de exercícios diferentes e a parcela do décimo terceiro", () => {
    expect(adicionarCompetenciaNe(["12/2026"],"01/2027","12/2026")).toEqual(["12/2026","01/2027"]);
    expect(adicionarCompetenciaNe(["12/2026","01/2027"],"13/2026","12/2026")).toEqual(["12/2026","13/2026","01/2027"]);
    expect(competenciaNeValida("13/2027")).toBe(true);
  });
  it("impede chaves inválidas e não duplica períodos", () => {
    for(const chave of ["00/2026","14/2027","01/0000","1/2027","01/20","99/2027"])
      expect(competenciaNeValida(chave)).toBe(false);
    expect(adicionarCompetenciaNe(["01/2027"],"01/2027","01/2027")).toEqual(["01/2027"]);
    expect(adicionarCompetenciaNe([],"14/2027","12/2026")).toBeNull();
  });
  it("protege a competência atual e remove períodos opcionais", () => {
    expect(removerCompetenciaNe(["12/2026","01/2027"],"12/2026","12/2026")).toEqual(["12/2026","01/2027"]);
    expect(removerCompetenciaNe(["12/2026","01/2027"],"01/2027","12/2026")).toEqual(["12/2026"]);
  });
  it("formata a entrada e ordena cronologicamente entre exercícios", () => {
    expect(formatarCompetenciaNe("012027")).toBe("01/2027");
    expect(formatarCompetenciaNe("13/2026")).toBe("13/2026");
    expect(ordenarCompetenciasNe(["02/2027","13/2026","11/2026","01/2028"])).toEqual(["11/2026","13/2026","02/2027","01/2028"]);
  });
});
