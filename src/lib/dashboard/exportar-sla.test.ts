import { describe, expect, it } from "vitest";
import { gerarCsvSla, linhasRelatorioSla, COLUNAS_CSV_SLA } from "./exportar-sla";
import type { DadosExportacaoSla } from "./exportar-sla";

const dados: DadosExportacaoSla = {
  modulos: [
    { id: "convenios", nome: "Convênios / lançamentos", etapas: [
      { etapa: "Etapa 1 · Análise", media: 1.5, n: 2 },
      { etapa: "Etapa 2 · Solicitação", media: null, n: 0 },
    ] },
    { id: "piso", nome: "Piso da Enfermagem", etapas: [
      { etapa: "Etapa 2 · Auditoria", media: 0.5, n: 4 },
    ] },
    { id: "cacon", nome: "Dieta CACON", etapas: [] },
    { id: "pvh", nome: "PVH", etapas: [] },
  ],
  assinaturasConsolidadas: [
    { modulo: "Convênios · Piso", signatario: "Maria", media: 3.5, n: 4,
      porModulo: [
        { modulo: "Convênios", media: 2, n: 1, cargos: ["Fiscal"] },
        { modulo: "Piso", media: 4, n: 3, cargos: ["Gerência"] },
      ],
    },
  ],
  leadTime: { media: 6, n: 2, real: true },
  contexto: {
    prestador: "Todos", convenio: "Todos", termo: "Todos",
    meses: "01,02", ano: "2026",
  },
  geradoEm: "2026-10-21T12:00:00.000Z",
};

describe("relatório gerencial CSV de SLA", () => {
  it("exporta lead time, resumo e etapas dos quatro módulos, e assinaturas por módulo e gerais", () => {
    const linhas = linhasRelatorioSla(dados);
    expect(linhas.filter(l => l.tipo_registro === "ETAPA")).toHaveLength(3);
    expect(linhas.filter(l => l.tipo_registro === "RESUMO_MODULO")).toHaveLength(4);
    expect(linhas.filter(l => l.tipo_registro === "ASSINATURA_MODULO")).toHaveLength(2);
    expect(linhas.find(l => l.tipo_registro === "ASSINATURA_MODULO" && l.modulo === "Piso"))
      .toMatchObject({ cargos_informados: "Gerência", quantidade_amostras: 3 });
    expect(linhas.filter(l => l.tipo_registro === "ASSINATURA_GERAL")).toHaveLength(1);
    expect(linhas.filter(l => l.tipo_registro === "LEAD_TIME_GERAL")).toHaveLength(1);
    expect(linhas.find(l => l.etapa.includes("Solicitação"))).toMatchObject({
      quantidade_amostras: 0, tempo_medio_dias: "", situacao: "Sem amostras",
    });
    expect(linhas.find(l => l.etapa.includes("Análise"))).toMatchObject({
      tempo_medio_dias: "1,500000", tempo_medio_horas: "36,000000",
    });
    expect(linhas.find(l => l.tipo_registro === "RESUMO_MODULO" && l.modulo.includes("Convênios")))
      .toMatchObject({ tempo_medio_dias: "1,500000", quantidade_amostras: 2 });
  });

  it("usa BOM UTF-8, ponto e vírgula, CRLF, filtra risco de fórmula e preserva acentos e aspas", () => {
    const csv = gerarCsvSla({
      ...dados,
      assinaturasConsolidadas: [{ modulo: "Piso", signatario: '=HYPERLINK("evil")', media: 0.5, n: 1 }],
      contexto: { ...dados.contexto, prestador: 'Hospital "São José"' },
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n").length).toBeGreaterThan(4);
    expect(csv).toContain('";"');
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"Hospital ""São José"""');
    expect(csv).toContain('"tempo_medio_dias"');
    expect(csv.split("\r\n")[0].replace(/^\uFEFF/, "").split(";")).toHaveLength(COLUNAS_CSV_SLA.length);
  });

  it("filtro exclusivo de outro módulo não exporta o lead time de Convênios", () => {
    const linhas = linhasRelatorioSla({
      ...dados, incluirLeadTime:false,
      modulos: dados.modulos.filter(m=>m.id==="pvh"),
      assinaturasConsolidadas:[],
    });
    expect(linhas.some(l=>l.tipo_registro==="LEAD_TIME_GERAL")).toBe(false);
    expect(linhas.filter(l=>l.tipo_registro==="RESUMO_MODULO")).toHaveLength(1);
    expect(linhas[0].modulo).toBe("PVH");
  });

  it("identifica estimativa do lead time sem apresentá-la como medição real", () => {
    const linhas = linhasRelatorioSla({ ...dados, leadTime: { media: 4, n: 2, real: false } });
    expect(linhas[0].situacao).toBe("Estimado (proxy)");
    expect(linhas[0].observacao_metodologica).toContain("Proxy");
  });
});
