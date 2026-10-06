import { describe, expect, it } from "vitest";
import { atraso, enesimoDiaUtilCompetencia } from "./prazos";

describe("prazos operacionais do Piso", () => {
  it("considera finais de semana e feriados cadastrados", () => {
    expect(enesimoDiaUtilCompetencia("09/2026", 5, ["2026-09-07"])).toBe("2026-09-08");
    expect(enesimoDiaUtilCompetencia("09/2026", 10, ["2026-09-07"])).toBe("2026-09-15");
  });

  it("classifica data tardia e pendência vencida como atraso", () => {
    expect(atraso("2026-09-09", "2026-09-08")).toBe(true);
    expect(atraso(null, "2026-09-08", "2026-09-07")).toBe(false);
    expect(atraso(null, "2026-09-08", "2026-09-09")).toBe(true);
  });
});
