import { describe, it, expect } from "vitest";
import { primeiraCompetencia, emAtraso, vencendoEmBreve, completudeConvenio, statusCompetencia, etapaCorrenteLabel, statusPrazoLancamento, nthDiaUtil, etapaEmpenhoAtual } from "./etapa";

const hoje = (iso: string) => new Date(`${iso}T12:00:00`);

describe("primeiraCompetencia", () => {
  it("extrai mês e ano de MM/AAAA", () => {
    expect(primeiraCompetencia("06/2026")).toEqual({ mes: 6, ano: 2026 });
  });
  it("usa a primeira quando há várias competências", () => {
    expect(primeiraCompetencia("05/2026, 06/2026")).toEqual({ mes: 5, ano: 2026 });
  });
  it("retorna null para valores inválidos", () => {
    expect(primeiraCompetencia(null)).toBeNull();
    expect(primeiraCompetencia("junho")).toBeNull();
  });
});

describe("etapaCorrenteLabel", () => {
  it("só é 'Concluído' com o clique em Concluir (flag concluido)", () => {
    expect(etapaCorrenteLabel({ concluido: true })).toBe("Concluído");
  });
  it("sefaz_etapa5_em sem Etapa 6 completa permanece em Liberação de Recurso (precedência)", () => {
    // Não salta para Anulação enquanto a Etapa 6 tiver subpassos pendentes.
    expect(etapaCorrenteLabel({ concluido: false, sefaz_etapa5_em: "2026-07-01T10:00:00Z" })).toBe("Liberação de Recurso");
  });
  it("sefaz_etapa5_em com Etapa 6 completa reflete Anulação de Empenho", () => {
    const LINK = "https://sei.joinville.sc.gov.br/doc/1";
    expect(
      etapaCorrenteLabel({
        concluido: false,
        link_relatorio_tecnico_sei: LINK,
        link_certidoes_sei: LINK,
        valor_atestado: 100,
        link_solicitacao_liberacao_sei: LINK,
        sefaz_etapa4_em: "2026-06-15T10:00:00Z",
        link_subempenho_sei: LINK,
        link_programacao_pagamento_sei: LINK,
        link_comprovante_pagamento_sei: LINK,
        data_pagamento: "2026-06-30",
        sefaz_etapa5_em: "2026-07-01T10:00:00Z",
      }),
    ).toBe("Anulação de Empenho");
  });
  it("com atestado segue em Liberação de Recurso", () => {
    expect(etapaCorrenteLabel({ concluido: false, valor_atestado: 100 })).toBe("Liberação de Recurso");
  });
});

const LINK = "https://sei.joinville.sc.gov.br/doc/1";
const empenhado = (extra: any = {}) => ({ competencia: "05/2026", numero_empenho: "123", link_empenho_sei: LINK, ...extra });

describe("nthDiaUtil", () => {
  it("5º dia útil de julho/2026 é 07/07 (qua–sex, pula fim de semana)", () => {
    expect(nthDiaUtil(2026, 7, 5)).toEqual(new Date(2026, 6, 7));
  });
  it("1º dia útil de agosto/2026 é 03/08 (01 é sábado)", () => {
    expect(nthDiaUtil(2026, 8, 1)).toEqual(new Date(2026, 7, 3));
  });
});

describe("etapaEmpenhoAtual", () => {
  it("sem dotação/fonte → Etapa 1", () => expect(etapaEmpenhoAtual({}).num).toBe(1));
  it("com dotação mas sem solicitação → Etapa 2", () => expect(etapaEmpenhoAtual({ dotacao_orcamentaria: "x", fonte_pagamento: "y" }).num).toBe(2));
});

// Cronômetro A — Empenho (etapas 1-5), competência 05/2026.
describe("statusPrazoLancamento · Cronômetro A (empenho)", () => {
  const conv = { dia_inicio_execucao: 5, dia_fim_execucao: 20 };
  it("mês subsequente (06/2026) sem empenho → CRÍTICO, com etapa no motivo", () => {
    const s = statusPrazoLancamento({ competencia: "05/2026" }, conv, hoje("2026-06-01"));
    expect(s.fase).toBe("empenho");
    expect(s.nivel).toBe("critico");
    expect(s.motivo).toMatch(/em atraso na Etapa 1/);
  });
  it("dentro do mês, antes do dia limite → preventivo (não é atraso)", () => {
    expect(statusPrazoLancamento({ competencia: "05/2026" }, conv, hoje("2026-05-10")).nivel).toBe("preventivo");
  });
  it("dentro do mês, após o dia limite → alerta (ainda não crítico)", () => {
    expect(statusPrazoLancamento({ competencia: "05/2026" }, conv, hoje("2026-05-25")).nivel).toBe("alerta");
  });
  it("janela do mês anterior a partir do dia_inicio → preventivo", () => {
    expect(statusPrazoLancamento({ competencia: "05/2026" }, conv, hoje("2026-04-10")).nivel).toBe("preventivo");
  });
});

