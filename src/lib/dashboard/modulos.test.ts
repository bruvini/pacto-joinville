import { describe, expect, it } from "vitest";
import {
  calcularAtividadeUsuarios,
  calcularSlaCacon,
  calcularSlaPiso,
  calcularSlaSignatarios,
  usuarioHumano,
} from "./modulos";

const dia = (n: number) =>
  new Date(Date.UTC(2026, 9, 1 + n, 12, 0, 0)).toISOString();

describe("dashboard modular", () => {
  it("remove ações automáticas e empilha ações humanas por módulo", () => {
    expect(usuarioHumano("Sistema")).toBeNull();
    expect(usuarioHumano("Sistema — correção")).toBeNull();
    expect(usuarioHumano("Bruno")).toBe("Bruno");
    expect(usuarioHumano("Importação SQL documental (não representa assinatura de servidor)")).toBeNull();
    expect(usuarioHumano("IMPORTACAO SQL DOCUMENTAL")).toBeNull();

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

  it("descarta importações SQL documentais sem apagar ações humanas verdadeiras", () => {
    const resultado = calcularAtividadeUsuarios({
      historico: [
        { usuario_nome: "Importação SQL documental (não representa assinatura de servidor)",
          acao: "Assinatura importada", lancamento_id: "l1" },
        { usuario_nome: "Maria", acao: "Importação SQL documental (não representa assinatura de servidor)",
          piso_competencia_id: "p1" },
        { usuario_nome: "João", acao: "Importacao SQL Documental", pvh_competencia_id: "v1" },
        { usuario_nome: "Maria", acao: "Documento SEI assinado", piso_competencia_id: "p1" },
        { usuario_nome: "João", acao: "Pagamento registrado", pvh_competencia_id: "v1" },
        { usuario_nome: "Bruno", acao: "Lançamento atualizado", lancamento_id: "l1" },
      ],
      caconLogs: [
        { usuario_nome: "Importação SQL documental (não representa assinatura de servidor)", competencia_id: "c1" },
        { usuario_nome: "Bruno", competencia_id: "c1" },
      ],
      idsLancamentos: new Set(["l1"]),
      idsPiso: new Set(["p1"]),
      idsCacon: new Set(["c1"]),
      idsPvh: new Set(["v1"]),
    });
    expect(resultado.map((item) => item.usuario).sort()).toEqual(["Bruno", "João", "Maria"]);
    expect(resultado.find((item) => item.usuario === "Maria")).toMatchObject({ piso: 1, total: 1 });
    expect(resultado.find((item) => item.usuario === "João")).toMatchObject({ pvh: 1, total: 1 });
    expect(resultado.find((item) => item.usuario === "Bruno")).toMatchObject({ convenios: 1, cacon: 1, total: 2 });
    expect(resultado.some((item) => item.usuario.includes("documental"))).toBe(false);
  });

  it("consolida o SLA de assinatura por signatário entre módulos", () => {
    const resultado = calcularSlaSignatarios({
      lancamentos: [{ id: "l1", created_at: dia(0) }],
      assinaturasConvenios: [
        {
          lancamento_id: "l1",
          servidor_nome: "Bruno Vinícius",
          assinado_em: dia(1),
        },
      ],
      documentosPiso: [{ id: "d1", competencia_id: "p1", created_at: dia(0) }],
      assinaturasPiso: [
        {
          documento_id: "d1",
          servidor_nome: "  Bruno   Vinícius ",
          assinado_em: dia(3),
        },
      ],
      competenciasCacon: [],
      assinaturasCacon: [],
      assinaturasPvh: [],
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      signatario: "Bruno Vinícius",
      modulo: "Convênios · Piso",
      n: 2,
      media: 2,
    });
    expect(resultado[0].porModulo).toEqual([
      { modulo: "Convênios", n: 1, media: 1, cargos: [] },
      { modulo: "Piso", n: 1, media: 3, cargos: [] },
    ]);
  });

  it("não contabiliza importações documentais SQL como assinatura de servidor", () => {
    const resultado = calcularSlaSignatarios({
      lancamentos: [{ id: "l1", created_at: dia(0) }],
      assinaturasConvenios: [
        { lancamento_id: "l1", servidor_nome: "Importação SQL documental (não representa assinatura de servidor)",
          assinado_em: dia(1) },
        { lancamento_id: "l1", servidor_nome: "Auditor real", cargo: "ACP", assinado_em: dia(3) },
      ],
      documentosPiso: [], assinaturasPiso: [],
      competenciasCacon: [], assinaturasCacon: [],
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].signatario).toBe("Auditor real");
    expect(resultado[0].media).toBe(3);
    expect(resultado[0].porModulo).toEqual([
      { modulo: "Convênios", media: 3, n: 1, cargos: ["ACP"] },
    ]);
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

  it("inclui o fluxo completo do Piso e mede os ramos independentes, mesmo com Etapa 4 pendente", () => {
    const eventos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
      piso_competencia_id: "set", data_hora: dia(n),
      detalhes: {
        etapas_concluidas: {
          de: Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [String(i + 1), true])),
          para: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), true])),
        },
      },
    }));
    const etapas = calcularSlaPiso([{ id: "set", created_at: dia(0), tipo_parcela: "mensal" }], eventos);
    expect(etapas.map(e => e.n)).toEqual([1,1,1,1,1,1,1,1,1]);
    expect(etapas[4].media).toBe(5); // Etapa 5 libera na criação, não espera a 4
    expect(etapas[5].media).toBe(1);
    expect(etapas[8].media).toBe(1);
    const parcial = calcularSlaPiso([{ id: "set", created_at: dia(0) }],
      eventos.filter((_, i) => [4, 5, 6, 7].includes(i)));
    expect(parcial[4].n).toBe(1);
    expect(parcial[5].n).toBe(1);
    expect(parcial[6].n).toBe(1);
    expect(parcial[0].n).toBe(0);
  });

  it("não conta a etapa 1 histórica da 13ª e mede a etapa 2 desde a criação", () => {
    const eventos = [
      {piso_competencia_id:"13", data_hora:dia(1),
        detalhes:{etapas_concluidas:{de:{},para:{"1":true}}}},
      {piso_competencia_id:"13", data_hora:dia(3),
        detalhes:{etapas_concluidas:{de:{"1":true},para:{"1":true,"2":true}}}},
      {piso_competencia_id:"13", data_hora:dia(5),
        detalhes:{etapas_concluidas:{de:{"1":true,"2":true},para:{"1":true,"2":true,"5":true}}}},
      {piso_competencia_id:"13", data_hora:dia(6),
        detalhes:{etapas_concluidas:{de:{"1":true,"2":true,"5":true},para:{"1":true,"2":true,"5":true,"6":true}}}},
    ];
    const result = calcularSlaPiso([{id:"13",tipo_parcela:"decimo_terceiro",created_at:dia(0)}],eventos);
    expect(result[0]).toMatchObject({ n:0, media:null });
    expect(result[1]).toMatchObject({ n:1, media:3 });
    expect(result[4]).toMatchObject({ n:1, media:5 });
    expect(result[5]).toMatchObject({ n:1, media:1 });
  });

  it("não inventa SLA sem marcos do histórico da etapa e mantém bifurcação 7/8", () => {
    const logs = [
      {piso_competencia_id:"p",data_hora:dia(2),detalhes:{etapas_concluidas:{de:{},para:{"5":true}}}},
      {piso_competencia_id:"p",data_hora:dia(4),detalhes:{etapas_concluidas:{de:{"5":true},para:{"5":true,"6":true}}}},
      {piso_competencia_id:"p",data_hora:dia(6),detalhes:{etapas_concluidas:{de:{"5":true,"6":true},para:{"5":true,"6":true,"8":true}}}},
    ];
    const result = calcularSlaPiso([{id:"p", created_at:dia(0)}], logs);
    expect(result[0].media).toBeNull();
    expect(result[3].media).toBeNull();
    expect(result[4].media).toBe(2);
    expect(result[5].media).toBe(2);
    expect(result[6].media).toBeNull();
    expect(result[7].media).toBe(2);
    expect(result[8].media).toBeNull();
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
