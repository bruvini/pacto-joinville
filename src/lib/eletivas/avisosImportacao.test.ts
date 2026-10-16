import {describe,it,expect} from "vitest";
import {agruparAvisosPublicacao} from "./avisosImportacao";
import {FONTES_ELETIVAS} from "./fontes";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const tela=readFileSync(fileURLToPath(new URL("../../../src/components/eletivas/FontesEletivas.tsx",import.meta.url)),"utf8");
describe("Fontes pré Fase 3 — avisos informativos e SEI",()=>{
 it("agrupa sete avisos em três fontes sem encobrir falhas",()=>{
  const dados=[
   ...["Físico","Complemento"].map(aba=>`SIA FAEC puro: Aba ${aba}: CNES 2436469 não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.`),
   ...["Físico","Financeiro","Complemento"].map(aba=>`SIA MAC: Aba ${aba}: CNES 2436469 não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.`),
   ...["Físico","Complemento"].map(aba=>`FAEC faixa estadual / MAC proc FAEC: Aba ${aba}: CNES 2436469 não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.`),
   "Falha real: cache de fórmula ausente",
  ];
  const x=agruparAvisosPublicacao(dados);
  expect(x.ausencias).toHaveLength(3);
  expect(x.ausencias.reduce((s,e)=>s+e.abas.length,0)).toBe(7);
  expect(x.outros).toEqual(["Falha real: cache de fórmula ausente"]);
 });
 it("não anuncia documentos SEI na aba de fontes",()=>{
  expect(FONTES_ELETIVAS.some(f=>f.id==="rtma"||f.id==="ra")).toBe(false);
  expect(tela).not.toContain('titulo:"Documentos SEI"');
  expect(tela).not.toContain("Registro individual de fonte");
  expect(tela).not.toContain("Etapa 6 — Liberação de Recurso");
 });
});
