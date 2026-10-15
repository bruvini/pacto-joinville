import {describe,expect,it} from "vitest";
import * as XLSX from "xlsx";
import {validarEstruturaFonte} from "./validarEstruturaFonte";
import {lerSES,lerFontesEC,lerDBF,type ArquivoBrutoEC} from "../../../supabase/functions/_shared/eletivas-leitores";
const CNES="2436469";
function livro(abas:Record<string,unknown[][]>){
 const wb=XLSX.utils.book_new();
 for(const [name,rows] of Object.entries(abas))
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
 return XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
}
const cab=["Procedimento",CNES+" HMSJ"];
const ses=()=>livro({
 Físico:[cab,["0415010010 Teste",1]],
 Financeiro:[cab,["0415010010 Teste",100]],
 Complemento:[cab,["0415010010 Teste",0]],
 Delib:[["0415010010",2000]],
});
describe("layout de evidências oficiais — sem presumir dados",()=>{
 it("identifica CNES e preserva código original e célula de origem",()=>{
   const b=ses();
   expect(validarEstruturaFonte("s_faec",b,CNES,"SES.xlsx").abas).toContain("Físico");
   const m=lerSES(new Uint8Array(b),CNES,XLSX as unknown as Parameters<typeof lerSES>[2]);
   expect(m.proveniencia?.financeiro["041501001"]).toMatchObject({
     aba:"Financeiro",celula:"B2",codigo_original:"0415010010",cnes:CNES,
   });
   expect(m.financeiro["041501001"]).toBe(100);
 });
 it("recusa CNES errado com referência à aba e região",()=>{
   expect(()=>validarEstruturaFonte("s_faec",ses(),"0000000","SES.xlsx")).toThrow(/Físico.*A1:L12.*CNES/);
 });
 it("reconhece três gerações de múltiplas FAEC pelo par de abas",()=>{
   for(const [a,b] of [["N_AIH","Estab"],["Hospitais","AIH"],["Hospital","Procedimentos"]])
     expect(validarEstruturaFonte("s_faec_ms",livro({
       [a]:[["AIH",CNES],[ "1234567890123",1]],[b]:[["AIH","0415010010"],["1234567890123",1]],
     }),CNES,"mult.xlsx").layout).toBe("s_faec_ms");
 });
 it("recusa MAC múltiplas se não houver Complemento",()=>{
   expect(()=>validarEstruturaFonte("s_mac_ms",livro({
     "Físico Principal":[[CNES,2]],
   }),CNES,"multmac.xlsx")).toThrow(/Físico Principal e Complemento/);
 });
 it("recusa workbook AIH sem aba de consultas",()=>{
   expect(()=>validarEstruturaFonte("wb_aih",livro({CIB:[["Codigo",100]]}),CNES,"AIH.xlsx")).toThrow(/Original para Consultas/);
 });
 it("recusa EC Delib sem Delib_*",()=>{
   expect(()=>validarEstruturaFonte("ec_delib",livro({Tabela:[[1,2]]}),CNES,"delib.xlsx")).toThrow(/Delib_/);
 });
 it("recusa FPO sem as colunas oficiais",()=>{
   expect(()=>validarEstruturaFonte("fpo_official",livro({FPO:[["Código","Descrição"]]}),CNES,"fpo.xlsx")).toThrow(/cabeçalho/);
 });
 it("distingue fórmula sem resultado de zero válido no leitor SES",()=>{
   const fis=XLSX.utils.aoa_to_sheet([cab,["0415010010",2]]);
   const fin=XLSX.utils.aoa_to_sheet([cab,["0415010010",100]]);
   const comp=XLSX.utils.aoa_to_sheet([cab,["0415010010",null]]);
   comp.B2={t:"n",f:"1+1"} as XLSX.CellObject;
   // Geradores XLSX podem preencher automaticamente cache 0 ao exportar.
   // Leitor sintético mantém o campo ausente, como em arquivo sem <v>.
   const workbook={SheetNames:["Físico","Financeiro","Complemento"],
     Sheets:{"Físico":fis,"Financeiro":fin,"Complemento":comp}};
   const adaptador={read:()=>workbook,utils:{sheet_to_json:XLSX.utils.sheet_to_json}};
   const m=lerSES(new Uint8Array(0),CNES,
     adaptador as unknown as Parameters<typeof lerSES>[2]);
   expect(m.formulasSemCache).toContain("041501001");
   expect(m.formulasCacheZero).toEqual([]);
 });
 it("aceita fórmula com resultado zero explicitamente salvo, como nos XLSX da SES",()=>{
   const wb=XLSX.utils.book_new();
   for(const name of ["Físico","Financeiro","Complemento"]){
     const sheet=XLSX.utils.aoa_to_sheet([cab,["0415010010",name==="Físico"?0:100]]);
     if(name==="Complemento")sheet.B2={t:"n",f:"IFERROR(1/0,0)",v:0} as XLSX.CellObject;
     XLSX.utils.book_append_sheet(wb,sheet,name);
   }
   const b=XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
   expect(()=>validarEstruturaFonte("s_faec",b,CNES,"ses.xlsx")).not.toThrow();
   const m=lerSES(new Uint8Array(b),CNES,XLSX as unknown as Parameters<typeof lerSES>[2]);
   expect(m.formulasSemCache).toEqual([]);
   expect(m.complemento["041501001"]).toBeUndefined();
 });
 it("fonte FAEC faixa estadual sem CNES HMSJ é apoio válido, sem somar valores de outros hospitais",()=>{
   const semHmsj=livro({
     "DelibFFE":[["Código","Descrição","Valor"],["0407010173","Bariátrica",2175]],
     "Físico":[["Procedimentos realizados","2522411 HOSPITAL AZAMBUJA",
       "2558254 HOSPITAL SANTO ANTONIO"],["0407010173 GASTROPLASTIA",2,13]],
     "Complemento":[["Código","Procedimento","2522411 HOSPITAL AZAMBUJA",
       "2558254 HOSPITAL SANTO ANTONIO"],["0407010173","GASTROPLASTIA",4350,28275]],
   });
   const v=validarEstruturaFonte("s_mac_faec",semHmsj,CNES,"faixa estadual.xlsx");
   expect(v.avisos?.some(x=>x.includes("não aparece"))).toBe(true);
   const m=lerSES(new Uint8Array(semHmsj),CNES,
     XLSX as unknown as Parameters<typeof lerSES>[2],true);
   expect(m.fisico).toEqual({});
   expect(m.financeiro).toEqual({});
   expect(m.complemento).toEqual({});
   expect(m.abasSemCnes).toContain("Físico");
   expect(m.abasSemCnes).toContain("Complemento");
   expect(()=>validarEstruturaFonte("s_faec",semHmsj,CNES,"obrigatório.xlsx"))
     .toThrow(/fonte obrigatória/);
 });
 it("SIA FAEC puro e SIA MAC sem CNES HMSJ não usam hospital de mesmo nome",()=>{
   const soOutro=livro({
     DelibM:[["0405050364",200]],
     Físico:[["Estabelecimentos CNES-SC","2306336 HOSPITAL SAO JOSE"],
       ["0405050364 TRATAMENTO",21]],
     Financeiro:[["Estabelecimentos CNES-SC","2306336 HOSPITAL SAO JOSE"],
       ["0405050364 TRATAMENTO",300]],
     Complemento:[["Procedimento","2306336 HOSPITAL SAO JOSE"],
       ["0405050364 TRATAMENTO",900]],
   });
   for(const papel of ["sia_mac","sia_faec_p"] as const){
     const v=validarEstruturaFonte(papel,soOutro,CNES,"apoio.xlsx");
     expect(v.avisos?.length).toBeGreaterThan(0);
     const m=lerSES(new Uint8Array(soOutro),CNES,
       XLSX as unknown as Parameters<typeof lerSES>[2],true);
     expect(m.fisico).toEqual({});
     expect(m.financeiro).toEqual({});
     expect(m.complemento).toEqual({});
   }
 });
});
