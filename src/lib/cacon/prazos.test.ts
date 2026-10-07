import { describe, expect, it } from "vitest";
import { pendenciasCompetenciasCaconMensais } from "./prazos";

describe("prazo mensal do CACON", () => {
  it("cobra a competência corrente quando o prestador já está no fluxo e o mês não foi aberto", () => {
    const pendencias = pendenciasCompetenciasCaconMensais(
      [
        {
          prestador_id: "hmsj",
          competencia: "09/2026",
          prestadores: { nome_instituicao: "Hospital Municipal São José" },
        },
      ],
      new Date(2026, 9, 7),
    );

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].competencia).toBe("10/2026");
    expect(pendencias[0].severidade).toBe("preventivo");
  });

  it("torna crítica uma competência que fechou sem registro", () => {
    const pendencias = pendenciasCompetenciasCaconMensais(
      [
        {
          prestador_id: "hmsj",
          competencia: "07/2026",
          prestadores: { nome_instituicao: "Hospital Municipal São José" },
        },
        {
          prestador_id: "hmsj",
          competencia: "09/2026",
          prestadores: { nome_instituicao: "Hospital Municipal São José" },
        },
      ],
      new Date(2026, 9, 7),
    );

    expect(
      pendencias.some(
        (item) => item.competencia === "08/2026" && item.severidade === "critico",
      ),
    ).toBe(true);
    expect(
      pendencias.some((item) => item.competencia === "10/2026"),
    ).toBe(true);
  });
});
