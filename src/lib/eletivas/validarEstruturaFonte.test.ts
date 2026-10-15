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
 it("identifica fórmula sem cache e a célula antes de conciliar",()=>{
   const wb=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([cab,["0415010010",0]]),"Físico");
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([cab,["0415010010",100]]),"Financeiro");
   const comp=XLSX.utils.aoa_to_sheet([cab,["0415010010",null]]);
   comp.B2={t:"n",f:"1+1",v:0} as XLSX.CellObject;
   XLSX.utils.book_append_sheet(wb,comp,"Complemento");
   const b=XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
   expect(()=>validarEstruturaFonte("s_faec",b,CNES,"complemento.xlsx")).toThrow(/Complemento.*B2.*fórmula/);
 });
});
