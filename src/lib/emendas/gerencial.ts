import type {Tables} from "@/integrations/supabase/types";

export type NeGerencial=Tables<"emenda_f_ne_painel">;
export type SubGerencial=Tables<"emenda_subempenhos">;
export type PagamentoGerencial=Tables<"emenda_pagamento_subempenhos_painel">;
export type ParcelaGerencial=Tables<"emenda_pagamento_parcelas_painel">;
export type DocumentoGerencial=Tables<"emenda_subempenho_documentos_painel">;
export type CompetenciaGerencial=Tables<"emenda_f_competencias_painel">;
export type SolicitacaoGerencial=Tables<"emenda_solicitacoes">;
export type ResumoGerencial=Tables<"emendas_resumo">;
export type TipoPendenciaGerencial=
 |"ne_sem_utilizacao"|"solicitacao_sem_aviso"|"aguardando_pagamento"
 |"pagamento_parcial"|"aguardando_conciliacao"|"saldo_anulavel"
 |"distribuicao_a_rever"|"competencia_pendente"|"documentacao_pendente"
 |"modelo_conflitante";
export type PendenciaGerencial={
 id:string;tipo:TipoPendenciaGerencial;severidade:"critico"|"atencao"|"informativo";
 titulo:string;descricao:string;etapa:string;numeroNe:string;competencia:string;
 lancamentoId:string;subempenhoId:string|null;valorReferencia:number|null;valorPendente:number|null;
 numeroSei:string|null;linkSei:string|null;
};
export type FontesGerenciais={
 nes:NeGerencial[];subempenhos:SubGerencial[];
 pagamentos:PagamentoGerencial[];parcelas:ParcelaGerencial[];
 documentos:DocumentoGerencial[];competencias:CompetenciaGerencial[];
 solicitacoes:SolicitacaoGerencial[];
};
const dinheiro=(v:number|null|undefined)=>Math.round(Number(v??0)*100);
const reais=(v:number)=>v/100;
const positivo=(v:number|null|undefined)=>dinheiro(v)>0;
const https=(v:string|null|undefined)=>typeof v==="string"&&/^https:\/\/\S+$/i.test(v)?v:null;
const prioridade={critico:0,atencao:1,informativo:2};
const relacao=(itens:FontesGerenciais)=>{
 const solicitacoes=new Map(itens.solicitacoes.map(s=>[s.id,s]));
 const neByLanc=new Map(itens.nes.map(n=>[n.lancamento_id,n]));
 const pagamentoBySub=new Map(itens.pagamentos.map(p=>[p.subempenho_id,p]));
 const compById=new Map(itens.competencias.map(c=>[c.lancamento_id+":"+c.competencia_id,c]));
 const docsBySub=new Map<string,DocumentoGerencial[]>();
 const parcelasBySub=new Map<string,ParcelaGerencial[]>();
 for(const d of itens.documentos){if(!d.subempenho_id)continue;
  docsBySub.set(d.subempenho_id,[...(docsBySub.get(d.subempenho_id)??[]),d]);}
 for(const p of itens.parcelas){if(!p.subempenho_id)continue;
  parcelasBySub.set(p.subempenho_id,[...(parcelasBySub.get(p.subempenho_id)??[]),p]);}
 return {solicitacoes,neByLanc,pagamentoBySub,compById,docsBySub,parcelasBySub};
};
export function pendenciasFinanceirasEmenda(itens:FontesGerenciais):PendenciaGerencial[]{
 const m=relacao(itens);
 const rows:PendenciaGerencial[]=[];
 const neLabel=(n:NeGerencial|undefined)=>n?.numero_ne
  ?n.numero_ne+(n.exercicio_ne?"/"+n.exercicio_ne:"")
  :"NE ainda sem número";
 const adicionar=(p:PendenciaGerencial)=>rows.push(p);
 for(const n of itens.nes){
  if(!n.lancamento_id||n.conciliada)continue;
  const sol=m.solicitacoes.get(n.solicitacao_id??"");
  const base={numeroNe:neLabel(n),competencia:"Todas",lancamentoId:n.lancamento_id,
   subempenhoId:null,numeroSei:sol?.numero_sei_ne??null,
   linkSei:https(sol?.link_sei_ne)};
  if(n.modelo_financeiro==="conflito_entre_modelos"){
   adicionar({...base,id:"conflito:"+n.lancamento_id,tipo:"modelo_conflitante",
    severidade:"critico",titulo:"Modelos financeiros conflitantes",
    descricao:"Há execução simultânea nos modelos legado e novo. Conferência obrigatória antes da conciliação.",
    etapa:"NE",valorReferencia:null,valorPendente:null});
  }
  if(positivo(n.valor_ne_emitida)&&!positivo(n.compromissos_novos)
   &&!positivo(n.liberacoes_legadas)&&!positivo(n.pago_liquido_novo)
   &&!positivo(n.pago_legado)){
   adicionar({...base,id:"ne-sem-uso:"+n.lancamento_id,tipo:"ne_sem_utilizacao",
    severidade:"atencao",titulo:"NE emitida sem utilização financeira",
    descricao:"Não há subempenho confirmado/reserva ativa nem liberação; distribuição de competências não é execução.",
    etapa:"NE",valorReferencia:Number(n.ne_liquida??0),valorPendente:Number(n.ne_liquida??0)});
  }
  if(positivo(n.saldo_disponivel_anular)){
   adicionar({...base,id:"anulavel:"+n.lancamento_id,tipo:"saldo_anulavel",
    severidade:"informativo",titulo:"Saldo potencialmente anulável",
    descricao:"Limite financeiro sem compromissos e protegido pelas distribuições ativas. Não é anulação realizada.",
    etapa:"Anulação",valorReferencia:Number(n.ne_liquida??0),
    valorPendente:Number(n.saldo_disponivel_anular)});
  }
  if(dinheiro(n.saldo_a_anular_fechamento)>dinheiro(n.saldo_disponivel_anular)){
   adicionar({...base,id:"rever:"+n.lancamento_id,tipo:"distribuicao_a_rever",
    severidade:"atencao",titulo:"Distribuição não comprometida a revisar",
    descricao:"O valor alocado às competências impede anular integralmente o residual necessário para encerrar a NE.",
    etapa:"Distribuição",valorReferencia:Number(n.distribuido_competencias??0),
    valorPendente:reais(dinheiro(n.saldo_a_anular_fechamento)-dinheiro(n.saldo_disponivel_anular))});
  }
 }
 for(const sub of itens.subempenhos){
  if(sub.status==="cancelado")continue;
  const n=m.neByLanc.get(sub.lancamento_id);
  if(n?.conciliada)continue;
  const comp=m.compById.get(sub.lancamento_id+":"+sub.competencia_id);
  const docs=m.docsBySub.get(sub.id)??[];
  const pg=m.pagamentoBySub.get(sub.id);
  const parcelas=m.parcelasBySub.get(sub.id)??[];
  const aviso=docs.find(d=>d.tipo==="aviso_subempenho");
  const andamento=docs.find(d=>d.tipo==="movimento_liquidacao")??
   docs.find(d=>d.tipo==="solicitacao_liquidacao");
  const doc=aviso??andamento;
  const base={numeroNe:neLabel(n),competencia:comp?.competencia??"",
   lancamentoId:sub.lancamento_id,subempenhoId:sub.id,
   numeroSei:doc?.numero_sei??null,linkSei:https(doc?.link_sei)};
  if(sub.status!=="subempenhado"||!aviso?.conclusao_id){
   adicionar({...base,id:"sem-aviso:"+sub.id,tipo:"solicitacao_sem_aviso",
    severidade:"atencao",titulo:"Solicitação sem Aviso de Subempenho concluído",
    descricao:"Solicitação #"+sub.sequencia+" em "+sub.status.replaceAll("_"," ")+
      ". Verificar documento, assinaturas, encaminhamento e conclusão da cadeia.",
    etapa:"Subempenho",valorReferencia:sub.valor_solicitado,valorPendente:sub.valor_solicitado});
  }else if(pg){
   const pago=dinheiro(pg.valor_pago_liquido);
   const saldo=dinheiro(pg.saldo_a_pagar);
   const progr=parcelas.find(p=>!!p.comprovante_link_sei)??parcelas.find(p=>!!p.programacao_link_sei);
   const evidence=progr?{
    numeroSei:progr.comprovante_numero_sei??progr.programacao_numero_sei??base.numeroSei,
    linkSei:https(progr.comprovante_link_sei??progr.programacao_link_sei)??base.linkSei
   }:base;
   if(saldo>0){
    const parcial=pago>0;
    adicionar({...base,...evidence,id:(parcial?"parcial:":"aguarda:")+sub.id,
     tipo:parcial?"pagamento_parcial":"aguardando_pagamento",
     severidade:"atencao",titulo:parcial?"Pagamento parcial do subempenho":"Subempenho aguardando pagamento",
     descricao:"Solicitação #"+sub.sequencia+" · "+
      (parcial?"Já há comprovante parcial; o restante continua pendente.":
       "Aviso concluído, sem pagamento líquido comprovado para quitar o valor."),
     etapa:"Pagamento",valorReferencia:Number(sub.valor_subempenhado??0),
     valorPendente:reais(saldo)});
   }else if(saldo===0&&!pg.conciliado){
    adicionar({...base,...evidence,id:"conciliar:"+sub.id,tipo:"aguardando_conciliacao",
     severidade:"atencao",titulo:"Subempenho pago, aguardando conciliação",
     descricao:"Pagamento líquido registrado. É necessário confirmar a conferência financeira no SEI.",
     etapa:"Conciliação",valorReferencia:Number(sub.valor_subempenhado??0),valorPendente:0});
   }
  }
  const pendente=docs.filter(d=>d.status_documental!=="concluido");
  if(pendente.length){
   const first=pendente[0];
   adicionar({...base,id:"doc-pendente:"+sub.id,tipo:"documentacao_pendente",
    severidade:"atencao",titulo:"Documentação do subempenho pendente",
    descricao:pendente.length+" subetapa(s) sem conclusão documental e/ou encaminhamento.",
    etapa:"Documentação",valorReferencia:null,valorPendente:null,
    numeroSei:first.numero_sei??base.numeroSei,linkSei:https(first.link_sei)??base.linkSei});
  }
 }
 for(const c of itens.competencias){
  if(c.situacao_competencia!=="pendente"||!c.lancamento_id||!c.competencia_id)continue;
  const ne=m.neByLanc.get(c.lancamento_id);
  if(ne?.conciliada)continue;
  if(positivo(c.valor_distribuido)||Number(c.subempenhos_ativos??0)>0||
    positivo(c.liberado_legado)||positivo(c.pago_legado)||Number(c.documentos_legados??0)>0)continue;
  const sol=m.solicitacoes.get(ne?.solicitacao_id??"");
  adicionar({id:"comp-pendente:"+c.lancamento_id+":"+c.competencia_id,
   tipo:"competencia_pendente",severidade:"informativo",
   titulo:"Competência sem execução ainda não encerrada",
   descricao:"Não há compromissos registrados. Conferir execução e formalizar encerramento sem execução, quando aplicável.",
   etapa:"Competência",numeroNe:neLabel(ne),competencia:c.competencia??"",
   lancamentoId:c.lancamento_id,subempenhoId:null,valorReferencia:null,valorPendente:null,
   numeroSei:sol?.numero_sei_ne??null,linkSei:https(sol?.link_sei_ne)});
 }
 return rows.sort((a,b)=>prioridade[a.severidade]-prioridade[b.severidade]||
  a.numeroNe.localeCompare(b.numeroNe,"pt-BR")||a.id.localeCompare(b.id,"pt-BR"));
}
export function indicadoresFinanceirosEmenda(args:{
 resumo:ResumoGerencial|null;nes:NeGerencial[];pagamentos:PagamentoGerencial[]
}){
 return {
  autorizadoVigente:args.resumo?.valor_autorizado_vigente??null,
  reservadoEmSolicitacoes:args.resumo?.valor_reservado??null,
  empenhado:args.resumo?.valor_empenhado??null,
  subempenhado:reais(args.nes.reduce((sum,n)=>sum+dinheiro(n.subempenhos_confirmados_valor),0)),
  programado:reais(args.pagamentos.reduce((sum,p)=>
   p.status_subempenho==="subempenhado"?sum+dinheiro(p.valor_programado):sum,0)),
  pagoLiquido:reais(args.nes.reduce((sum,n)=>sum+
   dinheiro(n.modelo_financeiro==="modelo_legado"?n.pago_legado:n.pago_liquido_novo),0)),
 };
}
export function competenciaISO(valor:string|null|undefined){
 if(!valor)return "Competência não informada";
 const m=/^(\d{4})-(\d{2})/.exec(valor);
 return m?`${m[2]}/${m[1]}`:valor;
}
export function csvExcelSeguro(cabecalhos:string[],linhas:(string|number|null|undefined)[][]){
 const limpar=(v:string|number|null|undefined)=>{
  const texto=String(v??"").replace(/[\r\n\t]/g," ").trim();
  const seguro=/^[=+\-@]/.test(texto)?"'"+texto:texto;
  return '"'+seguro.replace(/"/g,'""')+'"';
 };
 return "\uFEFFsep=;\r\n"+
  [cabecalhos,...linhas].map(l=>l.map(limpar).join(";")).join("\r\n")+"\r\n";
}
export function csvPendenciasGerenciais(rows:PendenciaGerencial[],numero:string){
 return csvExcelSeguro(
  ["Emenda","Severidade","Tipo","Situação","Etapa","NE","Competência",
   "Valor de referência (R$)","Saldo pendente/anulável (R$)","Documento SEI",
   "Link SEI","ID do lançamento","ID do subempenho","Descrição"],
  rows.map(r=>[numero,r.severidade,r.tipo,r.titulo,r.etapa,r.numeroNe,r.competencia,
   r.valorReferencia?.toFixed(2)??"",r.valorPendente?.toFixed(2)??"",
   r.numeroSei,r.linkSei,r.lancamentoId,r.subempenhoId,r.descricao])
 );
}
export function csvNesGerenciais(nes:NeGerencial[],numero:string){
 return csvExcelSeguro(
  ["Emenda","NE","Exercício","Modelo financeiro","Valor emitido (R$)",
   "NE líquida (R$)","Anulado (R$)","Distribuído (R$)","Comprometido novo (R$)",
   "Liberações legadas (R$)","Subempenhado confirmado (R$)",
   "Pago líquido novo (R$)","Pago legado (R$)","Saldo disponível para anular (R$)",
   "Saldo a anular no encerramento (R$)","Pagamento pendente (R$)",
   "Competências pendentes","Subempenhos pendentes","Subempenhos não conciliados",
   "Documento(s) pendente(s)","Conciliada","Número SEI da conciliação",
   "Link SEI da conciliação","ID do lançamento"],
  nes.map(n=>[numero,n.numero_ne,n.exercicio_ne,n.modelo_financeiro,
   n.valor_ne_emitida?.toFixed(2),n.ne_liquida?.toFixed(2),n.total_anulado?.toFixed(2),
   n.distribuido_competencias?.toFixed(2),n.compromissos_novos?.toFixed(2),
   n.liberacoes_legadas?.toFixed(2),n.subempenhos_confirmados_valor?.toFixed(2),
   n.pago_liquido_novo?.toFixed(2),n.pago_legado?.toFixed(2),
   n.saldo_disponivel_anular?.toFixed(2),n.saldo_a_anular_fechamento?.toFixed(2),
   n.saldo_de_pagamentos_pendentes?.toFixed(2),n.competencias_pendentes,
   n.subempenhos_pendentes,n.subempenhos_nao_conciliados,n.documentos_pendentes,
   n.conciliada?"Sim":"Não",n.conciliacao_numero_sei,n.conciliacao_link_sei,n.lancamento_id])
 );
}

export function csvCompetenciasGerenciais(rows:CompetenciaGerencial[],numero:string){
 return csvExcelSeguro(
  ["Emenda","NE (lançamento ID)","Competência","Parcela","Situação",
   "Valor distribuído (R$)","Compromissos novos (R$)","Pago líquido novo (R$)",
   "Liberado legado (R$)","Pago legado (R$)","Subempenhos ativos",
   "Subempenhos não conciliados","Documentos pendentes",
   "Sem execução documentada","SEI sem execução","Link SEI"],
  rows.map(r=>[numero,r.lancamento_id,competenciaISO(r.competencia),
   r.parcela_convenio,r.situacao_competencia,r.valor_distribuido?.toFixed(2),
   r.compromissos_novos?.toFixed(2),r.pago_liquido_novo?.toFixed(2),
   r.liberado_legado?.toFixed(2),r.pago_legado?.toFixed(2),
   r.subempenhos_ativos,r.subempenhos_nao_conciliados,
   Number(r.documentos_legados_pendentes??0)+Number(r.documentos_novos_pendentes??0),
   r.declarada_sem_execucao?"Sim":"Não",r.encerramento_numero_sei,r.encerramento_link_sei])
 );
}
export function csvPagamentosGerenciais(
 pagamentos:PagamentoGerencial[],parcelas:ParcelaGerencial[],numero:string
){
 const porSub=new Map(pagamentos.map(p=>[p.subempenho_id,p]));
 return csvExcelSeguro(
  ["Emenda","NE (lançamento ID)","Competência ID","Subempenho ID","Seq. Subempenho",
   "Seq. Parcela","Situação","Valor subempenhado (R$)","Programado vigente (R$)",
   "Pago bruto (R$)","Devolvido (R$)","Estornado (R$)","Pago líquido (R$)",
   "Saldo a pagar no subempenho (R$)","Documento programação","Link programação",
   "Documento comprovante","Link comprovante","Data pagamento"],
  parcelas.map(p=>{const sub=porSub.get(p.subempenho_id);
   return [numero,p.lancamento_id,p.competencia_id,p.subempenho_id,sub?.sequencia_subempenho,
    p.sequencia,p.situacao_parcela,sub?.valor_subempenhado?.toFixed(2),
    p.valor_programado?.toFixed(2),p.valor_pago_bruto?.toFixed(2),
    p.valor_devolvido?.toFixed(2),p.valor_estornado?.toFixed(2),
    p.valor_pago_liquido?.toFixed(2),sub?.saldo_a_pagar?.toFixed(2),
    p.programacao_numero_sei,p.programacao_link_sei,
    p.comprovante_numero_sei,p.comprovante_link_sei,p.data_pagamento];
  })
 );
}
