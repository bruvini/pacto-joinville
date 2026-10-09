/** Minutas fiscalizatórias baseadas nos itens CONFERIDOS. Não geram atesto ou assinatura. */
import * as XLSX from "xlsx";
import {resumoEncontro,valorConciliadoCentavos,type ItemEC,type CorrecaoEC,
  CATEGORIAS_ELETIVAS} from "./financeiro";

export type LinhaRelatorioEC=ItemEC&{
  procedimento?:string|null;aih?:string|null;origem?:string|null;
  conferido_em?:string|null;detalhe?:unknown;
};
export type ContextoRelatorioEC={
  competencia:string;cnes:string;prestador:string;
  documentos:Record<string,unknown>;correcoes:CorrecaoEC[];
  itens:LinhaRelatorioEC[];
};
const b=(n:number)=>Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const valores=(v:string|number)=>typeof v==="number"?v:Number(v)||0;
const doc=(x:ContextoRelatorioEC,key:string)=>String(x.documentos[key]??"").trim();
const nomes=(x:unknown)=>Array.isArray(x)?x.map(String).filter(Boolean):[];
const valor=(i:LinhaRelatorioEC)=>valorConciliadoCentavos(i)/100;
const pendencias=(x:ContextoRelatorioEC)=>x.itens.filter(i=>
  !i.conferido_em||(["div","nc","fora","pendente"].includes(i.situacao)&&!i.decisao));
const titulo=(x:ContextoRelatorioEC,tipo:string)=>
  (pendencias(x).length?"MINUTA — NÃO UTILIZAR COMO ATESTO\n":"")+
  tipo+"\nCompetência: "+x.competencia+" | Prestador: "+x.prestador+
  " | CNES: "+x.cnes;
const faixa=(i:LinhaRelatorioEC)=>i.categoria==="faec_fxmac";
const detalhe=(i:LinhaRelatorioEC):Record<string,unknown>=>{
  const d=i.detalhe;return d&&typeof d==="object"&&!Array.isArray(d)?
    d as Record<string,unknown>:{};
};
const leg=(cat:string)=>CATEGORIAS_ELETIVAS.find(x=>x[0]===cat)?.[1]??cat;
const fmt=(val:unknown)=>typeof val==="number"?Number(val).toLocaleString("pt-BR"):
  String(val??"—");
const ds=(x:ContextoRelatorioEC)=>
  "Origem: SIH/SUS TabWin (produção hospitalar), arquivos financeiros SES/SC "+
  "e memórias de cálculo anexadas à competência. Valor NÃO substitui conferência e assinatura no SEI.";
export function gerarRtmaEC(x:ContextoRelatorioEC):string{
  const r=resumoEncontro(x.itens,x.correcoes);
  const linhas=[
    ["Produção e complemento FAEC SIH",r.componentes.faec_prod+r.componentes.faec_compl],
    ["Múltiplas e sequenciais FAEC",r.componentes.faec_mult],
    ["Complemento MAC",r.componentes.mac_compl],
    ["Múltiplas e sequenciais MAC",r.componentes.mac_mult],
    ["Produção FAEC com faixa MAC",r.componentes.mac_fxfaec],
    ["Produção MAC",r.componentes.mac_prod],
    ["MAC faixa Federal",r.componentes.mac_fxfed],
    ["SIA — FAEC e MAC",r.sia],
    ["Correções de competências anteriores",r.correcoes],
  ] as const;
  const fisc=nomes(x.documentos.fiscais_rtma);
  return [
    titulo(x,"RELATÓRIO TÉCNICO DE MONITORAMENTO E AVALIAÇÃO"),
    "Processo SEI: "+(doc(x,"rtma_numero")||"[informar número do processo]"),
    "Objeto: Plano de Trabalho nº X — Cirurgias Eletivas. Conferir vigência do convênio e aditivos antes do uso.",
    "Período de execução: "+x.competencia,
    "",
    "QUADRO DE VALORES (R$)",
    ...linhas.filter(([,n])=>n!==0).map(([n,v])=>n+": "+b(v/100)),
    "Total provisório: "+b(r.total/100),
    "",
    "METODOLOGIA",
    "Confronto por procedimento, AIH e componente financeiro entre produção local e valores publicados pela SES/SC.",
    "A produção e o complemento são demonstrados separadamente; recorte FAEC faixa MAC é exclusivamente controle e não foi somado novamente.",
    "Situações não conciliadas preservam somente a parcela incontroversa, segundo decisões fiscalizatórias registradas.",
    ds(x),
    "",
    "PENDÊNCIAS",
    pendencias(x).length?pendencias(x).length+" item(ns) ainda sem conferência/decisão concluída.":
      "Nenhuma pendência de conferência fiscal identificada nos itens apresentados.",
    "",
    "Fiscais declarados no sistema: "+(fisc.join("; ")||"[informar]"),
    "A assinatura digital válida deve ser verificada no SEI.",
  ].join("\n");
}
const camposMemoria=["qt_aihs","qt_procedimentos","qt_ses","unitario_delib",
  "financeiro_local","financeiro_ses","complemento_previsto","qt_local",
  "qt_pagas","qt_elegiveis","qt_excluidas","nao_somar","origem"];
