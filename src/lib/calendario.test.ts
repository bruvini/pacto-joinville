import { describe, expect, it } from "vitest";
import {
  ehDiaUtilJoinville,
  feriadosInstitucionaisJoinville,
  nthDiaUtilJoinville,
  pascoa,
} from "./calendario";

describe("calendário institucional de Joinville", () => {
  it("calcula os feriados móveis de Joinville em 2026", () => {
    expect(pascoa(2026)).toEqual(new Date(2026, 3, 5));

    const feriados = feriadosInstitucionaisJoinville(2026);
    expect(
      feriados.some(
        (feriado) =>
          feriado.data === "2026-04-03" &&
          feriado.nome === "Sexta-Feira da Paixão",
      ),
    ).toBe(true);
    expect(
      feriados.some(
        (feriado) =>
          feriado.data === "2026-06-04" &&
          feriado.nome === "Corpus Christi",
      ),
    ).toBe(true);
  });

  it("inclui feriados nacionais, municipal de Joinville e Data Magna de SC transferida", () => {
    const feriados = feriadosInstitucionaisJoinville(2026);
    expect(feriados.some((f) => f.data === "2026-01-01")).toBe(true);
    expect(
      feriados.some(
        (f) => f.data === "2026-03-09" && f.esfera === "municipal",
      ),
    ).toBe(true);
    expect(
      feriados.some(
        (f) => f.nome.includes("Data Magna") && f.esfera === "estadual",
      ),
    ).toBe(true);
  });

  it("não considera feriado um dia útil", () => {
    expect(ehDiaUtilJoinville(new Date(2026, 2, 9))).toBe(false);
    expect(ehDiaUtilJoinville(new Date(2026, 10, 2))).toBe(false);
    expect(ehDiaUtilJoinville(new Date(2026, 9, 7))).toBe(true);
  });

  it("desloca o 5º dia útil quando há feriado", () => {
    // 02/11/2026 (segunda-feira) é Finados.
    expect(nthDiaUtilJoinville(2026, 11, 5)).toEqual(new Date(2026, 10, 9));

    // 01/01/2026 é feriado; 02/01 é ponto facultativo, não feriado.
    expect(nthDiaUtilJoinville(2026, 1, 5)).toEqual(new Date(2026, 0, 8));
  });
});
