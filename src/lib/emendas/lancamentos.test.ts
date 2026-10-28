import {describe,it,expect} from "vitest";
import {mascararCompetencia,planejarLancamento} from "./lancamentos";
describe("emendas: abertura de lançamento",()=>{
 it("insere a barra automaticamente",()=>{
  expect(mascararCompetencia("1")).toBe("1");
  expect(mascararCompetencia("102")).toBe("10/2");
  expect(mascararCompetencia("102026")).toBe("10/2026");
  expect(mascararCompetencia("10/2026")).toBe("10/2026");
  expect(mascararCompetencia("10/202699")).toBe("10/2026");
 });
 it("gera três meses e parcelas 15,16,17 sem rateio financeiro",()=>{
  expect(planejarLancamento("10/2026","trimestral",15)).toEqual([
   {competencia:"10/2026",parcela:15,liberacoesPrevistasMinimas:1},
   {competencia:"11/2026",parcela:16,liberacoesPrevistasMinimas:1},
   {competencia:"12/2026",parcela:17,liberacoesPrevistasMinimas:1},
  ]);
 });
 it("cria 12 previsões anuais atravessando o exercício",()=>{
  const a=planejarLancamento("10/2026","anual",15);
  expect(a).toHaveLength(12);
  expect(a[11]).toEqual({competencia:"09/2027",parcela:26,liberacoesPrevistasMinimas:1});
 });
 it("rejeita competência incompleta e parcela inválida",()=>{
  expect(()=>planejarLancamento("102026","mensal",1)).toThrow();
  expect(()=>planejarLancamento("12/2026","mensal",0)).toThrow();
 });
});
