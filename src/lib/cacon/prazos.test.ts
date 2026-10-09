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

  it("um lançamento residual de julho/2025 gera cinco falsos atrasos quando o monitoramento válido começou em 2026", () => {
    const base = Array.from({ length: 10 }, (_, i) => ({
      prestador_id: "hmsj",
      competencia: `${String(i + 1).padStart(2, "0")}/2026`,
    }));
    const comResidual = [
      { prestador_id: "hmsj", competencia: "07/2025" },
      ...base,
    ];
    const antes = pendenciasCompetenciasCaconMensais(comResidual, new Date(2026, 9, 9));
    expect(antes.map(p => p.competencia)).toEqual([
      "08/2025", "09/2025", "10/2025", "11/2025", "12/2025",
    ]);
    // A origem do alerta é o registro antigo, não um cache ou soma duplicada.
    expect(pendenciasCompetenciasCaconMensais(base, new Date(2026, 9, 9))).toEqual([]);
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
