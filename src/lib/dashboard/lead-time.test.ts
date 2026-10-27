import { describe, expect, it } from "vitest";
import { calcularLeadTimeReal, calcularLeadTimeMultimodulo, calcularDuracaoRegistros, calcularSlaEtapasConvenios } from "./lead-time";

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

describe("Lead Time geral dos quatro módulos", () => {
  const data = (dias: number) => new Date(Date.UTC(2026, 0, 1 + dias)).toISOString();
  const marcos = [
    {lancamento_id:"conv",marco:"criado",ocorrido_em:data(0)},
    {lancamento_id:"conv",marco:"concluido",ocorrido_em:data(2)},
  ];
  const piso = [{created_at:data(0),encerrada_em:data(6),status:"encerrada"},
                {created_at:data(0),encerrada_em:data(100),status:"aberta"}];
  const cacon = [{created_at:data(0),encaminhado_ses_ufi_em:data(10),status:"concluida"}];
  const pvh = [{created_at:data(0),encerrada_em:data(4),status:"encerrada"},
               {created_at:data(0),encerrada_em:data(8),status:"encerrada"}];

  it("pondera processos concluídos; não tira média simples das médias modulares",()=>{
    const resultado=calcularLeadTimeMultimodulo({
      marcosConvenios:marcos,idsConvenios:new Set(["conv"]),
      piso,cacon,pvh,modulo:"all"
    });
    expect(resultado.n).toBe(5);
    expect(resultado.media).toBe(6); // (2+6+10+4+8)/5
    expect(resultado.porModulo.map(p=>p.n)).toEqual([1,1,1,2]);
    expect(resultado.real).toBe(true);
  });
  it("aplica seleção por módulo, sem carregar amostras de outros módulos",()=>{
    const r=calcularLeadTimeMultimodulo({
      marcosConvenios:marcos,idsConvenios:new Set(["conv"]),
      piso,cacon,pvh,modulo:"cacon",
    });
    expect(r).toMatchObject({media:10,n:1});
    expect(r.porModulo.map(p=>p.id)).toEqual(["cacon"]);
  });
  it("não usa processo em andamento, datas faltantes nem término anterior à criação",()=>{
    expect(calcularDuracaoRegistros([
      {status:"encerrada",created_at:data(4),encerrada_em:data(1)},
      {status:"aberta",created_at:data(0),encerrada_em:data(3)},
      {status:"encerrada",created_at:data(0)},
    ],"encerrada","encerrada_em")).toEqual({media:null,n:0});
  });
  it("retém SLA por etapa distinto da duração total",()=>{
    const result=calcularSlaEtapasConvenios(marcos,new Set(["conv"]));
    expect(result[0].etapa).toContain("Etapa 1");
    expect(result).toHaveLength(7);
    expect(result[0].n).toBe(0);
  });
});
