import { describe, it, expect } from "vitest";
import { filtrarPelaAcao, idsBuscadosAcao, validarBuscaAcao } from "./acoes-navegacao";

describe("link de ação para listagens", () => {
  it("seleciona somente competências indicadas pelo alerta", () => {
    const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filtrarPelaAcao(lista, { alerta: "cacon-critica", ids: "a,c" }))
      .toEqual([lista[0], lista[2]]);
  });
  it("mantém a listagem original sem IDs e mostra vazio com IDs desconhecidos", () => {
    const lista = [{ id: "a" }];
    expect(filtrarPelaAcao(lista, {})).toEqual(lista);
    expect(filtrarPelaAcao(lista, { ids: "x" })).toEqual([]);
  });
  it("ignora IDs inválidos e parâmetros longos sem conceder acesso", () => {
    expect([...idsBuscadosAcao({ ids: "a,../../secret,b" })!]).toEqual(["a", "b"]);
    expect(validarBuscaAcao({ ids: "x".repeat(9000), alerta: "piso-reconferir" }))
      .toMatchObject({ ids: undefined, alerta: "piso-reconferir" });
  });
});
