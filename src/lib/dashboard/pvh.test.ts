import { describe, expect, it } from "vitest";
import {
  calcularSlaPvh,
  competenciaAtualPvh,
  pendenciasPvh,
  prazoPagamentoCompetenciaPvh,
} from "./pvh";

describe("dashboard PVH", () => {
  it("cobra abertura no primeiro dia do mês quando a competência não existe", () => {
    const itens = pendenciasPvh([], new Date(2026, 9, 8));
    const abertura = itens.find((item) => item.tipo === "abertura");
    expect(abertura?.competencia).toBe("10/2026");
    expect(abertura?.dias).toBe(-7);
    expect(abertura?.severidade).toBe("critico");
  });

  it("define o limite de pagamento no fim do mês seguinte", () => {
    expect(prazoPagamentoCompetenciaPvh("09/2026")).toEqual(
      new Date(2026, 9, 31),
    );
    expect(competenciaAtualPvh(new Date(2026, 9, 8))).toBe("10/2026");
  });

  it("gera alerta do prazo de cinco dias úteis após crédito no FMS", () => {
    const itens = pendenciasPvh(
      [
        {
          id: "v1",
          competencia: "10/2026",
          status: "ativa",
          recurso_fms_data: "2026-10-01",
          pvh_participantes: [
            { valor_estadual: 1000, valor_municipal: 1000, valor_pago: 0 },
          ],
        },
      ],
      new Date(2026, 9, 9),
    );

    const repasse = itens.find((item) => item.tipo === "repasse_5_dias");
    expect(repasse).toBeDefined();
    expect(repasse?.severidade).toBe("critico");
  });
});


const carimbo = (dia: number) => `2026-10-${String(dia).padStart(2, "0")}T00:00:00.000Z`;
const competenciaSla = (
  etapas_concluidas: Record<string, boolean> = {},
  etapas_reconferir: number[] = [],
) => ({
  id: "pvh-08",
  created_at: carimbo(1),
  etapas_concluidas,
  etapas_reconferir,
});
const eventoPvh = (
  dia: number,
  antes: Record<string, boolean>,
  depois: Record<string, boolean>,
) => ({
  pvh_competencia_id: "pvh-08",
  data_hora: carimbo(dia),
  acao: "PVH · update: pvh_competencias",
  detalhes: {
    antes: { etapas_concluidas: antes },
    depois: { etapas_concluidas: depois },
  },
});

describe("SLA real das etapas PVH", () => {
  it("encontra as conclusões no formato real da auditoria antes/depois", () => {
    const e1 = { "1": true };
    const e13 = { ...e1, "3": true };
    const e123 = { ...e13, "2": true };
    const e1234 = { ...e123, "4": true };
    const e12346 = { ...e1234, "6": true };
    const e123456 = { ...e12346, "5": true };
    const e1234567 = { ...e123456, "7": true };
    const logs = [
      eventoPvh(2, {}, e1),
      eventoPvh(3, e1, e13),
      eventoPvh(4, e13, e123),
      eventoPvh(5, e123, e1234),
      eventoPvh(6, e1234, e12346),
      eventoPvh(7, e12346, e123456),
      eventoPvh(8, e123456, e1234567),
    ];
    const medias = calcularSlaPvh([competenciaSla(e1234567)], logs);
    expect(medias.map((v) => v.n)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(medias.map((v) => v.media)).toEqual([1, 2, 2, 1, 2, 1, 1]);
  });

  it("não conta uma atualização comum como nova conclusão de etapa", () => {
    const etapa1 = { "1": true };
    const logs = [
      eventoPvh(2, {}, etapa1),
      eventoPvh(6, etapa1, etapa1),
      { ...eventoPvh(9, {}, {}), pvh_competencia_id: "outra-competencia" },
    ];
    const result = calcularSlaPvh([competenciaSla(etapa1)], logs);
    expect(result[0]).toMatchObject({ n: 1, media: 1 });
    expect(result[1]).toMatchObject({ n: 0, media: null });
  });

  it("registra Etapa 3 mesmo quando a Etapa 2 ainda está pendente", () => {
    const e3 = { "3": true };
    const resultado = calcularSlaPvh(
      [competenciaSla(e3)],
      [eventoPvh(3, {}, e3)],
    );
    expect(resultado[0].n).toBe(0);
    expect(resultado[1].n).toBe(0);
    expect(resultado[2]).toMatchObject({ n: 1, media: 2 });
  });

  it("mantém suporte ao registro antigo de antes/depois em de/para", () => {
    const logs = [
      { pvh_competencia_id: "pvh-08", data_hora: carimbo(3),
        acao: "PVH · alteração",
        detalhes: { etapas_concluidas: { de: {}, para: { "1": true } } } },
    ];
    expect(calcularSlaPvh([competenciaSla({ "1": true })], logs)[0])
      .toMatchObject({ n: 1, media: 2 });
  });

  it("anula conclusão reaberta e usa o último evento real de reconclusão", () => {
    const e1 = { "1": true };
    const logs = [
      eventoPvh(2, {}, e1),
      eventoPvh(3, e1, {}),
      eventoPvh(5, {}, e1),
    ];
    expect(calcularSlaPvh([competenciaSla(e1)], logs)[0])
      .toMatchObject({ n: 1, media: 4 });
    expect(calcularSlaPvh([competenciaSla(e1, [1])], logs)[0])
      .toMatchObject({ n: 0, media: null });
  });

  it("não converte flags importadas na criação em SLA fictício", () => {
    const log = {
      ...eventoPvh(1, {}, { "1": true, "3": true }),
      acao: "PVH · insert: pvh_competencias",
    };
    const result = calcularSlaPvh(
      [competenciaSla({ "1": true, "3": true })], [log],
    );
    expect(result[0]).toMatchObject({ n: 0, media: null });
    expect(result[2]).toMatchObject({ n: 0, media: null });
  });

  it("não inventa intervalos para competências sem eventos de conclusão", () => {
    const v = calcularSlaPvh([competenciaSla({ "1": true, "2": true })], []);
    expect(v).toHaveLength(7);
    expect(v.every((x) => x.n === 0 && x.media === null)).toBe(true);
  });

  it("ignora conclusão com início incompatível com a ordem documental", () => {
    const e3 = { "3": true };
    const e34 = { ...e3, "4": true };
    const p = { ...e34, "2": true };
    const logs = [
      eventoPvh(2, {}, e3),
      eventoPvh(3, e3, e34),
      eventoPvh(4, e34, p),
    ];
    const medias = calcularSlaPvh([competenciaSla(p)], logs);
    expect(medias[2].n).toBe(1);
    expect(medias[3].n).toBe(0);
  });
});
