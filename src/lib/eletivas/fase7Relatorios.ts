import {quadroAtestoEC,esc,moedaCent,rotuloEC,memoriasEC,
 type ContextoFase5EC,type ItemDocumentoEC} from "./fase5Documentos";
import {diferencaACobrarCentavos,valorConciliadoCentavos,envelopeAuditoria}
 from "./financeiro";

export type FluxoRelatorioEC={aih:string;etapa:number;valor_estimado:number;
 documento_sei:string|null;situacao:string;observacao?:string|null};
export type ComunicacaoRelatorioEC={tipo:string;referencia:string;aih?:string|null;
 destino:string;situacao:string;protocolo?:string|null;enviada_em?:string|null};
export type ContextoRelatorioFase7=ContextoFase5EC&{
 fluxos?:FluxoRelatorioEC[];comunicacoes?:ComunicacaoRelatorioEC[];
};

const num=(v:number)=>(v/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const bytes=(o:unknown):Record<string,unknown>=>
 o&&typeof o==="object"&&!Array.isArray(o)?o as Record<string,unknown>:{};
const aihArray=(i:ItemDocumentoEC)=>{const d=bytes(i.detalhe);
 return Array.isArray(d.aihs)?d.aihs.map(bytes):[];
};
const block=(h:string)=>'<div class="inst-section" style="font:700 15px Arial,sans-serif;margin-top:20px;border-bottom:2px solid #264936;padding:7px 0">'+esc(h)+"</div>";
const para=(s:string)=>'<p class="inst-p" style="font:12px/1.6 Arial,sans-serif">'+esc(s)+"</p>";
const td=(s:unknown,head=false)=>(head?"<th":"<td")+
 ' style="border:1px solid #bbc8bc;padding:7px 9px;vertical-align:top;'+
 (head?"background:#edf2eb;font-weight:700;":"")+'">'+esc(s)+
 (head?"</th>":"</td>");
const table=(headers:string[],rows:unknown[][])=>'<table class="sei" style="width:100%;border-collapse:collapse;font:11px Arial,sans-serif"><thead><tr>'+
 headers.map(x=>td(x,true)).join("")+"</tr></thead><tbody>"+
 rows.map(r=>"<tr>"+r.map(c=>td(c)).join("")+"</tr>").join("")+"</tbody></table>";
const validAih=(v:unknown)=>/^\d{13}$/.test(String(v??""));
const trace=(i:ItemDocumentoEC)=>{
 const d=bytes(i.detalhe),p=bytes(d.perfil);
 return [i.origem??"",String(p.faixa??""),String(d.regra_normativa??""),
  ...memoriasEC(i).map(x=>x.rotulo+": "+x.valor)].filter(Boolean).join(" · ");
};
const perfilEstado=(i:ItemDocumentoEC)=>{const d=bytes(i.detalhe),p=bytes(d.perfil);
 return String(d.classificacao_auditor??p.estado??"Não informado");
};
const identificacao=(i:ItemDocumentoEC)=>i.aih&&validAih(i.aih)?
 i.aih:aihArray(i).map(a=>String(a.aih??"")).filter(validAih).join(", ")||"Não individualizada";

export const SECOES_ANALISE_FASE7=[
 "1. Produção conciliada",
 "2. Correções recebidas",
 "3. Cobranças via ofício à GEMAS",
 "4. Incompatibilidades de faixa e composição",
 "5. Regularizações FPO/reprocessamento",
 "6. Reconciliação do valor atestado",
] as const;

/** Derivação exclusivamente da memória existente. Não distribui valor agregado entre AIHs. */
export function gerarAnaliseSeisSecoesEC(x:ContextoRelatorioFase7){
 const q=quadroAtestoEC(x);
 let html='<article class="sei-formal-document"><h2 style="text-align:center;font:700 17px Arial,sans-serif">'+
 'RELATÓRIO DE ANÁLISE — PLANO DE TRABALHO Nº X — CIRURGIAS ELETIVAS</h2>'+
 para("MINUTA PARA CONFERÊNCIA NO SEI. Não é assinatura nem documento autenticado.")+
 table(["Identificação","Valor"],[
  ["Prestador",x.prestador],["CNES",x.cnes],["Competência analisada",x.competencia],
  ["Relatório Técnico relacionado",String(x.documentos.rtma_numero??"SEI não informado")]])+
 para("Os valores publicados pela SES, esperados pela memória e fiscalmente admitidos "+
 "são apresentados separadamente. O documento descreve a competência sem antecipar "+
 "cobranças nem regularizações ainda não reconhecidas.");
 html+=block(SECOES_ANALISE_FASE7[0])+
 para("Produção hospitalar e ambulatorial por procedimento/AIH e fonte, sem "+
 "dupla contagem do recorte FAEC faixa MAC.");
 const categorias=[...new Set(x.itens.map(i=>i.categoria))];
 for(const cat of categorias){
  const linhas=x.itens.filter(i=>i.categoria===cat);
  html+='<h4 class="inst-subsection">'+esc(rotuloEC(cat))+"</h4>"+
   table(["Procedimento","AIH","Produção SES","Esperado","Admitido","Decisão","Memória/origem"],
    linhas.map(i=>[i.procedimento??"—",identificacao(i),num(Math.round(i.valor_publicado*100)),
      num(Math.round(i.valor_esperado*100)),num(valorConciliadoCentavos(i)),
      i.decisao??"Sem decisão",trace(i)||"Evidência não informada"]));
  if(cat==="faec_fxmac")html+=para("FAEC faixa MAC: parcela de controle; o valor "+
   "não é somado novamente ao atesto.");
  const det=linhas.flatMap(i=>aihArray(i).filter(a=>validAih(a.aih)).map(a=>[
   String(a.aih),i.procedimento??"—",String(a.qt??"Não informado"),
   String(a.proc10??a.proc??i.procedimento??""),
   String(a.val??a.valor??"Valor individual não disponível")]));
  if(det.length)html+=table(["AIH","Procedimento-base","QT","Filho","Valor individual de origem"],
   det);
 }
 html+=block(SECOES_ANALISE_FASE7[1])+
 para("Somente correções recebidas e aprovadas na competência atual compõem "+
 "o atesto; mantém-se a identificação da competência assistencial de origem.");
 const aprovadas=x.correcoes.filter(c=>c.status==="aprovada");
 html+=table(["Origem","AIHs","Referência","SEI","Valor recebido","Situação"],
  aprovadas.length?aprovadas.map(c=>[c.competencia_origem,
   (c.aihs??[]).filter(validAih).join(", ")||"AIH não individualizada",
   c.referencia_origem??"—",c.documento_sei,num(Math.round(c.valor*100)),c.status]):
  [["—","—","—","—","R$ 0,00","Sem correções aprovadas"]]);
 html+=para("Total de correções aprovadas: "+moedaCent(q.correcoesCent)+
 ". Correções em análise, rejeitadas ou duplicadas não integram o atesto.");
 html+=block(SECOES_ANALISE_FASE7[2])+
 para("Diferenças positivas marcadas expressamente para ofício à GEMAS, "+
 "com fundamento fiscal. Valores a cobrar não somam ao atesto enquanto não reconhecidos.");
 const cobrar=x.itens.filter(i=>i.decisao==="oficio"&&!envelopeAuditoria(i)&&
  i.categoria!=="faec_fxmac"&&diferencaACobrarCentavos(i)>0);
 html+=table(["Componente","Procedimento/AIH","Valor solicitado","Motivação","Efeito no RTMA"],
  cobrar.length?cobrar.map(i=>[rotuloEC(i.categoria),
   (i.procedimento??"")+" · "+identificacao(i),
   num(diferencaACobrarCentavos(i)),i.justificativa??"Motivo não informado",
   "Não acrescentado ao atesto"]):
   [["—","Sem diferenças classificadas para cobrança","R$ 0,00","—","Sem acréscimo"]]);
 html+=block(SECOES_ANALISE_FASE7[3])+
 para("Incompatibilidades de faixa/composição, dúvidas de enquadramento "+
 "e memória dos componentes por AIH. Pendências não autorizam crédito sem prova.");
 const faixa=x.itens.filter(i=>["faec_mult","mac_mult"].includes(i.categoria));
 html+=table(["AIH","Faixa","Enquadramento","Achado/justificativa","Destino/estado","Efeito financeiro"],
  faixa.length?faixa.flatMap(i=>{
   const d=bytes(i.detalhe),p=bytes(d.perfil);
   const comunica=(x.comunicacoes??[]).filter(c=>c.referencia===i.id||
    c.aih===i.aih);
   return [ [identificacao(i),String(p.faixa??"Não informada"),perfilEstado(i),
    String(i.justificativa??d.justificativa??"Requer conferência"),
    comunica.length?comunica.map(c=>c.destino+" / "+c.situacao).join("; "):
     "Sem comunicação registrada",
    "Valor reconhecido: "+num(valorConciliadoCentavos(i))] ];
  }):[["—","—","—","Sem múltiplas/sequenciais individuais","—","Sem impacto"]]);
 html+=block(SECOES_ANALISE_FASE7[4])+
 para("Regularizações pendentes não são crédito. Indicar etapa efetiva, "+
 "documento/protocolo e comprovação de recebimento somente quando existente.");
 html+=table(["AIH de origem","Etapa","Valor estimado","Documento SEI","Situação","Efeito RTMA"],
  (x.fluxos??[]).length?(x.fluxos??[]).map(f=>[f.aih,"Etapa "+f.etapa,
   num(Math.round(f.valor_estimado*100)),f.documento_sei??"Não comprovado",f.situacao,
   "Estimativa não incorporada como pagamento"]):
   [["—","Sem fluxos","R$ 0,00","—","—","Sem acréscimo"]]);
 html+=block(SECOES_ANALISE_FASE7[5])+
 para("Amarração das linhas automáticas com o Relatório Técnico. Nenhum valor "+
 "deste quadro pode ser alterado manualmente.");
 html+=table(["Linha do RTMA","Valor consolidado"],
  [...q.linhas.map(l=>[l.nome,moedaCent(l.valorCentavos)]),
   ["Correções recebidas de competências anteriores",moedaCent(q.correcoesCent)],
   ["Valor total a atestar",moedaCent(q.total)],
   ["Diferença contra motor",moedaCent(q.diferenca)]]);
 html+=para(q.diferenca===0?"Reconciliação aritmética concluída em centavos; "+
 "ainda depende de conferência fiscal, fonte SES e SEI.":"INTEGRIDADE: reconciliação "+
 "não coincide em centavos; emissão de atesto deve permanecer bloqueada.");
 html+=para("Fiscal(is) declarado(s) para a Análise: "+
 (Array.isArray(x.documentos.fiscais_analise)?
 x.documentos.fiscais_analise.join("; "):"Não informado")+
 ". Nenhuma assinatura digital ou autenticação SEI é presumida.")+"</article>";
 return html;
}
