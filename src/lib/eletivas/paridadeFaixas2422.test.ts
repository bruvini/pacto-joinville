import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {Tables} from "@/integrations/supabase/types";
import {classificacaoCIB,normaParaCompetencia} from
 "../../../supabase/functions/_shared/eletivas-normativas";
import {casosAuditorFaixa,resumoAuditorFaixa,LABELS_FAIXA} from "./auditorFaixaView";
type Item=Tables<"eletivas_itens">;
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const page=read("src/components/eletivas/AuditorFaixaEletivas.tsx");
const shell=read("src/routes/_authenticated/eletivas.$id.tsx");
const comm=read("src/components/eletivas/ComunicacoesEletivas.tsx");
const style=read("src/styles/eletivas-reference-faixas.css");
const cod=[...normaParaCompetencia("07/2026")!.anexoII][0];
const classification=classificacaoCIB(cod,"07/2026").classificacao;
const make=(aih:string,estado:string,options:Record<string,unknown>={})=>
 ({id:aih,categoria:"faec_mult",aih,procedimento:"041501001",
  descricao:"Múltipla FAEC",detalhe:{perfil:{
   aih,estado,faixa:"1",natureza:"Estadual",principal:"041501001",
   motivo:"Conferência normativa individual do procedimento-filho.",
   conferido:true,componentes:[{proc:cod,classification,qt:1,unitario:20,
    fonte:"workbook AIH",linha:23}]},...options}}
  as unknown as Item);
describe("Auditor de faixa · paridade HTML 2.42.2",()=>{
 it("reproduz hero, norma, contatos, 5 filtros, cartões e 2 diagnósticos",()=>{
  const keys=["fx-hero","norm-banner","fx-contact-grid","fx-kpis",
   "fx-filter-note","fx-list","fx-card","fx-card-head","fx-facts",
   "fx-components","fx-action-mini","now-box","fx-actions"];
  const indexes=keys.map(k=>page.indexOf(k));
  expect(indexes.every(i=>i>=0)).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a,b)=>a-b));
  for(const s of ["AIHs auditadas","Compatíveis","Revisar","Incompatíveis",
   "Dependência FPO","Ver diagnóstico e ação","Como concluiu?",
   "Regularizar FPO","sem componentes classificados"])
   expect(page).toContain(s);
  expect(page).toContain("DossieFiscalEletivas");
  expect(page).not.toContain('className="ec-table-scroll"');
 });
 it("mapeia IAHS individualizadas, sem duplicar uma AIH das fontes",()=>{
  const a=make("4226500312287","ok");
  const b=make("4226500312287","ok");
  b.categoria="mac_mult";b.id="mac-2";
  const cases=casosAuditorFaixa([a,b],"07/2026");
  expect(cases).toHaveLength(1);
  expect(cases[0].itens).toHaveLength(2);
  expect(cases[0].origens).toContain("mac_mult");
  expect(cases[0].filhos[0].classificacao).toBe(classification);
  expect(cases[0].norma).toBe("727/CIB/2025");
 });
 it("não confirma AIH sem origem válida ou memória individual",()=>{
  const none=make("mult","ok");
  expect(casosAuditorFaixa([none],"07/2026")).toEqual([]);
  const item=make("4226500312287","ok",{perfil:{
   aih:"4226500312287",estado:"ok",faixa:"1",
   motivo:"Sem linhas no workbook",componentes:[]}});
  const cases=casosAuditorFaixa([item],"07/2026");
  expect(cases[0].estado).toBe("review");
  expect(cases[0].alertaDeMemoria).toBe(true);
 });
 it("preserva a norma por competência e sinaliza classificações conflitantes",()=>{
  expect(normaParaCompetencia("08/2026")?.rotulo).toBe("399/CIB/2026");
  const item=make("4226500312287","ok",{perfil:{
   aih:"4226500312287",estado:"ok",faixa:"1",principal:"041501001",
   componentes:[{proc:cod,classification:"Não localizado",qt:1}]}});
  const res=casosAuditorFaixa([item],"07/2026")[0];
  // Sem classificação da origem não há reclassificação automática monetária.
  expect(res.estado).toBe("ok");
  const opposite=classification==="Federal"?"Estadual":"Federal";
  const bad=make("4226500312287","ok",{perfil:{
   aih:"4226500312287",estado:"ok",faixa:"1",principal:"041501001",
   componentes:[{proc:cod,classification:opposite,qt:1}]}});
  const conflict=casosAuditorFaixa([bad],"07/2026")[0];
  expect(conflict.estado).toBe("review");
  expect(conflict.filhos[0].divergenciaNormativa).toBe(true);
 });
 it("conta as quatro situações e permite busca e navegação reais",()=>{
  const rows=["ok","bad","review","fpo"].map((x,i)=>
   make("422650031228"+i,x));
  const c=casosAuditorFaixa(rows,"07/2026");
  const stats=resumoAuditorFaixa(c);
  expect(stats.all).toBe(4);
  expect(Object.values(LABELS_FAIXA)).toHaveLength(4);
  expect(page).toContain("aria-pressed={filtro===x}");
  expect(page).toContain("onAbrirFila(escolhido.item.id)");
  expect(page).toContain("onAbrirFpo(a.aih,a.item.id)");
  expect(page).toContain("onAbrirComunicacoes(a.aih,a.item.id)");
  expect(shell).toContain('onAbrirFpo={(aih,itemId)=>');
  expect(shell).toContain('onAbrirComunicacoes={(aih,itemId)=>');
  expect(comm).toContain('foco?.modo==="fpo"?foco.aih');
  expect(comm).toContain("ec_fpo_iniciar");
 });
 it("CSS e infraestrutura documental não vazam para os outros módulos",()=>{
  for(const s of [".fx-hero",".fx-kpi",".fx-card",".fx-facts",
   ".fx-components",".fx-action-mini",".now-box",".norm-banner"])
   expect(style).toContain(s);
  expect(style).toContain("@scope (.ec-sc .ec-faixas-ref)");
  expect(style.split("{").length).toBe(style.split("}").length);
  expect(page).not.toContain(".insert(");
  expect(page).not.toContain(".update(");
  expect(page).toContain('from("eletivas_comunicacoes")');
 });
});
