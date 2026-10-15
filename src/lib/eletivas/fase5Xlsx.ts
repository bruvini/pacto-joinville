import * as XLSX from "xlsx";
import {valorConciliadoCentavos} from "./financeiro";
import {quadroAtestoEC,memoriasEC,rotuloEC,provenienciaTecnicaEC,
  conferirDocumentosEC,type ContextoFase5EC,type ItemDocumentoEC} from "./fase5Documentos";
import {prepararEncaminhamentoEC} from "./fase5Ses";
import {sanitizarEvidenciaEC} from "./privacidade";
const n=(v:unknown)=>Number(v)||0;
const real=(i:ItemDocumentoEC)=>valorConciliadoCentavos(i)/100;
const dados=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?
  v as Record<string,unknown>:{};
const aihs=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.map(dados):[];
const seguro=(s:unknown)=>typeof s==="string"&&/^[=+\-@]/.test(s.trimStart())?
  "'"+s:String(s??"");
const seguroObj=(o:Record<string,unknown>)=>Object.fromEntries(Object.entries(o)
 .map(([k,v])=>[k,typeof v==="string"?seguro(v):v??""]));
function append(wb:XLSX.WorkBook,name:string,rows:Record<string,unknown>[],
  heads:string[]){
 const payload=(rows.length?rows:[Object.fromEntries(heads.map(k=>[k,""]))])
   .map(row=>seguroObj(row));
 const sheet=XLSX.utils.json_to_sheet(payload,{header:heads});
 sheet["!cols"]=heads.map(h=>({wch:Math.min(48,Math.max(15,h.length+4))}));
 // Números permanecem valores numéricos e não são convertidos em texto.
 for(const [addr,cell] of Object.entries(sheet)){
  if(addr.startsWith("!")||!cell||typeof cell!=="object")continue;
  if((cell as XLSX.CellObject).t==="n"){
   const col=XLSX.utils.decode_cell(addr).c;
   if(/valor|publicado|esperado|admitido|correção|total|diferença|líquido|unitário|provisório/i
      .test(heads[col]??""))(cell as XLSX.CellObject).z='"R$" #,##0.00;[Red]("R$" #,##0.00)';
  }
 }
 XLSX.utils.book_append_sheet(wb,sheet,name.slice(0,31));
}
export function gerarXlsxFase5EC(ctx:ContextoFase5EC){
 const wb=XLSX.utils.book_new(),quadro=quadroAtestoEC(ctx),
  ses=prepararEncaminhamentoEC(ctx);
 const linhas=ctx.itens.map(i=>({
  "Categoria":rotuloEC(i.categoria),"Código":i.procedimento??"",
  "AIH":i.aih??"","Descrição":i.descricao,
  "Quantidade AIH":dados(i.detalhe).qt_aihs??"",
  "QT procedimentos":dados(i.detalhe).qt_procedimentos??"",
  "Publicado R$":n(i.valor_publicado),"Esperado R$":n(i.valor_esperado),
  "Admitido R$":real(i),"Situação":i.situacao,
  "Decisão":i.decisao??"","Conferido":i.conferido_em?"Sim":"Não",
  "Justificativa":i.justificativa??"","Origem":i.origem??"",
 }));
 const heads=Object.keys(linhas[0]??{"Categoria":"","Código":"","AIH":"","Descrição":"",
  "Quantidade AIH":"","QT procedimentos":"","Publicado R$":"","Esperado R$":"",
  "Admitido R$":"","Situação":"","Decisão":"","Conferido":"","Justificativa":"","Origem":""});
 append(wb,"Resumo",[
  ...quadro.linhas.map(l=>({"Componente":l.nome,"Valor R$":l.valorCentavos/100,"Quantidade":l.quantidade??""})),
  {"Componente":"Correções aprovadas","Valor R$":quadro.correcoesCent/100,"Quantidade":""},
  {"Componente":"Total preliminar","Valor R$":quadro.total/100,"Quantidade":""},
  {"Componente":"Diferença contra motor","Valor R$":quadro.diferenca/100,"Quantidade":""},
  {"Componente":"Pendências para revisão","Valor R$":0,"Quantidade":quadro.pendencias.length},
  {"Componente":"Cobrança SES apta","Valor R$":ses.totalCent/100,"Quantidade":ses.cobrancas.length},
 ],["Componente","Valor R$","Quantidade"]);
 const grupo=(g:string)=>linhas.filter((_,idx)=>ctx.itens[idx].categoria.startsWith(g));
 append(wb,"FAEC",grupo("faec_"),heads);
 append(wb,"MAC",grupo("mac_"),heads);
 append(wb,"SIA",grupo("sia_"),heads);
 append(wb,"Multiplas",linhas.filter((_,idx)=>["faec_mult","mac_mult"].includes(
  ctx.itens[idx].categoria)),heads);
 append(wb,"Fila",linhas.filter((_,idx)=>{
  const i=ctx.itens[idx];
  return !i.conferido_em||!i.decisao&&["div","nc","fora","pendente"].includes(i.situacao)
   ||i.decisao==="analise"||i.decisao==="oficio";
 }),heads);
 append(wb,"Dossies",ctx.itens.map(i=>({
  "Categoria":i.categoria,"Código":i.procedimento??"",
  "AIH":i.aih??"","Descrição":i.descricao,
  "Memória estruturada":memoriasEC(i).map(m=>m.rotulo+": "+m.valor).join("\n"),
  "Detalhe sanitizado":JSON.stringify(sanitizarEvidenciaEC(i.detalhe??{})),
  "Justificativa":i.justificativa??"",
 })),["Categoria","Código","AIH","Descrição","Memória estruturada","Detalhe sanitizado","Justificativa"]);
 append(wb,"AIHs e Filhos",ctx.itens.flatMap(i=>{
  const d=dados(i.detalhe),f=dados(d.perfil),aihs=[...aihs(d.aihs),...aihs(d.filhos),...aihs(f.filhos)];
  return aihs.map(row=>({
    "AIH":i.aih??row.aih??"","Principal":f.principal??d.principal??"",
    "Componente":i.categoria,"Procedimento filho":row.proc??row.procedimento??"",
    "QT":row.qt??"","Unitário R$":row.unitario??row.unitario_cib??row.unit??"",
    "Valor R$":row.valor??"",
    "Faixa":f.faixa??"","Origem":row.fonte??row.aba??i.origem??"",
  }));
 }),["AIH","Principal","Componente","Procedimento filho","QT","Unitário R$","Valor R$","Faixa","Origem"]);
 append(wb,"FPO", (ctx.fpo??[]).map(f=>({
  "Procedimento":f.procedimento,"Competência FPO":f.competencia_programacao,
  "Vigência início":f.vigencia_inicio,"Vigência fim":f.vigencia_fim,
  "Federal unitário R$":f.valor_federal_unitario,"Documento SEI":f.documento_sei,
  "Tipo":"Programação efetiva documentada (não apenas parâmetro oficial)",
 })),["Procedimento","Competência FPO","Vigência início","Vigência fim",
  "Federal unitário R$","Documento SEI","Tipo"]);
 append(wb,"Correcoes",ctx.correcoes.map(c=>({
  "Competência de origem":c.competencia_origem,"AIHs":(c.aihs??[]).join(", "),
  "Valor R$":c.valor,"Origem":c.fonte_origem??"",
  "Referência única":c.referencia_origem??"","SEI":c.documento_sei,
  "Motivo":c.motivo,"Situação":c.status??"aprovada",
 })),["Competência de origem","AIHs","Valor R$","Origem","Referência única",
  "SEI","Motivo","Situação"]);
 append(wb,"Proveniencia",provenienciaTecnicaEC(ctx),["Categoria","Procedimento",
  "AIH","Origem","Detalhes sanitizados"]);
 append(wb,"Parecer",[
  {"Campo":"Parecer informado","Conteúdo":String(ctx.documentos.parecer??"Pendente")},
  {"Campo":"Parecer descritivo","Conteúdo":String(ctx.documentos.parecer_texto??"")},
  {"Campo":"Portaria","Conteúdo":String(ctx.documentos.portaria_comissao??"")},
  {"Campo":"Amparo legal","Conteúdo":String(ctx.documentos.amparo??"")},
  {"Campo":"Documentação","Conteúdo":conferirDocumentosEC(ctx).join("; ")||"Verificação em SEI pendente"},
  {"Campo":"Aviso","Conteúdo":"MINUTA: sem assinatura, autenticação ou atesto certificado"},
 ],["Campo","Conteúdo"]);
 append(wb,"SES Encaminhamentos",[
  {"Campo":"Assunto e-mail","Conteúdo":ses.assunto},
  {"Campo":"Corpo e-mail","Conteúdo":ses.corpo},
  {"Campo":"Cobrança líquida","Conteúdo":ses.totalCent/100},
  {"Campo":"Alertas","Conteúdo":ses.alertas.join("\n")},
 ],["Campo","Conteúdo"]);
 return wb;
}
