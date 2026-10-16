import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const load=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");
const html=load("../../components/eletivas/reference/manual-v2422.html");
const css=load("../../styles/eletivas-reference-manual.css");
const shell=load("../../routes/_authenticated/eletivas.$id.tsx");
const ui=load("../../components/eletivas/ManualProcessoEletivas.tsx");
const shellCss=load("../../styles/eletivas-sc.css");
describe("Reconstrução tela a tela — Manual standalone 2.42.2",()=>{
 it("reproduz o manual integral, não uma versão resumida em cartões",()=>{
  expect(html.length).toBeGreaterThan(28000);
  expect(html).toContain("Do arquivo do Estado ao atesto no SEI");
  const chapters=[...html.matchAll(/<h4 id="(m-[^"]+)" data-toc="([^"]+)"/g)].map(m=>m[1]);
  expect(chapters).toEqual(["m-inicio","m-passos","m-cib","m-fluxo",
   "m-principio","m-fontes","m-checagens","m-destinos","m-base","m-biblio"]);
  expect((html.match(/class="stepcard"/g)||[])).toHaveLength(6);
  expect((html.match(/<table/g)||[])).toHaveLength(3);
  expect((html.match(/class="fmini /g)||[]).length).toBeGreaterThanOrEqual(10);
  expect((html.match(/class="fcase /g)||[]).length).toBeGreaterThanOrEqual(5);
  expect(html).toContain('id="manToc"');
  expect(html).toContain("CIB");
  expect(html).toContain("Regularizar FPO");
  expect(html).toContain("Biblioteca de referência");
  expect(html).toContain("datasus.saude.gov.br");
 });
 it("fonte HTML é estática e sem elementos ativos injetados",()=>{
  expect(html).not.toMatch(/<script\b|on(?:click|load|error|submit)\s*=|<iframe|<object\b/i);
  expect(ui).toContain('import manualMarkup from "./reference/manual-v2422.html?raw"');
  expect(ui).toContain("dangerouslySetInnerHTML={{__html:html}}");
  expect(ui).toContain("replaceAll('target=\"_blank\"'");
  expect(ui).toContain("noopener noreferrer");
  expect(ui).toContain("querySelectorAll<HTMLAnchorElement>");
  expect(ui).toContain('aria-label="Índice dos capítulos"');
 });
 it("CSS visual é próprio da referência e isolado no módulo",()=>{
  expect(css).toContain("@scope (.ec-sc .ec-manual-ref)");
  for(const k of [".man-hero",".man-toc",".man h4",".man .stepcard",
   ".man .flow",".fnode.f-start",".fgate .diamond",".man .tbl",
   ".man .checks",".man .dest",".man .norm"]){
   expect(css).toContain(k);
  }
  expect(css).toContain("'Fraunces'");
  expect(css).toContain("'Public Sans'");
  expect(css).toContain("'Spline Sans Mono'");
  expect(shellCss).toContain(".ec-sc .ec-brand-flag img");
  expect(shell).toContain('src="/eletivas/referencia/bandeira-sc.webp"');
 });
 it("não altera criação de competência, lançamento ou motor do Encontro",()=>{
  expect(shell).toContain('supabase.from("lancamentos_pagamento")');
  expect(shell).toContain('aba==="manual"&&<ManualProcessoEletivas');
  expect(shell).toContain("ec-admin-tools");
  expect(ui).toContain("parcela aberta de convênio");
  expect(ui).toContain("Etapa 6 — Liberação de Recurso");
  expect(ui).not.toContain("supabase.from");
  expect(ui).not.toContain("supabase.rpc");
 });
});
