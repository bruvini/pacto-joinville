import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { lerSES } from "../../../supabase/functions/_shared/eletivas-leitores";
import { validarEstruturaFonte } from "./validarEstruturaFonte";
const CNES = "2436469";
const CODIGO = "040501001";
function gerador() {
  const wb=XLSX.utils.book_new();
  for (const [aba, coluna, valor] of [
    ["Físico",9,3],["Financeiro",9,175],["Complemento",10,0],
  ] as const) {
    const cab=Array.from({length:12},()=>null as unknown);
    cab[coluna]=CNES+" HOSPITAL MUNICIPAL SAO JOSE";
    const linha=Array.from({length:12},()=>null as unknown);
    linha[0]=405010010;
    linha[1]="0405010010 CORRECAO CIRURGICA";
    linha[coluna]=valor;
    const sheet=XLSX.utils.aoa_to_sheet([cab,linha]);
    if (aba==="Complemento")sheet.K2={t:"n",f:"A2*0",v:0} as XLSX.CellObject;
    XLSX.utils.book_append_sheet(wb,sheet,aba);
  }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ["Código Proc.","Complemento"],[405010010,20],
  ]),"DelibF");
  return XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
}
describe("SIA julho: CNES independente por aba",()=>{
  it("interpreta colunas J e K sem confundir cache calculado zero",()=>{
    const bytes=gerador();
    expect(()=>validarEstruturaFonte("sia_faec",bytes,CNES,"SIA.xlsx")).not.toThrow();
    const m=lerSES(new Uint8Array(bytes),CNES,
      XLSX as unknown as Parameters<typeof lerSES>[2]);
    expect(m.fisico[CODIGO]).toBe(3);
    expect(m.financeiro[CODIGO]).toBe(175);
    expect(m.delib[CODIGO]).toBe(20);
    expect(m.formulasSemCache).toEqual([]);
    expect(m.formulasCacheZero).toContain(CODIGO);
    expect(m.proveniencia?.financeiro[CODIGO]).toMatchObject({
      celula:"J2",codigo_original:"0405010010"});
    expect(m.proveniencia?.complemento[CODIGO]).toMatchObject({
      celula:"K2",formula:true,valor_cache:0});
  });
});
