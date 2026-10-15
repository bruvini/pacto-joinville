import {resumoEncontro,valorConciliadoCentavos,type ItemEC} from "./financeiro";
import {sanitizarEvidenciaEC} from "./privacidade";

/** Fase 7: contrato portável entre HTML de referência e React/Supabase.
 * Somente dados técnicos: nunca nomes, CPF, CNS ou textos não sanitizados. */
export const GOLDEN_SCHEMA="ec-golden-v1";
export const CATEGORIAS_GOLDEN=[
 "faec_prod","faec_compl","faec_mult","faec_fxmac","mac_compl","mac_mult",
 "mac_fxfaec","mac_prod","mac_fxfed","sia_faec","sia_mac",
] as const;
export type GoldenCategoria=typeof CATEGORIAS_GOLDEN[number];
export type GoldenOrigem="html"|"react";
export type GoldenFonte={categoria:string;sha256:string};
export type GoldenLinha={
 chave:string;categoria:GoldenCategoria;aih:string;procedimento:string;
 qtAIH:number|null;qtInterna:number|null;
 publicadoCent:number;esperadoCent:number;admitidoCent:number;
 situacao:string;decisao:string;
 // Exceção de tolerância exclusivamente quando a regra do HTML é documentada.
 regraTolerancia?:string;
};
export type GoldenEC={
 schema:typeof GOLDEN_SCHEMA;origem:GoldenOrigem;competencia:string;cnes:string;
 versaoMotor:string;versaoReferencia:string;fontes:GoldenFonte[];
 itens:GoldenLinha[];
 componentes:Record<GoldenCategoria,number>;
 totalCent:number;correcoesCent:number;
 status:"capturado"|"aprovado";
};
export type DiferencaGolden={codigo:string;chave:string;campo:string;
 esperado:string|number;obtido:string|number;responsavel:string;fonte:string};
const inteiro=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&Number.isInteger(x)?x:null;
const cent=(v:unknown)=>Math.round(Number(v??0)*100);
const codigo=(v:unknown)=>{
 const d=String(v??"").replace(/\D/g,"");return d.length>=9?d.slice(0,9):d;
};
const categorias=new Set<string>(CATEGORIAS_GOLDEN);
const fundos=():Record<GoldenCategoria,number>=>Object.fromEntries(
 CATEGORIAS_GOLDEN.map(cat=>[cat,0])) as Record<GoldenCategoria,number>;
const ordem=(a:GoldenLinha,b:GoldenLinha)=>a.chave.localeCompare(b.chave,"pt-BR");
const memoria=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?
 v as Record<string,unknown>:{};