function memo(i:LinhaRelatorioEC){
  const d=detalhe(i);
  return camposMemoria.filter(k=>d[k]!==undefined)
    .map(k=>k+": "+fmt(d[k])).join(" | ");
}
export function gerarRelatorioAnaliseEC(x:ContextoRelatorioEC):string{
  const r=resumoEncontro(x.itens,x.correcoes);
  const grupos=[...new Set(x.itens.map(i=>i.categoria))].sort();
  const cab=titulo(x,"RELATÓRIO DE ANÁLISE — PLANO DE TRABALHO Nº X");
  const blocos=grupos.map(cat=>{
    const itens=x.itens.filter(i=>i.categoria===cat).sort((a,b)=>
      String(a.procedimento??"").localeCompare(String(b.procedimento??""))||
      String(a.aih??"").localeCompare(String(b.aih??"")));
    return [
      "",
      leg(cat)+(cat==="faec_fxmac"?" (somente controle, sem soma no total)":""),
      ...itens.flatMap(i=>[
        (i.procedimento??"—")+(i.aih?" | AIH "+i.aih:"")+" | "+i.descricao,
        "SES "+b(valores(i.valor_publicado))+" | esperado "+b(valores(i.valor_esperado))+
          " | reconhecido provisório "+b(valor(i))+" | "+i.situacao+
          (i.decisao?" | decisão "+i.decisao:"")+
          (i.conferido_em?" | conferido":" | NÃO CONFERIDO"),
        memo(i)||"Memória adicional não preenchida",
        i.justificativa?"Justificativa: "+i.justificativa:"",
      ].filter(Boolean)),
    ].join("\n");
  });
  return [
    cab,ds(x),
    "Valores: FAEC "+b(r.faec/100)+" | MAC "+b(r.mac/100)+
      " | SIA "+b(r.sia/100)+" | Correções "+b(r.correcoes/100),
    "Total provisório "+b(r.total/100),
    "Nota: AIHs e memórias só constam quando presentes nas fontes e no registro auditável.",
    ...blocos,
    "",
    "Relatório de Análise · SEI "+(doc(x,"analise_numero")||"[informar]"),
    "Fiscal(is): "+(nomes(x.documentos.fiscais_analise).join("; ")||"[informar]"),
  ].join("\n");
}
export function gerarOficioEC(x:ContextoRelatorioEC):string{
  const positivos=x.itens.filter(i=>i.decisao==="oficio"&&!faixa(i)&&
    !["041501001","041502003","041502004","041502005","041502006","041502007"]
      .includes(i.procedimento??"")&&
    valores(i.valor_esperado)-valores(i.valor_publicado)>0.02);
  const tecnicos=x.itens.filter(i=>i.decisao==="analise"||
    (i.categoria==="faec_mult"&&i.situacao==="div"));
  const mm=Number(x.competencia.split("/")[0]),year=Number(x.competencia.split("/")[1]);
  const norma=year>2026||(year===2026&&mm>=7)?"399/CIB/2026":"727/CIB/2025";
  const cab=titulo(x,"MINUTA DE OFÍCIO À SES/SC — GEMAS");
  return [cab,
    "Assunto: Encontro de Contas de Cirurgias Eletivas — competência "+x.competencia,
    "Referência normativa a confirmar: Deliberação "+norma+" e atos aplicáveis à competência.",
    "Prezados(as),",
    "Encaminha-se para verificação o confronto entre tabulação local e publicação SES/SC.",
    "",
    "DIVERGÊNCIAS COM COBRANÇA EXPRESSAMENTE SELECIONADA PELO FISCAL",
    ...(positivos.length?positivos.map(i=>
      (i.procedimento??"—")+(i.aih?" AIH "+i.aih:"")+
      " | "+i.descricao+" | esperado "+b(valores(i.valor_esperado))+
      " | publicado "+b(valores(i.valor_publicado))+
      " | diferença preliminar "+b(Math.max(0,valores(i.valor_esperado)-valores(i.valor_publicado)))+
      " | justificativa: "+(i.justificativa??"não informada")):
      ["Nenhum item selecionado para cobrança."]),
    "Total preliminar solicitado: "+b(positivos.reduce((s,i)=>
      s+Math.max(0,valores(i.valor_esperado)-valores(i.valor_publicado)),0)),
    "",
    "SOLICITAÇÕES DE ANÁLISE TÉCNICA (NÃO CONFIGURAM COBRANÇA AUTOMÁTICA)",
    ...(tecnicos.length?tecnicos.map(i=>
      (i.procedimento??"—")+(i.aih?" AIH "+i.aih:"")+
      " | "+i.descricao+" | motivo: "+(i.justificativa??i.situacao)):
      ["Nenhuma análise técnica adicional marcada."]),
    "",
    "Solicita-se a conferência das memórias anexadas e manifestação formal.",
    "Esta minuta não constitui cobrança final nem comprova publicação ou programação FPO.",
  ].join("\n");
}
export function gerarMemoriaXlsxEC(x:ContextoRelatorioEC):XLSX.WorkBook{
  const wb=XLSX.utils.book_new();
  const rows=x.itens.map(i=>({
    Categoria:leg(i.categoria),"Procedimento":i.procedimento??"",
    "AIH":i.aih??"","Descrição":i.descricao,
    "Valor SES R$":valores(i.valor_publicado),"Esperado R$":valores(i.valor_esperado),
    "Valor provisório R$":valor(i),"Situação":i.situacao,
    "Decisão":i.decisao??"","Justificativa":i.justificativa??"",
    "Conferido":i.conferido_em?"SIM":"NÃO",
    "Origem":i.origem??"",
  }));
  const resumo=resumoEncontro(x.itens,x.correcoes);
  const sum=[
    {Componente:"FAEC",Valor:resumo.faec/100},
    {Componente:"MAC",Valor:resumo.mac/100},
    {Componente:"SIA",Valor:resumo.sia/100},
    {Componente:"Correções anteriores",Valor:resumo.correcoes/100},
    {Componente:"Total provisório",Valor:resumo.total/100},
    {Componente:"Pendências sem decisão",Valor:resumo.pendencias.length},
    {Componente:"Itens não conferidos",Valor:x.itens.filter(i=>!i.conferido_em).length},
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(sum),"Resumo");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Conciliação");
  const mem=x.itens.map(i=>({
    Categoria:i.categoria,Procedimento:i.procedimento??"",AIH:i.aih??"",
    ...Object.fromEntries(camposMemoria.map(c=>[c,fmt(detalhe(i)[c])])),
  }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(mem),"Memória Técnica");
  const correcoes=x.correcoes.map(c=>({
    Competencia:c.competencia_origem,Valor:c.valor,SEI:c.documento_sei,Motivo:c.motivo,
  }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(correcoes),"Correções");
  return wb;
}
