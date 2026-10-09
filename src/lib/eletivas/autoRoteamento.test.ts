import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {identificarFonte} from "./autoRoteamento";
function workbook(abas:Record<string,unknown[][]>){
  const wb=XLSX.utils.book_new();
  for(const [name,rows] of Object.entries(abas))
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  const data=XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
  return new File([data],"evidencia.xlsx");
}
describe("classificação estrutural de fontes eletivas",()=>{
  it("reconhece três formatos de múltiplas FAEC",async()=>{
    for(const [a,b] of [["N_AIH","Estab"],["Hospitais","AIH"],["Hospital","Procedimentos"]]){
      const f=workbook({[a]:[["AIH"]],[b]:[["PROC"]]});
      expect((await identificarFonte(f))?.id).toBe("s_faec_ms");
    }
  });
  it("prioriza workbook AIH sobre FPO embutida",async()=>{
    const f=workbook({"Original para Consultas":[["num_aih","procedimento"]],
      "Tabela FPO":[["Código","Descrição","Financiamento","Eletiva","% Máximo"]]});
    expect((await identificarFonte(f))?.id).toBe("wb_aih");
  });
  it("reconhece FPO oficial pelo conteúdo",async()=>{
    const f=workbook({"Planilha":[["Código","Descrição","Financiamento","Eletiva","% Máximo"]]});
    expect((await identificarFonte(f))?.id).toBe("fpo_official");
  });
  it("não classifica planilha desconhecida pelo nome",async()=>{
    const f=workbook({"Sem estrutura":[["Teste"]]});
    expect(await identificarFonte(f)).toBeNull();
  });
});
