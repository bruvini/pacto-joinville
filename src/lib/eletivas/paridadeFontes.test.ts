import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL("../../../"+p,import.meta.url)),"utf8");
const html=read("src/components/eletivas/FontesEletivas.tsx");
const css=read("src/styles/eletivas-reference-fontes.css");
const modal=read("src/components/eletivas/TabwinGuiaEletivas.tsx");
const raw=read("src/components/eletivas/reference/tabwin-v2422.html");
const route=read("src/routes/_authenticated/eletivas.$id.tsx");
describe("Fontes v2.42.2: reconstrução da referência com importação institucional",()=>{
 it("mantém estrutura original, títulos e ordem dos quatro grupos",()=>{
  for(const cl of ["files-hero","stage-pill","hero-actions","intake-layout","bigdrop",
   "intake-side","sources-board","source-head","source-step","slots",
   "slot-format","run-dock","run-status","techlog"]){
   expect(html).toContain(cl);
  }
  expect(html).toContain("Reúna as fontes. O sistema cuida do resto.");
  const groups=["Tabulações locais","Retorno SES · hospitalar",
   "Retorno SES · ambulatorial","Fontes de apoio"];
  expect(groups.map(x=>html.indexOf(x))).toEqual(
   groups.map(x=>html.indexOf(x)).sort((a,b)=>a-b));
  expect(html).toContain("Analisar competência");
  expect(html).toContain("Detalhes técnicos da importação");
  expect(css).toContain("@scope (.ec-sc .ec-fontes-ref)");
  expect(css).toContain(".files-hero");
  expect(css).toContain(".source-section");
 });
 it("repete a experiência de soltar arquivos, reconhecer estrutura e confirmar antes de gravar",()=>{
  for(const anchor of ["onDrop={arrasto}","loteInput.current?.click()",
   "classificar(Array.from","identificarFonte(file)","validarFonteAntesUpload",
   "const preparados:","Nenhum arquivo deste lote foi enviado",
   "insert(registros)","sha256(bytes)","createSignedUrl"]){
   expect(html).toContain(anchor);
  }
  expect(html).toContain('onClick={()=>upload.mutate(lote)}');
  expect(html).toContain('onClick={()=>escolherArquivo(f.id)}');
 });
 it("botão Analisar executa pré-conciliação protegida, sem gravação parcial",()=>{
  expect(html).toContain("executarPreConciliacaoLocal");
  expect(html).toContain("ErroPreConciliacao");
  expect(html).toContain("disabled={!podeEditar||aguarda||faltantes.length>0||lote.length>0}");
  expect(html).toContain("onClick={()=>conciliar.mutate()}");
  expect(html).toContain("Conferência fiscal obrigatória.");
  expect(html).toContain("A conciliação exige confirmação fiscal posterior");
 });
 it("guia TabWin original está completo e os controles são seguros",()=>{
  expect(raw).toContain("Como gerar as tabulações");
  expect(raw).toContain('data-twpane="faec"');
  expect(raw).toContain('data-twpane="mac"');
  expect(raw).toContain('data-twpane="sia"');
  expect(raw).toContain("Proced. CIB.727_2025");
  expect(raw).toContain("Proced. CIB.744_2023");
  expect(raw).not.toMatch(/<script|on(?:click|load|error)=/i);
  expect(modal).toContain("dangerouslySetInnerHTML");
  expect(modal).toContain("noopener noreferrer");
  expect(modal).toContain("onOpenChange");
 });
 it("CSS extraído tem blocos completos e permanece no escopo próprio",()=>{
  const modalCSS=read("src/styles/eletivas-reference-tabwin.css");
  for(const folha of [css,modalCSS]){
   expect((folha.match(/\\{/g)??[]).length)
    .toBe((folha.match(/\\}/g)??[]).length);
   expect(folha).not.toMatch(/@import\\s+url/);
  }
  expect(css).toContain(".intake-layout");
  expect(css).toContain(".run-dock");
  expect(modalCSS).toContain(".ec-tabwin .tw-pane.on");
 });
 it("referência de layout permanece limitada ao módulo Eletivas",()=>{
  expect(route).toContain("<FontesEletivas");
  expect(route).toContain("id={id} cnes={c.cnes}");
  expect(css).not.toMatch(/(?:^|\n)\s*(?:body|html|:root)\s*\{/);
  expect(html).not.toContain("localStorage");
  expect(html).toContain('from("eletivas-arquivos")');
  expect(html).toContain('supabase.from("eletivas_arquivos")');
 });
});
