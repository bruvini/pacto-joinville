import { describe, expect, it } from "vitest";
import { proximaEtapaAposConclusaoPvh } from "./fluxoNavegacao";

describe("avanço explícito PVH", () => {
  it("avança em ordem após concluir etapas 1 a 4", () => {
    expect([1, 2, 3, 4].map((n) => proximaEtapaAposConclusaoPvh(n)))
      .toEqual([2, 3, 4, 5]);
  });
  it("da Etapa 5 vai para Comunicação se ainda estiver pendente", () => {
    expect(proximaEtapaAposConclusaoPvh(5, { "6": false })).toBe(6);
  });
  it("da Etapa 5 vai direto ao Encerramento quando a Comunicação já terminou", () => {
    expect(proximaEtapaAposConclusaoPvh(5, { "6": true })).toBe(7);
  });
  it("da Etapa 6 retorna ao Pagamento pendente sem liberar antecipadamente a 7", () => {
    expect(proximaEtapaAposConclusaoPvh(6, { "5": false })).toBe(5);
    expect(proximaEtapaAposConclusaoPvh(6, { "5": true })).toBe(7);
  });
  it("a Etapa 7 não possui avanço", () => {
    expect(proximaEtapaAposConclusaoPvh(7)).toBeNull();
  });
});
