import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {memoriaFpoOficialEC,CODIGOS_NOTA5} from "./memoriaFpoHtml";
import type {Tables} from "@/integrations/supabase/types";
type Item=Tables<"eletivas_itens">;
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const ui=read("src/components/eletivas/FpoArt19Eletivas.tsx");
const css=read("src/styles/eletivas-reference-fpo.css");
const route=read("src/routes/_authenticated/eletivas.$id.tsx");
const component=read("src/components/eletivas/ProgramacaoFpoEletivas.tsx");
const item=(categoria:string,qt:number|null,federal:number,cib:number=200,ec:number=150)=>
 ({id:categoria,procedimento:"040701003",descricao:"Teste",categoria,
 detalhe:{
  qt_procedimentos:qt,unitario_delib:ec,
  fpo_oficial:{nome:"Procedimento FPO",federal,sigtap:180,cib_complemento:cib,
   eletiva:"S",pct:"100",nota5:true}
 }} as unknown as Item);

describe("Tela FPO · Art. 19 — paridade HTML 2.42.2",()=>{
 it("repete a ordem visual do renderFpo original, sem blocos institucionais invasivos",()=>{
  const exact=["fpo-hero","fx-contact-grid","reg-group-panel","playbook",
   "fpo-rule","fpo-formula","pendwarn","fpo-note5","kpis",
   "Produção da competência × FPO oficial","fpo-note-section",
   "Situação da programação local","fpo-source"];
  const at=exact.map(x=>ui.indexOf(x));
  expect(at.every(n=>n>=0)).toBe(true);
  expect(at).toEqual([...at].sort((a,b)=>a-b));
  expect(ui).toContain("FPO é controle de programação — não é uma linha do atesto.");
  expect(ui).toContain("Tabela Catarinense");
  expect(ui).toContain("Residual SES");
  expect(ui).toContain("GEMAS · Gerência de Monitoramento");
  expect(route).toContain('aba==="fpo"&&<FpoArt19Eletivas');
  expect(route).not.toContain('competencia={c.competencia} modo="fpo"');
 });
 it("mantém CSS original isolado com quatro indicadores, ledger e versão mobile",()=>{
  for(const x of [".fpo-hero",".fpo-rule-card",".fpo-formula",".fpo-note5",
   ".reg-group-panel",".fx-contact-grid",".kpis",".ledger",".fpo-status"]){
   expect(css).toContain(x);
  }
  expect(css).toContain("@scope (.ec-sc .ec-fpo-ref)");
  expect(css.split("{").length).toBe(css.split("}").length);
  expect(css).not.toContain("\nbody{");
 });
 it("julho mostra FPO como referência futura; agosto aplica Nota 05 somente a memória",()=>{
  const july=memoriaFpoOficialEC([item("faec_prod",2,50)],"07/2026");
  const august=memoriaFpoOficialEC([item("faec_prod",2,50)],"08/2026");
  expect(july.postNota).toBe(false);
  expect(august.postNota).toBe(true);
  expect(august.rows[0].federalTotal).toBe(100);
  expect(august.rows[0].residual).toBe(150);
  expect(august.rows[0].residualTotal).toBe(300);
  expect(august.rows[0].estado).toBe("coerente");
  expect(august.totalFederal).toBe(100);
  expect(august.totalResidual).toBe(300);
  expect(CODIGOS_NOTA5).toEqual(["040701003","041304002","040901018"]);
 });
 it("nunca duplica físico do complemento nem inventa QTD ausente",()=>{
  const v=memoriaFpoOficialEC([
   item("faec_prod",3,50),
   item("faec_compl",3,50)
  ],"08/2026");
  expect(v.rows[0].qtd).toBe(3);
  expect(v.rows[0].federalTotal).toBe(150);
  const noQ=memoriaFpoOficialEC([item("faec_compl",3,50)],"08/2026");
  expect(noQ.rows[0].qtd).toBeNull();
  expect(noQ.totalFederal).toBeNull();
  expect(noQ.totalResidual).toBeNull();
  expect(noQ.rows[0].estado).toBe("sem comparação");
 });
 it("diferença na unidade é sinal de revisão, não crédito; nunca residual negativo",()=>{
  const v=memoriaFpoOficialEC([item("mac_prod",2,100,120,50)],"08/2026");
  expect(v.rows[0].estado).toBe("revisar");
  expect(v.rows[0].residual).toBe(20);
  const w=memoriaFpoOficialEC([item("mac_prod",2,130,120,0)],"08/2026");
  expect(w.rows[0].residual).toBe(0);
  expect(w.rows[0].estado).toBe("sem comparação");
 });
 it("não grava valor ou vincula artificialmente fluxos FPO",()=>{
  expect(ui).toContain('from("eletivas_fpo_fluxos")');
  expect(ui).toContain('from("eletivas_fpo_programacoes")');
  expect(ui).toContain('from("eletivas_arquivos")');
  expect(ui).not.toContain("supabase.rpc(");
  expect(ui).not.toContain(".insert(");
  expect(ui).toContain("a FPO oficial informa");
  expect(ui).toContain("não comprovação");
  expect(ui).toContain("mostrarDocumentos&&<ProgramacaoFpoEletivas");
  expect(component).toContain("Documento de programação FPO registrado");
  expect(ui).toContain("onNavigate(\"arquivos\")");
 });
});
