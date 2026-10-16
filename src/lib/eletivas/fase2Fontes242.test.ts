import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {identificarFonteBytes} from "./autoRoteamento";
import {validarFonteAntesUpload} from "./prepararFonte";
const CNES="2436469";
const livro=(tabs:Record<string,unknown[][]>)=>{
 const wb=XLSX.utils.book_new();
 for(const [nome,rows] of Object.entries(tabs))
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),nome);
 return XLSX.write(wb,{bookType:"xlsx",type:"array"}) as ArrayBuffer;
};
const consolidado=()=>livro({"Geral":[
 ["ENCONTRO DE CONTAS - JULHO 2026"],
 ["Estabelecimentos-SC","Municípios-SC","Julho","Correção","Total Estabelecimentos"],
 [CNES+" HOSPITAL MUNICIPAL SAO JOSE","JOINVILLE",100,20,120],
]});
describe("Fase 2 — fontes do HTML v2.42.2",()=>{
 it("reconhece consolidado pelo cabeçalho e não pelo nome",()=>{
  const b=consolidado();
  expect(identificarFonteBytes("arquivo-generico.xlsx",b)?.id).toBe("ec_consolidado");
  expect(validarFonteAntesUpload({nome:"arquivo-generico.xlsx",bytes:b,
    papel:"ec_consolidado",cnes:CNES}).layout).toBe("ec_consolidado");
 });
 it("não classifica consolidado como FPO nem o permite no papel trocado",()=>{
  const b=consolidado();
  expect(()=>validarFonteAntesUpload({nome:"FPO.xlsx",bytes:b,papel:"fpo_official",cnes:CNES}))
   .toThrow(/detectada como ec_consolidado/);
 });
 it("não aceita pasta de arquivos disfarçada de planilha",()=>{
  expect(()=>validarFonteAntesUpload({
    nome:"consolidado.xlsx",bytes:new Uint8Array([2,4,8,1]).buffer,
    papel:"ec_consolidado",cnes:CNES})).toThrow();
 });
 it("rejeita workbook sem colunas que provem o papel",()=>{
  const b=livro({Planilha:[["codigo","valor"],["0407010173",20]]});
  expect(identificarFonteBytes("FPO.xlsx",b)).toBeNull();
  expect(()=>validarFonteAntesUpload({nome:"FPO.xlsx",bytes:b,
    papel:"fpo_official",cnes:CNES})).toThrow(/FPO oficial/);
 });
 it("metadados documentais não entram como fontes do motor",()=>{
  const v=validarFonteAntesUpload({nome:"relatorio.pdf",
   bytes:new Uint8Array([37,80,68,70]).buffer,papel:"rtma",cnes:CNES});
  expect(v.layout).toBe("evidencia");
 });
});
