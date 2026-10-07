import { describe, expect, it } from "vitest";
import {
  calcularAtividadeUsuarios,
  calcularSlaCacon,
  calcularSlaPiso,
  usuarioHumano,
} from "./modulos";

const dia = (n: number) =>
  new Date(Date.UTC(2026, 9, 1 + n, 12, 0, 0)).toISOString();

describe("dashboard modular", () => {
  it("remove ações automáticas e empilha ações humanas por módulo", () => {
    expect(usuarioHumano("Sistema")).toBeNull();
    expect(usuarioHumano("Sistema — correção")).toBeNull();
    expect(usuarioHumano("Bruno")).toBe("Bruno");

    const resultado = calcularAtividadeUsuarios({
      historico: [
        {
          usuario_nome: "Sistema",
          acao: "Correção automática",
          lancamento_id: "l1",
        },
        {
          usuario_nome: "Bruno",
          acao: "Lançamento atualizado",
          lancamento_id: "l1",
        },
        {
          usuario_nome: "Bruno",
          acao: "Prestação de contas recebida",
          lancamento_id: "l1",
        },
        {
          usuario_nome: "Maria",
          acao: "Piso · atualizado",
          piso_competencia_id: "p1",
        },
      ],
      caconLogs: [{ usuario_nome: "Bruno", competencia_id: "c1" }],
      idsLancamentos: new Set(["l1"]),
      idsPiso: new Set(["p1"]),
      idsCacon: new Set(["c1"]),
    });

    expect(resultado.find((item) => item.usuario === "Bruno")).toMatchObject({
      convenios: 1,
      prestacao: 1,
      cacon: 1,
      piso: 0,
      total: 3,
    });
    expect(resultado.some((item) => item.usuario.startsWith("Sistema"))).toBe(false);
  });

  it("calcula retenção real do Piso pela primeira conclusão de cada etapa", () => {
    const etapas = calcularSlaPiso(
      [{ id: "p1", created_at: dia(0) }],
      [
        {
          piso_competencia_id: "p1",
          data_hora: dia(1),
          detalhes: { etapas_concluidas: { de: {}, para: { "1": true } } },
        },
        {
          piso_competencia_id: "p1",
          data_hora: dia(3),
          detalhes: {
            etapas_concluidas: { de: { "1": true }, para: { "1": true, "2": true } },
          },
        },
      ],
    );

    expect(etapas[0].media).toBe(1);
    expect(etapas[1].media).toBe(2);
    expect(etapas[2].media).toBeNull();
  });

  it("calcula as três etapas do CACON a partir da trilha real", () => {
    const logs = [
      "data_recebimento",
      "hmsj_memorando_numero",
      "hmsj_memorando_link",
      "hmsj_anexo_numero",
      "hmsj_anexo_link",
    ].map((campo, index) => ({
      competencia_id: "c1",
      ocorrido_em: dia(index + 1),
      acao: "Dados da competência atualizados",
      detalhes: { campo },
    }));

    const etapas = calcularSlaCacon(
      [
        {
          id: "c1",
          created_at: dia(0),
          processado_em: dia(7),
          encaminhado_ses_ufi_em: dia(9),
        },
      ],
      logs,
    );

    expect(etapas.map((item) => item.media)).toEqual([5, 2, 2]);
  });
});
