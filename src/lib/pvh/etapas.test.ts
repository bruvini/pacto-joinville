import { describe, expect, it } from "vitest";
import {
  competenciaValidaPvh,
  etapaAtualPvh,
  etapaLiberadaPvh,
  prerequisitosEtapaPvh,
} from "./etapas";

describe("fluxo PVH", () => {
  it("valida competência mensal", () => {
    expect(competenciaValidaPvh("10/2026")).toBe(true);
    expect(competenciaValidaPvh("13/2026")).toBe(false);
  });

  it("libera portaria municipal, empenho e recurso após a portaria estadual", () => {
    const concluidas = { "1": true };
    expect(etapaLiberadaPvh(2, concluidas)).toBe(true);
    expect(etapaLiberadaPvh(3, concluidas)).toBe(true);
    expect(etapaLiberadaPvh(4, concluidas)).toBe(true);
    expect(etapaLiberadaPvh(5, concluidas)).toBe(false);
  });

  it("exige empenho e recurso para subempenho", () => {
    const concluidas = { "1": true, "3": true, "4": true };
    expect(etapaLiberadaPvh(5, concluidas)).toBe(true);
    expect(prerequisitosEtapaPvh(5)).toEqual([3, 4]);
  });

  it("não libera pagamento sem portaria municipal e subempenho", () => {
    expect(etapaLiberadaPvh(6, { "1": true, "3": true, "4": true, "5": true })).toBe(false);
    expect(
      etapaLiberadaPvh(6, {
        "1": true,
        "2": true,
        "3": true,
        "4": true,
        "5": true,
      }),
    ).toBe(true);
  });

  it("calcula a primeira etapa ainda não concluída", () => {
    expect(etapaAtualPvh({})).toBe(1);
    expect(etapaAtualPvh({ "1": true, "2": true })).toBe(3);
    expect(etapaAtualPvh({}, "encerrada")).toBe(8);
  });
});
