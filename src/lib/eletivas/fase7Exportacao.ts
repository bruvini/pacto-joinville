import * as XLSX from "xlsx";
import {quadroAtestoEC,rotuloEC,memoriasEC,provenienciaTecnicaEC,
 type ContextoFase5EC,type ItemDocumentoEC} from "./fase5Documentos";
import {resumoEncontro,diferencaACobrarCentavos,valorConciliadoCentavos,
 envelopeAuditoria} from "./financeiro";
import {sanitizarEvidenciaEC} from "./privacidade";

export const ABAS_HTML_FASE7=[
 "Consolidado","Checkmate SES","Itens","Divergências","Correções",
 "Auditoria de Faixa","Comunicações","Regularizações FPO","Alertas","FPO"
] as const;
export type EvidenciaComunicacaoEC={id:string;tipo:string;referencia:string;
 aih?:string|null;destino:string;situacao:string;assunto?:string|null;
 protocolo?:string|null;enviada_em?:string|null;atualizado_em?:string|null};
export type EvidenciaFluxoEC={id:string;aih:string;etapa:number;situacao:string;
 documento_sei?:string|null;valor_estimado:number;atualizado_em?:string|null};
export type EvidenciaEventoEC={comunicacao_id:string;acao:string;
 registrado_em:string;justificativa:string;protocolo?:string|null};
export type ConsolidadoSES={
 arquivo:string;competencia:string;cnes:string;publicacao:number|null;
 ajustes:number|null;total:number|null;observacao:string;
};
export type ContextoExportFase7EC=ContextoFase5EC&{
 comunicacoes?:EvidenciaComunicacaoEC[];
 fluxos?:EvidenciaFluxoEC[];eventos?:EvidenciaEventoEC[];
 consolidadoSES?:ConsolidadoSES|null;
};
const d=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?
 x as Record<string,unknown>:{};
const cent=(x:unknown)=>Math.round(Number(x??0)*100);
const unsafe=(x:unknown):string=>{
 const s=String(x??"");
 return /^[=+@\-\t\r]/.test(s.trimStart())?"'"+s:s;
};
const money='"R$" #,##0.00;[Red]("R$" #,##0.00)';
function sheet(wb:XLSX.WorkBook,name:typeof ABAS_HTML_FASE7[number],
 heads:string[],rows:unknown[][],moedas:number[]=[],inteiros:number[]=[]){
 const capa=[
  ["ENCONTRO DE CONTAS — CIRURGIAS ELETIVAS · "+name],
  ["Memória da competência — dados institucionais e auditoria fiscal"],
  ["", ""],[],heads
 ];
 const normalized=rows.length?rows:[["Não existem registros para este quadro."]];
 const data=[...capa,...normalized.map(r=>r.map((x,i)=>{
  if(x===null||x===undefined)return "";
  return typeof x==="number"&&Number.isFinite(x)?x:unsafe(x);
 }))];
 const ws=XLSX.utils.aoa_to_sheet(data);
 ws["!cols"]=heads.map((h,i)=>({wch:Math.min(63,Math.max(16,
  /Memória|Observações|Histórico|Procedimento|Justificativa|Origem|Composição|Situação/.test(h)?40:
  /Valor|Publicado|Esperado|Total|Diferença/.test(h)?20:h.length+4))}));
 ws["!freeze"]={xSplit:0,ySplit:5};
 if(rows.length)ws["!autofilter"]={ref:"A5:"+XLSX.utils.encode_col(heads.length-1)+(data.length)};
 ws["!rows"]=[{hpt:27},{hpt:20},{hpt:8},{hpt:8},{hpt:29}];
 for(let col=0;col<heads.length;col++){
  const a=XLSX.utils.encode_cell({r:4,c:col}),cel=ws[a];
  if(cel)cel.s={font:{bold:true,color:{rgb:"FFFFFF"}},
   fill:{fgColor:{rgb:"173D32"}},alignment:{wrapText:true,vertical:"center"}};
 }
 for(let row=5;row<data.length;row++){
  for(const col of moedas){
   const a=XLSX.utils.encode_cell({r:row,c:col}),cel=ws[a];
   if(cel&&cel.t==="n")cel.z=money;
  }
  for(const col of inteiros){
   const a=XLSX.utils.encode_cell({r:row,c:col}),cel=ws[a];
   if(cel&&cel.t==="n")cel.z="0";
  }
 }
 XLSX.utils.book_append_sheet(wb,ws,name);
}
const fields=(ctx:ContextoExportFase7EC)=>{
 const it=ctx.itens,r=resumoEncontro(it,ctx.correcoes);
 const q=quadroAtestoEC(ctx);
 return {it,r,q};
};
const aih=(i:ItemDocumentoEC)=>{
 const raw=i.detalhe&&typeof i.detalhe==="object"&&!Array.isArray(i.detalhe)?
  i.detalhe as Record<string,unknown>:{};
 const a=Array.isArray(raw.aihs)?raw.aihs.map(d):[];
 return i.aih||a.map(x=>String(x.aih??"")).filter(Boolean).join(", ");
};
const status=(i:ItemDocumentoEC)=>i.conferido_em?"Conferido":"Pendente de conferência";
const divergent=(i:ItemDocumentoEC)=>i.situacao!=="ok"&&
 !envelopeAuditoria(i);
