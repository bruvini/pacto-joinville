import { describe, expect, it } from "vitest";
import { emailValido, montarNotificacaoPiso, normalizarEmail } from "./notificacao-email";

describe("notificação por e-mail do Piso", () => {
  it("normaliza e valida contatos", () => {
    expect(normalizarEmail(" Financeiro@Hospital.Org.Br ")).toBe("financeiro@hospital.org.br");
    expect(emailValido("financeiro@hospital.org.br")).toBe(true);
    expect(emailValido("email-invalido")).toBe(false);
  });

  it("gera assunto e corpo com competência e usuário", () => {
    const email = montarNotificacaoPiso("10/2026", "Bruno Teste");
    expect(email.assunto).toBe("Piso de Enfermagem - Outubro de 2026");
    expect(email.corpo).toContain("competência de outubro de 2026");
    expect(email.corpo).toContain("Bruno Teste");
    expect(email.corpo).toContain("Avisos de movimentos - Subempenho");
  });
});
