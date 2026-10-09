import { describe, expect, it } from "vitest";
import { calcularVolumeFinanceiroAcompanhado } from "./fluxoFinanceiro";

describe("volume gerencial acompanhado nos quatro módulos", () => {
  const quatro = [
    { id: "convenios" as const, valorReferencia: 92627568.5 },
    { id: "piso" as const, valorReferencia: 9700.68 },
    { id: "cacon" as const, valorReferencia: 427826.68 },
    { id: "pvh" as const, valorReferencia: 9046506.27 },
  ];

  it("soma apenas empenhado, homologado, produzido e publicado uma vez por módulo", () => {
    expect(calcularVolumeFinanceiroAcompanhado(quatro)).toBe(102111602.13);
  });
  it("não duplica métricas do mesmo módulo nem soma fases distintas", () => {
    expect(calcularVolumeFinanceiroAcompanhado([
      { id: "convenios", valorReferencia: 100 },
      { id: "piso", valorReferencia: 40 },
      { id: "cacon", valorReferencia: 25 },
      { id: "pvh", valorReferencia: 60 },
    ])).toBe(225);
  });
  it("preserva centavos e considera zero num recorte vazio", () => {
    expect(calcularVolumeFinanceiroAcompanhado([
      { id: "convenios", valorReferencia: 0.1 },
      { id: "piso", valorReferencia: 0.2 },
      { id: "cacon", valorReferencia: 0 },
      { id: "pvh", valorReferencia: 0 },
    ])).toBe(0.3);
  });
  it("não transforma grandeza inválida em valor financeiro positivo", () => {
    expect(calcularVolumeFinanceiroAcompanhado([
      { id: "convenios", valorReferencia: Number.NaN },
      { id: "piso", valorReferencia: -300 },
      { id: "cacon", valorReferencia: 100 },
      { id: "pvh", valorReferencia: 0 },
    ])).toBe(100);
  });
  it("detecta dupla inclusão de um mesmo módulo", () => {
    expect(() => calcularVolumeFinanceiroAcompanhado([
      { id: "pvh", valorReferencia: 100 },
      { id: "pvh", valorReferencia: 100 },
    ])).toThrow("Origem financeira duplicada");
  });
});
