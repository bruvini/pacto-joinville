import { describe, expect, it } from "vitest";
import { requerAnulacaoPiso, saldosAnulacaoPiso } from "./anulacao";

describe("anulação condicional de empenho do Piso", () => {
  it("detecta diferenças de outubro do BOJ e Bethesda sem arredondamento prematuro", () => {
    const saldos = saldosAnulacaoPiso([
      {id:"boj", participante_id:"bo",valor_empenhado:15000,valor_a_liquidar:9524.68},
      {id:"bet", participante_id:"beth",valor_empenhado:1000,valor_a_liquidar:352},
    ]);
    expect(saldos.map(x=>x.previsto)).toEqual([5475.32,648]);
    expect(saldos.reduce((s,x)=>s+Math.round(x.previsto*100),0)).toBe(612332);
  });
  it("não inventa anulação sem valor da NE ou conciliação", () => {
    expect(requerAnulacaoPiso([
      {id:"1",participante_id:"a",valor_empenhado:null,valor_a_liquidar:100},
      {id:"2",participante_id:"b",valor_empenhado:50,valor_a_liquidar:null},
      {id:"3",participante_id:"c",valor_empenhado:50,valor_a_liquidar:100},
      {id:"4",participante_id:"d",valor_empenhado:100,valor_a_liquidar:100},
    ])).toBe(false);
  });
  it("preserva valor efetivamente anulado separado do previsto", () => {
    expect(saldosAnulacaoPiso([{id:"o",participante_id:"p",
      valor_empenhado:500,valor_a_liquidar:300,valor_anulado:null}])[0])
      .toMatchObject({previsto:200,anulado:null});
  });
});
