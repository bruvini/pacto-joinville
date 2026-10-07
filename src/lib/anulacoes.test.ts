import { describe, expect, it } from "vitest";
import {
  anulacoesSemRastreabilidadeSei,
  derivarAnulacoes,
} from "./anulacoes";

describe("auditoria de anulações", () => {
  it("não duplica filhos e deriva a anulação do processo-pai", () => {
    const dados = [
      { id: "p", competencia: "07/2026, 08/2026", valor_solicitado: 1000 },
      { id: "f1", parent_id: "p", competencia: "07/2026", valor_atestado: 400, concluido: true },
      { id: "f2", parent_id: "p", competencia: "08/2026", valor_atestado: 500, concluido: true },
    ];

    const resultado = derivarAnulacoes(dados);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("p");
    expect(resultado[0]._anulado).toBe(100);
  });

  it("usa a mesma base para pendência de rastreabilidade SEI", () => {
    const dados = [
      {
        id: "a",
        competencia: "08/2026",
        valor_solicitado: 100,
        valor_atestado: 80,
        valor_anulado: 20,
        link_anulacao_sei: null,
      },
      {
        id: "b",
        competencia: "08/2026",
        valor_solicitado: 100,
        valor_atestado: 90,
        valor_anulado: 10,
        link_anulacao_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1",
      },
    ];

    expect(anulacoesSemRastreabilidadeSei(dados).map((item) => item.id)).toEqual(["a"]);
  });
});
