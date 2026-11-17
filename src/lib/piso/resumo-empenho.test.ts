import { describe, expect, it } from "vitest";
import { resumoEmpenhoPiso } from "./resumo-empenho";
const parts=[
  {id:"boj",valor_devido:9524.68},
  {id:"bethesda",valor_devido:352},
];
const obrigs=[
  {participante_id:"boj",valor_empenhado:15000},
  {participante_id:"bethesda",valor_empenhado:1000},
];
describe("quadro de empenho reconciliado",()=>{
  it("sinaliza previsão duplicada sem inventar anulação",()=>{
    const r=resumoEmpenhoPiso(9524.68,[{id:"boj",valor_devido:9524.68}],[
      {id:"1",participante_id:"boj",alocacao_manual:true,valor_aplicado:9524.68,valor_empenhado:15000},
      {id:"2",participante_id:"boj",alocacao_manual:true,valor_aplicado:9524.68,valor_empenhado:13474.24},
    ]).porInstituicao[0];
    expect(r.valorEmpenhado).toBe(28474.24);
    expect(r.divergenciaPlanejada).toBe(9524.68);
    expect(r.excedentePrevisto).toBeNull();
  });
  it("ignora parcelas históricas e não supõe disponibilidade a partir do valor nominal",()=>{
    const ns=[{id:"1",participante_id:"boj",alocacao_manual:true,valor_aplicado:9524.68,valor_empenhado:15000},{id:"2",participante_id:"boj",alocacao_manual:true,valor_aplicado:9524.68,valor_empenhado:13474.24}];
    const r=resumoEmpenhoPiso(9524.68,[parts[0]],ns,["1","2"],[{obrigacao_id:"2",valor:9524.68}]).porInstituicao[0];
    expect(r.valorEmpenhado).toBe(28474.24); expect(r.totalAplicado).toBe(9524.68);
    expect(r.saldoAEmpenhar).toBe(0); expect(r.divergenciaPlanejada).toBeNull(); expect(r.excedentePrevisto).toBeNull();
  });
  it("mostra saldo quando a NE emitida não cobre o devido",()=>{
    const r=resumoEmpenhoPiso(9876.68,parts,[{...obrigs[0],valor_empenhado:2000},obrigs[1]]);
    expect(r.porInstituicao[0].totalAplicado).toBe(2000);
    expect(r.porInstituicao[0].saldoAEmpenhar).toBe(7524.68);
  });
  it("mostra projeção do InvestSUS sem confundi-la com homologação",()=>{
    const r=resumoEmpenhoPiso(null,parts,obrigs);
    expect(r.totalInvestsus).toBe(9876.68);
    expect(r.totalConfere).toBe(false);
    expect(r.porInstituicao.map(p=>p.excedentePrevisto)).toEqual([5475.32,648]);
    expect(r.totalPrevisto).toBe(6123.32);
    expect(r.porInstituicao[0].valorConfirmado).toBeNull();
  });
  it("valida as parcelas somente quando somam a Portaria homologada",()=>{
    expect(resumoEmpenhoPiso(9876.68,parts,obrigs).totalConfere).toBe(true);
    expect(resumoEmpenhoPiso(10000,parts,obrigs).totalConfere).toBe(false);
  });
  it("não inventa excedente quando existe apenas valor empenhado",()=>{
    const r=resumoEmpenhoPiso(10000,[{id:"boj",valor_devido:null}],
      [{participante_id:"boj",valor_empenhado:15000}]);
    expect(r.totalPrevisto).toBeNull();
    expect(r.porInstituicao[0].excedentePrevisto).toBeNull();
  });
  it("não considera obrigação duplicada como base inequívoca",()=>{
    const r=resumoEmpenhoPiso(9876.68,parts,[...obrigs,obrigs[0]]);
    expect(r.porInstituicao[0].excedentePrevisto).toBeNull();
  });
});