const approved=(ctx:ContextoExportFase7EC)=>ctx.correcoes.filter(x=>x.status==="aprovada");
export function gerarXlsxHtmlFase7EC(ctx:ContextoExportFase7EC){
 const wb=XLSX.utils.book_new(),{it,r,q}=fields(ctx);
 wb.Props={Title:"Auditoria Encontro de Contas — "+ctx.competencia,
  Subject:"Memória fiscal, não constitui assinatura ou atesto SEI",
  Company:"Secretaria Municipal de Saúde de Joinville"};
 sheet(wb,"Consolidado",["Grupo","Linha de apuração","Quantidade","Valor","Observação"],[
  ...q.linhas.map(l=>[l.id.startsWith("faec")?"FAEC":l.id.startsWith("mac")?"MAC":
    l.id==="sia"?"SIA":"Controle",l.nome,l.quantidade??"",
    l.valorCentavos/100,"Valor fiscalmente admitido, não editável"]),
  ["Controle","FAEC em faixa MAC — controle (não soma)","",r.controleFaecFxMac/100,
   "Excluído da soma financeira"],
  ["Atesto","EC da competência atual","",r.encontro/100,"Base, sem correções anteriores"],
  ["Atesto","Correções aprovadas recebidas","",r.correcoes/100,
   "Somente aprovação fiscal e origem comprovada"],
  ["Atesto","Total preliminar do atesto","",r.total/100,"Ainda depende de validação fiscal"],
  ["Fora do atesto","Diferenças por ofício","",r.oficio/100,
   "Não constitui pagamento nem crédito líquido reconhecido"],
 ],[3],[2]);
 const cm=ctx.consolidadoSES;
 const cmValido=!!cm&&cm.cnes===ctx.cnes&&cm.competencia===ctx.competencia&&
  cm.publicacao!==null&&cm.ajustes!==null&&cm.total!==null;
 sheet(wb,"Checkmate SES",["Conferência","Memória React","Consolidado SES",
  "Diferença","Resultado"],[
  ["Fonte do consolidado",cm?.arquivo??"NÃO IMPORTADA",cm?.observacao??"","",""],
  ["EC-base",r.encontro/100,cmValido?cm.publicacao:"",
    cmValido?(r.encontro/100-(cm.publicacao??0)):"",
    cmValido?(cent(r.encontro/100)===cent(cm.publicacao)?"Confere":"Diverge"):"NÃO COMPROVADO"],
  ["Correções aprovadas",r.correcoes/100,cmValido?cm.ajustes:"",
    cmValido?(r.correcoes/100-(cm.ajustes??0)):"",
    cmValido?(cent(r.correcoes/100)===cent(cm.ajustes)?"Confere":"Diverge"):"NÃO COMPROVADO"],
  ["Total de estabelecimento",r.total/100,cmValido?cm.total:"",
    cmValido?(r.total/100-(cm.total??0)):"",
    cmValido?(cent(r.total/100)===cent(cm.total)?"Confere":"Diverge"):"NÃO COMPROVADO"],
  ["Observação","O consolidado não prova AIH nem origem de correções","","",""],
 ],[1,2,3]);
 const itens=it.map(i=>[rotuloEC(i.categoria),i.categoria,i.procedimento??"",
  i.descricao,aih(i),d(i.detalhe).qt_aihs??"",
  d(i.detalhe).qt_procedimentos??"",i.valor_publicado,
  i.valor_esperado,valorConciliadoCentavos(i)/100,i.situacao,
  i.decisao??"Sem decisão",status(i),i.justificativa??"",i.origem??""]);
 sheet(wb,"Itens",["Categoria","Financiamento","Procedimento","Descrição","AIH",
  "Quantidade AIH","QT interna","Publicado","Esperado","Admitido","Status",
  "Decisão","Conferência","Observações","Origem"],itens,[7,8,9],[5,6]);
 sheet(wb,"Divergências",["Categoria","Escopo","Procedimento","Descrição","AIH",
  "QT local","QT SES","Esperado","Publicado","Diferença",
  "Status","Decisão","Observação"],it.filter(divergent).map(i=>[
   rotuloEC(i.categoria),i.categoria,i.procedimento??"",i.descricao,aih(i),
   d(i.detalhe).qt_procedimentos??"",d(i.detalhe).qt_ses??"",
   i.valor_esperado,i.valor_publicado,
   Math.round((i.valor_esperado-i.valor_publicado)*100)/100,
   i.situacao,i.decisao??"Sem decisão",i.justificativa??""
  ]),[7,8,9],[5,6]);
 sheet(wb,"Correções",["Competência de origem","AIHs","Quantidade AIHs",
  "Valor recebido","Status","SEI","Referência","Motivo"],ctx.correcoes.map(c=>[
  c.competencia_origem,(c.aihs??[]).join(", "),(c.aihs??[]).length,
  c.valor,c.status??"Em análise",c.documento_sei,c.referencia_origem??"",c.motivo
 ]),[3],[2]);
 const faixa=it.filter(i=>["faec_mult","mac_mult"].includes(i.categoria));
 sheet(wb,"Auditoria de Faixa",["AIH","Procedimento envelope","Faixa recebida",
  "Enquadramento","Status","Componentes classificados","Não localizados",
  "Providência / tratamento"],faixa.flatMap(i=>{
  const dd=d(i.detalhe),p=d(dd.perfil),cs=Array.isArray(dd.aihs)?dd.aihs.map(d):[];
  const ps=cs.length?cs:[p];
  return ps.map(a=>[
   a.aih??i.aih??"",i.procedimento??"",a.faixa??p.faixa??"",
   a.natureza??p.natureza??dd.classificacao_cib??"",
   a.estado??p.estado??dd.classificacao_auditor??i.situacao,
   (Array.isArray(a.filhos)?a.filhos.map(d):[]).map(x=>
    [x.proc??x.procedimento,x.classificacao??""].join(" — ")).join("\n"),
   (Array.isArray(a.unknown)?a.unknown:[]).map(x=>String(x)).join("\n"),
   i.justificativa??dd.justificativa??"Revisão individual do dossiê"
  ]);
 }),[],[]);
 const historico=new Map<string,string[]>();
 for(const ev of ctx.eventos??[]){
  const lista=historico.get(ev.comunicacao_id)??[];
  lista.push(ev.registrado_em+" · "+ev.acao+" · "+ev.justificativa);
  historico.set(ev.comunicacao_id,lista);
 }
 sheet(wb,"Comunicações",["Tipo","Competência","AIH / fluxo","Destino","Estado",
  "Atualizado em","Enviado em","Protocolo","Histórico"],(ctx.comunicacoes??[]).map(c=>[
  c.tipo,ctx.competencia,c.aih??c.referencia,c.destino,c.situacao,
  c.atualizado_em??"",c.enviada_em??"",c.protocolo??"",
  (historico.get(c.id)??[]).join("\n")
 ]));
 sheet(wb,"Regularizações FPO",["Competência de origem","AIH",
  "Valor estimado","Etapa atual","Situação","Documento SEI","Atualizado em",
  "Observação / comprovação"],(ctx.fluxos??[]).map(f=>[
   ctx.competencia,f.aih,f.valor_estimado,"Etapa "+f.etapa,f.situacao,
   f.documento_sei??"Não comprovado",f.atualizado_em??"",
   "Estimativa não incorporada sem reconhecimento SES"
 ]),[2]);
 const alertas=[
  ...(q.diferenca!==0?[["Crítica","Financeiro","Total RTMA diverge do motor",
   "Diferença "+(q.diferenca/100),"Bloquear atesto"]]:[]),
  ...q.pendencias.map(i=>["Pendência","Auditoria",i.descricao,
   "Conferência/decisão fiscal pendente","Investigar fila"]),
  ...(!cmValido?[["Informativo","Consolidado SES",
   "Checkmate SES não comprovado com publicação na memória congelada",
   "Não utilizar valores inferidos de outros hospitais","Importar/conferir SES"]]:[]),
  ...(!q.quantidadeConfiavel?[["Crítica","RTMA","Quantidade de AIHs não certificável",
   "Base individual incompleta","Conferir AIHs"]]:[])
 ];
 sheet(wb,"Alertas",["Severidade","Grupo","O que aconteceu","Por que importa",
  "Onde resolver"],alertas);
 sheet(wb,"FPO",["Procedimento","Descrição","Competência programada",
  "Federal / un.","Vigência início","Vigência fim","Documento SEI",
  "Status de comprovação"],(ctx.fpo??[]).map(f=>[
   f.procedimento,"Referência informada",f.competencia_programacao,
   f.valor_federal_unitario,f.vigencia_inicio,f.vigencia_fim,f.documento_sei,
   f.documento_sei?"Programação declarada; conferir autenticidade":
    "Programação não comprovada"
  ]),[3]);
 if(wb.SheetNames.join("|")!==ABAS_HTML_FASE7.join("|"))
  throw Error("Integridade: 10 abas obrigatórias do HTML não foram produzidas.");
 return wb;
}
export const CABECALHO_CSV_DIVERGENCIAS=[
 "Categoria","Escopo","Procedimento","Descrição","AIH","Qtd. local",
 "Qtd. SES","Complemento previsto","Complemento publicado","Diferença",
 "Status","Decisão","Observação"] as const;
