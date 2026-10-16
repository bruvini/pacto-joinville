import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {webcrypto} from "node:crypto";
import {compararGolden,montarGoldenReact,validarGolden} from "./goldenMaster";
import {valorConciliadoCentavos,type ItemEC} from "./financeiro";

const ler=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const exportador=ler("../../../public/homologacao/ec-golden-html-102026.js");
const sha="a".repeat(64);
const sint=(over:Partial<ItemEC>={}):ItemEC=>({
  chave:"faec_compl|040704025",categoria:"faec_compl",descricao:"Procedimento sintético",
  valor_publicado:150,valor_esperado:120,situacao:"div",...over,
});

/** Contrato sintético extraído da regra financeira do HTML 2.42.2; NÃO é golden real. */
function referenciaContada(item:ItemEC){
  const pub=item.valor_publicado,exp=item.valor_esperado,d=item.decisao;
  if(item.situacao==="ok"||item.situacao==="info")return Math.round(pub*100);
  if(d==="aceito")return Math.round(pub*100);
  if(d==="erro")return 0;
  if(pub<=0.02)return 0;
  return Math.round((exp>0.02?Math.min(pub,exp):pub)*100);
}

type LinhaMock={id:string;cat:string;proc:string;aih?:string;fin?:string;status:string;
  qtMine:number;qtProc?:number;valorPago:number;valorEsperado:number;decisao?:string;
  nome_paciente?:string;cpf?:string};

async function executarCaptura(options:{
  itens:LinhaMock[];correcoes?:number;recEC:number;total?:number;fonte?:ArrayBuffer;
}){
  type Elemento={id?:string;style:Record<string,unknown>;listeners?:Record<string,()=>void>};
  const anexos:Elemento[]=[];
  let ultimoBlob:Blob|undefined;
  const alertas:string[]=[];
  const documento={
    readyState:"complete",
    createElement:(tag:string)=>({tag,id:"",type:"",textContent:"",style:{},
      listeners:{} as Record<string,()=>void>,
      addEventListener(name:string,fn:()=>void){this.listeners[name]=fn;},
      click(){},remove(){},href:"",download:""}),
    body:{appendChild(el:Elemento){anexos.push(el);}},
  };
  const rows=options.itens.map(x=>({...x}));
  const cor=options.correcoes??0;
  const funcs={
    R:{items:rows},FILES:{dbf_faec:{buffer:options.fonte??new TextEncoder().encode("fonte sintética").buffer}},
    CNES:"2436469",compKey:()=>"07/2026",
    p9:(p:string)=>p.replace(/\D/g,"").slice(0,9),
    payValue:(x:LinhaMock)=>x.valorPago,
    expectedPayValue:(x:LinhaMock)=>x.valorEsperado,
    countedPayValue:(x:LinhaMock)=>x.valorPago,
    decisionOf:(id:string)=>({dec:rows.find(x=>x.id===id)?.decisao??""}),
    correctionTotal:()=>cor,
    aggregates:()=>({recEC:options.recEC,correcoes:cor,
      totalAtesto:options.total??options.recEC+cor}),
    crypto:webcrypto,Uint8Array,ArrayBuffer,Blob,TextEncoder,
    setTimeout:(fn:()=>void)=>{fn();return 1;},
    URL:{createObjectURL:(blob:Blob)=>{ultimoBlob=blob;return "blob:test";},revokeObjectURL:()=>{}},
    document:documento,alert:(msg:string)=>alertas.push(msg),
  };
  runInNewContext(exportador,funcs);
  const botao=anexos.find(x=>x.id==="ec-golden-export-102026");
  expect(botao).toBeDefined();
  botao?.listeners?.click();
  // Crypto.subtle.digest() é assíncrono; não assumir que 12 microturnos
  // bastam no CI quando várias suites são executadas em paralelo.
  for(let n=0;n<200&&!ultimoBlob&&!alertas.length;n++)
   await new Promise<void>(r=>setTimeout(r,5));
  return {capturado:ultimoBlob?JSON.parse(await ultimoBlob.text()):null,alertas};
}
const linha=(over:Partial<LinhaMock>={}):LinhaMock=>({
  id:"faec_compl|040704025",cat:"faec_compl",proc:"0407040255",
  aih:"",status:"ok",qtMine:1,qtProc:2,valorPago:100,valorEsperado:100,...over,
});

