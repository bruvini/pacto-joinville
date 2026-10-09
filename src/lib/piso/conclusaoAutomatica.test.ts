import { describe, expect, it } from "vitest";
import { conclusaoAutomaticaPermitidaPiso } from "./conclusaoAutomatica";

describe("conclusão automática do Piso", () => {
  it("não conclui Etapa 1 da 13ª somente porque os CNES já estão cadastrados", () => {
    expect(conclusaoAutomaticaPermitidaPiso(1, "decimo_terceiro")).toBe(false);
  });
  it("mantém o comportamento da competência mensal", () => {
    expect(conclusaoAutomaticaPermitidaPiso(1, "mensal")).toBe(true);
    expect(conclusaoAutomaticaPermitidaPiso(2, "mensal")).toBe(true);
  });
  it("permite prosseguir automaticamente depois da confirmação inicial da 13ª", () => {
    expect(conclusaoAutomaticaPermitidaPiso(2, "decimo_terceiro")).toBe(true);
    expect(conclusaoAutomaticaPermitidaPiso(null, "decimo_terceiro")).toBe(false);
  });
});
