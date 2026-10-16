import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resumoEncontro} from "./financeiro";
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const painel=read("src/components/eletivas/PainelScEletivas.tsx");
const fontes=read("src/components/eletivas/FontesEletivas.tsx");
const route=read("src/routes/_authenticated/eletivas.$id.tsx");
const css=read("src/styles/eletivas-reference-painel.css");
describe("Paridade HTML 2.42.2 — Painel da conciliação",()=>{
 it("cinco KPIs exatamente na ordem de renderPainel()",()=>{
  const labels=["Valor considerado no atesto","Não pago / divergente",
   "Pendentes de decisão","Conciliados","A receber via Ofício"];
  const pos=labels.map(x=>painel.indexOf('rotulo:"'+x+'"'));
  expect(pos.every(x=>x>=0)).toBe(true);
  expect(pos).toEqual([...pos].sort((a,b)=>a-b));
  expect(painel).toContain('className="kpis" id="painelKpis"');
 });
 it("24 linhas na mesma sequência do HTML e recorte FAEC MAC separado",()=>{
  const linhas=["Físico MAC","MAC Complemento","MAC Múltiplas e Sequenciais",
   "MAC faixa FAEC","MAC faixa Federal","MAC Produção (Financeiro MC)",
   "Subtotal MAC","Físico FAEC","FAEC Produção","FAEC Complemento",
   "FAEC Múltiplas e Sequenciais (Complemento)",
   "FAEC faixa MAC — controle / não soma","Subtotal FAEC",
   "Físico SIA FAEC","SIA FAEC","Físico SIA MAC","SIA MAC","Subtotal SIA",
   "Não contemplado MS FAEC","Não contemplado MS MAC",
   "A receber EC — competência atual",
   "Correções recebidas — competências anteriores","Valor total do atesto",
   "A receber via Ofício"];
  const body=painel.split(" return [\n")[1]?.split("\n ];")[0]??"";
  const pos=linhas.map(x=>body.indexOf('nome:"'+x+'"'));
  expect(pos.every(x=>x>=0)).toBe(true);
  expect(pos).toEqual([...pos].sort((a,b)=>a-b));
  expect(linhas).toHaveLength(24);
  const r=resumoEncontro([{chave:"x",categoria:"faec_fxmac",descricao:"controle",
   valor_publicado:999,valor_esperado:999,situacao:"ok"},
   {chave:"y",categoria:"sia_mac",descricao:"SIA",valor_publicado:80,
    valor_esperado:80,situacao:"ok"}]);
  expect(r.total).toBe(8000);
  expect(r.controleFaecFxMac).toBe(99900);
 });
 it("preserva norma, operações, alertas e Checkmate na ordem original",()=>{
  const anchors=["norm-banner","ops-strip","alert-center","checkmate-missing",
   "Consolidado da competência","panel-consolidated","pendwarn"];
  const pos=anchors.map(x=>painel.indexOf(x));
  expect(pos.every(x=>x>=0)).toBe(true);
  expect(pos).toEqual([...pos].sort((a,b)=>a-b));
  expect(painel).toContain("consolidadoDoManifestoEC");
  expect(painel).toContain("ec_resumo_financeiro");
  expect(painel).toContain("valorConciliadoCentavos");
  expect(painel).toContain("Math.round(Number(memoriaSql)*100)===r.total");
 });
 it("CSS é isolado e usa a hierarquia de classes da referência",()=>{
  expect(css).toContain("@scope (.ec-sc .ec-painel-ref)");
  for(const x of [".kpis",".ops-grid",".alert-center",".checkmate-grid",
   ".panel-consolidated",".pendwarn",".norm-banner"]){
   expect(css).toContain(x);
  }
  expect((css.match(/\{/g)||[]).length).toBe((css.match(/\}/g)||[]).length);
 });
 it("fluxo Fontes → processamento → refresh completo → Painel só em sucesso",()=>{
  expect(fontes).toContain("executarPreConciliacaoLocal");
  expect(fontes).toContain("await onRefresh()");
  expect(fontes).toContain("onAnalisado()");
  expect(fontes.indexOf("await onRefresh()")).toBeLessThan(fontes.indexOf("onAnalisado()"));
  expect(route).toContain('onAnalisado={()=>ir("painel")}');
  expect(route).toContain('fontesSnapshot={c.ec_fontes_snapshot}');
  expect(fontes).not.toContain("Registro individual de fonte");
  expect(route).toContain('aba!=="arquivos"&&aba!=="painel"');
 });
});
