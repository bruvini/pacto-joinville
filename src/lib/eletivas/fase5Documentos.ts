import {resumoEncontro,valorConciliadoCentavos,type CorrecaoEC,
  type ItemEC,CATEGORIAS_ELETIVAS} from "./financeiro";
import {sanitizarEvidenciaEC} from "./privacidade";

export type ItemDocumentoEC=ItemEC&{
  id?:string;aih?:string|null;procedimento?:string|null;
  origem?:string|null;detalhe?:unknown;conferido_em?:string|null;
};
export type DocumentoFonteEC={categoria:string;nome_original:string;sha256:string;id?:string};
export type ReferenciaFpoEC={procedimento:string;competencia_programacao:string;
  documento_sei:string;vigencia_inicio:string;vigencia_fim:string;valor_federal_unitario:number};
export type ContextoFase5EC={
  competencia:string;cnes:string;prestador:string;
  documentos:Record<string,unknown>;
  itens:ItemDocumentoEC[];correcoes:CorrecaoEC[];
  fontes?:DocumentoFonteEC[];fpo?:ReferenciaFpoEC[];
};
export type LinhaAtestoEC={id:string;nome:string;valorCentavos:number;itens:number;quantidade:number|null};
export const moedaCent=(v:number)=>(v/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export const numero=(v:number)=>v.toLocaleString("pt-BR");
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:Number(v)||0;
const cent=(v:unknown)=>Math.round(n(v)*100);
const objeto=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const arr=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.map(objeto):[];
export const esc=(x:unknown)=>String(x??"").replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
  .replace(/'/g,"&#39;");
const campo=(x:ContextoFase5EC,k:string,def="")=>String(x.documentos[k]??def).trim();
const nomes=(v:unknown)=>Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):[];
export const rotuloEC=(cat:string)=>CATEGORIAS_ELETIVAS.find(a=>a[0]===cat)?.[1]??cat;
export const grupoEC=(cat:string)=>cat.startsWith("faec_")?"FAEC":cat.startsWith("mac_")?"MAC":"SIA";
const naoControle=(i:ItemDocumentoEC)=>i.categoria!=="faec_fxmac";
export function memoriasEC(i:ItemDocumentoEC){
 const d=objeto(i.detalhe);
 const p=objeto(d.perfil),f=objeto(d.financeiro),orig=objeto(d.origem_ses);
 const res:{rotulo:string;valor:string}[]=[];
 for(const [rotulo,valor] of [
  ["AIHs na tabulação",d.qt_aihs],["Procedimentos internos (QT)",d.qt_procedimentos],
  ["Quantidade publicada SES",d.qt_ses],["Unitário Delib",d.unitario_delib],
  ["Principal",p.principal??d.principal],["Faixa",p.faixa],
  ["Natureza",p.natureza],["Produção local",d.financeiro_local],
  ["Produção SES",d.financeiro_ses],["Complemento previsto",d.complemento_previsto],
  ["Valor estadual publicado",f.estadual_publicado],
  ["Valor esperado independente",f.esperado],["Justificativa do motor",d.justificativa],
  ["Regra",d.regra],["FPO — evidência adicional",d.exige_programacao_fpo===true?
    "Programação efetiva deve ser comprovada":""] ] as [string,unknown][]){
   if(valor!==null&&valor!==undefined&&String(valor)!=="")
     res.push({rotulo,valor:String(valor)});
 }
 for(const [k,v] of Object.entries(orig)){
  const e=objeto(v);res.push({rotulo:"Fonte SES "+k,
   valor:[e.aba,e.celula,e.codigo_original].filter(Boolean).join(" · ")||"Fonte indicada"});
 }
 return res;
}
export function aihsIdentificadasEC(itens:ItemDocumentoEC[]){
 const aihs=new Set<string>();
 for(const i of itens){
  if(!["faec_prod","mac_compl","mac_mult","mac_prod"].includes(i.categoria))continue;
  if(i.aih&&/^\d{13}$/.test(i.aih))aihs.add(i.aih);
  const d=objeto(i.detalhe);
  for(const entry of arr(d.aihs))if(/^\d{13}$/.test(String(entry.aih??"")))
    aihs.add(String(entry.aih));
 }
 return aihs;
}
export function quadroAtestoEC(x:ContextoFase5EC){
 const itens=x.itens;
 const soma=(cats:string[])=>itens.filter(i=>cats.includes(i.categoria))
   .reduce((acc,i)=>acc+valorConciliadoCentavos(i),0);
 const qtd=(cats:string[])=>{
   const ids=aihsIdentificadasEC(itens.filter(i=>cats.includes(i.categoria)));
   return ids.size||null;
 };
 const spec:[string,string,string[]][]=[
  ["faecPC","Produção e Complemento FAEC SIH",["faec_prod","faec_compl"]],
  ["faecMS","Múltiplas e Sequenciais FAEC",["faec_mult"]],
  ["macC","Complemento Tabela MAC",["mac_compl"]],
  ["macMS","Múltiplas e Sequenciais MAC",["mac_mult"]],
  ["fxMac","Produção FAEC com faixa MAC",["mac_fxfaec"]],
  ["macP","Produção MAC",["mac_prod"]],
  ["macFed","MAC faixa Federal",["mac_fxfed"]],
  ["sia","SIA — Produção e Complemento (FAEC + MAC)",["sia_faec","sia_mac"]],
 ];
 const linhas=spec.map(([id,nome,cats])=>({
   id,nome,valorCentavos:soma(cats),itens:itens.filter(i=>cats.includes(i.categoria)).length,
   quantidade:qtd(cats),
 })).filter(l=>l.itens>0);
 const correcoesCent= x.correcoes.filter(c=>!c.status||c.status==="aprovada")
   .reduce((acc,c)=>acc+cent(c.valor),0);
 const totalLinhas=linhas.reduce((acc,l)=>acc+l.valorCentavos,0);
 const resultado=resumoEncontro(itens,x.correcoes);
 const diferenca=resultado.total-(totalLinhas+correcoesCent);
 const aihs=aihsIdentificadasEC(itens);
 const pendencias=itens.filter(i=>!i.conferido_em ||
   i.decisao==="analise"||
   (["div","nc","fora","pendente"].includes(i.situacao)&&!i.decisao));
 return {linhas,correcoesCent,totalLinhas,total:totalLinhas+correcoesCent,
   diferenca,aihsIdentificadas:aihs.size,
   quantidadeConfiavel:aihssuficiente(itens,aihs),
   pendencias,naoConferidos:itens.filter(i=>!i.conferido_em).length};
}
function aihssuficiente(itens:ItemDocumentoEC[],aih:Set<string>){
 const rows=itens.filter(i=>["faec_prod","mac_compl","mac_mult"].includes(i.categoria)
   &&valorConciliadoCentavos(i)>0);
 return rows.length>0&&aih.size>0&&rows.every(i=>{
   const d=objeto(i.detalhe);
   return !!i.aih||arr(d.aihs).length>0||i.categoria==="mac_mult"&&arr(d.aihs).length>0;
 });
}
export function conferirDocumentosEC(x:ContextoFase5EC){
 const q=quadroAtestoEC(x),pend:string[]=[];
 if(q.diferenca!==0)pend.push("O quadro RTMA não coincide com o total do motor.");
 if(q.pendencias.length)pend.push(q.pendencias.length+" item(ns) aguardam conferência ou decisão definitiva.");
 if(!q.quantidadeConfiavel)pend.push("Quantidade global de cirurgias não comprovada por conjunto completo de AIHs.");
 if(!campo(x,"rtma_numero")||!campo(x,"analise_numero"))
   pend.push("Números SEI do RTMA e da Análise ainda não informados.");
 for(const k of ["rtma_link","analise_link"])
   if(!/^https?:\/\//.test(campo(x,k)))pend.push("Link SEI não comprovado: "+k);
 if(nomes(x.documentos.fiscais_rtma).length<2)
   pend.push("RTMA exige declaração de pelo menos dois fiscais distintos.");
 if(new Set(nomes(x.documentos.fiscais_rtma).map(n=>n.toLowerCase())).size<2)
   pend.push("Fiscais do RTMA precisam ser distintos.");
 if(nomes(x.documentos.fiscais_analise).length<1)
   pend.push("Relatório de Análise exige fiscal signatário.");
 if(!campo(x,"parecer"))pend.push("Parecer da Comissão não foi selecionado.");
 if(!campo(x,"amparo"))pend.push("Amparo normativo não informado.");
 if(!campo(x,"portaria_comissao"))pend.push("Portaria da Comissão não informada.");
 return pend;
}
const td=(value:unknown,bold=false)=>"<td style=\"border:1px solid #888;padding:6px 8px;vertical-align:top;"+
 (bold?"font-weight:700;":"")+"\">"+esc(value)+"</td>";
const tr=(vs:unknown[],bold=false)=>"<tr>"+vs.map(v=>td(v,bold)).join("")+"</tr>";
const tabela=(heads:string[],rows:unknown[][])=>
 "<table border=\"1\" style=\"border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11px\">"+
 tr(heads,true)+rows.map(row=>tr(row)).join("")+"</table>";
const sec=(t:string)=>"<h3 style=\"font-family:Arial,sans-serif;font-size:14px;margin:18px 0 7px\">"+esc(t)+"</h3>";
const pp=(v:string)=>"<p style=\"font:12px/1.5 Arial,sans-serif\">"+esc(v)+"</p>";
const mainTitle=(v:string)=>"<h2 style=\"text-align:center;font:700 16px Arial,sans-serif\">"+
 esc(v)+"</h2><p style=\"text-align:center;color:#a54a16\"><strong>MINUTA — depende de conferência documental e assinatura no SEI</strong></p>";
export function gerarRtmaHtmlEC(x:ContextoFase5EC){
 const q=quadroAtestoEC(x),d=x.documentos;
 const parecer=campo(x,"parecer")||"NÃO INFORMADO — MINUTA";
 const dir=[
  ["Proponente",x.prestador],["Oferta de Serviço",campo(x,"oferta",
    "Integração do hospital na rede SUS, conforme instrumento pactuado.")],
  ["Período de Execução (Mês/Ano)",x.competencia],
  ["Parceria nº",campo(x,"parceria","Convênio de Assistência à Saúde nº 107/2021/PMJ")],
  ["Parcela nº",campo(x,"parcela","Atesto complementar — a verificar")],
  ["Objeto Pactuado",campo(x,"objeto","Plano de Trabalho X — Cirurgias Eletivas (verificar aditivos)")],
  ["Amparo Legal",campo(x,"amparo","[Informar norma vigente e documento SEI]")],
  ["Competência",x.competencia],
  ["Quantidade de Cirurgias",q.quantidadeConfiavel?String(q.aihsIdentificadas):
    "A validar por AIH (identificadas "+q.aihsIdentificadas+")"],
 ];
 const financeiras=q.linhas.map(l=>[l.nome,moedaCent(l.valorCentavos)]);
 financeiras.push(["Correções de competências anteriores (somente aprovadas)",
   moedaCent(q.correcoesCent)]);
 financeiras.push(["Valor total calculado — não editável",moedaCent(q.total)]);
 return mainTitle("RELATÓRIO TÉCNICO DE MONITORAMENTO E AVALIAÇÃO")+
  pp("Competência "+x.competencia+" · CNES "+x.cnes+
   " · Referência SEI: "+campo(x,"rtma_numero","[não informado]"))+
  tabela(["Campo","Registro"],dir)+sec("Quadro resumido de valores por competência")+
  tabela(["Linha do atesto","Valor apurado (R$)"],financeiras)+
  pp("Memória calculada a partir dos itens conciliados e das correções aprovadas. "+
   "O recorte FAEC faixa MAC é exclusivamente de controle e não foi somado novamente. "+
   "Qualquer ajuste monetário exige registro específico de correção com origem, SEI e decisão fiscal.")+
  tabela(["Verificação","Descrição"],[
   ["Metodologia","Comparação das tabulações SIH/SIA com publicação SES e evidências congeladas da competência."],
   ["Análise detalhada","Consultar o Relatório de Análise, SEI "+campo(x,"analise_numero","[não informado]")],
   ["Informações pertinentes",campo(x,"informacoes_pertinentes",
     "A publicação estadual e a programação FPO devem ser verificadas documentalmente; não se presumem pagamentos.")],
   ["Parecer da Comissão",parecer],
   ["Portaria de designação",campo(x,"portaria_comissao","[não informada]")],
   ["Fiscais declarados",nomes(d.fiscais_rtma).join("; ")||"[não informados]"],
  ])+
  pp("Proposta de texto da Comissão: "+campo(x,"parecer_texto",
   "Com base na documentação apresentada, submete-se à apreciação da Comissão a memória calculada do encontro de contas."))+
  pp("Parecer, conferência dos documentos, autenticidade de links e assinaturas efetivas "+
   "dependem de verificação no SEI. Este arquivo não certifica assinatura nem libera pagamento.");
}
export function gerarAnaliseHtmlEC(x:ContextoFase5EC){
 const q=quadroAtestoEC(x);
 let html=mainTitle("RELATÓRIO DE ANÁLISE — PLANO DE TRABALHO X · CIRURGIAS ELETIVAS")+
  pp("Competência "+x.competencia+" · CNES "+x.cnes+
     " · SEI: "+campo(x,"analise_numero","[não informado]"))+
  pp("Análise por categoria, procedimento e AIH. Valores estaduais publicados "+
     "distintos de esperados e admitidos. Faixa de controle não entra no total.");
 const cats=[...new Set(x.itens.map(i=>i.categoria))].sort();
 for(const cat of cats){
  const rows=x.itens.filter(i=>i.categoria===cat);
  html+=sec(rotuloEC(cat)+(cat==="faec_fxmac"?" — CONTROLE, NÃO SOMAR":""))+
   tabela(["Procedimento","AIH","Descrição","Publicado","Esperado",
    "Provisório","Situação","Decisão","Conferência"],rows.map(i=>[
     i.procedimento??"—",i.aih??"—",i.descricao,
     moedaCent(cent(i.valor_publicado)),moedaCent(cent(i.valor_esperado)),
     moedaCent(valorConciliadoCentavos(i)),i.situacao,
     i.decisao??"Sem decisão",i.conferido_em?"Conferido":"A conferir"]));
  html+=tabela(["AIH / procedimento","Trilha de cálculo / justificativa"],
    rows.map(i=>[(i.aih??"—")+" · "+(i.procedimento??"—"),
     [...memoriasEC(i).map(m=>m.rotulo+": "+m.valor),
       "Fiscal: "+(i.justificativa??"Sem justificativa"),
       "Origem: "+(i.origem??"—")].join(" | ")]));
  html+=pp("Subtotal fiscal: "+moedaCent(rows.reduce((acc,i)=>
   acc+valorConciliadoCentavos(i),0))+(cat==="faec_fxmac"?
    " (controle informativo, excluído do atesto).":""));
 }
 html+=sec("Quadro de reconciliação com RTMA")+
  tabela(["Componente do atesto","Valor (R$)"],[
   ...q.linhas.map(l=>[l.nome,moedaCent(l.valorCentavos)]),
   ["Correções anteriores aprovadas",moedaCent(q.correcoesCent)],
   ["TOTAL",moedaCent(q.total)],
   ["Diferença contra consolidação do motor",moedaCent(q.diferenca)]]);
 html+=pp(q.diferenca===0?"Amarração aritmética: OK (mesma fonte de valores).":
   "ATENÇÃO: amarração divergente, revisar antes de copiar para o SEI.");
 html+=pp("Fiscais declarados: "+(nomes(x.documentos.fiscais_analise).join("; ")||
   "[não informados]")+". Assinatura efetiva não é certificada neste sistema.");
 return html;
}
export function extrairTextoHtmlEC(html:string){
 return html.replace(/<\/t[rdh]>/gi,"\n").replace(/<\/p>/gi,"\n")
  .replace(/<\/h[1-6]>/gi,"\n").replace(/<[^>]+>/g," ")
  .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"')
  .replace(/&#39;/g,"'").replace(/&amp;/g,"&")
  .replace(/[ \t]{2,}/g," ").trim();
}
export function provenienciaTecnicaEC(x:ContextoFase5EC){
 return x.itens.map(i=>({
   Categoria:i.categoria,Procedimento:i.procedimento??"",
   AIH:i.aih??"",Origem:i.origem??"",
   "Detalhes sanitizados":JSON.stringify(sanitizarEvidenciaEC(i.detalhe??{})),
 })).concat((x.fontes??[]).map(f=>({
   Categoria:f.categoria,Procedimento:"",AIH:"",Origem:f.nome_original,
   "Detalhes sanitizados":"SHA256 "+f.sha256,
 })));
}
