import { describe, expect, it } from "vitest";
import { formatarEventoPiso } from "./historico";

describe("histórico do Piso", () => {
  it("traduz inclusão de participante sem expor nomes técnicos", () => {
    const evento = formatarEventoPiso({
      acao: "Piso · criado: piso_participantes",
      detalhes: { id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(evento).toEqual({
      titulo: "Instituição adicionada à competência",
      linhas: ["Identificação da instituição não registrada neste evento histórico."],
    });
  });

  it("formata mudanças de situação e valores", () => {
    const evento = formatarEventoPiso({
      acao: "Piso · atualizado: piso_participantes",
      detalhes: {
        instituicao_nome: "Hospital Bethesda",
        data_retorno: { de: null, para: "2026-09-10" },
        valor_devido: { de: 1000, para: 1250.5 },
        prestador_id: { de: "uuid-1", para: "uuid-2" },
      },
    });
    expect(evento.titulo).toBe("Retorno registrado — Hospital Bethesda");
    expect(evento.linhas).toEqual(["10/09/2026"]);
  });

  it("individualiza eventos das instituições no mesmo minuto", () => {
    const boj = formatarEventoPiso({
      acao: "Piso · criado: piso_arquivos",
      detalhes: {
        categoria: "planilha_carga",
        instituicao_nome: "Hospital Municipal São José",
        arquivo: "carga-hmsj.xlsx",
      },
    });
    const bethesda = formatarEventoPiso({
      acao: "Piso · criado: piso_arquivos",
      detalhes: {
        categoria: "planilha_carga",
        instituicao_nome: "Hospital Bethesda",
        arquivo: "carga-bethesda.xlsx",
      },
    });
    expect(boj.titulo).toContain("Hospital Municipal São José");
    expect(bethesda.titulo).toContain("Hospital Bethesda");
    expect(boj.titulo).not.toBe(bethesda.titulo);
  });

  it("traduz importação da Portaria e resultado da conciliação", () => {
    expect(
      formatarEventoPiso({
        acao: "Piso · atualizado: piso_competencias",
        detalhes: { portaria_gm_numero: { de: null, para: "12.207" } },
      }).titulo,
    ).toBe("Portaria GM/MS nº 12.207 importada");
    expect(
      formatarEventoPiso({
        acao: "Piso · atualizado: piso_competencias",
        detalhes: { conciliacao_auditoria: { criticas: 0, alertas: 2 } },
      }),
    ).toEqual({
      titulo: "Conciliação concluída sem críticas bloqueantes",
      linhas: ["0 crítica(s) · 2 alerta(s)"],
    });
  });

  it("usa texto seguro para eventos desconhecidos", () => {
    expect(formatarEventoPiso({ acao: "evento_interno", detalhes: { segredo: "x" } })).toEqual({
      titulo: "Atividade registrada na competência",
      linhas: [],
    });
  });
});