export function montarGoldenReact(args:{
 competencia:string;cnes:string;versaoMotor:string;
 versaoReferencia?:string;fontes:GoldenFonte[];itens:(ItemEC&{
  aih?:string|null;procedimento?:string|null;detalhe?:unknown;
 })[];correcoesCent?:number;
}):GoldenEC{
 const componentes=fundos();
 const itens:GoldenLinha[]=args.itens.map(i=>{
  const d=memoria(i.detalhe);
  const publicadoCent=cent(i.valor_publicado),esperadoCent=cent(i.valor_esperado);
  const admitidoCent=valorConciliadoCentavos(i);
  componentes[i.categoria]+=admitidoCent;
  return {chave:i.chave,categoria:i.categoria,aih:i.aih??"",
   procedimento:codigo(i.procedimento),qtAIH:inteiro(d.qt_aihs),
   qtInterna:inteiro(d.qt_procedimentos),
   publicadoCent,esperadoCent,admitidoCent,
   situacao:i.situacao,decisao:i.decisao??""};
 }).sort(ordem);
 const resumo=resumoEncontro(args.itens,[]);
 const correcoesCent=args.correcoesCent??0;
 return {schema:GOLDEN_SCHEMA,origem:"react",competencia:args.competencia,cnes:args.cnes,
   versaoMotor:args.versaoMotor,versaoReferencia:args.versaoReferencia??"",
   fontes:[...args.fontes].sort((a,b)=>a.categoria.localeCompare(b.categoria)),
   itens,componentes,totalCent:resumo.encontro+correcoesCent,correcoesCent,
   status:"capturado"};
}
export function validarGolden(x:unknown):GoldenEC{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Golden master deve ser um JSON.");
 const g=x as Record<string,unknown>;
 if(g.schema!==GOLDEN_SCHEMA||!["html","react"].includes(String(g.origem))
    ||!/^\d{2}\/20\d{2}$/.test(String(g.competencia??""))
    ||!/^\d{7}$/.test(String(g.cnes??""))
    ||!Array.isArray(g.itens)||g.itens.length>10000
    ||!Array.isArray(g.fontes)||g.fontes.length>24
    ||!g.componentes||typeof g.componentes!=="object"
    ||!Number.isInteger(g.totalCent)||!Number.isInteger(g.correcoesCent)){
   throw Error("Esquema do golden master inválido ou incompleto.");
 }
 for(const f of g.fontes as GoldenFonte[]){
  if(!f||typeof f.categoria!=="string"||!(/^[a-f0-9]{64}$/i).test(f.sha256))
   throw Error("Fonte sem hash SHA-256 válido; não é possível aprovar golden master.");
 }
 for(const i of g.itens as GoldenLinha[]){
  if(!i||!categorias.has(i.categoria)||typeof i.chave!=="string"
   ||!i.chave.startsWith(i.categoria+"|")||typeof i.aih!=="string"
   ||typeof i.procedimento!=="string"||!Number.isInteger(i.publicadoCent)
   ||!Number.isInteger(i.esperadoCent)||!Number.isInteger(i.admitidoCent)
   ||(i.qtAIH!==null&&!Number.isInteger(i.qtAIH))
   ||(i.qtInterna!==null&&!Number.isInteger(i.qtInterna)))
   throw Error("Linha técnica inválida no golden master.");
 }
 return g as GoldenEC;
}
export function compararGolden(master:GoldenEC,atual:GoldenEC):DiferencaGolden[]{
 validarGolden(master);validarGolden(atual);
 const dif:DiferencaGolden[]=[];
 const add=(codigo:string,chave:string,campo:string,esperado:string|number,
  obtido:string|number,fonte="Conferir hash/fonte da competência")=>{
  dif.push({codigo,chave,campo,esperado,obtido,responsavel:"Fiscal responsável pela homologação",fonte});
 };
 if(master.origem!=="html"||atual.origem!=="react")
  add("ORIGEM","geral","origem","html → react",master.origem+" → "+atual.origem);
 for(const k of ["competencia","cnes"] as const)
  if(master[k]!==atual[k])add("IDENTIDADE","geral",k,master[k],atual[k]);
 const mm=new Map(master.fontes.map(f=>[f.categoria,f.sha256]));
 const ma=new Map(atual.fontes.map(f=>[f.categoria,f.sha256]));
 if(!mm.size||!ma.size)add("FONTE","geral","fontes","Manifesto validado","Manifesto vazio");
 for(const key of new Set([...mm.keys(),...ma.keys()])){
  if(mm.get(key)!==ma.get(key))add("FONTE",key,"sha256",mm.get(key)??"ausente",
   ma.get(key)??"ausente","Arquivo original da categoria "+key);
 }
 const map=(rows:GoldenLinha[],origem:string)=>{
  const out=new Map<string,GoldenLinha>();
  for(const row of rows){
   if(out.has(row.chave))add("DUPLICADO",row.chave,"chave",origem+" sem duplicatas",
    "Chave repetida",origem);
   else out.set(row.chave,row);
  }
  return out;
 };
 const antes=map(master.itens,"HTML"),depois=map(atual.itens,"React");
 for(const key of new Set([...antes.keys(),...depois.keys()])){
  const a=antes.get(key),b=depois.get(key);
  if(!a||!b){add("ITEM",key,"presença",a?"presente":"ausente",
    b?"presente":"ausente");continue;}
  for(const field of ["categoria","aih","procedimento","qtAIH","qtInterna",
    "situacao","decisao"] as const){
   if(a[field]!==b[field])add("ITEM",key,field,String(a[field]),String(b[field]));
  }
  for(const field of ["publicadoCent","esperadoCent","admitidoCent"] as const){
   if(a[field]===b[field])continue;
   // Só produção/financeiro pode usar 2 centavos, e SOMENTE com referência
   // de regra explícita igual nos dois lados. Glosa/admitido nunca tolera.
   const tol=field!=="admitidoCent"&&a.regraTolerancia==="conferencia_financeira_2_centavos"
    &&b.regraTolerancia===a.regraTolerancia;
   if(!(tol&&Math.abs(a[field]-b[field])<=2))
    add("VALOR",key,field,a[field],b[field]);
  }
 }
 for(const category of CATEGORIAS_GOLDEN){
  if(master.componentes[category]!==atual.componentes[category])
   add("COMPONENTE",category,"subtotalCent",master.componentes[category],
    atual.componentes[category]);
 }
 for(const field of ["correcoesCent","totalCent"] as const)
  if(master[field]!==atual[field])
   add("TOTAL","geral",field,master[field],atual[field]);
 return dif;
}
export function serializarGolden(g:GoldenEC):string{
 const limpo=sanitizarEvidenciaEC(g);
 return JSON.stringify(limpo,null,2);
}
