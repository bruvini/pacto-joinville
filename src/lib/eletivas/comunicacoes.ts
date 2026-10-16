import type {ItemEC} from "./financeiro";
import {diferencaACobrarCentavos,reais} from "./financeiro";
export const ETAPAS_FPO=[
 "FPO a corrigir","FPO corrigida","Competência reprocessada",
 "Aguardando aprovação DATASUS/processamento","Produção aprovada",
 "Solicitar revisão à GEMAS por ofício","Aguardando correção no EC",
 "Correção recebida / encerrado"
] as const;
export type DestinoEC="regulacao"|"gemas"|"interno"|"none";
export type EstadoEC="fila"|"enviada"|"interno"|"nenhuma";
export type ComunicacaoEC={
 id:string;tipo:string;referencia:string;destino:DestinoEC;
 situacao:EstadoEC;assinatura:string;enviada_em:string|null;
 protocolo:string|null;assunto:string|null;
};
export type FluxoEC={
 id:string;competencia_id:string;item_id:string|null;aih:string;
 etapa:number;situacao:string;valor_estimado:number;versao:number;
 documento_sei:string|null;
};
const dados=(x:unknown):Record<string,unknown>=>
 x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const txt=(x:unknown)=>String(x??"").trim();
export const CORREIOS_EC={
 regulacao:{label:"Central de Regulação",email:"sur.coorsceletivas@saude.sc.gov.br"},
 gemas:{label:"GEMAS",email:"gemas@saude.sc.gov.br"},
 interno:{label:"Tratamento interno / FPO",email:""},
 none:{label:"Não comunicar",email:""}
} as const;
export function perfilAuditoriaEC(item:Pick<ItemEC,"detalhe"|"categoria"|"aih">){
 const d=dados(item.detalhe),p=dados(d.perfil);
 const estado=txt(d.classificacao_auditor||p.estado||d.auditoria_estado);
 const aih=txt(item.aih||p.aih||d.aih);
 return {estado,aih,perfil:p};
}
export function destinosPermitidosEC(item:ItemEC,fluxos:FluxoEC[]):DestinoEC[]{
 if(!["faec_mult","mac_mult"].includes(item.categoria))return ["none"];
 const p=perfilAuditoriaEC(item);
 if(["bad","review"].includes(p.estado))return ["none","interno","regulacao"];
 if(p.estado==="fpo"){
  // A GEMAS só recebe FPO pela entidade de regularização após etapa 5,
  // nunca por reclassificação direta da AIH.
  return ["none","interno"];
 }
 return ["none"];
}
export function sugestaoDestinoEC(item:ItemEC):DestinoEC{
 const p=perfilAuditoriaEC(item);
 if(["bad","review"].includes(p.estado))return "regulacao";
 if(p.estado==="fpo")return "interno";
 return "none";
}
export function aptosGemasEC(fluxos:FluxoEC[]){
 return fluxos.filter(f=>f.situacao==="ativo"&&f.etapa>=5&&f.etapa<=7);
}
export function gerarMinutaEC(
 destino:"gemas"|"regulacao",competencia:string,cnes:string,
 rows:ComunicacaoEC[],itens:ItemEC[],fluxos:FluxoEC[]
){
 const pendentes=rows.filter(r=>r.destino===destino&&r.situacao==="fila");
 if(!pendentes.length)throw Error("Selecione pelo menos um caso pendente do mesmo destinatário.");
 const unicos=new Set(pendentes.map(x=>x.id));
 if(unicos.size!==pendentes.length)throw Error("Há comunicações repetidas na seleção.");
 const itensPorId=new Map(itens.map(x=>[x.id,x]));
 const fluxoPorId=new Map(fluxos.map(x=>[x.id,x]));
 const linhas:string[]=[];
 let totalCobrar=0;
 const emAnalise:string[]=[];
 for(const c of pendentes){
  if(c.tipo==="aih"){
   const i=itensPorId.get(c.referencia);
   if(!i)throw Error("Item da comunicação não foi encontrado. Recarregue a competência.");
   const p=perfilAuditoriaEC(i);
   linhas.push("AIH: "+(p.aih||"não individualizada")+
    " · Procedimento: "+(i.procedimento||"não informado")+
    " · Enquadramento: "+p.estado+
    "\nSituação: "+i.situacao+
    " · Justificativa: "+txt(i.justificativa||dados(i.detalhe).motivo));
  }else if(c.tipo==="regflow"){
   const f=fluxoPorId.get(c.referencia);
   if(!f)throw Error("Fluxo de regularização não encontrado.");
   if(f.etapa<5||f.etapa>7)throw Error("Produção ainda não aprovada para GEMAS.");
   linhas.push("AIH: "+f.aih+" · Etapa: "+ETAPAS_FPO[f.etapa-1]+
    " · Valor estimado (não reconhecido): "+reais(Math.round(f.valor_estimado*100))+
    " · Documento: "+(f.documento_sei||"pendente"));
  }else if(c.tipo==="ec_gemas"){
   const acordos=itens.filter(i=>i.decisao==="oficio"||i.decisao==="analise");
   if(!acordos.length)throw Error("Não há decisões para encaminhamento à GEMAS.");
   for(const i of acordos){
    const valor=i.decisao==="oficio"?diferencaACobrarCentavos(i):0;
    totalCobrar+=valor;
    if(i.decisao==="analise")emAnalise.push(i.chave);
    linhas.push("Componente: "+i.categoria+
     " · Procedimento: "+(i.procedimento||i.descricao)+
     " · Decisão: "+(i.decisao==="oficio"?"Solicitar regularização":"Análise técnica")+
     " · Diferença a cobrar: "+reais(valor)+
     " · Fundamentação: "+txt(i.justificativa));
   }
  }else throw Error("Tipo de comunicação não suportado.");
 }
 const asunto=destino==="regulacao"?
  "Conferência de faixas — Cirurgias Eletivas — competência "+competencia+
  " — HMSJ CNES "+cnes:
  "Revisão e regularização — Cirurgias Eletivas — competência "+competencia+
  " — HMSJ CNES "+cnes;
 const corpo=destino==="regulacao"?
  "Boa tarde.\n\nDurante a conferência das cirurgias eletivas da competência "+
  competencia+", identificamos "+pendentes.length+
  " ocorrência(s) que exigem confirmação quanto à distribuição das faixas pela Central de Regulação.\n\n"+
  linhas.map((l,n)=>(n+1)+". "+l).join("\n\n")+
  "\n\nSolicitamos confirmar a adequação das faixas e orientar eventuais ajustes no fluxo de autorização.\n\n"+
  "Atenciosamente,\nÁrea de Convênios e Parcerias\nSecretaria Municipal de Saúde de Joinville":
  "Boa tarde.\n\nEncaminhamos, para revisão técnica e eventual regularização do Encontro de Contas, "+
  pendentes.length+" ocorrência(s) da competência "+competencia+
  ". As estimativas FPO não representam pagamentos reconhecidos.\n\n"+
  linhas.map((l,n)=>(n+1)+". "+l).join("\n\n")+
  "\n\nDiferenças indicadas por ofício: "+reais(totalCobrar)+
  " (não incorporadas automaticamente ao atesto)."+
  (emAnalise.length?"\nItens em análise: "+emAnalise.length+".":"")+
  "\n\nSolicitamos revisão e retorno documentado, quando cabível.\n\n"+
  "Atenciosamente,\nÁrea de Convênios e Parcerias\nSecretaria Municipal de Saúde de Joinville";
 return {para:CORREIOS_EC[destino].email,destino,assunto:asunto,corpo,
  ids:pendentes.map(x=>x.id),totalCobrar};
}
