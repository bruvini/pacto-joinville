import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("./EtapasPiso.tsx", import.meta.url)),
  "utf8",
);

describe("regressão da renderização do Piso", () => {
  it("não referencia observacao13 removida da reorganização do fluxo", () => {
    expect(fonte).not.toMatch(/\bobservacao13\b/);
  });

  it("mantém a etapa mensal e a 13ª com seus conteúdos próprios", () => {
    expect(fonte).toContain("if (n === 1)");
    expect(fonte).toContain('else if (n === 2 && c.tipo_parcela === "decimo_terceiro")');
    expect(fonte).toContain("<Simulador13Piso");
    expect(fonte).toContain("<PortariaFederal13Piso");
  });
});
