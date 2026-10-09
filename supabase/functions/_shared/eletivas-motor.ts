/**
 * Motor financeiro do Encontro de Contas de Eletivas — primeira migração do
 * HTML Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado(4).html.
 *
 * Conserva produção FAEC/MAC, complementos simples, SIA e recortes de faixa.
 * Múltiplas e sequenciais só são reconhecidas quando há detalhamento de AIH;
 * sem esse suporte, o motor devolve pendência NÃO conciliada.
 */
export type CatEC =
  | "faec_prod" | "faec_compl" | "faec_mult" | "faec_fxmac"
  | "mac_prod" | "mac_compl" | "mac_mult" | "mac_fxfaec"
  | "mac_fxfed" | "sia_faec" | "sia_mac";

export type RegistroSIH = {
  aih: string; proc: string; valor: number; qt_procedimento?: number;
  nome?: string;
};
export type RegistroSIA = { proc: string; qt: number; valor: number; nome?: string };
export type MatrizSES = {
  fisico: Record<string,number>;
  financeiro: Record<string,number>;
  complemento: Record<string,number>;
  delib: Record<string,number>;
  nomes?: Record<string,string>;
  formulasSemCache?: string[];
};
export type ComponenteEC = {
  chave: string; categoria: CatEC; descricao: string;
  procedimento: string | null; aih: string | null;
  valor_publicado: number; valor_esperado: number;
  situacao: "ok" | "info" | "div" | "nc" | "fora" | "pendente";
  detalhe: Record<string,unknown>;
};
export type FonteEC = {
  dbf_faec: RegistroSIH[]; dbf_mac: RegistroSIH[];
  dbf_sia?: RegistroSIA[];
  s_faec: MatrizSES; s_mac: MatrizSES;
  s_faec_est?: MatrizSES; s_mac_fed?: MatrizSES;
  s_mac_faec?: MatrizSES;
  sia_faec?: MatrizSES; sia_faec_p?: MatrizSES; sia_mac?: MatrizSES;
  // Dados detalhados do Estado por AIH quando encontrados em outra etapa do parser.
  mult_faec?: Array<{ aih:string; proc:string; pago:number; esperado:number; filhos?:unknown[] }>;
  mult_mac?: { publicado:number; esperado:number; quantidade_local:number; quantidade_estado:number };
};
export type ResultadoEC = {
  itens: ComponenteEC[];
  impedimentos: string[];
  totais: { publicado: number; esperado: number; incontroverso: number };
};

