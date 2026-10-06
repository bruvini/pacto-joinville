import { describe, expect, it } from "vitest";
import { atraso, enesimoDiaUtilCompetencia, feriadosNacionaisFixos } from "./prazos";

describe("prazos operacionais do Piso", () => {
  it("considera automaticamente os feriados nacionais fixos", () => {
    expect(feriadosNacionaisFixos(2026)).toContain("2026-09-07");
    expect(enesimoDiaUtilCompetencia("09/2026", 5)).toBe("2026-09-08");
    expect(enesimoDiaUtilCompetencia("09/2026", 10)).toBe("2026-09-15");
    expect(enesimoDiaUtilCompetencia("09/2026", 15)).toBe("2026-09-22");
  });

  it("combina feriados configurados no banco com os nacionais fixos", () => {
    expect(enesimoDiaUtilCompetencia("09/2026", 5, ["2026-09-07"])).toBe("2026-09-08");
    expect(enesimoDiaUtilCompetencia("09/2026", 10, ["2026-09-07"])).toBe("2026-09-15");
  });

  it("classifica data tardia e pendência vencida como atraso", () => {
    expect(atraso("2026-09-09", "2026-09-08")).toBe(true);
    expect(atraso(null, "2026-09-08", "2026-09-07")).toBe(false);
    expect(atraso(null, "2026-09-08", "2026-09-09")).toBe(true);
  });
});
