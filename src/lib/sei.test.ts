import { describe, expect, it } from "vitest";
import { hrefSei, linkValido, normalizarLinkSei } from "./sei";

describe("links SEI", () => {
  const original = "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=123";
  it("mantém o destino e os parâmetros originais", () => {
    expect(linkValido(original)).toBe(true);
    expect(hrefSei(original)).toBe(original);
  });
  it("corrige separadores HTML copiados de outra página", () => {
    const colado = original.replace("&id_procedimento", "&amp;id_procedimento");
    expect(linkValido(colado)).toBe(true);
    expect(normalizarLinkSei(colado)).toBe(original);
    expect(hrefSei(colado)).toBe(original);
  });
  it("aceita domínio sem protocolo", () => {
    expect(hrefSei(original.replace("https://", ""))).toBe(original);
  });
  it("não abre esquemas, credenciais ou URLs malformadas", () => {
    for (const item of ["", "javascript:alert(1)", "data:text/html,abc", "https://",
      "https://https://sei.joinville.sc.gov.br/", "https://usuario:senha@sei.joinville.sc.gov.br/"]) {
      expect(linkValido(item)).toBe(false);
    }
  });
});
