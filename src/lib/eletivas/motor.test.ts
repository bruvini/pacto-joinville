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
