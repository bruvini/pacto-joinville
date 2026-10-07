import { describe, it, expect } from "vitest";
import {
  etapaAtualPiso,
  competenciaValida,
  etapaLiberadaPiso,
  etapasOperacionaisLiberadasPiso,
} from "./etapas";

describe("piso etapas", () => {
  it("etapa atual é a primeira pendente", () => {
    expect(etapaAtualPiso({})).toBe(1);
    expect(etapaAtualPiso({ "1": true, "2": true })).toBe(3);
    expect(
      etapaAtualPiso(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), true]))),
    ).toBe(9);
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

  it("valida competência", () => {
    expect(competenciaValida("05/2026")).toBe(true);
    expect(competenciaValida("13/2026")).toBe(false);
    expect(competenciaValida("5/2026")).toBe(false);
  });
});
