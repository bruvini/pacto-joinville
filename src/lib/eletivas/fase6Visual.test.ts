import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const route=read("src/routes/_authenticated/eletivas.$id.tsx");
const css=read("src/styles/eletivas-sc.css");
const panel=read("src/components/eletivas/PainelScEletivas.tsx");
const audit=read("src/components/eletivas/AuditoriaEletivas.tsx");
const docs=read("src/components/eletivas/DocumentosEletivas.tsx");
describe("Fase 6 — reconstrução visual isolada do HTML 2.42.2",()=>{
 it("onze seções, na mesma ordem e sem abas administrativas extras",()=>{
  const bloco=route.split("const abas=[")[1].split("] as const;")[0];
  const linhas=[...bloco.matchAll(/^  \["([^"]+)","([^"]+)"/gm)]
   .map(m=>[m[1],m[2]]);
  expect(linhas).toEqual([
   ["arquivos","Fontes da competência"],
   ["painel","Painel"],
   ["correcoes","Correções recebidas"],
   ["fpo","FPO · Art. 19"],
   ["faixas","Auditor de faixa"],
   ["comunicacoes","Comunicações"],
   ["pagos","Itens conciliados"],
   ["fila","Fila de auditoria"],
   ["atesto","Atesto (SEI)"],
   ["exportar","Exportar"],
   ["manual","Manual do processo"]
  ]);
  expect(route).toContain('useState<Aba>("arquivos")');
  expect(route).toContain("aria-current={aba===chave?");
  expect(route).toContain("data-testid=\"eletivas-fase6-shell\"");
  expect(route).toContain("onClick={()=>ir(chave)}");
 });
 it("identidade visual Santa Catarina não muda CSS global do restante do sistema",()=>{
  for(const x of ["--sc-red:#ef202c","--sc-green:#a6ce2e",
   "--sc-ink:#17332c","--sc-bg:#f4f5f1","--sc-serif",
   ".ec-sc .ec-side",".ec-sc .ec-nav",".ec-sc .ec-topbar",
   ".ec-sc .ec-stamp",".ec-sc .ec-kpi",".ec-sc .ec-ledger",
   "@media(max-width:900px)","@media(max-width:550px)",
   "@media(prefers-reduced-motion:reduce)"])expect(css).toContain(x);
  expect(css).not.toMatch(/(?:^|\n)\s*(?:body|html|:root|aside|main|button|table)\s*\{/);
  expect(route).toContain('import "@/styles/eletivas-sc.css"');
  expect(route).toContain("aria-label=\"Busca contextual por AIH e procedimento\"");
 });
 it("painel tem os cinco quadros financeiros e não duplica FAEC faixa MAC",()=>{
  for(const x of ["FAEC","MAC","SIA","Correções recebidas",
   "Consolidado financeiro","faec_fxmac","Controle não somado",
   "ec_resumo_financeiro","Conferência React × PostgreSQL"]){
   expect(panel).toContain(x);
  }
  expect(panel).toContain("valorConciliadoCentavos");
  expect(panel).toContain("cent(N(sql.data.total_com_correcoes))===r.total");
 });
 it("correções, atesto e exportação preservam as RPCs operacionais",()=>{
  expect(docs).toContain('modo?:"atesto"|"correcoes"|"exportar"');
  expect(docs).toContain('modo==="correcoes"');
  expect(docs).toContain('modo==="atesto"');
  expect(docs).toContain('modo==="exportar"');
  for(const name of ["ec_incluir_correcao","ec_revisar_correcao",
   "DocumentacaoFase5Eletivas"]){expect(docs).toContain(name);}
  expect(route).toContain("<FechamentoEletivas");
  expect(route).toContain("<HomologacaoEletivas");
  expect(route).toContain("<ComunicacoesEletivas");
  expect(route).toContain("<ConferenciaNormativaEletivas competencia={c.competencia}/>");
 });
 it("itens conciliados e fila compartilham o motor decisório sem duplicar lógica",()=>{
  expect(route).toContain('aba==="pagos"||aba==="fila"');
  expect(route).toContain('modoTela={aba==="pagos"?"conciliados":"fila"}');
  expect(audit).toContain('modoTela?:"todos"|"conciliados"|"fila"');
  expect(audit).toContain("vista:vistaAtiva");
  expect(audit).toContain("ec_decidir_item");
  expect(audit).toContain("ec_conferir_item");
  expect(audit).toContain("DossieFiscalEletivas");
 });
 it("auditor individual possui tabela, dossiê modal, estados e busca de AIH",()=>{
  const fx=read("src/components/eletivas/AuditorFaixaEletivas.tsx");
  expect(fx).toContain("Confronto entre a faixa distribuída à AIH");
  expect(fx).toContain("DialogContent");
  expect(fx).toContain("DossieFiscalEletivas");
  expect(fx).toContain("d.aihs.map(record)");
  expect(route).toContain('aba==="faixas"');
 });
 it("manual e linha do tempo preservam transparência, versão e histórico JSON recolhido",()=>{
  const manual=read("src/components/eletivas/ManualProcessoEletivas.tsx");
  expect(manual).toContain('manual-v2422.html?raw');
  expect(manual).toContain("Do arquivo do Estado");
  expect(route).toContain('aba==="manual"');
  expect(route).toContain("descreverEventoEletivas");
  expect(route).toContain("Ver registro técnico completo");
  expect(route).toContain("Carregar mais eventos");
 });
});