export const proc9 = (v: unknown) => {
  const d=String(v??"").replace(/\D/g,"");
  if (!d) return "";
  if(d.length>=10) return d.slice(0,9);
  if(d.length===9) return d[0]==="0" ? d : ("0"+d).slice(0,9);
  return d.length===8 ? "0"+d : d;
};
export const ENVELOPES_MULT = new Set([
  "041501001","041502003","041502004","041502005","041502006","041502007",
]);
const cent=(v:number)=>Math.round(Number(v??0)*100);
const reais=(centavos:number)=>Math.round(centavos)/100;
const prox=(a:number,b:number)=>Math.abs(a-b)<=2;
const centMapa=(x:Record<string,number>,k:string)=>cent(x[k]??0);
const valor=(x:Record<string,number>,k:string)=>Number(x[k]??0);
type Grupo = { quantidade:number; procedimentos:number; produzido:number; aihs:Array<{aih:string;quantidade:number;valor:number}> };
function agregarSIH(rows:RegistroSIH[]):Record<string,Grupo>{
  const map:Record<string,Grupo>={};
  for(const r of rows){
    const k=proc9(r.proc);
    if(!k)continue;
    const q=r.qt_procedimento??1;
    if(!Number.isFinite(q)||q<=0||!Number.isFinite(r.valor)||r.valor<0)
      throw Error("Tabulação SIH com quantidade ou valor inválido.");
    const g=map[k]??(map[k]={quantidade:0,procedimentos:0,produzido:0,aihs:[]});
    g.quantidade++;g.procedimentos+=q;g.produzido+=cent(r.valor);
    g.aihs.push({aih:r.aih,quantidade:q,valor:r.valor});
  }
  return map;
}
function agregarSIA(rows:RegistroSIA[]){
  const map:Record<string,{quantidade:number;produzido:number}>={};
  for(const r of rows){
    const k=proc9(r.proc);if(!k)continue;
    if(!Number.isFinite(r.qt)||r.qt<0||!Number.isFinite(r.valor)||r.valor<0)
      throw Error("Tabulação SIA com quantidade/valor inválido.");
    const g=map[k]??(map[k]={quantidade:0,produzido:0});
    g.quantidade+=r.qt;g.produzido+=cent(r.valor);
  }
  return map;
}
const consolidar=(...mapas:Record<string,unknown>[])=>new Set(mapas.flatMap(m=>Object.keys(m)));
export function conciliarEletivas(f:FonteEC):ResultadoEC {
  const itens:ComponenteEC[]=[];
  const impedimentos:string[]=[];
  const faec=agregarSIH(f.dbf_faec),mac=agregarSIH(f.dbf_mac);
  const sia=agregarSIA(f.dbf_sia??[]);
  const push=(cat:CatEC,proc:string, pub:number,exp:number,situacao:ComponenteEC["situacao"],
              detail:Record<string,unknown>,aih:string|null=null,descricao?:string)=>{
    const chave=`${cat}|${aih||proc}`;
    if(itens.some(i=>i.chave===chave))throw Error("Chave duplicada na conciliação: "+chave);
    itens.push({chave,categoria:cat,descricao:descricao??proc,procedimento:proc||null,
      aih,valor_publicado:reais(pub),valor_esperado:reais(exp),situacao,detalhe:detail});
  };
  // FAEC físico e financeiro não podem ser somados ao complemento duas vezes.
  for(const k of consolidar(f.s_faec.fisico,f.s_faec.financeiro,f.s_faec.complemento,faec)){
    const g=faec[k],qt=g?.quantidade??0,prod=g?.procedimentos??qt;
    const p=centMapa(f.s_faec.financeiro,k),local=g?.produzido??0;
    const q=valor(f.s_faec.fisico,k),pub=centMapa(f.s_faec.complemento,k);
    const u=centMapa(f.s_faec.delib,k),exp=Math.round(prod*u);
    const envelope=ENVELOPES_MULT.has(k);
    const detalhe={qt_aihs:qt,qt_procedimentos:prod,qt_ses:q,financeiro_local:reais(local),
      financeiro_ses:reais(p),unitario_delib:reais(u),complemento_previsto:reais(exp)};
    push("faec_prod",k,p,local,prox(p,local)?"ok":qt>0&&p===0?"nc":"div",detalhe,
      null,f.s_faec.nomes?.[k]??k);
    if(envelope){
      // O cabeçalho da AIH não dá direito ao complemento dos procedimentos-filhos.
      if(qt>0&&!f.mult_faec?.some(x=>proc9(x.proc)===k))
        impedimentos.push(`Múltiplas FAEC ${k}: importar o detalhamento por AIH da SES.`);
      continue;
    }
    if(pub||u)push("faec_compl",k,pub,exp,prox(pub,exp)?"ok":qt>0&&pub===0?"nc":"div",detalhe,
      null,f.s_faec.nomes?.[k]??k);
  }
  for(const m of f.mult_faec??[]){
    const k=proc9(m.proc),pub=cent(m.pago),exp=cent(m.esperado);
    push("faec_mult",k,pub,exp,prox(pub,exp)?"ok":"div",
      {filhos:m.filhos??[],origem:"ses_mult_seq"},m.aih);
  }
  // MAC produção é categoria financeira distinta do complemento.
  for(const k of consolidar(f.s_mac.fisico,f.s_mac.financeiro,f.s_mac.complemento,mac)){
    const g=mac[k],qt=g?.quantidade??0,prod=g?.procedimentos??qt;
    const pubProd=centMapa(f.s_mac.financeiro,k),local=g?.produzido??0;
    const pub=centMapa(f.s_mac.complemento,k),u=centMapa(f.s_mac.delib,k);
    const exp=Math.round(prod*u),qtSes=valor(f.s_mac.fisico,k);
    const detalhe={qt_aihs:qt,qt_procedimentos:prod,qt_ses:qtSes,
      unitario_delib:reais(u),complemento_previsto:reais(exp)};
    if(local||pubProd)push("mac_prod",k,pubProd,local,prox(pubProd,local)?"ok":"div",
      detalhe,null,f.s_mac.nomes?.[k]??k);
    if(!ENVELOPES_MULT.has(k)&&(u||pub))
      push("mac_compl",k,pub,exp,prox(pub,exp)?"ok":qt>0&&pub===0?"nc":"div",
        detalhe,null,f.s_mac.nomes?.[k]??k);
  }
  if(f.mult_mac){
    const m=f.mult_mac;
    push("mac_mult","041500000",cent(m.publicado),cent(m.esperado),
      prox(cent(m.publicado),cent(m.esperado))?"ok":"div",
      {qt_local:m.quantidade_local,qt_ses:m.quantidade_estado},"mult", "Múltiplas e sequenciais MAC");
  }else if(Object.keys(mac).some(k=>ENVELOPES_MULT.has(k))){
    impedimentos.push("Múltiplas MAC encontradas; falta arquivo específico para conferir complemento.");
  }
  const recortes:[keyof FonteEC,CatEC,"faec"|"mac"][]=[
    ["s_faec_est","faec_fxmac","faec"],["s_mac_faec","mac_fxfaec","mac"],
    ["s_mac_fed","mac_fxfed","mac"],
  ];
  for(const [src,cat,origem] of recortes){
    const mat=f[src] as MatrizSES|undefined;
    if(!mat)continue;
    const mine=origem==="faec"?faec:mac;
    for(const k of consolidar(mat.fisico,mat.complemento)){
      const fis=valor(mat.fisico,k),pub=centMapa(mat.complemento,k),
        unit=centMapa(mat.delib,k)||(cat==="faec_fxmac"&&ENVELOPES_MULT.has(k)?200000:0);
      const exp=Math.round(fis*unit);
      if(fis===0&&pub===0)continue;
      if(mat.formulasSemCache?.includes(k)&&pub===0&&exp>0) {
        impedimentos.push(`SES ${src} ${k}: fórmula sem cache; confirmar manualmente o complemento.`);
      }
      push(cat,k,pub,exp,prox(pub,exp)?"ok":"div",
        {qt_ses:fis,qt_local:mine[k]?.quantidade??0,unitario_delib:reais(unit),
          nao_somar:cat==="faec_fxmac"},null,mat.nomes?.[k]??k);
    }
  }
  for(const [src,cat] of [["sia_faec","sia_faec"],["sia_faec_p","sia_faec"],["sia_mac","sia_mac"]] as const){
    const mat=f[src];if(!mat)continue;
    for(const k of consolidar(mat.fisico,mat.financeiro,mat.complemento)){
      const local=sia[k],qt=local?.quantidade??0,q=valor(mat.fisico,k);
      const expCompl=centMapa(mat.delib,k)*qt;
      const publicado=centMapa(mat.financeiro,k)+centMapa(mat.complemento,k);
      const esperado=(local?.produzido??0)+expCompl;
      if(!publicado&&!esperado)continue;
      // SIA FAEC puro e misto podem repetir o mesmo procedimento: não duplicar.
      if(itens.some(i=>i.chave===`${cat}|${k}`)){
        impedimentos.push(`SIA ${cat} procedimento ${k} consta em mais de uma fonte. Conferir recorte.`);
        continue;
      }
      push(cat,k,publicado,esperado,prox(publicado,esperado)?"ok":qt>0&&publicado===0?"nc":"div",
        {qt_local:qt,qt_ses:q,producao:reais(local?.produzido??0),
          complemento_ses:reais(centMapa(mat.complemento,k))},null,mat.nomes?.[k]??k);
    }
  }
  const contabilizaveis=itens.filter(i=>i.categoria!=="faec_fxmac");
  return {itens,impedimentos,totais:{
    publicado:reais(contabilizaveis.reduce((a,i)=>a+cent(i.valor_publicado),0)),
    esperado:reais(contabilizaveis.reduce((a,i)=>a+cent(i.valor_esperado),0)),
    incontroverso:reais(contabilizaveis.reduce((a,i)=>{
      if(i.situacao==="ok"||i.situacao==="info")return a+cent(i.valor_publicado);
      return a+Math.max(0,Math.min(cent(i.valor_publicado),cent(i.valor_esperado)));
    },0)),
  }};
}
