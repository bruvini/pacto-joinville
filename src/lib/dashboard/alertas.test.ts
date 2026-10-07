import { describe, expect, it } from "vitest";
import { gerarAcoesNecessarias } from "./alertas";

const hoje = new Date(2026, 9, 7);

const base = {
  termos: [],
  prestacoes: [],
  pisoCompetencias: [],
  caconCompetencias: [],
  aberturasPendentes: [],
  hoje,
};

describe("motor de ações necessárias", () => {
  it("usa o teto mensal do convênio quando não há termo aditivo", () => {
    const convenio = {
      id: "c1",
      teto_mensal: 1000,
      status_convenio: "ativo",
      exige_prestacao_contas: false,
    };
    const lancamentos = [
      {
        id: "l1",
        convenio_id: "c1",
        valor_solicitado: 1100,
        competencia: null,
        concluido: false,
      },
    ];

    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos,
      convenios: [convenio],
      convById: { c1: convenio },
    });

    expect(alertas.find((a) => a.id === "acima-teto")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "proximo-teto")).toBeUndefined();
  });

  it("demove uso de 85 a 100% do teto para prevenção, sem chamar de saldo contratual", () => {
    const convenio = {
      id: "c1",
      teto_mensal: 1000,
      status_convenio: "ativo",
      exige_prestacao_contas: false,
    };

    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [
        {
          id: "l1",
          convenio_id: "c1",
          valor_solicitado: 900,
          competencia: null,
          concluido: false,
        },
      ],
      convenios: [convenio],
      convById: { c1: convenio },
    });

    const alerta = alertas.find((a) => a.id === "proximo-teto");
    expect(alerta?.n).toBe(1);
    expect(alerta?.severidade).toBe("preventivo");
    expect(alerta?.label).toMatch(/85–100% do teto mensal/);
  });

  it("separa CACON com crítica, fallback manual e conferência humana", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convenios: [],
      convById: {},
      caconCompetencias: [
        {
          id: "a",
          status: "em_andamento",
          auditoria: { criticas: 1 },
          extracao: {},
        },
        {
          id: "b",
          status: "em_andamento",
          auditoria: { criticas: 0 },
          extracao: { status: "requer_preenchimento_manual" },
        },
        {
          id: "c",
          status: "em_andamento",
          auditoria: { criticas: 0 },
          processado_em: "2026-10-07T10:00:00Z",
          extracao: { status: "aguardando_confirmacao" },
        },
      ],
    });

    expect(alertas.find((a) => a.id === "cacon-critica")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "cacon-manual")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "cacon-confirmacao")?.n).toBe(1);
  });

  it("sinaliza comunicação do Piso quando pagamento terminou e etapa 8 não", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convenios: [],
      convById: {},
      pisoCompetencias: [
        {
          id: "p1",
          status: "ativa",
          etapas_reconferir: [],
          etapas_concluidas: { "7": true, "8": false },
        },
      ],
    });

    expect(alertas.find((a) => a.id === "piso-comunicacao")?.n).toBe(1);
  });

  it("prioriza vigência expirada e cria janela preventiva de 90 dias", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convById: {},
      convenios: [
        {
          id: "exp",
          status_convenio: "ativo",
          exige_prestacao_contas: false,
          data_inicio_vigencia: "2025-01-01",
          total_parcelas: 12,
        },
        {
          id: "breve",
          status_convenio: "ativo",
          exige_prestacao_contas: false,
          data_inicio_vigencia: "2026-01-01",
          total_parcelas: 11,
        },
      ],
    });

    expect(alertas.find((a) => a.id === "vigencia-expirada")?.n).toBe(1);
    expect(
      (alertas.find((a) => a.id === "vigencia-30")?.n ?? 0) +
        (alertas.find((a) => a.id === "vigencia-90")?.n ?? 0),
    ).toBe(1);
  });

  it("sinaliza prazo externo vencido em prestação de contas", () => {
    const convenio = {
      id: "c1",
      status_convenio: "ativo",
      exige_prestacao_contas: true,
      prazo_prestacao_contas_dias: 30,
      prazo_retorno_entidade_dias: 5,
    };
    const lancamento = {
      id: "l1",
      convenio_id: "c1",
      concluido: true,
      competencia: "08/2026",
      data_pagamento: "2026-08-31",
    };

    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [lancamento],
      convenios: [convenio],
      convById: { c1: convenio },
      prestacoes: [
        {
          lancamento_id: "l1",
          status: "recebida",
          data_envio_entidade: "2026-09-20",
          data_retorno_entidade: null,
        },
      ],
    });

    expect(alertas.find((a) => a.id === "retorno-externo-atrasado")?.n).toBe(1);
  });
});
