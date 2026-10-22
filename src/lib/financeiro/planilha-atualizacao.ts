/** Consolidação somente leitura. Não transforma pagamento em atestado nem rateia NE anual. */
export type ModuloPlanilha = "convenios" | "piso" | "pvh";
export type LinhaPlanilha = {
  id: string; modulo: ModuloPlanilha; instituicao: string; contrato: string | null;
  contratoChave: string; numeroProcessoSeiMae?: string | null;
  parcela: string | null; competencia: string | null; valorPrevisto: number | null;
  numeroSolicitacaoSei: string | null; linkSolicitacao: string | null; dotacao: string | null; fonte: string | null;
  numeroEmpenho: string | null; numeroEmpenhoSei: string | null; linkEmpenho: string | null; valorEmpenhado: number | null;
  valorAtestado: number | null; valorAnulado: number | null;
  numeroSolicitacaoAnulacaoSei: string | null; linkSolicitacaoAnulacao: string | null;
  numeroAnulacaoSei: string | null; linkAnulacao: string | null; rota: string; nota?: string;
};
export type DadosPlanilha = {
  lancamentos: any[]; pisoCompetencias: any[]; pisoDocumentos: any[];
  pvhCompetencias: any[]; pvhParticipantes: any[]; pvhEmpenhos: any[]; pvhAlocacoes: any[];
};
const str = (v: any): string | null => String(v ?? "").trim() || null;
const num = (v: any): number | null => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const inst = (v: any): string => str((Array.isArray(v) ? v[0] : v)?.nome_instituicao) ?? "Instituição não identificada";
const unicos = (vs: any[]): string | null => [...new Set(vs.map(str).filter(Boolean))].join(", ") || null;
const docsTipo = (ds: any[], tipo: string) => ds.find(d => d.tipo === tipo);
/** Competência mais recente, mesmo quando várias aparecem na linha consolidada. */
export function ordemCompetenciaPlanilha(valor: string | null): number {
  const chaves = [...String(valor ?? "").matchAll(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/g)]
    .map(m => Number(m[2]) * 100 + Number(m[1]));
  return chaves.length ? Math.max(...chaves) : 0;
}
export function ordenarCompetenciasPlanilha(valores: string[]): string[] {
  return [...new Set(valores.flatMap(v => v.split(",").map(c => c.trim()).filter(Boolean)))]
    .sort((a,b) => ordemCompetenciaPlanilha(b)-ordemCompetenciaPlanilha(a) ||
      a.localeCompare(b,"pt-BR"));
}
/** O ID do convênio distingue objetos homônimos, inclusive no filtro cruzado. */
export function opcoesContratoPlanilha(linhas: LinhaPlanilha[], instituicao = "todas", modulo = "todos") {
  const opcoes = new Map<string,string>();
  for (const l of linhas) {
    if (instituicao !== "todas" && l.instituicao !== instituicao) continue;
    if (modulo !== "todos" && l.modulo !== modulo) continue;
    const nome = l.modulo === "piso" ? "Piso da Enfermagem (programa)" :
      l.modulo === "pvh" ? "PVH (programa)" :
      (l.contrato ?? "Convênio sem objeto informado") +
        (l.numeroProcessoSeiMae ? " · SEI " + l.numeroProcessoSeiMae : "");
    opcoes.set(l.contratoChave,nome);
  }
  return [...opcoes].map(([value,label])=>({value,label}))
    .sort((a,b)=>a.label.localeCompare(b.label,"pt-BR") || a.value.localeCompare(b.value));
}

function convenios(lancamentos: any[]): LinhaPlanilha[] {
  const byParent = new Map<string,any[]>();
  const ids = new Set(lancamentos.map(x=>x.id));
  for(const x of lancamentos) if(x.parent_id)
    byParent.set(x.parent_id,[...(byParent.get(x.parent_id)??[]),x]);
  return lancamentos.filter(x=>!x.parent_id||!ids.has(x.parent_id)).map(l=>{
    const kids=byParent.get(l.id)??[];
    const atestos=(kids.length?kids:[l]).map(x=>num(x.valor_atestado)).filter(x=>x!==null);
    const anulacoes=kids.map(x=>num(x.valor_anulado)).filter(x=>x!==null);
    return {
      id:"convenios:"+l.id, modulo:"convenios", instituicao:inst(l.prestadores),
      contrato:str(l.convenios?.objeto),
      contratoChave:str(l.convenio_id) ? "convenio:"+l.convenio_id : "convenio:sem-id:"+(str(l.convenios?.objeto)??"sem-objeto"),
      numeroProcessoSeiMae:str(l.convenios?.numero_processo_sei_mae), parcela:kids.length?unicos(kids.map(x=>x.parcela)):str(l.parcela),
      competencia:kids.length?unicos(kids.map(x=>x.competencia)):str(l.competencia),
      valorPrevisto:num(l.valor_solicitado)??(kids.some(x=>num(x.valor_solicitado)!==null)?kids.reduce((s,x)=>s+Number(x.valor_solicitado??0),0):null),
      numeroSolicitacaoSei:null,linkSolicitacao:str(l.link_solicitacao_sei),dotacao:str(l.dotacao_orcamentaria),
      fonte:str(l.fonte_pagamento),numeroEmpenho:str(l.numero_empenho),numeroEmpenhoSei:null,
      linkEmpenho:str(l.link_empenho_sei),valorEmpenhado:num(l.valor_empenho_liquido),
      valorAtestado:atestos.length?atestos.reduce((s,x)=>s+x,0):null,
      valorAnulado:num(l.valor_anulado)??(anulacoes.length?anulacoes.reduce((s,x)=>s+x,0):null),
      numeroSolicitacaoAnulacaoSei:null,linkSolicitacaoAnulacao:str(l.link_solicitacao_anulacao),
      numeroAnulacaoSei:null,linkAnulacao:str(l.link_anulacao_sei),
      rota:"/lancamentos/"+l.id,
      nota:kids.length?"Empenho pai: atestos de competências filhas consolidados; NE contada uma vez.":
        "O valor da NE usa o campo valor de empenho líquido, quando preenchido.",
    };
  });
}

