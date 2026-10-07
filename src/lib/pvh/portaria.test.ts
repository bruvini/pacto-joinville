import { describe, expect, it } from "vitest";
import { extrairPortariaSes, normalizarEntradaPortariaSes } from "./portaria";

describe("parser de Portaria SES do PVH", () => {
  it("normaliza o exemplo institucional e extrai a data", () => {
    expect(extrairPortariaSes("PORTARIA Nº 3186, DE 21/9/2026")).toEqual({
      numero: "SES Nº 3186",
      data: "2026-09-21",
    });
  });

  it.each([
    "portaria n° 3186, de 21/09/2026",
    "PORTARIA N 3186 DE 21.09.2026",
    "Portaria SES nº 3186, de 21-9-2026",
    "SES Nº 3186, DE 21/9/2026",
  ])("aceita variações de escrita: %s", (valor) => {
    expect(extrairPortariaSes(valor)).toEqual({
      numero: "SES Nº 3186",
      data: "2026-09-21",
    });
  });

  it("normaliza o número sem inventar uma data ausente", () => {
    expect(extrairPortariaSes("PORTARIA Nº 3186")).toEqual({
      numero: "SES Nº 3186",
      data: null,
    });
  });

  it("preserva entrada não reconhecida e a data já preenchida", () => {
    expect(normalizarEntradaPortariaSes("Ato estadual especial", "2026-09-21")).toEqual({
      numero: "Ato estadual especial",
      data: "2026-09-21",
      reconhecida: false,
    });
  });

  it("ignora data impossível", () => {
    expect(extrairPortariaSes("PORTARIA Nº 3186, DE 31/2/2026")).toEqual({
      numero: "SES Nº 3186",
      data: null,
    });
  });
});