// Cronômetro B — Atesto/Pagamento (etapa 6), competência 05/2026.
describe("statusPrazoLancamento · Cronômetro B (pagamento)", () => {
  const conv = { dia_inicio_execucao: 5, dia_fim_execucao: 20 };
  it("durante 05/2026 (produção aberta) → neutro, sem cobrança", () => {
    const s = statusPrazoLancamento(empenhado(), conv, hoje("2026-05-25"));
    expect(s.fase).toBe("pagamento");
    expect(s.nivel).toBe("neutro");
  });
  it("em 06/2026 (cobrança aberta), longe do prazo → preventivo", () => {
    expect(statusPrazoLancamento(empenhado(), conv, hoje("2026-06-15")).nivel).toBe("preventivo");
  });
  it("após o 5º dia útil de 07/2026 → CRÍTICO (atraso financeiro)", () => {
    const s = statusPrazoLancamento(empenhado(), conv, hoje("2026-07-08"));
    expect(s.nivel).toBe("critico");
    expect(s.motivo).toMatch(/5º dia útil de 07\/2026/);
  });
});

// Cronômetro C — Anulação (etapa 7).
describe("statusPrazoLancamento · Cronômetro C (anulação)", () => {
  const conv = { dia_inicio_execucao: 5, dia_fim_execucao: 20 };
  const anulavel = empenhado({ link_comprovante_pagamento_sei: LINK, valor_solicitado: 100, valor_atestado: 80, data_pagamento: "2026-06-20" });
  it("dentro da janela de 15d após o pagamento → preventivo", () => {
    expect(statusPrazoLancamento(anulavel, conv, hoje("2026-06-25")).fase).toBe("anulacao");
    expect(statusPrazoLancamento(anulavel, conv, hoje("2026-06-25")).nivel).toBe("preventivo");
  });
  it("passou de 15d após o pagamento → alerta", () => {
    expect(statusPrazoLancamento(anulavel, conv, hoje("2026-07-10")).nivel).toBe("alerta");
  });
});

describe("statusPrazoLancamento · convênios complementares", () => {
  it("pagamento complementar não gera prazo cronológico (neutro)", () => {
    expect(statusPrazoLancamento({ competencia: "05/2026" }, { pagamento_pontual: true }, hoje("2026-08-01")).nivel).toBe("neutro");
  });
});

describe("emAtraso / vencendoEmBreve (delegam ao motor)", () => {
  const conv = { dia_fim_execucao: 20 };
  it("competência passada sem empenho → em atraso (crítico)", () => {
    expect(emAtraso({ concluido: false, competencia: "05/2026" }, conv, hoje("2026-07-10"))).toBe(true);
  });
  it("competência atual antes do limite → não está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "07/2026" }, conv, hoje("2026-07-10"))).toBe(false);
  });
  it("competência atual após o limite → vencendo (alerta), NÃO em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "07/2026" }, conv, hoje("2026-07-25"))).toBe(false);
    expect(vencendoEmBreve({ concluido: false, competencia: "07/2026" }, conv, hoje("2026-07-25"))).toBe(true);
  });
  it("competência futura nunca está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "09/2026" }, conv, hoje("2026-07-25"))).toBe(false);
  });
  it("processo concluído nunca está em atraso", () => {
    expect(emAtraso({ concluido: true, competencia: "05/2026" }, conv, hoje("2026-07-10"))).toBe(false);
  });
  it("não sinaliza vencendo sem competência válida", () => {
    expect(vencendoEmBreve({ concluido: false }, { dia_fim_execucao: null })).toBe(false);
  });
});

describe("completudeConvenio", () => {
  const conv = { id: "c1", total_parcelas: 12, data_inicio_vigencia: "2026-01-15" };
  it("calcula esperadas pelo tempo de vigência e concluídas pelas parcelas", () => {
    const lancs = [
      { convenio_id: "c1", concluido: true, parcela: "1" },
      { convenio_id: "c1", concluido: true, parcela: "2" },
      { convenio_id: "c1", concluido: false, parcela: "3" },
      { convenio_id: "outro", concluido: true, parcela: "1" },
    ];
    // De 15/01 a 10/07 são 6 meses de diferença -> 6 parcelas esperadas
    const k = completudeConvenio(conv, lancs, hoje("2026-07-10"));
    expect(k.esperadas).toBe(6);
    expect(k.concluidas).toBe(2);
    expect(k.taxa).toBe(33);
    expect(k.total).toBe(12);
  });
  it("sem parcelas esperadas ainda, taxa é null", () => {
    const k = completudeConvenio({ ...conv, data_inicio_vigencia: "2026-07-01" }, [], hoje("2026-07-10"));
    expect(k.esperadas).toBe(0);
    expect(k.taxa).toBeNull();
  });
});

describe("statusCompetencia", () => {
  const conv = { id: "c1", _nome: "Hospital X", dia_inicio_execucao: 5, dia_fim_execucao: 20 };
  it("tudo concluído no mês → ok", () => {
    const lancs = [{ convenio_id: "c1", concluido: true, competencia: "07/2026" }];
    expect(statusCompetencia(conv, lancs, hoje("2026-07-10"))?.nivel).toBe("ok");
  });
  it("pendente após o dia limite → grave", () => {
    const lancs = [{ convenio_id: "c1", concluido: false, competencia: "07/2026" }];
    expect(statusCompetencia(conv, lancs, hoje("2026-07-25"))?.nivel).toBe("grave");
  });
  it("nada lançado e prazo já passou → grave", () => {
    expect(statusCompetencia(conv, [], hoje("2026-07-25"))?.nivel).toBe("grave");
  });
  it("nada lançado, faltando ≤7 dias para iniciar → aviso informativo", () => {
    expect(statusCompetencia(conv, [], hoje("2026-07-01"))?.nivel).toBe("info");
  });
});
