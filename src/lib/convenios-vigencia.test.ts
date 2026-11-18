import { describe, expect, it } from "vitest";
import { diaConvenio, formatarDataConvenio, ordenarTermosConvenio, tetoVigenteConvenio, vigenciaConvenio } from "./convenios-vigencia";

const hoje = new Date("2026-11-18T12:00:00-03:00");
const convenio = { id: "hmsj-poa", teto_mensal: 5068707.37, data_inicio_vigencia: "2022-01-31", total_parcelas: 60 };
const quarto = { id: "4", convenio_id: convenio.id, identificador: "Quarto Termo Aditivo", data_assinatura: "2024-12-20", valor_total: 6024001.89 };
const quinto = { id: "5", convenio_id: convenio.id, identificador: "Quinto Termo Aditivo", data_assinatura: "2026-07-14", valor_total: 6647604.80 };

describe("teto mensal e vigência do convênio", () => {
  it("seleciona o quinto aditivo mesmo se o quarto vier primeiro no cache", () => {
    const termos = [quarto, quinto];
    expect(tetoVigenteConvenio(convenio, termos, hoje)).toEqual({ termo: quinto, teto: 6647604.80 });
    expect(ordenarTermosConvenio(termos)).toEqual([quinto, quarto]);
    expect(termos).toEqual([quarto, quinto]);
  });
  it("não troca teto por termo sem alteração financeira, futuro ou de outro convênio", () => {
    const termos = [quarto, quinto, { ...quinto, id: "6", data_assinatura: "2026-11-01", valor_total: null },
      { ...quinto, id: "7", data_assinatura: "2026-12-01", valor_total: 9000000 },
      { ...quinto, id: "8", convenio_id: "outro", valor_total: 12000000 }];
    expect(tetoVigenteConvenio(convenio, termos, hoje).teto).toBe(6647604.80);
    expect(tetoVigenteConvenio(convenio, [], hoje).teto).toBe(5068707.37);
    expect(tetoVigenteConvenio(convenio, termos, new Date("2026-06-30T12:00:00-03:00")).teto).toBe(6024001.89);
  });
  it("calcula a vigência de 60 meses da data original, sem arredondar por competência", () => {
    expect(vigenciaConvenio(convenio, hoje)).toEqual({ inicio: "2022-01-31", fim: "2027-01-31", restantes: 74, ateInicio: 0, decorrido: 96 });
  });
  it("limita o aniversário ao último dia do mês e mantém o prazo válido no dia final", () => {
    const c = { data_inicio_vigencia: "2024-01-31", total_parcelas: 1 };
    expect(vigenciaConvenio(c, new Date("2024-02-29T23:59:00-03:00"))?.fim).toBe("2024-02-29");
    expect(vigenciaConvenio(c, new Date("2024-02-29T23:59:00-03:00"))?.restantes).toBe(0);
    expect(vigenciaConvenio(c, new Date("2024-03-01T00:00:00-03:00"))?.restantes).toBe(-1);
  });
  it("não inventa vigência para pagamentos pontuais ou cadastro incompleto", () => {
    expect(vigenciaConvenio({ ...convenio, pagamento_pontual: true }, hoje)).toBeNull();
    expect(vigenciaConvenio({ ...convenio, total_parcelas: null }, hoje)).toBeNull();
    expect(vigenciaConvenio({ ...convenio, data_inicio_vigencia: "2026-02-31" }, hoje)).toBeNull();
  });
  it("preserva datas civis e sinaliza início futuro", () => {
    expect(formatarDataConvenio("2026-07-14")).toBe("14/07/2026");
    expect(diaConvenio(new Date("2026-11-19T01:00:00Z"))).toBe("2026-11-18");
    expect(vigenciaConvenio({ data_inicio_vigencia: "2026-11-20", total_parcelas: 1 }, hoje)?.ateInicio).toBe(2);
    expect(vigenciaConvenio({ data_inicio_vigencia: "2026-11-20", total_parcelas: 1 }, hoje)?.decorrido).toBe(0);
  });
});