const csvSafe=(v:unknown)=>{
 const s=unsafe(v);
 return '"'+s.replace(/"/g,'""').replace(/\r?\n/g," ")+'"';
};
export function gerarCsvDivergenciasFase7EC(ctx:ContextoFase5EC){
 const rows=ctx.itens.filter(divergent).map(i=>[
  rotuloEC(i.categoria),i.categoria,i.procedimento??"",i.descricao,aih(i),
  d(i.detalhe).qt_procedimentos??"",d(i.detalhe).qt_ses??"",
  i.valor_esperado.toFixed(2).replace(".",","),
  i.valor_publicado.toFixed(2).replace(".",","),
  (i.valor_esperado-i.valor_publicado).toFixed(2).replace(".",","),
  i.situacao,i.decisao??"Sem decisão",i.justificativa??""
 ]);
 return "\uFEFF"+[CABECALHO_CSV_DIVERGENCIAS,...rows]
  .map(row=>row.map(csvSafe).join(";")).join("\r\n");
}

/** Extrai SOMENTE a memória já congelada do Consolidado SES no manifesto.
 * Não consulta hospitais vizinhos nem substitui arquivo/aba por inferência.
 */
export function consolidadoDoManifestoEC(snapshot:unknown,cnes:string,competencia:string):ConsolidadoSES|null{
 if(!Array.isArray(snapshot))return null;
 const item=snapshot.find(x=>x&&typeof x==="object"&&!Array.isArray(x)&&
  (x as Record<string,unknown>).categoria==="ec_consolidado") as Record<string,unknown>|undefined;
 if(!item)return null;
 const txt=String(item.observacao??"");
 const match=txt.match(/produção\s+(-?\d+\.\d{2})\s*\|\s*ajustes\s+(-?\d+\.\d{2})\s*\|\s*total\s+(-?\d+\.\d{2})/i);
 if(!match||/total derivado/i.test(txt))return {arquivo:String(item.nome_original??"Consolidado SES"),
  cnes,competencia,publicacao:null,ajustes:null,total:null,
  observacao:"Memória oficial indisponível ou total derivado: confira o XLSX da SES. "+txt};
 return {arquivo:String(item.nome_original??"Consolidado SES"),cnes,competencia,
  publicacao:Number(match[1]),ajustes:Number(match[2]),total:Number(match[3]),
  observacao:"Valores da memória congelada da execução; confira célula, aba e SHA no manifesto. "+txt};
}
