import { describe, expect, it } from "vitest";
import { formatarEventoPiso } from "./historico";

describe("histórico do Piso", () => {
  it("traduz inclusão de participante sem expor nomes técnicos", () => {
    const evento = formatarEventoPiso({
      acao: "Piso · criado: piso_participantes",
      detalhes: { id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(evento).toEqual({ titulo: "Instituição adicionada à competência", linhas: [] });
  });

  it("formata mudanças de situação e valores", () => {
    const evento = formatarEventoPiso({
      acao: "Piso · atualizado: piso_participantes",
      detalhes: {
        situacao: { de: "enviado", para: "retornado" },
        valor_devido: { de: 1000, para: 1250.5 },
        prestador_id: { de: "uuid-1", para: "uuid-2" },
      },
    });
    expect(evento.titulo).toBe("Retorno da instituição registrado");
    expect(evento.linhas).toEqual([
      "Situação da instituição: Enviado → Retornado",
      "Valor devido: R$\u00a01.000,00 → R$\u00a01.250,50",
    ]);
  });

  it("usa texto seguro para eventos desconhecidos", () => {
    expect(formatarEventoPiso({ acao: "evento_interno", detalhes: { segredo: "x" } })).toEqual({
      titulo: "Atividade registrada na competência",
      linhas: [],
    });
  });
});
