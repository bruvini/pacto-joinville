import { describe, expect, it } from "vitest";
import {
  resumoAlocacao, validarAlocacao, validarSubempenho, saldoAnulacaoNe,
  totalSubempenhado, totalDevidoUnico, valorAplicadoNe,
  sugerirValorAplicadoNe, bloqueioExclusaoNe,
} from "./alocacao";

const P = "p1";

describe("alocação de NEs do Piso", () => {
  it("sugere automaticamente o devido, limitado ao valor da nota, e o saldo para a complementar", () => {
    const a = { id: "a", participante_id: P, valor_empenhado: 15000, valor_a_liquidar: 9524.68 };
    expect(sugerirValorAplicadoNe(9524.68, [a], P, "a", 15000)).toBe(9524.68);
    expect(sugerirValorAplicadoNe(9524.68, [a], P, "a", 2000)).toBe(2000);
    const notas = [{ ...a, alocacao_manual: true, valor_aplicado: 2000 }, { id: "b", participante_id: P, alocacao_manual: true }];
    expect(sugerirValorAplicadoNe(9524.68, notas, P, "b", 9000)).toBe(7524.68);
    expect(valorAplicadoNe({ ...a, valor_empenhado: 2000 }, [{ ...a, valor_empenhado: 2000 }])).toBe(2000);
    expect(sugerirValorAplicadoNe(null, notas, P, "b", 9000)).toBeNull();
  });
  it("permite excluir NE registrada sem dependências e protege registros posteriores", () => {
    const a = { id: "a", participante_id: P, valor_empenhado: 15000 };
    expect(bloqueioExclusaoNe(a, [{ obrigacao_id: "a", tipo: "nota_empenho" }], [])).toBeNull();
    expect(bloqueioExclusaoNe(a, [], [{ obrigacao_id: "a" }])).toMatch(/vinculados/);
    expect(bloqueioExclusaoNe(a, [{ obrigacao_id: "a", tipo: "aviso_liquidacao" }], [])).toMatch(/vinculados/);
    expect(bloqueioExclusaoNe({ ...a, valor_pago: 100 }, [], [])).toMatch(/vinculados/);
  });
  it("legado: NE única sem alocação usa valor_a_liquidar", () => {
    const obr = [{ id: "o1", participante_id: P, valor_empenhado: 10000, valor_a_liquidar: 9876.68 }];
    expect(valorAplicadoNe(obr[0], obr)).toBe(9876.68);
    expect(resumoAlocacao(P, 9876.68, obr).fechado).toBe(true);
    expect(saldoAnulacaoNe(obr[0], obr)).toBe(123.32);
  });

  it("duas NEs complementares 1.762,40 + 8.114,28 = 9.876,68 fecham o devido", () => {
    const obr = [
      { id: "o1", participante_id: P, valor_empenhado: 1762.4, valor_aplicado: 1762.4, valor_a_liquidar: 9876.68 },
      { id: "o2", participante_id: P, valor_empenhado: 8114.28, valor_aplicado: 8114.28, valor_a_liquidar: 9876.68 },
    ];
    const r = resumoAlocacao(P, 9876.68, obr);
    expect(r.totalAplicado).toBe(9876.68);
    expect(r.saldoAEmpenhar).toBe(0);
    expect(r.fechado).toBe(true);
  });

  it("não duplica o devido: valor_a_liquidar em cada NE não é somado", () => {
    const obr = [
      { id: "o1", participante_id: P, valor_a_liquidar: 9876.68, valor_aplicado: 1762.4 },
      { id: "o2", participante_id: P, valor_a_liquidar: 9876.68, valor_aplicado: null },
    ];
    const r = resumoAlocacao(P, 9876.68, obr);
    expect(r.totalAplicado).toBe(1762.4);
    expect(r.pendentes).toBe(1);
    expect(r.saldoAEmpenhar).toBe(8114.28);
    expect(totalDevidoUnico([{ id: P, valor_devido: 9876.68 }])).toBe(9876.68);
  });

  it("impede alocação acima do devido (centavos)", () => {
    const obr = [{ id: "o1", participante_id: P, valor_aplicado: 1762.4 }];
    expect(validarAlocacao(9876.68, obr, P, null, 8114.28, 8114.28)).toBeNull();
    expect(validarAlocacao(9876.68, obr, P, null, 8114.29, 9000)).toMatch(/excede/);
    expect(validarAlocacao(9876.68, obr, P, null, 500, 400)).toMatch(/maior que o valor da NE/);
  });

  it("dois subempenhos na mesma NE e bloqueio de oversubempenho", () => {
    const obr = [{ id: "o1", participante_id: P, valor_empenhado: 8114.28, valor_aplicado: 8114.28 }];
    const subs = [{ id: "s1", obrigacao_id: "o1", valor: 4000 }];
    expect(validarSubempenho(obr[0], obr, subs, null, 4114.28)).toBeNull();
    expect(totalSubempenhado("o1", [...subs, { id: "s2", obrigacao_id: "o1", valor: 4114.28 }])).toBe(8114.28);
    expect(validarSubempenho(obr[0], obr, subs, null, 4114.29)).toMatch(/excede/);
  });

  it("anulação 7A por NE usa valor aplicado daquela nota", () => {
    const obr = [
      { id: "o1", participante_id: P, valor_empenhado: 2000, valor_aplicado: 1762.4 },
      { id: "o2", participante_id: P, valor_empenhado: 8114.28, valor_aplicado: 8114.28 },
    ];
    expect(saldoAnulacaoNe(obr[0], obr)).toBe(237.6);
    expect(saldoAnulacaoNe(obr[1], obr)).toBe(0);
  });

  it("rascunho sem valor é permitido mas não fecha", () => {
    const obr = [{ id: "o1", participante_id: P, valor_aplicado: null }, { id: "o2", participante_id: P }];
    expect(validarAlocacao(100, obr, P, "o1", null, null)).toBeNull();
    expect(resumoAlocacao(P, 100, obr).fechado).toBe(false);
  });
});
