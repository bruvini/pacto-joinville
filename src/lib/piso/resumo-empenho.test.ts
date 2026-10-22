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
