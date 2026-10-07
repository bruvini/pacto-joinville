import { describe, expect, it } from "vitest";
import {
  mascaraColagemMoedaBrl,
  mascaraMoedaBrl,
  moedaBrlDeNumero,
  numeroMoedaBrl,
} from "./moeda";

describe("moeda BRL do PVH", () => {
  it("aplica máscara progressiva em centavos durante a digitação", () => {
    expect(mascaraMoedaBrl("1")).toBe("0,01");
    expect(mascaraMoedaBrl("123")).toBe("1,23");
    expect(mascaraMoedaBrl("123456")).toBe("1.234,56");
  });

  it("interpreta colagem formatada em BRL", () => {
    expect(mascaraColagemMoedaBrl("R$ 1.240.000,00")).toBe("1.240.000,00");
    expect(mascaraColagemMoedaBrl("1.775.502,09")).toBe("1.775.502,09");
  });

  it("interpreta número inteiro colado como reais, não como centavos", () => {
    expect(mascaraColagemMoedaBrl("1240000")).toBe("1.240.000,00");
  });

  it("interpreta decimal com ponto colado", () => {
    expect(mascaraColagemMoedaBrl("1775502.09")).toBe("1.775.502,09");
  });

  it("converte máscara para número e número para máscara", () => {
    expect(numeroMoedaBrl("1.775.502,09")).toBe(1775502.09);
    expect(moedaBrlDeNumero(1775502.09)).toBe("1.775.502,09");
  });

  it("mantém vazio sem transformar em zero visual", () => {
    expect(mascaraMoedaBrl("")).toBe("");
    expect(moedaBrlDeNumero(null)).toBe("");
  });
});