describe("Fase 0 — referência v2.42.2 congelada",()=>{
  it("inclui inventário, SHA e exportador específico sem alterar HTML",()=>{
    const script=ler("../../../scripts/eletivas-fase0-inventario.mjs");
    expect(script).toContain("75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186");
    for(const tela of ["arquivos","painel","correcoes","fpo","faixas","comunicacoes",
      "pagos","fila","atesto","exportar","manual"])
      expect(script).toContain("'"+tela+"'");
    for(const func of ["parseDBF","parseConsolidadoSES","reconcile","aggregates",
      "renderCommunications","renderAtesto","parseFpoOfficial"])expect(script).toContain(func);
    expect(exportador).toContain("HTML-v2.42.2");
  });
  it("captura subtotal, correções recebidas e total sem duplicar FAEC faixa MAC",async()=>{
    const r=await executarCaptura({
      itens:[linha(),linha({id:"faec_fxmac|040704026",cat:"faec_fxmac",proc:"0407040265",
        valorPago:50,valorEsperado:50})],recEC:100,correcoes:20.35,
    });
    expect(r.alertas).toEqual([]);
    const g=validarGolden(r.capturado);
    expect(g.componentes.faec_compl).toBe(10000);
    expect(g.componentes.faec_fxmac).toBe(0);
    expect(g.itens.find(x=>x.categoria==="faec_fxmac")?.admitidoCent).toBe(0);
    expect(g.correcoesCent).toBe(2035);
    expect(g.totalCent).toBe(12035);
    expect(g.fontes[0].categoria).toBe("dbf_faec");
    expect(g.fontes[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("não exporta inconsistência nem dados nominativos",async()=>{
    const i=linha({nome_paciente:"Pessoa protegida",cpf:"111.222.333-44"});
    const okay=await executarCaptura({itens:[i],recEC:100});
    expect(JSON.stringify(okay.capturado)).not.toMatch(/Pessoa protegida|111\.222\.333-44/);
    const invalid=await executarCaptura({itens:[i],recEC:100,total:101});
    expect(invalid.capturado).toBeNull();
    expect(invalid.alertas[0]).toMatch(/Correções\/total/);
  });
  it("rejeita duplicidade de chaves em vez de gerar golden parcial",async()=>{
    const r=await executarCaptura({itens:[linha(),linha()],recEC:200});
    expect(r.capturado).toBeNull();
    expect(r.alertas[0]).toMatch(/duplicada/);
  });
});

describe("Fase 3 — diagnósticos sintéticos corrigidos, sem homologação real",()=>{
  const cenarios=[
    {nome:"parcela incontroversa em análise",item:sint({decisao:"analise"}),html:12000},
    {nome:"parcela publicada ainda pendente",item:sint({situacao:"pendente",valor_publicado:80}),html:8000},
    {nome:"status ok prevalece sobre erro no HTML",item:sint({situacao:"ok",decisao:"erro",valor_publicado:25}),html:2500},
    {nome:"tolerância de dois centavos",item:sint({valor_publicado:0.01,valor_esperado:1}),html:0},
    {nome:"decisão aceito sem conflito",item:sint({decisao:"aceito"}),html:15000},
  ];
  for(const c of cenarios)it(c.nome,()=>{
    expect(referenciaContada(c.item)).toBe(c.html);
    expect(valorConciliadoCentavos(c.item)).toBe(c.html);
    const atual=montarGoldenReact({competencia:"07/2026",cnes:"2436469",
      versaoMotor:"fase0-sintetico",fontes:[{categoria:"dbf_faec",sha256:sha}],itens:[c.item]});
    const master=structuredClone(atual);
    master.origem="html";
    master.itens[0].admitidoCent=c.html;
    master.componentes[c.item.categoria]=c.html;
    master.totalCent=c.html;
    const divergencias=compararGolden(master,atual);
    expect(divergencias).toEqual([]);
  });
});
