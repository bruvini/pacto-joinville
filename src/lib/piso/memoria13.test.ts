import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { lerMemoria13PorCnes } from "./memoria13";

function planilha(linhas: unknown[][]): ArrayBuffer {
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(linhas),"Memória 13");
  const bytes=XLSX.write(workbook,{bookType:"xlsx",type:"array"}) as ArrayBuffer;
  return bytes;
}

describe("memória oficial da 13ª por CNES",()=>{
  it("exige cabeçalho específico da parcela anual e preserva centavos",()=>{
    const arquivo=planilha([
      ["CNES","VALOR AFC 13ª"],
      ["1234567","9.524,68"],
      ["7654321",352],
    ]);
    expect(lerMemoria13PorCnes(arquivo)).toEqual([
      {cnes:"1234567",valor:"9524.68"},
      {cnes:"7654321",valor:"352.00"},
    ]);
  });
  it("não aceita memória mensal genérica como fonte da 13ª",()=>{
    const arquivo=planilha([["CNES","Valor complemento mensal"],["1234567",100]]);
    expect(()=>lerMemoria13PorCnes(arquivo)).toThrow(/cabeçalhos CNES/i);
  });
  it("bloqueia CNES duplicado e valores financeiros inválidos",()=>{
    expect(()=>lerMemoria13PorCnes(planilha([
      ["CNES","VALOR HOMOLOGADO DA 13ª"],["1234567",10],["1234567",20],
    ]))).toThrow(/duplicado/i);
    expect(()=>lerMemoria13PorCnes(planilha([
      ["CNES","VALOR AFC 13ª"],["1234567",-10],
    ]))).toThrow(/inválido/i);
  });
});