function piso(competencias:any[], documentos:any[]):LinhaPlanilha[]{
  const ds=new Map<string,any[]>();
  for(const d of documentos)if(d.obrigacao_id)ds.set(d.obrigacao_id,[...(ds.get(d.obrigacao_id)??[]),d]);
  return competencias.flatMap(c=>(c.piso_participantes??[]).flatMap((p:any)=>{
    const os=p.piso_obrigacoes?.length?p.piso_obrigacoes:[null];
    return os.map((o:any,i:number)=>{
      const docs=ds.get(o?.id)??[];
      const ne=docsTipo(docs,"nota_empenho");
      return {
        id:"piso:"+c.id+":"+p.id+":"+(o?.id??i),modulo:"piso" as const,
        instituicao:inst(p.prestadores),contrato:null,contratoChave:"programa:piso",
        parcela:c.tipo_parcela==="decimo_terceiro"?"13ª parcela":"Mensal",competencia:str(c.competencia),
        valorPrevisto:i===0?(num(o?.valor_a_liquidar)??num(p.valor_devido)):null,
        numeroSolicitacaoSei:str(docsTipo(docs,"solicitacao_ne")?.numero_sei),
        linkSolicitacao:str(docsTipo(docs,"solicitacao_ne")?.link_sei),
        dotacao:str(o?.cr_dotacao),fonte:str(o?.fonte),
        numeroEmpenho:str(ne?.numero),numeroEmpenhoSei:str(ne?.numero_sei),linkEmpenho:str(ne?.link_sei),
        valorEmpenhado:num(o?.valor_empenhado),valorAtestado:i===0?num(p.valor_devido):null,
        valorAnulado:num(o?.valor_anulado),
        numeroSolicitacaoAnulacaoSei:str(docsTipo(docs,"solicitacao_anulacao")?.numero_sei),
        linkSolicitacaoAnulacao:str(docsTipo(docs,"solicitacao_anulacao")?.link_sei),
        numeroAnulacaoSei:str(docsTipo(docs,"aviso_anulacao")?.numero_sei),
        linkAnulacao:str(docsTipo(docs,"aviso_anulacao")?.link_sei),
        rota:"/piso/"+c.id,nota:os.length>1?"Piso: valor devido conciliado exibido só na primeira obrigação da instituição para evitar duplicação.":"Piso: atestado representa o devido conciliado.",
      };
    });
  }));
}

function pvh(competencias:any[],participantes:any[],empenhos:any[],alocacoes:any[]):LinhaPlanilha[]{
  const cm=new Map(competencias.map(c=>[c.id,c])),pm=new Map(participantes.map(p=>[p.id,p]));
  const em=new Map(empenhos.map(e=>[e.id,e])),associados=new Set<string>();
  const rows:LinhaPlanilha[]=[];
  const make=(p:any,e:any|null,a:any|null,id:string):LinhaPlanilha=>({
    id,modulo:"pvh",instituicao:inst(p.prestadores),contrato:null,contratoChave:"programa:pvh",parcela:"Mensal",
    competencia:str((cm.get(p.competencia_id) as any)?.competencia),
    valorPrevisto:num(a?.valor_alocado)??num(p.valor_municipal)??num(p.valor_estadual),
    numeroSolicitacaoSei:str(e?.solicitacao_sei_numero),linkSolicitacao:str(e?.solicitacao_sei_link),dotacao:str(e?.cr_dotacao)??str(p.cr_dotacao),
    fonte:str(e?.fonte_recurso)??str(p.fonte_recurso),
    numeroEmpenho:str(e?.numero_ne),numeroEmpenhoSei:str(e?.nota_empenho_sei_numero),linkEmpenho:str(e?.nota_empenho_sei_link),
    valorEmpenhado:num(e?.valor_total),valorAtestado:null,valorAnulado:null,
    numeroSolicitacaoAnulacaoSei:null,linkSolicitacaoAnulacao:null,numeroAnulacaoSei:null,linkAnulacao:null,rota:"/pvh/"+p.competencia_id,
    nota:e?"PVH: valor total da NE pode se repetir entre competências; o previsto é a alocação própria.":
      "PVH: instituição sem NE alocada ou solicitação correspondente.",
  });
  for(const a of alocacoes){
    const p:any=pm.get(a.participante_id),e:any=em.get(a.empenho_id);
    if(!p||!e||!cm.has(p.competencia_id))continue;
    rows.push(make(p,e,a,"pvh:alocacao:"+a.id));associados.add(p.id);
  }
  for(const e of empenhos){
    if(!e.solicitacao_competencia_id)continue;
    const candidatos=participantes.filter(p=>p.competencia_id===e.solicitacao_competencia_id&&p.prestador_id===e.prestador_id);
    for(const p of candidatos){
      if(alocacoes.some(a=>a.empenho_id===e.id&&a.participante_id===p.id))continue;
      rows.push(make(p,e,null,"pvh:solicitacao:"+e.id+":"+p.id));associados.add(p.id);
    }
  }
  for(const p of participantes)if(cm.has(p.competencia_id)&&!associados.has(p.id))
    rows.push(make(p,null,null,"pvh:pendente:"+p.id));
  return rows;
}

