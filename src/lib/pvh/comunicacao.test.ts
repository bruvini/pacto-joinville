import { describe, expect, it } from "vitest";
import {
  montarComunicacaoPvh,
  numeroInteiroPorExtensoPvh,
  valorPorExtensoBrlPvh,
} from "./comunicacao";

describe("Comunicação do PVH", () => {
  it("converte valores relevantes do PVH por extenso", () => {
    expect(numeroInteiroPorExtensoPvh(1240000)).toBe(
      "um milhão e duzentos e quarenta mil",
    );
    expect(valorPorExtensoBrlPvh(1775502.09)).toBe(
      "um milhão, setecentos e setenta e cinco mil e quinhentos e dois reais e nove centavos",
    );
  });

  it("monta assunto e corpo com competência, valor, empenho e Portaria", () => {
    const modelo = montarComunicacaoPvh({
      competencia: "09/2026",
      valor: 1240000,
      empenhos: ["6015/2026"],
      portariaMunicipal: "195/2026/SES",
      usuarioNome: "Bruno da Silva",
    });

    expect(modelo.assunto).toBe(
      "Programa de Valorização dos Hospitais - PVH - 09/2026",
    );
    expect(modelo.corpo).toContain("1.240.000,00");
    expect(modelo.corpo).toContain("um milhão e duzentos e quarenta mil reais");
    expect(modelo.corpo).toContain("- Empenho nº 6015/2026");
    expect(modelo.corpo).toContain("- Portaria nº 195/2026/SES");
    expect(modelo.corpo).toContain("Bruno da Silva");
  });

  it("preserva múltiplas NEs quando a competência usa cobertura complementar", () => {
    const modelo = montarComunicacaoPvh({
      competencia: "09/2026",
      valor: 1775502.09,
      empenhos: ["4086/2026", "6016/2026"],
      portariaMunicipal: "31013073",
      usuarioNome: "Usuário",
    });

    expect(modelo.corpo).toContain(
      "- Empenhos nº 4086/2026, 6016/2026",
    );
  });
});
