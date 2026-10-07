import { describe, expect, it } from "vitest";
import { montarEsteiraCacon, montarEsteiraPiso } from "./esteiras";

describe("esteiras dos módulos mensais", () => {
  it("inclui concluídos no Piso", () => {
    const colunas = montarEsteiraPiso([
      {
        id: "a",
        status: "em_andamento",
        etapas_concluidas: { "1": true, "2": true },
        valor_homologado: 100,
      },
      {
        id: "b",
        status: "encerrada",
        etapas_concluidas: Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [String(i + 1), true]),
        ),
        valor_homologado: 200,
      },
    ]);

    expect(colunas.at(-1)?.slug).toBe("piso-concluidos");
    expect(colunas.at(-1)?.n).toBe(1);
    expect(colunas.at(-1)?.valor).toBe(200);
  });

  it("inclui concluídos no CACON", () => {
    const colunas = montarEsteiraCacon([
      { id: "a", status: "aberta", valor_fornecido: 10 },
      { id: "b", status: "concluida", valor_fornecido: 20 },
    ]);

    expect(colunas.at(-1)?.slug).toBe("cacon-concluidos");
    expect(colunas.at(-1)?.n).toBe(1);
    expect(colunas.at(-1)?.valor).toBe(20);
  });
});
