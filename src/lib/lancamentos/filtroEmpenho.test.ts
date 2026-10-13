import { describe, expect, it } from "vitest";
import { correspondeNumeroEmpenho, correspondeEmpenhoFamilia, filtrarFilhosPorEmpenho } from "./filtroEmpenho";
describe("busca de lançamentos pelo empenho da Etapa 5", () => {
  it("busca pelo começo do número ou número/ano informado", () => {
    expect(correspondeNumeroEmpenho("6610/2026", "6610")).toBe(true);
    expect(correspondeNumeroEmpenho("6610/2026", "6610/2026")).toBe(true);
    expect(correspondeNumeroEmpenho("6610/2026", "66")).toBe(true);
    expect(correspondeNumeroEmpenho("6610/2026", " 6610 / 2026 ")).toBe(true);
    expect(correspondeNumeroEmpenho("6610/2026", "6610/2025")).toBe(false);
  });
  it("não acha notas pelo ano isolado, por número incompatível ou campo vazio", () => {
    expect(correspondeNumeroEmpenho("6610/2026", "2026")).toBe(false);
    expect(correspondeNumeroEmpenho("6610/2026", "16610")).toBe(false);
    expect(correspondeNumeroEmpenho(null, "6610")).toBe(false);
    expect(correspondeNumeroEmpenho(undefined, "6610")).toBe(false);
    expect(correspondeNumeroEmpenho("6610/2026", "abc")).toBe(false);
    expect(correspondeNumeroEmpenho(null, "")).toBe(true);
  });
  it("permite NE herdada do pai e preserva todas suas filhas", () => {
    const pai = { numero_empenho: "6610/2026" };
    const filhos = [{ numero_empenho: null }, { numero_empenho: "5006/2026" }];
    expect(correspondeEmpenhoFamilia(pai, filhos, "6610")).toBe(true);
    expect(filtrarFilhosPorEmpenho(pai, filhos, "6610")).toEqual(filhos);
  });
  it("encontra o pai pela nota da filha, exibindo somente a filha correspondente", () => {
    const pai = { numero_empenho: null };
    const filhos = [{ id: "a", numero_empenho: "6610/2026" },
      { id: "b", numero_empenho: "5006/2026" }, { id: "c", numero_empenho: null }];
    expect(correspondeEmpenhoFamilia(pai, filhos, "6610")).toBe(true);
    expect(filtrarFilhosPorEmpenho(pai, filhos, "6610")).toEqual([filhos[0]]);
    expect(correspondeEmpenhoFamilia(pai, filhos, "4977")).toBe(false);
  });
  it("admite texto legado com múltiplas notas e mantém o exercício", () => {
    expect(correspondeNumeroEmpenho("NE 6610/2026, NE 4819/2025", "4819/2025")).toBe(true);
    expect(correspondeNumeroEmpenho("NE 6610/2026, NE 4819/2025", "4819/2026")).toBe(false);
  });
});
