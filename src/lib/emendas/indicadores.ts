/** Indicadores derivados de registros documentais. Nenhum indicador implica execução na SEFAZ. */
type L={id:string;status:string;competencia_inicial:string;periodicidade:string;parcela_inicial:number;created_at:string;updated_at:string;solicitacao_id:string|null;excluido_em?:string|null};
type M={lancamento_id:string;competencia_id:string;parcela_convenio:number;liberacoes_minimas:number};
type E={lancamento_id:string;etapa:string;coord_orcamentos_confirmada?:boolean|null;conferido_em?:string|null};
type P={lancamento_id:string;desfecho:string;ocorrido_em:string};
type A={lancamento_id:string;papel:string};
type N={id:string;status:string;valor_ne:number|null;valor_solicitado:number;numero_ne:string|null};
type V={id:string;lancamento_id:string;competencia_id:string;valor:number;tipo:string};
type G={id:string;lancamento_id:string;competencia_id:string;liberacao_id:string;valor:number};
type T={lancamento_id:string;valor:number};
type C={lancamento_id:string;competencia_id:string};
type Q={lancamento_id:string};
export type DadosIndicadores={
 lancamentos:L[];meses:M[];etapas:E[];pareceres:P[];assinaturas:A[];
 solicitacoes:N[];liberacoes:V[];pagamentos:G[];anulacoes:T[];
 encerramentos:C[];comprovantes:C[];conciliacoes:Q[];
};
export type NivelAlerta="critico"|"atencao"|"informativo";
export type AlertaEmenda={chave:string;lancamentoId:string;nivel:NivelAlerta;titulo:string;detalhe:string};
export type LinhaIndicador={
 id:string;competencia:string;periodicidade:string;parcelaInicial:number;parcelas:number;
 fase:string;status:string;solicitacao:number;reservado:number;ne:number;anulado:number;liberado:number;pago:number;
 conciliado:boolean;criadoEm:string;
};
const centavos=(v:number|null|undefined)=>{
 const n=Number(v??0);
 return Number.isFinite(n)?Math.round(n*100):0;
};
const dias=(data:string,agora:Date)=>{
 const a=new Date(data);
 if(!Number.isFinite(a.getTime()))return 0;
 return Math.max(0,Math.floor((agora.getTime()-a.getTime())/86400000));
};
const papeisObrigatorios=["orcamentos","fiscal","gerencia_acp","diretor_servicos","diretoria_financeira"];
const somar=(values:{valor:number}[])=>values.reduce((s,v)=>s+centavos(v.valor),0);
const resumoFase=(l:L,f:DadosIndicadores):string=>{
 if(f.conciliacoes.some(c=>c.lancamento_id===l.id))return "Conciliado e encerrado";
 if(l.status==="emitido")return "Liberações e pagamentos";
 if(l.status==="formalizado")return "Aguardando NE";
 if(l.status==="cancelado")return "Cancelado";
 const etapas=f.etapas.filter(e=>e.lancamento_id===l.id);
 const dot=etapas.find(e=>e.etapa==="dotacao");
 if(!dot?.coord_orcamentos_confirmada)return "Dotação e fonte";
 const parecer=[...f.pareceres].filter(p=>p.lancamento_id===l.id&&
  p.ocorrido_em>=(dot.conferido_em??"")).sort((a,b)=>b.ocorrido_em.localeCompare(a.ocorrido_em))[0];
 if(parecer?.desfecho!=="aprovado")return "Autorização financeira";
 if(!etapas.some(e=>e.etapa==="solicitacao"))return "Solicitação de empenho";
 const assinados=new Set(f.assinaturas.filter(a=>a.lancamento_id===l.id).map(a=>a.papel));
 if(!papeisObrigatorios.every(p=>assinados.has(p)))return "Assinaturas";
 return "Envio à SEFAZ";
};
export function apurarIndicadoresEmenda(f:DadosIndicadores,agora=new Date()){
 const linhas:LinhaIndicador[]=[];
 const alertas:AlertaEmenda[]=[];
 const alertar=(l:L,nivel:NivelAlerta,codigo:string,titulo:string,detalhe:string)=>{
  alertas.push({chave:l.id+":"+codigo,lancamentoId:l.id,nivel,titulo,detalhe});
 };
 for(const l of f.lancamentos){
  if(l.excluido_em)continue;
  const ms=f.meses.filter(m=>m.lancamento_id===l.id);
  const libs=f.liberacoes.filter(x=>x.lancamento_id===l.id);
  const pags=f.pagamentos.filter(x=>x.lancamento_id===l.id);
  const anul=f.anulacoes.filter(x=>x.lancamento_id===l.id);
  const nota=f.solicitacoes.find(x=>x.id===l.solicitacao_id);
  const fase=resumoFase(l,f);
  const ne=centavos(nota?.valor_ne),liberado=somar(libs),pago=somar(pags),anulado=somar(anul);
  const doc=f.etapas.find(x=>x.lancamento_id===l.id&&x.etapa==="solicitacao");
  const solicitado=centavos(nota?.valor_solicitado)||
    centavos((doc as {valor_solicitado?:number|null}|undefined)?.valor_solicitado);
  const conciliado=f.conciliacoes.some(c=>c.lancamento_id===l.id);
  linhas.push({
   id:l.id,competencia:l.competencia_inicial,periodicidade:l.periodicidade,
   parcelaInicial:l.parcela_inicial,parcelas:ms.length,fase,status:l.status,
   solicitacao:solicitado/100,reservado:nota?.status==="aguardando_ne"?centavos(nota.valor_solicitado)/100:0,ne:ne/100,anulado:anulado/100,
   liberado:liberado/100,pago:pago/100,conciliado,criadoEm:l.created_at,
  });
  if(l.status==="rascunho"){
   if(f.pareceres.filter(p=>p.lancamento_id===l.id).sort((a,b)=>b.ocorrido_em.localeCompare(a.ocorrido_em))[0]?.desfecho==="recusado")
    alertar(l,"atencao","recusa","Parecer financeiro recusado","Aguardando revisão e um novo desfecho registrado.");
   if(dias(l.created_at,agora)>=30)
    alertar(l,"atencao","rascunho-antigo","Lançamento em preparação há 30 dias ou mais",
     "Sinalização gerencial de acompanhamento; não é um prazo legal.");
  }
  if(l.status==="formalizado"&&dias(l.updated_at,agora)>=15)
   alertar(l,"atencao","ne-pendente","Emissão da NE aguardada há 15 dias ou mais",
    "Sinalização gerencial, baseada na última atualização do lançamento.");
  if(ne<anulado+liberado)
   alertar(l,"critico","residual","Anulações e liberações superam a NE",
    "Verifique os registros da Nota de Empenho e os documentos do processo SEI.");
  if(pago>liberado)
   alertar(l,"critico","pagamento-superior","Pagamentos superiores às liberações",
    "Inconsistência financeira: o total pago não pode superar o valor liberado.");
  const idsLiberacao=new Set(libs.map(v=>v.id));
  if(pags.some(p=>!idsLiberacao.has(p.liberacao_id)))
   alertar(l,"critico","pagamento-sem-liberacao","Pagamento sem liberação vinculada",
    "Há bloco de pagamento cuja liberação não pertence a este lançamento.");
  for(const m of ms){
   const ml=libs.filter(x=>x.competencia_id===m.competencia_id);
   const mp=pags.filter(x=>x.competencia_id===m.competencia_id);
   const qtdOriginais=ml.filter(x=>x.tipo==="original").length;
   if(ml.length&&(qtdOriginais!==1))
    alertar(l,"critico","liberacao-original-"+m.competencia_id,"Liberação original inconsistente",
     "A competência possui liberações sem exatamente uma liberação original.");
   if(mp.length&&!f.comprovantes.some(c=>c.lancamento_id===l.id&&c.competencia_id===m.competencia_id))
    alertar(l,"critico","comprovante-"+m.competencia_id,"Pagamento sem comprovante",
     "Não foi localizado comprovante para a competência vinculada ao pagamento.");
   if(conciliado&&!f.encerramentos.some(e=>e.lancamento_id===l.id&&e.competencia_id===m.competencia_id)){
    if(!ml.length||somar(ml)!==somar(mp))
     alertar(l,"critico","mes-nao-quitado-"+m.competencia_id,"Competência não quitada em NE conciliada",
      "Uma nota encerrada contém competência com liberação/pagamento pendentes.");
   }
  }
  if(conciliado&&(ne-anulado!==liberado||liberado!==pago))
   alertar(l,"critico","conciliacao-divergente","Divergência após conciliação",
    "NE líquida, total liberado e total pago devem coincidir.");
  if(l.status==="emitido"&&!conciliado&&!libs.length&&dias(l.updated_at,agora)>=15)
   alertar(l,"informativo","liberacao-pendente","NE sem liberações registradas há 15 dias ou mais",
    "Verifique se há documento de liberação ainda não lançado.");
 }
 const total=(campo:keyof Pick<LinhaIndicador,"solicitacao"|"reservado"|"ne"|"anulado"|"liberado"|"pago">)=>
  linhas.reduce((a,l)=>a+centavos(l[campo]),0)/100;
 alertas.sort((a,b)=>(["critico","atencao","informativo"].indexOf(a.nivel)-
  ["critico","atencao","informativo"].indexOf(b.nivel))||a.titulo.localeCompare(b.titulo,"pt-BR"));
 return {
  linhas,alertas,
  totais:{
   lancamentos:linhas.length,
   preparacao:linhas.filter(l=>l.status==="rascunho").length,
   formalizados:linhas.filter(l=>l.status==="formalizado").length,
   emitidos:linhas.filter(l=>l.status==="emitido").length,
   conciliados:linhas.filter(l=>l.conciliado).length,
   solicitacao:total("solicitacao"),reservado:total("reservado"),ne:total("ne"),anulado:total("anulado"),
   liberado:total("liberado"),pago:total("pago"),
  },
  distribuicao:[...new Set(linhas.map(l=>l.fase))].map(fase=>({
   fase,quantidade:linhas.filter(l=>l.fase===fase).length
  })).sort((a,b)=>b.quantidade-a.quantidade),
 };
}
/** CSV UTF-8 para importação no Excel; texto não pode ser executado como fórmula. */
export function gerarCsvIndicadores(linhas:LinhaIndicador[],emenda:string){
 const cabecalhos=["Emenda","Competência","Periodicidade","Parcela inicial","Quantidade parcelas","Etapa",
  "Situação","Solicitado","Reservado","NE","Anulado","Liberado","Pago","Conciliado","Criado em"];
 const celula=(v:string|number|boolean)=>{
  const valor=typeof v==="number"?v.toFixed(2).replace(".",","):typeof v==="boolean"?(v?"Sim":"Não"):v;
  const seguro=typeof v==="string"&&/^[\s]*[=+\-@\t\r]/.test(valor)?"'"+valor:valor;
  return '"'+seguro.replace(/"/g,'""').replace(/[\r\n]+/g," ")+'"';
 };
 const corpo=linhas.map(l=>[emenda,l.competencia.slice(5,7)+"/"+l.competencia.slice(0,4),
  l.periodicidade,l.parcelaInicial,l.parcelas,l.fase,l.status,l.solicitacao,l.reservado,l.ne,
  l.anulado,l.liberado,l.pago,l.conciliado,l.criadoEm]);
 return "\uFEFF"+[cabecalhos,...corpo].map(l=>l.map(celula).join(";")).join("\r\n")+"\r\n";
}
