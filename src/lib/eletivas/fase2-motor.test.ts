import {describe,expect,it} from "vitest";
import {conciliarEletivas,proc9,type FonteEC,type MatrizSES} from "./motor";
import {resumoEncontro,valorConciliadoCentavos} from "./financeiro";

const mat=(f:Record<string,number>={},p:Record<string,number>={},
 c:Record<string,number>={},d:Record<string,number>={}):MatrizSES=>
 ({fisico:f,financeiro:p,complemento:c,delib:d});
const k="040704025";
const f=(complemento=30):FonteEC=>({
 dbf_faec:[{aih:"1234567890123",proc:"0407040255",valor:100,qt_procedimento:2,
   qt_origem:"workbook_aih"}],
 dbf_mac:[],s_faec:mat({[k]:1},{[k]:100},{[k]:complemento},{[k]:15}),s_mac:mat(),
});
const itens=(r:ReturnType<typeof conciliarEletivas>,cat:string)=>
 r.itens.filter(x=>x.categoria===cat);

describe("Fase 2 — snapshots normativos de conciliação",()=>{
 it("combina uma AIH com dois procedimentos internos sem duplicar o físico",()=>{
   const r=conciliarEletivas(f());
   const p=itens(r,"faec_prod")[0],c=itens(r,"faec_compl")[0];
   expect(p.situacao).toBe("ok");
   expect(c).toMatchObject({valor_publicado:30,valor_esperado:30,situacao:"ok"});
   expect(c.detalhe).toMatchObject({qt_aihs:1,qt_procedimentos:2,
     qt_ses:1,quantidade_interna_confirmada:true,unitario_delib:15});
   expect(r.totais).toEqual({publicado:130,esperado:130,incontroverso:130});
 });
 it("aceita diferença financeira de até R$ 0,02 e preserva centavos",()=>{
   const r=conciliarEletivas(f(29.98));
   expect(itens(r,"faec_compl")[0].situacao).toBe("ok");
   expect(r.totais.publicado).toBe(129.98);
   expect(r.totais.esperado).toBe(130);
   expect(r.totais.incontroverso).toBe(129.98);
 });
 it("explica separadamente divergência física e complemento a menor",()=>{
   const base=f(20);base.s_faec.fisico[k]=0;
   const r=conciliarEletivas(base);
   expect(itens(r,"faec_prod")[0].situacao).toBe("div");
   expect(String(itens(r,"faec_prod")[0].detalhe.justificativa)).toContain("Físico");
   expect(itens(r,"faec_compl")[0].situacao).toBe("div");
   expect(String(itens(r,"faec_compl")[0].detalhe.justificativa)).toContain("Faltam");
   expect(itens(r,"faec_compl")[0].detalhe.financeiro).toMatchObject({
     estadual_publicado:20,esperado:30,fiscalmente_admitido_provisorio:20});
 });
 it("distingue fora do rol, não contemplado e publicado sem tabulação",()=>{
   const fora=f();fora.s_faec=mat();
   const a=conciliarEletivas(fora);
   expect(itens(a,"faec_prod")[0].situacao).toBe("fora");
   const nc=f();nc.s_faec=mat({}, {},{}, {[k]:15});
   const b=conciliarEletivas(nc);
   expect(itens(b,"faec_prod")[0].situacao).toBe("nc");
   expect(itens(b,"faec_compl")[0].situacao).toBe("nc");
   const apenasEstado=f();apenasEstado.dbf_faec=[];
   const c=conciliarEletivas(apenasEstado);
   expect(itens(c,"faec_prod")[0].situacao).toBe("info");
   expect(itens(c,"faec_prod")[0].detalhe.justificativa).toMatch(/sem correspondente/);
 });
 it("separa produção MAC de complemento e não soma nenhum item de faixa controle",()=>{
   const b=f();b.dbf_mac=[{aih:"2222222222222",proc:"0407040255",valor:50,qt_procedimento:1}];
   b.s_mac=mat({[k]:1},{[k]:50},{[k]:10},{[k]:10});
   b.s_faec_est=mat({"041501001":1},{},{"041501001":2000},{});
   const r=conciliarEletivas(b);
   expect(itens(r,"mac_prod")[0]).toMatchObject({situacao:"ok",valor_publicado:50});
   expect(itens(r,"mac_compl")[0]).toMatchObject({situacao:"ok",valor_publicado:10});
   expect(itens(r,"faec_fxmac")[0].detalhe).toMatchObject({
     financeiro:{controle_nao_somar:true}});
   expect(r.totais.publicado).toBe(190);
   expect(resumoEncontro(r.itens).encontro).toBe(19000);
 });
 it("um cache zero com físico e Delib não é prova de publicação estadual",()=>{
   const b=f();b.s_faec_est={...mat({"041501001":1},{},{"041501001":0},{}),
      formulasCacheZero:["041501001"]};
   const rec=itens(conciliarEletivas(b),"faec_fxmac")[0];
   expect(rec.valor_publicado).toBe(0);
   expect(rec.valor_esperado).toBe(2000);
   expect(rec.situacao).toBe("div");
   expect(rec.detalhe).toMatchObject({cache_zero_formula:true,
     financeiro:{controle_nao_somar:true}});
 });
 it("SIA contabiliza financeiro e complemento apenas uma vez entre FAEC e puro",()=>{
   const b=f();const p="030101001";
   b.dbf_sia=[{proc:"0301010010",qt:2,valor:40}];
   b.sia_faec=mat({[p]:2},{[p]:40},{[p]:60},{[p]:30});
   b.sia_faec_p=mat({[p]:2},{[p]:40},{[p]:60},{[p]:30});
   const r=conciliarEletivas(b);
   expect(r.impedimentos).toHaveLength(0);
   expect(itens(r,"sia_faec")).toHaveLength(1);
   expect(itens(r,"sia_faec")[0]).toMatchObject({
     valor_publicado:100,valor_esperado:100,situacao:"ok"});
   expect(itens(r,"sia_faec")[0].detalhe).toMatchObject({sobreposicao_idêntica:true});
   expect(r.totais.publicado).toBe(230);
 });
 it("SIA FAEC diferente de FAEC puro é impedimento, nunca duplicação",()=>{
   const b=f();const p="030101001";
   b.dbf_sia=[{proc:"0301010010",qt:2,valor:40}];
   b.sia_faec=mat({[p]:2},{[p]:40},{[p]:60},{[p]:30});
   b.sia_faec_p=mat({[p]:2},{[p]:40},{[p]:100},{[p]:30});
   const r=conciliarEletivas(b);
   expect(r.impedimentos.some(x=>x.includes("físico/financeiro/complemento diferentes"))).toBe(true);
   expect(itens(r,"sia_faec")).toHaveLength(0);
 });
 it("não aprova classificação ambulatorial presente simultaneamente em FAEC e MAC",()=>{
   const b=f();const p="030101001";
   b.dbf_sia=[{proc:"0301010010",qt:2,valor:40}];
   b.sia_faec=mat({[p]:2},{[p]:40},{[p]:60},{[p]:30});
   b.sia_mac=mat({[p]:2},{[p]:40},{[p]:60},{[p]:30});
   expect(conciliarEletivas(b).impedimentos.some(x=>x.includes("simultaneamente em FAEC e MAC"))).toBe(true);
 });
 it("somatório fiscal por item usa os mesmos centavos e regras do ec_valor_item",()=>{
   const b=f(12);const r=conciliarEletivas(b);
   const soma=r.itens.reduce((a,x)=>a+valorConciliadoCentavos(x),0);
   expect(soma).toBe(11200);
   expect(r.totais.incontroverso).toBe(soma/100);
   expect(proc9("0407040255")).toBe(k);
 });
});
