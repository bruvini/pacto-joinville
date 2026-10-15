import {moedaCent,rotuloEC,esc,memoriasEC,type ItemDocumentoEC,
  type ContextoFase5EC} from "./fase5Documentos";
import {valorConciliadoCentavos} from "./financeiro";

export type LinhaEncaminhamentoEC={item:ItemDocumentoEC;valorLiquidoCent:number;
  justificativa:string;referencias:string[];motivoBloqueio?:string};
const cents=(x:unknown)=>Math.round((Number(x)||0)*100);
const objeto=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?
 v as Record<string,unknown>:{};
const moeda=(v:unknown)=>moedaCent(cents(v));
const norma=(x:ContextoFase5EC)=>{
 const explicit=String(x.documentos.deliberacao??"").trim();
 if(explicit)return explicit;
 const [mes,ano]=x.competencia.split("/").map(Number);
 return ano>2026||ano===2026&&mes>=7?
  "Deliberação 399/CIB/2026 — verificar vigência/dispositivos":
  "Deliberação 727/CIB/2025 — verificar vigência/dispositivos";
};
const fontes=(x:ContextoFase5EC,i:ItemDocumentoEC)=>{
 const d=objeto(i.detalhe),src=objeto(d.origem_ses);
 const referencias=(x.fontes??[]).filter(f=>{
  const id=String(d.origem??"");
  return id.includes(f.categoria)||f.categoria.includes(i.categoria.slice(0,3));
 }).map(f=>f.categoria+" · "+f.nome_original+" · SHA "+f.sha256.slice(0,12));
 const origem=Object.entries(src).map(([k,v])=>{
  const o=objeto(v);return k+" "+[o.aba,o.celula].filter(Boolean).join(" / ");
 });
 return [...new Set([norma(x),...referencias,...origem])];
};
const evidenciaIncompleta=(i:ItemDocumentoEC)=>{
 const d=objeto(i.detalhe);
 return i.situacao==="pendente"||d.exige_programacao_fpo===true||
  (i.categoria==="faec_mult"&&d.publicacao_independente!==true)||
  (i.categoria==="mac_mult"&&d.base_independente_comprovada!==true);
};
const descricao=(i:ItemDocumentoEC)=>(
 i.procedimento??"—")+(i.aih?" · AIH "+i.aih:"")+" · "+i.descricao;
