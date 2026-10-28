import { describe,it,expect } from "vitest";
import { competenciasPrevistas, competenciaValida, exibirCompetenciaISO, resumoSolicitacao, validarSolicitacao } from "./competencias";
import { anoDaEmenda,totalAutorizado,formularioVazioEmenda,validarCadastroEmenda } from "./cadastro";
describe("Emendas · Fase 2, competências e valores",()=>{
 it("cria 1, 3 ou 12 competências conforme periodicidade escolhida na solicitação",()=>{
  expect(competenciasPrevistas("10/2026","mensal")).toEqual(["10/2026"]);
  expect(competenciasPrevistas("10/2026","trimestral")).toEqual(["10/2026","11/2026","12/2026"]);
  const anual=competenciasPrevistas("10/2026","anual");
  expect(anual).toHaveLength(12);
  expect(anual[0]).toBe("10/2026");
  expect(anual[3]).toBe("01/2027");
  expect(anual[11]).toBe("09/2027");
 });
 it("aceita virada de ano e não interpreta meses inválidos",()=>{
  expect(competenciasPrevistas("12/2026","trimestral")).toEqual(["12/2026","01/2027","02/2027"]);
  expect(competenciaValida("13/2026")).toBe(false);
  expect(competenciaValida("01/2026")).toBe(true);
  expect(()=>competenciasPrevistas("00/2026","mensal")).toThrow(/inválida/);
  expect(exibirCompetenciaISO("2026-10-01")).toBe("10/2026");
 });
 it("número de emenda com ano já dispensa seleção de exercício",()=>{
  expect(anoDaEmenda("42510002/2026",2025)).toBe(2026);
  expect(anoDaEmenda("42510002",2025)).toBe(2025);
 });
 it("valor disponível inicial inclui o rendimento, antes dos compromissos",()=>{
  expect(totalAutorizado(510000,2500,[])).toBe(512500);
  expect(totalAutorizado(510000,2500,[{variacao:500},{variacao:-1000}])).toBe(512000);
 });
 it("nota substitui reserva, sem somar a solicitação à NE",()=>{
  expect(resumoSolicitacao(300000,null,"aguardando_ne")).toEqual({reservado:300000,empenhado:0});
  expect(resumoSolicitacao(300000,270000,"emitida")).toEqual({reservado:0,empenhado:270000});
  expect(resumoSolicitacao(300000,null,"cancelada")).toEqual({reservado:0,empenhado:0});
 });
 it("valida SEI, valor e saldo antes de solicitar",()=>{
  const valid={competencia:"10/2026",periodicidade:"trimestral" as const,valor:300000,
   numeroSEI:"31405303",linkSEI:"https://sei.joinville.sc.gov.br/sei/controlador.php?id=1",saldo:510000};
  expect(validarSolicitacao(valid)).toEqual([]);
  expect(validarSolicitacao({...valid,valor:600000}).join(" ")).toContain("maior que o saldo");
  expect(validarSolicitacao({...valid,linkSEI:"http://example.org"})).not.toHaveLength(0);
 });
 it("cadastro aceita rendimento e a ausência de prazo de execução",()=>{
  const f={...formularioVazioEmenda(2026),numero:"42510002/2026",
   modalidade:"Individual",autoria_parlamentar:"Autoria",origem_recurso:"Federal",objeto:"Objeto da emenda",
   valor_autorizado_inicial:510000,valor_rendimento:1200,prestador_id:"uuid",prazo_execucao_dias:null};
  expect(validarCadastroEmenda(f)).toEqual([]);
  expect(validarCadastroEmenda({...f,valor_rendimento:-1}).some(x=>x.includes("Rendimento"))).toBe(true);
 });
});
