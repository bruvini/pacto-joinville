import { describe, expect, it } from "vitest";
import { resumirProducaoCacon, valorAuditadoCacon } from "./cacon-financeiro";

describe("produção CACON no dashboard", () => {
  it("não inclui competência aberta sem produção auditada no divisor da média", () => {
    const r = resumirProducaoCacon([
      { competencia: "09/2026", status: "concluida", valor_fornecido: 34130.48 },
      { competencia: "10/2026", status: "aberta", valor_fornecido: null },
    ]);
    expect(r).toEqual({
      totalAuditado: 34130.48,
      competenciasAuditadas: 1,
      mediaPorCompetenciaAuditada: 34130.48,
    });
  });

  it("somente soma valor em competência concluída ou extração confirmada", () => {
    expect(valorAuditadoCacon({ competencia: "10/2026", status: "aberta", valor_fornecido: 1000 })).toBeNull();
    expect(valorAuditadoCacon({
      competencia: "10/2026", status: "aberta", valor_fornecido: 1000,
      extracao: { confirmada_em: "2026-10-08T13:00:00Z" },
    })).toBe(1000);
  });

  it("mantém zero explícito e precisão de centavos", () => {
    expect(resumirProducaoCacon([
      { competencia: "01/2026", status: "concluida", valor_fornecido: 0 },
      { competencia: "02/2026", status: "concluida", valor_fornecido: 0.10 },
      { competencia: "03/2026", status: "concluida", valor_fornecido: 0.20 },
    ])).toEqual({
      totalAuditado: 0.30, competenciasAuditadas: 3, mediaPorCompetenciaAuditada: 0.10,
    });
  });

  it("valor de 2025 ainda é incluído quando existe na origem: só limpeza real o retira", () => {
    const comLegado = [
      { competencia: "07/2025", status: "concluida", valor_fornecido: 24249.19 },
      { competencia: "01/2026", status: "concluida", valor_fornecido: 43588.68 },
    ];
    expect(resumirProducaoCacon(comLegado).totalAuditado).toBe(67837.87);
    expect(resumirProducaoCacon(comLegado.filter(c => c.competencia.endsWith("/2026"))).totalAuditado)
      .toBe(43588.68);
  });
});
