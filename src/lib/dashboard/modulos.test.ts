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
      idsPvh: new Set(["v1"]),
    });

    expect(resultado.find((item) => item.usuario === "Bruno")).toMatchObject({
      convenios: 1,
      prestacao: 1,
      cacon: 1,
      piso: 0,
      pvh: 0,
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

  it("mede Pagamento e Notificação do Piso em paralelo a partir da Etapa 6", () => {
    const conclusoes = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((etapa) => ({
      piso_competencia_id: "p2",
      data_hora:
        etapa <= 6
          ? dia(etapa)
          : etapa === 7
            ? dia(9)
            : etapa === 8
              ? dia(8)
              : dia(10),
      detalhes: {
        etapas_concluidas: {
          de: Object.fromEntries(
            Array.from({ length: etapa - 1 }, (_, i) => [String(i + 1), true]),
          ),
          para: Object.fromEntries(
            Array.from({ length: etapa }, (_, i) => [String(i + 1), true]),
          ),
        },
      },
    }));

    const etapas = calcularSlaPiso([{ id: "p2", created_at: dia(0) }], conclusoes);
    expect(etapas[6].media).toBe(3);
    expect(etapas[7].media).toBe(2);
    expect(etapas[8].media).toBe(1);
  });

  it("calcula as três etapas do CACON a partir da trilha real e da confirmação humana", () => {
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
          extracao: { confirmada_em: dia(8) },
          encaminhado_ses_ufi_em: dia(10),
        },
      ],
      logs,
    );

    expect(etapas.map((item) => item.media)).toEqual([5, 3, 2]);
  });
});
