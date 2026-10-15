import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {compararGolden,montarGoldenReact,validarGolden,
 type GoldenEC} from "./goldenMaster";
import {verificarAihsOrigem,quantidadeSeparada,verificarLote,
 diagnosticoReduzido,comPrazo} from "./segurancaHomologacao";
import {construirManifestoEC,type FonteEscolhida} from "./manifesto";
import {validarEstruturaFonte,validarFormulaCache} from "./validarEstruturaFonte";
import {conciliarEletivas,type FonteEC} from "./motor";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const html=readFileSync(fileURLToPath(new URL(
 "../../../public/homologacao/ec-golden-html.js",import.meta.url)),"utf8");
const ler=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const sha="a".repeat(64);
const item=(v=10)=>({
 chave:"faec_prod|040704025",categoria:"faec_prod" as const,
 descricao:"Nome de procedimento",aih:null,procedimento:"0407040255",
 valor_publicado:v,valor_esperado:v,situacao:"ok" as const,
 detalhe:{qt_aihs:1,qt_procedimentos:3,cpf:"123.456.789-01"}
});
const base=()=>{
 const current=montarGoldenReact({
  competencia:"04/2026",cnes:"2436469",versaoMotor:"browser-eletivas-fase3.0",
  fontes:[{categoria:"s_faec",sha256:sha}],
  itens:[item()],correcoesCent:0,
 });
 const master={...structuredClone(current),origem:"html" as const,versaoMotor:"HTML-v2.10"};
 return {current,master};
};
describe("Fase 7 — golden master sem homologação fictícia",()=>{
 it("exporta quantidades de AIHs separadas de QT>1, sem paciente",()=>{
  const {current}=base();
  expect(current.itens[0]).toMatchObject({
   procedimento:"040704025",qtAIH:1,qtInterna:3,
   publicadoCent:1000,esperadoCent:1000,admitidoCent:1000,
  });
  expect(JSON.stringify(current)).not.toContain("123.456.789-01");
  expect(compararGolden(base().master,current)).toEqual([]);
 });
 it("não tolera alteração de centavo, subtotal nem total de atesto",()=>{
  const {master,current}=base();
  const changed:GoldenEC=structuredClone(current);
  changed.itens[0].admitidoCent=999;
  changed.componentes.faec_prod=999;
  changed.totalCent=999;
  const dif=compararGolden(master,changed);
  expect(dif.some(d=>d.campo==="admitidoCent")).toBe(true);
  expect(dif.some(d=>d.campo==="subtotalCent")).toBe(true);
  expect(dif.some(d=>d.campo==="totalCent")).toBe(true);
 });
 it("não aceita diferença de R$ 0,02 sem regra explícita dos dois motores",()=>{
  const {master,current}=base();
  current.itens[0].publicadoCent+=2;
  expect(compararGolden(master,current).some(d=>d.campo==="publicadoCent")).toBe(true);
  master.itens[0].regraTolerancia="conferencia_financeira_2_centavos";
  current.itens[0].regraTolerancia="conferencia_financeira_2_centavos";
  expect(compararGolden(master,current)).toEqual([]);
  current.itens[0].publicadoCent+=1;
  expect(compararGolden(master,current).some(d=>d.campo==="publicadoCent")).toBe(true);
 });
 it("glosa, decisão, estado, CNES e composição não permitem tolerância",()=>{
  const {master,current}=base();
  current.itens[0].decisao="aceito";
  current.itens[0].qtInterna=2;
  current.cnes="0000000";
  const d=compararGolden(master,current);
  expect(d.some(x=>x.campo==="decisao")).toBe(true);
  expect(d.some(x=>x.campo==="qtInterna")).toBe(true);
  expect(d.some(x=>x.campo==="cnes")).toBe(true);
 });
 it("rejeita AIH repetida e ausência de fonte com hash",()=>{
  const {master,current}=base();
  current.itens.push({...current.itens[0]});
  current.fontes=[];
  const d=compararGolden(master,current);
  expect(d.some(x=>x.codigo==="DUPLICADO")).toBe(true);
  expect(d.some(x=>x.codigo==="FONTE")).toBe(true);
  expect(()=>validarGolden({...current,fontes:[{categoria:"s_mac",sha256:"semsha"}]}))
   .toThrow(/SHA-256/);
 });
 it("exportador real lê R.items, aggregates e decisões, não patient names",()=>{
  expect(html).toContain("R.items.map");
  expect(html).toContain("aggregates()");
  expect(html).toContain("decisionOf(item.id)");
  expect(html).toContain("crypto.subtle.digest");
  for(const segredo of ["nome_paciente","nome_mae","prontuario_paciente"])
   expect(html).not.toContain("item."+segredo);
  expect(html).toContain('status:"capturado"');
  expect(html).toContain("aggregates().recEC");
  expect(html).toContain("const a=aggregates(),totalCent=cents(a.recEC)");
  expect(html).toContain("subtotais[item.cat]+=admitidoCent");
  expect(html).toContain('lnVal("total",totalLinhas)');

 });
});
describe("Fase 7 — rejeição de fontes e duplicidade",()=>{
 const dbf=(aih:string,proc:string,qt_procedimento=1)=>({
  aih,proc,valor:100,qt_procedimento,
 });
 it("a mesma AIH com procedimentos diferentes é válida, QT interno não duplica AIHs",()=>{
  const aih="4226101214786";
  const rows=[dbf(aih,"0407040255",3),dbf(aih,"0407040265",2)];
  expect(()=>verificarAihsOrigem(rows,"FAEC")).not.toThrow();
  expect(quantidadeSeparada(rows)).toEqual({aihs:1,quantidadeInterna:5});
 });
 it("bloqueia duplicidade exata AIH/procedimento e ausência de AIH",()=>{
  const aih="4226101214786",r=dbf(aih,"0407040255",1);
  expect(()=>verificarAihsOrigem([r,r],"FAEC")).toThrow(/duplicados/);
  expect(()=>verificarAihsOrigem([dbf("","0407040255")],"FAEC")).toThrow(/AIH ausente/);
 });
 it("rejeita arquivos truncados/corrupção e CNES ausente",()=>{
  const bad=new Uint8Array(4).buffer;
  expect(()=>validarEstruturaFonte("dbf_faec",bad,"2436469","sihteste.dbf")).toThrow();
  const wb=XLSX.utils.book_new();
  for(const name of ["Físico","Financeiro","Complemento"])
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ["Proc","9999999"],["0407040255",1]]),name);
  const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array"}) as ArrayBuffer;
  expect(()=>validarEstruturaFonte("s_faec",bytes,"2436469","SES.xlsx")).toThrow(/CNES/);
 });
 it("célula com fórmula sem cache bloqueia e cache numérico zero é válido",()=>{
  expect(()=>validarFormulaCache({f:"1-1"},"Planilha.xlsx","Financeiro","B2"))
   .toThrow(/fórmula sem resultado no cache/);
  expect(()=>validarFormulaCache({f:"1-1",v:null},"Planilha.xlsx","Financeiro","B2"))
   .toThrow(/fórmula sem resultado no cache/);
  expect(()=>validarFormulaCache({f:"1-1",v:0},"Planilha.xlsx","Financeiro","B2"))
   .not.toThrow();
 });
 const fake=(categoria:string,sha256=sha)=>({
  id:categoria, categoria, sha256,nome_original:categoria+".xlsx",
  tamanho:123,enviado_em:"2026-10-15T15:00:00Z",
 }) as unknown as FonteEscolhida;
 it("duplicate hash em fontes distintas gera impedimento",()=>{
  const files=["dbf_faec","dbf_mac","s_faec","s_mac"].map(id=>fake(id));
  expect(()=>construirManifestoEC(files,"04/2026")).toThrow(/mesmo arquivo/);
 });
 it("04/2026 não exige MAC Mult/Seq; 07/2026 e posteriores exigem",()=>{
  const files=["dbf_faec","dbf_mac","s_faec","s_mac"].map((id,i)=>fake(id,String(i).repeat(64)));
  expect(construirManifestoEC(files,"04/2026").fontes).toHaveLength(4);
  expect(()=>construirManifestoEC(files,"07/2026")).toThrow(/MAC múltiplas/);
  expect(()=>construirManifestoEC(files,"08/2026")).toThrow(/MAC múltiplas/);
 });
 it("lote acima do limite ou arquivo maior que 50MB é rejeitado",()=>{
  expect(()=>verificarLote([fake("s_faec")])).not.toThrow();
  const tooBig={...fake("s_faec"),tamanho:51*1024*1024};
  expect(()=>verificarLote([tooBig])).toThrow(/50 MB/);
  expect(()=>verificarLote(Array.from({length:19},(_,i)=>fake("cat"+i))))
   .toThrow(/fontes/);
 });
 it("não registra arquivo fora da competência ou repete envio sem auditoria",()=>{
  const sql=ler("supabase/migrations/20261015101500_eletivas_fase0_integridade_execucao.sql");
  expect(sql).toContain("competencia_id");
  const processar=ler("src/lib/eletivas/processarLocal.ts");
  expect(processar).toContain('p_comp:args.id');
  expect(processar).toContain('p_evidencias:manifesto');
  expect(processar).toContain("verificarAihsOrigem(normalizados.dbf_faec");
 });
 it("controle não soma e múltiplas sem AIH não viram aceito",()=>{
  const mat={fisico:{},financeiro:{},complemento:{},delib:{}};
  const f:FonteEC={dbf_faec:[],dbf_mac:[],s_faec:mat,s_mac:mat,
   s_faec_est:{...mat,complemento:{"041501001":2000}},
   mult_faec:[{aih:"4226101214786",proc:"041501001",pago:100,esperado:100}]};
  const r=conciliarEletivas(f);
  expect(r.totais.publicado).toBe(0);
  expect(r.itens.find(x=>x.categoria==="faec_mult")?.situacao).not.toBe("ok");
 });
 it("timeout é explícito e erro exibido não expõe CPF, AIH ou CNS",async()=>{
  await expect(comPrazo(new Promise<never>(()=>{}),1,"arquivo")).rejects.toThrow(/Tempo limite/);
  expect(diagnosticoReduzido(new Error(
   "CPF 123.456.789-01 AIH 4226101214786 CNS 123456789012345")))
    .not.toMatch(/123\.456\.789-01|4226101214786|123456789012345/);
 });
});
