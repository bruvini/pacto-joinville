import {describe,it,expect} from "vitest";
import {normalizarAihsCorrecao,normalizarValorCorrecao,
 validarEntradaCorrecaoEC,type EntradaCorrecaoEC} from "./correcoesFormulario";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(path:string)=>readFileSync(fileURLToPath(new URL("../../../"+path,import.meta.url)),"utf8");
const tela=read("src/components/eletivas/CorrecoesRecebidasEletivas.tsx");
const css=read("src/styles/eletivas-reference-correcoes.css");
const route=read("src/routes/_authenticated/eletivas.$id.tsx");
const entrada:EntradaCorrecaoEC={
 competencia_origem:"06/2026",aihs:"4226500312287\n4226500329403",
 valor:"R$ 1.234,56",fonte_origem:"SES/SC",referencia_origem:"DOC-123",
 documento_sei:"31212345",motivo:"Ajuste identificado pela SES"
};
describe("Paridade da página Correções Recebidas · HTML v2.42.2",()=>{
 it("preserva ordem do HTML: hero, 3 KPIs, referência consolidado, formulário, cartões",()=>{
  const els=["corr-hero","corr-summary","corr-consolidated","corr-layout",
   "corr-form","corr-note","corr-list-card","corr-entry","corr-aihs"];
  const list=els.map(x=>tela.indexOf(x));
  expect(list.every(x=>x>=0)).toBe(true);
  expect(list).toEqual([...list].sort((a,b)=>a-b));
  for(const label of ["VALORES RECEBIDOS · COMPETÊNCIAS ANTERIORES",
   "Correções monetárias recebidas","Total de correções","Registros lançados",
   "AIHs relacionadas","Competência de origem","AIHs relacionadas",
   "Valor recebido","Rastreabilidade da origem","Correções já registradas"]){
   expect(tela).toContain(label);
  }
  expect(route).toContain('aba==="correcoes"&&<CorrecoesRecebidasEletivas');
  expect(route).not.toContain('onRefresh={refresh} modo="correcoes"');
 });
 it("mantém estética original encapsulada sem afetar Fluxos 1/2",()=>{
  for(const sel of [".corr-hero",".corr-kpi",".corr-layout",".corr-form",
   ".corr-field",".corr-link-box",".corr-entry",".corr-aih",".corr-consolidated"])
   expect(css).toContain(sel);
  expect(css).toContain("@scope (.ec-sc .ec-correcoes-ref)");
  expect((css.match(/\{/g)||[]).length).toBe((css.match(/\}/g)||[]).length);
  expect(css).not.toMatch(/(?:^|\n)\s*(?:body|html|:root)\s*\{/);
 });
 it("formulário valida origin anterior, valor em centavos e AIH de 13 dígitos",()=>{
  expect(validarEntradaCorrecaoEC(entrada,"07/2026").ok).toBe(true);
  expect(validarEntradaCorrecaoEC({...entrada,competencia_origem:"07/2026"},"07/2026").ok).toBe(false);
  expect(validarEntradaCorrecaoEC({...entrada,competencia_origem:"08/2026"},"07/2026").ok).toBe(false);
  expect(validarEntradaCorrecaoEC({...entrada,documento_sei:"1"},"07/2026").ok).toBe(false);
  expect(validarEntradaCorrecaoEC({...entrada,aihs:"invalid"},"07/2026").ok).toBe(false);
  expect(validarEntradaCorrecaoEC({...entrada,valor:"-2"},"07/2026").ok).toBe(false);
  expect(normalizarValorCorrecao("R$ 1.234,56")).toBe(1234.56);
  expect(normalizarValorCorrecao("1234.56")).toBe(1234.56);
  expect(normalizarValorCorrecao("R$ 2,999")).toBeNull();
  expect(normalizarAihsCorrecao("4226500312287; 4226500312287 4226500329403").validas)
   .toEqual(["4226500312287","4226500329403"]);
 });
 it("não aceita edição/exclusão silenciosa; usa inclusão e revisão justificadas",()=>{
  expect(tela).toContain('rpc("ec_incluir_correcao"');
  expect(tela).toContain('rpc("ec_revisar_correcao"');
  expect(tela).toContain("Justifique a decisão com pelo menos 15 caracteres.");
  expect(tela).toContain("Aguardará revisão fiscal");
  expect(tela).toContain('status:"aprovada"');
  expect(tela).toContain('status:"rejeitada"');
  expect(tela).not.toContain('supabase.from("eletivas_correcoes").delete(');
  expect(tela).not.toContain('supabase.from("eletivas_correcoes").update(');
  expect(tela).toContain('x.status==="aprovada"');
 });
 it("fluxos FPO de origem são apenas consultados, sem inventar relação",()=>{
  expect(tela).toContain('from("eletivas_fpo_fluxos")');
  expect(tela).toContain("Consulta informativa");
  expect(tela).toContain("não são automáticos");
  expect(tela).toContain("consolidadoDoManifestoEC");
  expect(tela).toContain("financeiro.correcoes");
 });
});
