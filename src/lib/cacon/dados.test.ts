import { describe, expect, it } from "vitest";
import { auditarDadosCacon } from "./dados";

describe("auditoria manual CACON", () => {
  it("aceita dados financeiros consistentes e mantém indicadores clínicos opcionais", () => {
    const auditoria = auditarDadosCacon({
      total_unidades: 100,
      valor_medio_unitario: 10,
      valor_medio_dia: 100,
      valor_fornecido: 1000,
      pacientes_oral: 5,
      dias_oral: 10,
      pacientes_enteral: null,
      dias_enteral: null,
    });

    expect(auditoria.criticas).toBe(0);
    expect(auditoria.alertas).toBe(0);
  });

  it("bloqueia confirmação quando os quatro campos financeiros obrigatórios são inválidos", () => {
    const auditoria = auditarDadosCacon({
      total_unidades: 0,
      valor_medio_unitario: null,
      valor_medio_dia: 0,
      valor_fornecido: null,
      pacientes_oral: null,
      dias_oral: null,
      pacientes_enteral: null,
      dias_enteral: null,
    });

    expect(auditoria.criticas).toBe(4);
    expect(auditoria.alertas).toBeGreaterThan(0);
  });

  it("gera alerta, sem bloquear, quando a média informada diverge do cálculo", () => {
    const auditoria = auditarDadosCacon({
      total_unidades: 100,
      valor_medio_unitario: 9,
      valor_medio_dia: 95,
      valor_fornecido: 1000,
      pacientes_oral: 5,
      dias_oral: 10,
      pacientes_enteral: 2,
      dias_enteral: 0,
    });

    expect(auditoria.criticas).toBe(0);
    expect(auditoria.alertas).toBe(2);
  });
});
