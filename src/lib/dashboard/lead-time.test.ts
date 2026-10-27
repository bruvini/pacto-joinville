import { describe, expect, it } from "vitest";
import { calcularLeadTimeReal } from "./lead-time";

describe("Lead Time dos lançamentos de Convênios",()=>{
  const dia = (n:number)=>new Date(Date.UTC(2026,0,1+n)).toISOString();
  it("mede criado até concluído por lançamento, sem misturar módulos",()=>{
    const m=[
      {lancamento_id:"a",marco:"criado",ocorrido_em:dia(0)},
      {lancamento_id:"a",marco:"concluido",ocorrido_em:dia(1)},
      {lancamento_id:"b",marco:"criado",ocorrido_em:dia(0)},
      {lancamento_id:"b",marco:"concluido",ocorrido_em:dia(3)},
      {lancamento_id:"c",marco:"criado",ocorrido_em:dia(0)},
      {lancamento_id:"c",marco:"concluido",ocorrido_em:dia(20)},
    ];
    expect(calcularLeadTimeReal(m,new Set(["a","b"]))).toEqual({media:2,n:2});
  });
  it("considera primeiro marco criado e último concluído; ignora intervalos inválidos",()=>{
    const m=[
      {lancamento_id:"a",marco:"criado",ocorrido_em:dia(1)},
      {lancamento_id:"a",marco:"criado",ocorrido_em:dia(0)},
      {lancamento_id:"a",marco:"concluido",ocorrido_em:dia(2)},
      {lancamento_id:"b",marco:"concluido",ocorrido_em:dia(2)},
    ];
    expect(calcularLeadTimeReal(m,new Set(["a","b"]))).toEqual({media:2,n:1});
    expect(calcularLeadTimeReal(m,new Set(["b"]))).toEqual({media:null,n:0});
  });
});
