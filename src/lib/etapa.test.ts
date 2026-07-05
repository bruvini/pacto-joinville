import { describe, it, expect } from "vitest";
import { primeiraCompetencia, emAtraso, vencendoEmBreve, completudeConvenio, statusCompetencia, etapaCorrenteLabel } from "./etapa";

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
  it("tudo preenchido sem concluir → 'Aguardando conclusão' (não confunde o painel)", () => {
    expect(etapaCorrenteLabel({ concluido: false, sefaz_etapa5_em: "2026-07-01T10:00:00Z" })).toBe("Aguardando conclusão");
  });
  it("com atestado segue em Liberação de Recurso", () => {
    expect(etapaCorrenteLabel({ concluido: false, valor_atestado: 100 })).toBe("Liberação de Recurso");
  });
});

describe("emAtraso", () => {
  const conv = { dia_fim_execucao: 20 };
  it("competência passada e não concluída está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "05/2026" }, conv, hoje("2026-07-10"))).toBe(true);
  });
  it("competência atual antes do dia limite não está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "07/2026" }, conv, hoje("2026-07-10"))).toBe(false);
  });
  it("competência atual depois do dia limite está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "07/2026" }, conv, hoje("2026-07-25"))).toBe(true);
  });
  it("competência futura nunca está em atraso", () => {
    expect(emAtraso({ concluido: false, competencia: "09/2026" }, conv, hoje("2026-07-25"))).toBe(false);
  });
  it("processo concluído nunca está em atraso", () => {
    expect(emAtraso({ concluido: true, competencia: "05/2026" }, conv, hoje("2026-07-10"))).toBe(false);
  });
});

describe("vencendoEmBreve", () => {
  it("não sinaliza sem dia limite no convênio", () => {
    expect(vencendoEmBreve({ concluido: false }, { dia_fim_execucao: null })).toBe(false);
  });
  it("não sinaliza processo concluído", () => {
    expect(vencendoEmBreve({ concluido: true }, { dia_fim_execucao: 20 })).toBe(false);
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
