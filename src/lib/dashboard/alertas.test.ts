import { describe, expect, it } from "vitest";
import { gerarAcoesNecessarias } from "./alertas";

const hoje = new Date(2026, 9, 7);

const base = {
  termos: [],
  prestacoes: [],
  pisoCompetencias: [],
  caconCompetencias: [],
  aberturasPendentes: [],
  caconPendenciasMensais: [],
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
      lancamentosTodos: lancamentos,
      convenios: [convenio],
      convById: { c1: convenio },
    });

    const alerta = alertas.find((a) => a.id === "acima-teto");
    expect(alerta?.n).toBe(1);
    expect(alerta?.search).toEqual({ status: "acima-teto", ids: "l1" });
  });

  it("não cria alerta preventivo de 85–100% do teto", () => {
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

    expect(alertas.find((a) => a.id === "proximo-teto")).toBeUndefined();
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

  it("mantém só a janela de vigência em até 7 dias", () => {
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
          data_inicio_vigencia: "2025-10-14",
          total_parcelas: 12,
        },
      ],
    });

    expect(alertas.find((a) => a.id === "vigencia-expirada")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "vigencia-7")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "vigencia-90")).toBeUndefined();
  });

  it("expõe prazos fixos da Etapa 1 do Piso como ações necessárias", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convenios: [],
      convById: {},
      pisoPrazosEtapa1: [
        {
          id: "piso-retorno-p1-i1",
          competenciaId: "p1",
          competencia: "10/2026",
          participanteId: "i1",
          prestadorNome: "Instituição A",
          tipo: "retorno_instituicao",
          prazo: "2026-10-10",
          dias: 3,
          severidade: "alerta",
          motivo: "Receber Planilha de Carga de Instituição A até dia 10",
        },
        {
          id: "piso-envio-p2-i2",
          competenciaId: "p2",
          competencia: "10/2026",
          participanteId: "i2",
          prestadorNome: "Instituição B",
          tipo: "envio_instituicao",
          prazo: "2026-10-05",
          dias: -2,
          severidade: "critico",
          motivo: "Enviar Planilha de Carga para Instituição B até dia 5",
        },
      ],
    });

    expect(alertas.find((a) => a.id === "piso-prazo-vencido")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "piso-prazo-proximo")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "piso-prazo-vencido")).toMatchObject({
      to: "/piso/$id",
      params: { id: "p2" },
    });
    expect(alertas.find((a) => a.id === "piso-prazo-vencido")?.hash).toBeUndefined();
  });

  it("faz o alerta de prazo consolidado apontar para o Aging", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convenios: [],
      convById: {},
      urgenciasPrazoProximas: 3,
    });

    const alerta = alertas.find((a) => a.id === "processos-vencendo");
    expect(alerta?.n).toBe(3);
    expect(alerta?.to).toBe("/dashboard");
    expect(alerta?.hash).toBe("urgencias-aging");
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

  it("abre diretamente competência CACON com uma crítica e filtra quando há duas", () => {
    const c1 = { id: "c1", status: "em_andamento", auditoria: { criticas: 2 } };
    const c2 = { id: "c2", status: "em_andamento", auditoria: { criticas: 1 } };
    const criar = (caconCompetencias: any[]) => gerarAcoesNecessarias({
      ...base, lancamentos: [], convenios: [], convById: {}, caconCompetencias,
    }).find((a) => a.id === "cacon-critica");
    expect(criar([c1])).toMatchObject({
      to: "/cacon/$id", params: { id: "c1" },
    });
    expect(criar([c1, c2])).toMatchObject({
      to: "/cacon", search: { alerta: "cacon-critica", ids: "c1,c2" },
    });
  });

  it("abre diretamente Piso com comunicação pendente e filtra reconferências múltiplas", () => {
    const montar = (pisoCompetencias: any[]) => gerarAcoesNecessarias({
      ...base, lancamentos: [], convenios: [], convById: {}, pisoCompetencias,
    });
    const p1 = { id: "p1", status: "aberta",
      etapas_concluidas: { "7": true, "8": false }, etapas_reconferir: [5] };
    const p2 = { id: "p2", status: "aberta",
      etapas_concluidas: {}, etapas_reconferir: [4] };
    expect(montar([p1]).find((a) => a.id === "piso-comunicacao")).toMatchObject({
      to: "/piso/$id", params: { id: "p1" },
    });
    expect(montar([p1, p2]).find((a) => a.id === "piso-reconferir")).toMatchObject({
      to: "/piso", search: { alerta: "piso-reconferir", ids: "p1,p2" },
    });
  });

  it("direciona PVH para competência em atraso e filtra múltiplos processos", () => {
    const c1 = { id: "v1", status: "em_andamento", etapas_concluidas: {},
      pvh_participantes: [] };
    const c2 = { ...c1, id: "v2" };
    const montar = (pvhCompetencias: any[], pvhPendencias: any[]) =>
      gerarAcoesNecessarias({
        ...base, lancamentos: [], convenios: [], convById: {},
        pvhCompetencias, pvhPendencias,
      });
    const prazo = { id: "v1-prazo", competenciaId: "v1", competencia: "09/2026",
      tipo: "pagamento_limite", motivo: "Vencido", dias: -1,
      severidade: "critico", prazoLabel: "1d atraso" };
    expect(montar([c1], [prazo]).find((a) => a.id === "pvh-pagamento-atrasado"))
      .toMatchObject({ to: "/pvh/$id", params: { id: "v1" } });
    expect(montar([c1, c2], []).find((a) => a.id === "pvh-portaria-estadual"))
      .toMatchObject({
        to: "/pvh", search: { alerta: "pvh-portaria-estadual", ids: "v1,v2" },
      });
  });

  it("permite cadastrar competência CACON ausente com mês e prestador corretos", () => {
    const alertas = gerarAcoesNecessarias({
      ...base, lancamentos: [], convenios: [], convById: {},
      caconPendenciasMensais: [{
        id: "cacon-abertura-b-09/2026", prestadorId: "b",
        prestadorNome: "Hospital", competencia: "09/2026",
        prazo: new Date(2026, 8, 30), dias: -7, severidade: "critico",
        motivo: "Sem registro",
      }],
    });
    expect(alertas.find((a) => a.id === "cacon-sem-registro-vencido"))
      .toMatchObject({
        to: "/cacon",
        search: { alerta: "cacon-sem-registro-vencido",
          faltantes: "cacon-abertura-b-09/2026", competencia: "09/2026", prestador: "b" },
      });
  });

  it("prioriza alertas críticos do PVH", () => {
    const alertas = gerarAcoesNecessarias({
      ...base,
      lancamentos: [],
      convenios: [],
      convById: {},
      pvhCompetencias: [{ id: "v1", etapas_reconferir: [4] }],
      pvhPendencias: [
        {
          id: "pvh-repasse-v1",
          competenciaId: "v1",
          competencia: "09/2026",
          tipo: "repasse_5_dias",
          motivo: "Prazo excedido",
          dias: -2,
          severidade: "critico",
          prazoLabel: "2d atraso",
        },
      ],
    });

    expect(alertas.find((a) => a.id === "pvh-repasse-atrasado")?.n).toBe(1);
    expect(alertas.find((a) => a.id === "pvh-reconferir")?.n).toBe(1);
  });
});
