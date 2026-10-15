import {describe,expect,it} from "vitest";
import * as XLSX from "xlsx";
import {multSeqFaec} from "../../../supabase/functions/_shared/eletivas-leitores";

const CNES="2436469";
const AIH="4226101200134";
function workbook(temUnitario:boolean){
  const wb=XLSX.utils.book_new();
  const add=(name:string,rows:unknown[][])=>
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  add("Hospital",[
    ["AIH JULHO",CNES+" HOSPITAL MUNICIPAL SAO JOSE"],
    [AIH,1],
  ]);
  add("Procedimentos",[
    ["AIH JULHO","0407020230 PROCEDIMENTO SEM PREMIO"],
    [AIH,1],
  ]);
  add("Mult e Seq",[
    ["Hospital - SC",temUnitario?"040702023 0":"SEM REFERENCIA"],
    [CNES+" HOSPITAL MUNICIPAL SAO JOSE",0],
  ]);
  return wb;
}
describe("múltiplas FAEC reais — zero publicado não é ausência de unitário",()=>{
 it("aceita filho com unitário zero explícito, sem inventar complemento",()=>{
   const x=multSeqFaec(workbook(true),CNES,{},XLSX as unknown as Parameters<typeof multSeqFaec>[3]);
   expect(x[AIH].filhos).toMatchObject([{proc:"040702023",qt:1,unit:0,valor:0}]);
   expect(x[AIH].publicado).toBe(0);
 });
 it("impede filho com unidade efetivamente sem referência",()=>{
   expect(()=>multSeqFaec(workbook(false),CNES,{},
     XLSX as unknown as Parameters<typeof multSeqFaec>[3]))
     .toThrow(/referência unitária ausente/);
 });
});