export function prepararEncaminhamentoEC(x:ContextoFase5EC){
 const cobrancas:LinhaEncaminhamentoEC[]=[],analises:LinhaEncaminhamentoEC[]=[];
 const alertas:string[]=[];
 for(const i of x.itens){
  if(i.decisao!=="oficio"&&i.decisao!=="analise")continue;
  const diferenca=Math.max(0,cents(i.valor_esperado)-cents(i.valor_publicado));
  const prova=evidenciaIncompleta(i);
  const envelope=i.categoria==="faec_fxmac"||
   objeto(i.detalhe).controle_nao_somar===true;
  const motivacao=(i.justificativa??"").trim();
  const ref=fontes(x,i);
  const linha:LinhaEncaminhamentoEC={item:i,valorLiquidoCent:0,
    justificativa:motivacao,referencias:ref};
  if(i.decisao==="analise"){
   linha.motivoBloqueio="Requer manifestação técnica antes de quantificar eventual valor.";
   analises.push(linha);continue;
  }
  if(!i.conferido_em){
   linha.motivoBloqueio="Conferência fiscal do item ainda não registrada.";
  }else if(envelope){
   linha.motivoBloqueio="Recorte de controle ou envelope: proibição de cobrança duplicada.";
  }else if(prova){
   linha.motivoBloqueio="Falta publicação/composição independente ou programação FPO efetiva.";
  }else if(motivacao.length<10){
   linha.motivoBloqueio="Justificativa fiscal insuficiente.";
  }else if(diferenca<=2){
   linha.motivoBloqueio="Diferença de até R$ 0,02 ou sem saldo positivo; não há cobrança líquida.";
  }
  if(linha.motivoBloqueio){
   analises.push(linha);
   alertas.push("Cobrança não incluída: "+descricao(i)+" — "+linha.motivoBloqueio);
  }else{
   linha.valorLiquidoCent=diferenca;
   cobrancas.push(linha);
  }
 }
 const totalCent=cobrancas.reduce((a,b)=>a+b.valorLiquidoCent,0);
 const assuntoBase="Encontro de Contas — Cirurgias Eletivas HMSJ · "+x.competencia;
 const assunto=totalCent>0?
  assuntoBase+" · Solicitação de regularização financeira"+
   (analises.length?" e análise técnica":""):
  assuntoBase+" · Solicitação de análise técnica";
 const corpo:string[]=[
  "Prezados(as),","",
  "A Secretaria Municipal de Saúde de Joinville encaminha apontamentos "+
  "referentes ao Encontro de Contas das Cirurgias Eletivas do Hospital Municipal São José "+
  "(CNES "+x.cnes+"), competência "+x.competencia+".",
  "",
 ];
 if(cobrancas.length){
  corpo.push("I. DIFERENÇAS FINANCEIRAS FUNDAMENTADAS PARA REVISÃO");
  for(const l of cobrancas)corpo.push(
   descricao(l.item)+" | Categoria: "+rotuloEC(l.item.categoria)+
   " | Esperado: "+moeda(l.item.valor_esperado)+
   " | Publicado: "+moeda(l.item.valor_publicado)+
   " | Valor líquido solicitado: "+moedaCent(l.valorLiquidoCent)+
   " | Motivo fiscal: "+l.justificativa+
   " | Fonte/norma: "+l.referencias.join("; "));
  corpo.push("Valor líquido total solicitado: "+moedaCent(totalCent),"");
 }else{
  corpo.push("Não há valor líquido apto a cobrança nesta minuta. "+
   "Nenhuma solicitação financeira será apresentada como crédito definido.","");
 }
 if(analises.length){
  corpo.push("II. OCORRÊNCIAS PARA ANÁLISE TÉCNICA — NÃO SOMAR À COBRANÇA");
  for(const l of analises)corpo.push(
   descricao(l.item)+" | Categoria: "+rotuloEC(l.item.categoria)+
   " | Situação: "+l.item.situacao+
   " | Valor estadual: "+moeda(l.item.valor_publicado)+
   " | Esperado de referência: "+moeda(l.item.valor_esperado)+
   " | Motivo: "+(l.motivoBloqueio??l.justificativa)+
   " | Evidência: "+memoriasEC(l.item).map(m=>m.rotulo+"="+m.valor).join("; ")+
   " | Referências: "+l.referencias.join("; "));
  corpo.push("");
 }
 corpo.push("Referências: arquivos SES/SC e tabulações SIH/SIA congelados na "+
  "competência; "+norma(x)+". Os documentos oficiais e a vigência normativa "+
  "devem ser conferidos antes do envio.");
 corpo.push("Solicitamos retorno quanto às diferenças financeiras efetivamente "+
  "identificadas e/ou orientação sobre os casos sujeitos à análise técnica.","",
  "Atenciosamente,","Secretaria Municipal de Saúde de Joinville",
  "MINUTA — revisar destinatário, assinaturas e documentos no SEI antes do envio.");
 return {assunto,corpo:corpo.join("\n"),cobrancas,analises,alertas,totalCent,
  valorZero:totalCent===0};
}
const tabela=(headers:string[],rows:string[][])=>{
 const cell=(v:string)=>"<td style=\"border:1px solid #888;padding:6px 7px\">"+esc(v)+"</td>";
 return "<table style=\"border-collapse:collapse;width:100%;font:11px Arial\" border=\"1\">"+
  "<tr>"+headers.map(cell).join("")+"</tr>"+
  rows.map(r=>"<tr>"+r.map(cell).join("")+"</tr>").join("")+"</table>";
};
export function gerarEncaminhamentoHtmlEC(x:ContextoFase5EC){
 const r=prepararEncaminhamentoEC(x);
 let html="<h2 style=\"font:700 15px Arial\">ENCAMINHAMENTO À SES/SC — MINUTA</h2>"+
  "<p><strong>Assunto:</strong> "+esc(r.assunto)+"</p>"+
  "<p>Secretaria Municipal de Saúde de Joinville — HMSJ · CNES "+esc(x.cnes)+
  " · Competência "+esc(x.competencia)+"</p>";
 if(r.cobrancas.length){
  html+="<h3>Diferenças financeiras aptas a revisão/regularização</h3>"+
   tabela(["Código/AIH","Categoria","Esperado","Publicado","Líquido","Motivo / fonte"],r.cobrancas.map(l=>[
    descricao(l.item),rotuloEC(l.item.categoria),
    moeda(l.item.valor_esperado),moeda(l.item.valor_publicado),moedaCent(l.valorLiquidoCent),
    l.justificativa+" | "+l.referencias.join("; ")]));
 }
 html+="<p><strong>Valor líquido solicitado:</strong> "+moedaCent(r.totalCent)+"</p>";
 if(r.valorZero)html+="<p><strong>Atenção: cobrança financeira R$ 0,00.</strong> "+
  "Não apresentar como dívida reconhecida.</p>";
 if(r.analises.length)html+="<h3>Análises técnicas, sem cobrança automática</h3>"+
  tabela(["Código/AIH","Status","Valor de referência","Providência"],r.analises.map(l=>[
   descricao(l.item),l.item.situacao,moeda(l.item.valor_esperado),
   (l.motivoBloqueio??l.justificativa)+" | "+l.referencias.join("; ")]));
 html+="<p>Fontes SES/SC, SIH/SIA e fundamentos informados requerem conferência"+
  " documental. Esta minuta não comprova pagamento nem substitui envio/assinatura no SEI.</p>";
 return html;
}
