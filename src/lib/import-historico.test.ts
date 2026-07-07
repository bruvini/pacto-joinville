import { describe, it, expect } from "vitest";
import { parseMoeda, parseData, parseCompetencia, mapStatusCgm, mapSituacaoBaixa, statusPcHistorico, norm, montarLinha } from "./import-historico";

describe("norm", () => {
  it("remove acentos, pontuação e caixa", () => {
    expect(norm("Prestação de Contas ")).toBe("prestacao de contas");
    expect(norm("N° Processo")).toBe("n processo");
  });
});

describe("parseMoeda", () => {
  it("converte 'R$40.000,00' → 40000", () => expect(parseMoeda("R$40.000,00")).toBe(40000));
  it("aceita número puro", () => expect(parseMoeda(2718040.89)).toBeCloseTo(2718040.89));
  it("vazio → 0", () => expect(parseMoeda(null)).toBe(0));
});

describe("parseData", () => {
  it("Date → ISO", () => expect(parseData(new Date(2020, 9, 9))).toBe("2020-10-09"));
  it("dd/mm/yyyy → ISO", () => expect(parseData("09/10/2020")).toBe("2020-10-09"));
  it("'-' e vazio → null", () => { expect(parseData("-")).toBeNull(); expect(parseData("")).toBeNull(); });
});

describe("parseCompetencia", () => {
  it("mês por extenso + ano", () => expect(parseCompetencia("Outubro", 2020)).toBe("10/2020"));
  it("mês inválido → null", () => expect(parseCompetencia("xxx", 2020)).toBeNull());
});

describe("mapStatusCgm", () => {
  it("Regular com ressalvas", () => expect(mapStatusCgm("Regular com ressalvas ")).toBe("regular_ressalvas"));
  it("Diligências", () => expect(mapStatusCgm("Diligências")).toBe("diligencias"));
  it("vazio → null", () => expect(mapStatusCgm("")).toBeNull());
});

describe("mapSituacaoBaixa", () => {
  it("com baixa + exercício", () => expect(mapSituacaoBaixa("aprovada com baixa contábil 2021")).toEqual({ situacao: "com_baixa", exercicio: 2021 }));
  it("em aberto e sem baixa", () => expect(mapSituacaoBaixa("em aberto e sem baixa")).toEqual({ situacao: "sem_baixa", exercicio: null }));
});

describe("statusPcHistorico", () => {
  const base: any = { statusMacro: "", dataRecebimento: null, dataBaixaContabil: null, situacaoBaixa: null };
  it("com baixa → aprovada", () => expect(statusPcHistorico({ ...base, situacaoBaixa: "com_baixa" })).toBe("aprovada"));
  it("concluído → aprovada", () => expect(statusPcHistorico({ ...base, statusMacro: "Concluído" })).toBe("aprovada"));
  it("recebida em análise", () => expect(statusPcHistorico({ ...base, dataRecebimento: "2026-01-08" })).toBe("recebida"));
  it("sem nada → aguardando", () => expect(statusPcHistorico(base)).toBe("aguardando"));
});

describe("montarLinha", () => {
  const celulas: Record<string, any> = {
    instituicao: "APAE Joinville",
    termo: "025/2020/PMJ",
    empenho: "3342/2020",
    parcela: 1,
    compMes: "Outubro",
    compAno: 2020,
    valor: "R$40.000,00",
    ingresso: new Date(2020, 9, 9),
    processoPc: "20.0.187389-6",
    recebimento: new Date(2020, 10, 20),
    statusCgm: "Regular com ressalvas",
    situacaoBaixa: "aprovada com baixa contábil 2021",
    baixaContabil: new Date(2021, 5, 17),
    responsavel: "Hugo",
    statusMacro: "Concluído",
  };
  const l = montarLinha((k) => celulas[k], 3);

  it("mapeia campos-chave e deriva a competência", () => {
    expect(l.competencia).toBe("10/2020");
    expect(l.valor).toBe(40000);
    expect(l.dataPagamento).toBe("2020-10-09");
    expect(l.statusCgm).toBe("regular_ressalvas");
    expect(l.situacaoBaixa).toBe("com_baixa");
    expect(l.exercicioBaixa).toBe(2021);
    expect(l._erros).toHaveLength(0);
  });
  it("sinaliza erro quando falta instituição/competência", () => {
    const vazia = montarLinha(() => null, 9);
    expect(vazia._erros).toContain("sem instituição");
    expect(vazia._erros).toContain("competência inválida");
  });
});
