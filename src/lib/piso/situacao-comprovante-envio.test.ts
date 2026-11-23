import { describe, expect, it } from "vitest";
import { situacaoComprovanteEnvioPiso } from "./situacao-comprovante-envio";

describe("Piso · situação do comprovante de envio InvestSUS", () => {
  it("não exige comprovante quando a instituição declarou não haver elegíveis", () => {
    expect(situacaoComprovanteEnvioPiso(true, false)).toBe("nao_aplicavel");
  });

  it("distingue conferência efetiva de comprovante pendente", () => {
    expect(situacaoComprovanteEnvioPiso(false, true)).toBe("conferido");
    expect(situacaoComprovanteEnvioPiso(false, false)).toBe("pendente");
  });

  it("mantém a declaração sem elegíveis como não aplicável mesmo com evidência histórica", () => {
    expect(situacaoComprovanteEnvioPiso(true, true)).toBe("nao_aplicavel");
  });
});
