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
  it("libera Portaria, Confirmar recurso e Empenho/Liquidação em paralelo após as etapas 1 e 2", () => {
    const concluidas = { "1": true, "2": true };
    expect(etapaLiberadaPiso(3, concluidas)).toBe(true);
    expect(etapaLiberadaPiso(4, concluidas)).toBe(true);
    expect(etapaLiberadaPiso(5, concluidas)).toBe(true);
    expect(etapaLiberadaPiso(4, concluidas, [3])).toBe(true);
    expect(etapaLiberadaPiso(6, concluidas)).toBe(false);

    const comEtapa3Pendente = {
      "1": true,
      "2": true,
      "4": true,
      "5": true,
    };
    expect(etapaLiberadaPiso(6, comEtapa3Pendente)).toBe(false);

    const prontasParaEpublica = {
      "1": true,
      "2": true,
      "3": true,
      "4": true,
      "5": true,
    };
    expect(etapaLiberadaPiso(6, prontasParaEpublica)).toBe(true);
    expect(etapaLiberadaPiso(6, prontasParaEpublica, [4])).toBe(false);
  });

  it("libera Pagamento e Notificação em paralelo após as etapas 1 a 6", () => {
    const concluidas = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [String(n), true]),
    );
    expect(etapasOperacionaisLiberadasPiso(concluidas)).toEqual({
      pagamento: true,
      notificacao: true,
    });
    expect(etapaLiberadaPiso(7, concluidas)).toBe(true);
    expect(etapaLiberadaPiso(8, concluidas)).toBe(true);
    expect(etapaLiberadaPiso(9, concluidas)).toBe(false);
    expect(etapaLiberadaPiso(8, concluidas, [4])).toBe(false);
  });

  it("13ª abre em cálculo/portaria sem considerar a preparação mensal", () => {
    expect(etapaAtualPiso({}, "decimo_terceiro")).toBe(2);
    expect(etapaLiberadaPiso(1, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(2, {}, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(3, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(4, {}, [], "decimo_terceiro")).toBe(false);
    expect(etapaLiberadaPiso(3, { "2": true }, [], "decimo_terceiro")).toBe(true);
    expect(etapaLiberadaPiso(4, { "2": true, "3": true }, [], "decimo_terceiro")).toBe(true);
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
