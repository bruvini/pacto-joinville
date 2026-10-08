import { describe, expect, it } from "vitest";
import {
  competenciaAtualPvh,
  pendenciasPvh,
  prazoPagamentoCompetenciaPvh,
} from "./pvh";

describe("dashboard PVH", () => {
  it("cobra abertura no primeiro dia do mês quando a competência não existe", () => {
    const itens = pendenciasPvh([], new Date(2026, 9, 8));
    const abertura = itens.find((item) => item.tipo === "abertura");
    expect(abertura?.competencia).toBe("10/2026");
    expect(abertura?.dias).toBe(-7);
    expect(abertura?.severidade).toBe("critico");
  });

  it("define o limite de pagamento no fim do mês seguinte", () => {
    expect(prazoPagamentoCompetenciaPvh("09/2026")).toEqual(
      new Date(2026, 9, 31),
    );
    expect(competenciaAtualPvh(new Date(2026, 9, 8))).toBe("10/2026");
  });

  it("gera alerta do prazo de cinco dias úteis após crédito no FMS", () => {
    const itens = pendenciasPvh(
      [
        {
          id: "v1",
          competencia: "10/2026",
          status: "ativa",
          recurso_fms_data: "2026-10-01",
          pvh_participantes: [
            { valor_estadual: 1000, valor_municipal: 1000, valor_pago: 0 },
          ],
        },
      ],
      new Date(2026, 9, 9),
    );

    const repasse = itens.find((item) => item.tipo === "repasse_5_dias");
    expect(repasse).toBeDefined();
    expect(repasse?.severidade).toBe("critico");
  });
});
