import {describe,it,expect} from "vitest";
import {conciliarEletivas,type FonteEC} from "./motor";
import {valorConciliadoCentavos} from "./financeiro";

const aih="4226100322066";
const matriz=()=>({fisico:{},financeiro:{},complemento:{},delib:{}});
const base=():FonteEC=>({
 competencia:"07/2026",
 dbf_faec:[{aih,proc:"0415010010",valor:100,qt_procedimento:1}],
 dbf_mac:[],s_faec:matriz(),s_mac:matriz(),
 workbook_aih:{
  rows:[
   {aih,proc:"041501001",qt:1,faixa:"1",principal:"041501001"},
   {aih,proc:"041502008",qt:2,faixa:"1",principal:"041501001"},
  ],
  cib:{"041502008":{nature:"Estadual",compl:600,nome:"Componente cirúrgico"}},
 },
 mult_faec:[{aih,proc:"0415010010",pago:1200,esperado:1200,
   filhos:[{proc:"041502008",qt:2,unit:600,valor:1200}]}],
});
const multi=(f:FonteEC)=>conciliarEletivas(f).itens.find(i=>i.categoria==="faec_mult")!;
describe("Fase 3 — múltiplas com prova independente por AIH",()=>{
 it("não atribui publicação ou status ok à soma dos próprios filhos",()=>{
  const item=multi(base());
  expect(item.situacao).toBe("pendente");
  expect(item.valor_publicado).toBe(0);
  expect(item.valor_esperado).toBe(1200);
  expect(item.detalhe).toMatchObject({
   total_filhos_ses:1200,publicacao_independente:false,
   base_independente_comprovada:true,principal:"041501001",
  });
  expect(valorConciliadoCentavos(item)).toBe(0);
 });
 it("só reconhece compatibilidade quando publicação é documentada separadamente",()=>{
  const f=base();
  f.mult_faec![0].publicado_independente=1200;
  f.mult_faec![0].evidencia_publicacao="SEI 31219053";
  const item=multi(f);
  expect(item.situacao).toBe("ok");
  expect(item.valor_publicado).toBe(1200);
  expect(item.detalhe).toMatchObject({
    publicacao_independente:true,evidencia_publicacao:"SEI 31219053",
  });
 });
 it("preserva procedimento-filho 04150 não agrupador no workbook",()=>{
  const f=base();
  f.workbook_aih!.rows[1].proc="041503001";
  f.workbook_aih!.cib={"041503001":{
    nature:"Estadual",compl:600,nome:"Filho real com prefixo 04150",
  }};
  const item=multi(f);
  const perfil=item.detalhe.perfil as {filhos:Array<{proc:string}>};
  expect(perfil.filhos).toMatchObject([{proc:"041503001"}]);
  expect(item.valor_esperado).toBe(1200);
 });
 it("faixa federal não vira crédito estadual sem programação FPO",()=>{
  const f=base();
  for(const row of f.workbook_aih!.rows)row.faixa="5";
  f.workbook_aih!.cib["041502008"].nature="Federal";
  f.mult_faec![0].publicado_independente=1200;
  f.mult_faec![0].evidencia_publicacao="SEI 31219053";
  const item=multi(f);
  expect(item.situacao).toBe("pendente");
  expect(item.detalhe).toMatchObject({exige_programacao_fpo:true,
    cobranca_automatica:false});
  expect(valorConciliadoCentavos(item)).toBe(0);
 });
 it("MAC conserva consolidado SES e dossiê das AIHs sem ratear pagamento fictício",()=>{
  const f=base();
  f.dbf_mac=[{aih,proc:"0415010010",valor:100}];
  f.dbf_faec=[];
  f.mult_faec=undefined;
  f.mult_mac={publicado:2000,esperado:2000,quantidade_local:1,
    quantidade_estado:1,pagas:1,unitario:2000,publicado_independente:true};
  const item=conciliarEletivas(f).itens.find(i=>i.categoria==="mac_mult")!;
  expect(item.detalhe.aihs).toMatchObject([{
    aih,principal:"041501001",faixa:"1",natureza:"Estadual",
  }]);
  expect(item.valor_publicado).toBe(2000);
  expect(item.valor_esperado).toBe(2000);
  expect(item.detalhe).toMatchObject({base_independente_comprovada:true});
 });
 it("MAC sem publicação independente permanece pendente em vez de presumir valor pago",()=>{
  const f=base();f.dbf_faec=[];f.mult_faec=undefined;
  f.dbf_mac=[{aih,proc:"0415010010",valor:100}];
  f.mult_mac={publicado:0,esperado:2000,quantidade_local:1,
    quantidade_estado:1,pagas:1,unitario:2000,publicado_independente:false};
  const item=conciliarEletivas(f).itens.find(i=>i.categoria==="mac_mult")!;
  expect(item.situacao).toBe("pendente");
  expect(item.valor_publicado).toBe(0);
  expect(item.valor_esperado).toBe(2000);
  expect(valorConciliadoCentavos(item)).toBe(0);
 });
 it("FPO oficial é parâmetro, não uma programação comprovada; Nota só a partir de agosto",()=>{
  const f=base();f.fpo_oficial={"041501001":{nome:"CIB",fin:"Federal",
    sigtap:1,federal:400,eletiva:"SIM",pct:"100%",nota5:true}};
  const item=multi(f);
  const fpo=item.detalhe.fpo_oficial as {programacao_comprovada:boolean;
    nota5_aplicavel:boolean};
  expect(fpo.programacao_comprovada).toBe(false);
  expect(fpo.nota5_aplicavel).toBe(false);
  f.competencia="08/2026";
  expect((multi(f).detalhe.fpo_oficial as typeof fpo).nota5_aplicavel).toBe(true);
 });
});
