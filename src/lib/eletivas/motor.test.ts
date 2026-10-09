import { describe,it,expect } from "vitest";
import {conciliarEletivas,proc9,type FonteEC} from "./motor";

const mat=(fisico:Record<string,number>={},financeiro:Record<string,number>={},
  complemento:Record<string,number>={},delib:Record<string,number>={})=>
  ({fisico,financeiro,complemento,delib});
const base:FonteEC={
 dbf_faec:[{aih:"123",proc:"0407040255",valor:100,qt_procedimento:2}],
 dbf_mac:[],
 s_faec:mat({"040704025":1},{"040704025":100},{"040704025":30},{"040704025":15}),
 s_mac:mat(),
};
describe("motor inicial do Encontro de Contas adaptado do HTML",()=>{
 it("normaliza procedimento 10 dígitos e confere complemento pelo QT interno",()=>{
   expect(proc9("0407040255")).toBe("040704025");
   const r=conciliarEletivas(base);
   expect(r.itens.find(i=>i.categoria==="faec_compl")).toMatchObject({
     valor_publicado:30,valor_esperado:30,situacao:"ok",
   });
 });
 it("mantém apenas valor publicado até o limite do esperado, sem somar glosa",()=>{
   const r=conciliarEletivas({...base,s_faec:mat(
     {"040704025":1},{"040704025":100},{"040704025":12},{"040704025":15})});
   expect(r.itens.find(i=>i.categoria==="faec_compl")?.situacao).toBe("div");
   expect(r.totais.incontroverso).toBe(112);
 });
 it("não soma recorte de controle FAEC faixa MAC",()=>{
   const r=conciliarEletivas({...base,
     s_faec_est:mat({"041501001":1},{},{"041501001":2000},{})});
   expect(r.itens.find(i=>i.categoria==="faec_fxmac")?.valor_publicado).toBe(2000);
   expect(r.totais.publicado).toBe(130);
 });
 it("nunca presume complemento dos filhos de AIH múltipla",()=>{
   const r=conciliarEletivas({...base,dbf_faec:[
     ...base.dbf_faec,{aih:"999",proc:"0415010010",valor:300},
   ]});
   expect(r.impedimentos.some(s=>s.includes("Múltiplas FAEC"))).toBe(true);
 });
 it("aceita detalhamento FAEC por AIH distinta",()=>{
   const r=conciliarEletivas({...base,mult_faec:[
     {aih:"999",proc:"041501001",pago:2000,esperado:2000},
   ]});
   expect(r.itens.find(i=>i.categoria==="faec_mult")?.situacao).toBe("ok");
 });
 it("confronta SIA financeiro + complemento sem confundir produção",()=>{
   const r=conciliarEletivas({...base,dbf_sia:[{proc:"0301010010",qt:2,valor:40}],
     sia_mac:mat({"030101001":2},{"030101001":40},{"030101001":60},{"030101001":30})});
   expect(r.itens.find(i=>i.categoria==="sia_mac")).toMatchObject({
     valor_publicado:100,valor_esperado:100,situacao:"ok"
   });
 });
 it("não duplica mesmo procedimento SIA FAEC proveniente de duas fontes",()=>{
   const m=mat({"030101001":1},{"030101001":10});
   const r=conciliarEletivas({...base,sia_faec:m,sia_faec_p:m});
   expect(r.itens.filter(i=>i.categoria==="sia_faec")).toHaveLength(1);
   expect(r.impedimentos.some(s=>s.includes("mais de uma fonte"))).toBe(true);
 });
});

describe("paridade de múltiplas/faixas do HTML",()=>{
  it("exige detalhamento da AIH específica, não apenas do envelope",()=>{
    const f={...base,dbf_faec:[
      {aih:"0000000000001",proc:"0415010010",valor:100},
      {aih:"0000000000002",proc:"0415010010",valor:100},
    ],mult_faec:[{aih:"0000000000001",proc:"041501001",pago:2000,esperado:2000}]};
    const r=conciliarEletivas(f);
    expect(r.impedimentos.some(x=>x.includes("0000000000002"))).toBe(true);
  });
  it("não presume cobrança de AIH sem componentes de faixa correspondente",()=>{
    const r=conciliarEletivas({...base,
      dbf_faec:[{aih:"0000000000001",proc:"0415010010",valor:100}],
      workbook_aih:{rows:[{aih:"0000000000001",proc:"040101001",qt:1,faixa:"1",principal:"041501001"}],
        cib:{"040101001":{nature:"Federal",compl:900,nome:"Componente federal"}}},
      mult_faec:[]});
    const item=r.itens.find(x=>x.categoria==="faec_mult");
    expect(r.impedimentos).toHaveLength(0);
    expect(item?.situacao).toBe("info");
    expect(item?.valor_esperado).toBe(0);
  });
  it("anota a FPO oficial como referência e não altera o valor publicado",()=>{
    const r=conciliarEletivas({...base,
      fpo_oficial:{"040704025":{nome:"Teste",fin:"FAEC",sigtap:20,federal:40,
        eletiva:"SIM",pct:"100%",nota5:false}}});
    expect(r.totais.publicado).toBe(130);
    expect(r.itens[0].detalhe.fpo_oficial).toBeDefined();
  });
});
