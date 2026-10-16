import {describe,expect,it} from "vitest";
import * as XLSX from "xlsx";
import {validarFonteAntesUpload} from "./prepararFonte";
const CNES="2436469";
const livro=(x:Record<string,unknown[][]>)=>{
 const wb=XLSX.utils.book_new();
 for(const [a,rows] of Object.entries(x))
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),a);
 return XLSX.write(wb,{bookType:"xlsx",type:"array"}) as ArrayBuffer;
};
describe("Fase 2 — pré-validação bloqueia arquivo antes de Storage",()=>{
 it("reprova matriz SES obrigatória sem o CNES",()=>{
  const bytes=livro({Físico:[["Procedimento","1111111 Hospital Outro"],["0407010173",3]],
   Financeiro:[["Procedimento","1111111 Hospital Outro"],["0407010173",100]],
   Complemento:[["Procedimento","1111111 Hospital Outro"],["0407010173",200]],
   DelibF:[["0407010173",200]]});
  expect(()=>validarFonteAntesUpload({nome:"SIH.xlsx",bytes,papel:"s_faec",cnes:CNES}))
   .toThrow(/CNES/);
 });
 it("reprova conteúdo de FPO declarado como SIH MAC",()=>{
  const bytes=livro({FPO:[["Código","Descrição","Financiamento","Eletiva","% Máximo"]]});
  expect(()=>validarFonteAntesUpload({nome:"SIH MAC.xlsx",bytes,papel:"s_mac",cnes:CNES}))
   .toThrow(/detectada como fpo_official/);
 });
 it("não permite PDF com papel DBF",()=>{
  expect(()=>validarFonteAntesUpload({nome:"planilha.pdf",
   bytes:new Uint8Array([37,80,68,70]).buffer,papel:"dbf_mac",cnes:CNES}))
   .toThrow(/Fonte técnica exige/);
 });
});