export function montarLinhasPlanilha(d:DadosPlanilha):LinhaPlanilha[]{
  return [...convenios(d.lancamentos),...piso(d.pisoCompetencias,d.pisoDocumentos),
    ...pvh(d.pvhCompetencias,d.pvhParticipantes,d.pvhEmpenhos,d.pvhAlocacoes)]
    .sort((a,b)=>ordemCompetenciaPlanilha(b.competencia)-ordemCompetenciaPlanilha(a.competencia)||
      a.instituicao.localeCompare(b.instituicao,"pt-BR")||a.id.localeCompare(b.id));
}
export const COLUNAS_PLANILHA=[
  {chave:"instituicao",titulo:"Instituição",tipo:"texto"},
  {chave:"contrato",titulo:"Contrato / objeto",tipo:"texto"},
  {chave:"parcela",titulo:"Parcela",tipo:"texto"},
  {chave:"competencia",titulo:"Competência",tipo:"texto"},
  {chave:"valorPrevisto",titulo:"Valor previsto / solicitado",tipo:"moeda"},
  {chave:"numeroSolicitacaoSei",titulo:"Nº SEI da solicitação",tipo:"texto"},
  {chave:"linkSolicitacao",titulo:"Link da solicitação",tipo:"link"},
  {chave:"dotacao",titulo:"Dotação",tipo:"texto"},
  {chave:"fonte",titulo:"Fonte",tipo:"texto"},
  {chave:"numeroEmpenho",titulo:"Número do empenho",tipo:"texto"},
  {chave:"numeroEmpenhoSei",titulo:"Nº SEI do empenho",tipo:"texto"},
  {chave:"linkEmpenho",titulo:"Link do empenho",tipo:"link"},
  {chave:"valorEmpenhado",titulo:"Valor empenhado (NE)",tipo:"moeda"},
  {chave:"valorAtestado",titulo:"Valor atestado / conciliado",tipo:"moeda"},
  {chave:"valorAnulado",titulo:"Valor anulado",tipo:"moeda"},
  {chave:"numeroSolicitacaoAnulacaoSei",titulo:"Nº SEI da solicitação de anulação",tipo:"texto"},
  {chave:"linkSolicitacaoAnulacao",titulo:"Link da solicitação de anulação",tipo:"link"},
  {chave:"numeroAnulacaoSei",titulo:"Nº SEI da anulação",tipo:"texto"},
  {chave:"linkAnulacao",titulo:"Link da anulação",tipo:"link"},
] as const;
export type ColunaPlanilha=typeof COLUNAS_PLANILHA[number];
export function celulaPlanilha(l:LinhaPlanilha,c:ColunaPlanilha):string{
  const v=l[c.chave];if(v===null||v===undefined||v==="")return "";
  return c.tipo==="moeda"&&typeof v==="number"
    ?v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})
    :String(v);
}
const seguro=(v:string)=>/^\s*[=+@-]/.test(v)?"'"+v:v;
export function tsvPlanilha(ls:LinhaPlanilha[]):string{
  return [COLUNAS_PLANILHA.map(c=>c.titulo).join("\t"),
    ...ls.map(l=>COLUNAS_PLANILHA.map(c=>seguro(celulaPlanilha(l,c)).replace(/[\t\r\n]+/g," ")).join("\t"))].join("\n");
}
export function csvPlanilha(ls:LinhaPlanilha[]):string{
  const q=(v:string)=>'"'+seguro(v).replace(/"/g,'""').replace(/[\r\n]+/g," ")+'"';
  return "\uFEFF"+[COLUNAS_PLANILHA.map(c=>q(c.titulo)).join(";"),
    ...ls.map(l=>COLUNAS_PLANILHA.map(c=>q(celulaPlanilha(l,c))).join(";"))].join("\r\n");
}
