import { describe, it, expect } from "vitest";
import {
  etapaAtualPiso,
  competenciaValida,
  etapaLiberadaPiso,
  etapasOperacionaisLiberadasPiso,
  etapasVisiveisPiso,
  numeroVisualEtapaPiso,
} from "./etapas";

describe("piso etapas", () => {
  it("etapa atual é a primeira pendente", () => {
    expect(etapaAtualPiso({})).toBe(1);
    expect(etapaAtualPiso({ "1": true, "2": true })).toBe(3);
    expect(
      etapaAtualPiso(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), true]))),
    ).toBe(9);
  });
  it("abre as etapas 1 e 5 na competência mensal sem pré-requisitos", () => {
    const c = {};
    expect(etapaLiberadaPiso(1, c)).toBe(true);
    expect(etapaLiberadaPiso(5, c)).toBe(true);
    for (const n of [2, 3, 4, 6, 7, 8, 9]) {
      expect(etapaLiberadaPiso(n, c)).toBe(false);
    }
  });
  it("libera o eixo assistencial em sequência 1→2→3→4", () => {
    expect(etapaLiberadaPiso(2, { "1": true })).toBe(true);
    expect(etapaLiberadaPiso(3, { "1": true })).toBe(false);
    expect(etapaLiberadaPiso(3, { "2": true })).toBe(true);
    expect(etapaLiberadaPiso(4, { "1": true, "2": true })).toBe(false);
    expect(etapaLiberadaPiso(4, { "3": true })).toBe(true);
    expect(etapaLiberadaPiso(4, { "3": true }, [3])).toBe(false);
  });
  it("libera eixo financeiro independente de 1–4: 5→6→(7,8)", () => {
    const eixo = { "5": true };
    expect(etapaLiberadaPiso(6, eixo)).toBe(true);
    expect(etapaLiberadaPiso(6, eixo, [5])).toBe(false);
    expect(etapaLiberadaPiso(7, eixo)).toBe(false);
    expect(etapaLiberadaPiso(8, eixo)).toBe(false);
    const liberado = { "5": true, "6": true };
    expect(etapaLiberadaPiso(7, liberado)).toBe(true);
    expect(etapaLiberadaPiso(8, liberado)).toBe(true);
    expect(etapasOperacionaisLiberadasPiso(liberado)).toEqual({
      pagamento: true, notificacao: true,
    });
    expect(etapasOperacionaisLiberadasPiso(liberado, [6])).toEqual({
      pagamento: false, notificacao: false,
    });
    expect(etapaLiberadaPiso(9, liberado)).toBe(false);
  });
  it("encerramento exige ambos os eixos concluídos e reconferidos", () => {
    const all = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(n => [String(n), true]));
    expect(etapaLiberadaPiso(9, all)).toBe(true);
    expect(etapaLiberadaPiso(9, all, [4])).toBe(false);
    expect(etapaLiberadaPiso(9, all, [5])).toBe(false);
    expect(etapaLiberadaPiso(9, { ...all, "8": false })).toBe(false);
  });

  it("13ª abre em cálculo/portaria sem considerar a preparação mensal", () => {
    expect(etapaAtualPiso({}, "decimo_terceiro")).toBe(2);
    expect(etapaLiberadaPiso(1, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(2, {}, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(3, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(4, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(5, {}, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(3, { "2": true }, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(4, { "2": true, "3": true }, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(6, { "5": true }, [], "decimo_terceiro")).toBe(true);
  });
  it("13ª habilita pagamento e comunicação depois das etapas operacionais", () => {
    const concluidas = Object.fromEntries([2, 3, 4, 5, 6].map(n => [String(n), true]));
    expect(etapasOperacionaisLiberadasPiso(concluidas, [], "decimo_terceiro")).toEqual({
      pagamento: true, notificacao: true,
    });
    expect(etapaLiberadaPiso(7, concluidas, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(9, concluidas, [], "decimo_terceiro")).toBe(false);
  });

  it("13ª apresenta oito etapas com cálculo e Portaria antes dos atos municipais", () => {
    expect(etapasVisiveisPiso("decimo_terceiro").map(e => e.n))
      .toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numeroVisualEtapaPiso(2, "decimo_terceiro")).toBe(1);
    expect(numeroVisualEtapaPiso(3, "decimo_terceiro")).toBe(2);
    expect(numeroVisualEtapaPiso(9, "decimo_terceiro")).toBe(8);
  });

  it("valida competência", () => {
    expect(competenciaValida("05/2026")).toBe(true);
    expect(competenciaValida("13/2026")).toBe(false);
    expect(competenciaValida("5/2026")).toBe(false);
  });
});
