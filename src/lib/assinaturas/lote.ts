import {
  SLOTS_PADRAO, SLOTS_ETAPA1, SLOTS_LIBERA_ORC, SLOTS_ETAPA4_F2,
  SLOTS_F2_MINUTA, SLOTS_F2_MEMORANDO, SLOTS_F2_LIQUIDACAO, SLOTS_F2_AVISO,
  type Slot,
} from "@/components/BlocoAssinaturas";
import { SLOTS_SOLICITACAO_EMPENHO_PVH } from "@/lib/pvh/empenhos";
import { SLOTS_MINUTA_PVH, SLOTS_MEMORANDO_PVH } from "@/lib/pvh/etapa2";
import { linkValido, normalizarLinkSei } from "@/lib/sei";

export type TipoAssinaturaLote = "convenios" | "piso" | "pvh_solicitacao" | "pvh_documento" | "pvh_subempenho";
export type ModuloAssinaturasLote = "convenios" | "piso" | "pvh";
export type LinhaAssinaturaLote = {
  key: string; tipo: TipoAssinaturaLote; registroId: string; bloco: string;
  slot: string; label: string; documento: string; competencia: string;
  instituicao: string; linkSei: string; cargos: string[]; manual: boolean;
  cargoManual?: string; opcional: boolean; posicao: number;
};

const nome = (v: any) => (Array.isArray(v) ? v[0] : v)?.nome_instituicao ?? "—";
const ativo = (a: any) => !a.revogado_em;
const mk = (tipo: TipoAssinaturaLote, registroId: string, bloco: string, slot: string,
  posicao: number) => [tipo,registroId,bloco,slot,posicao].join("|");
const labelPiso = (tipo: string) => ({
  solicitacao_ne: "Solicitação de NE", nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Solicitação de Subempenho/Liquidação",
  aviso_liquidacao: "Aviso de Movimento em Liquidação",
  aviso_subempenho: "Aviso de Movimento — Subempenho",
  programacao_pagamento: "Programação de pagamento",
  comprovante_pagamento: "Comprovante de pagamento",
} as Record<string,string>)[tipo] ?? tipo.replaceAll("_"," ");

type Base = Omit<LinhaAssinaturaLote, "key"|"slot"|"label"|"cargos"|"manual"|"cargoManual"|"opcional"|"posicao">;
function adicionar(lista: LinhaAssinaturaLote[], base: Base, slots: Slot[],
  assinaturas: any[]) {
  if (!linkValido(base.linkSei)) return;
  for (const slot of slots) {
    const count = assinaturas.filter(a => a.slot === slot.key).length;
    const limite = slot.min ?? 1;
    for (let i=count; i<limite; i++) {
      lista.push({
        ...base, key: mk(base.tipo,base.registroId,base.bloco,slot.key,i),
        slot:slot.key, label:slot.label, cargos:slot.cargos, manual:!!slot.manual,
        cargoManual:slot.cargoManual, opcional:!!slot.opcional, posicao:i+1,
      });
    }
  }
}
const relTecnico: Slot[] = [
  { key: "fiscal", label: "Fiscal (2 obrigatórias)", cargos: ["Fiscal"], min: 2 },
  { key: "extra", label: "Terceira assinatura (opcional)", cargos: ["Fiscal","Gerente","Coordenador ACP"], opcional: true },
];
const relAnalise: Slot[] = [{key:"fiscal",label:"Fiscal",cargos:["Fiscal"]}];

export function candidatosConvenios(lancamentos: any[], assinaturas: any[], isAcp: boolean, isAco: boolean) {
  const linhas: LinhaAssinaturaLote[]=[];
  const pais = new Set(lancamentos.filter(l=>l.parent_id).map(l=>l.parent_id));
  const blocos = [
    ["etapa1","link_solicitacao_sei","Solicitação"],
    ["libera_orc","link_empenho_sei","Liberação de orçamento"],
    ["etapa4","link_solicitacao_liberacao_sei","Solicitação de liberação"],
    ["etapa5","link_solicitacao_anulacao","Solicitação de anulação"],
    ["f2_minuta","link_minuta_sei","Minuta"],
    ["f2_memorando","link_memorando_sei","Memorando"],
    ["f2_liquidacao","link_solicitacao_liquidacao_sei","Solicitação de liquidação"],
    ["f2_aviso","link_aviso_liquidacao_sei","Aviso de Movimento"],
    ["rel_tecnico","link_relatorio_tecnico_sei","Relatório técnico"],
    ["rel_analise","link_relatorio_analise_sei","Relatório de análise"],
  ] as const;
  for (const l of lancamentos) {
    if(l.concluido||pais.has(l.id))continue;
    const fluxo2=l.convenios?.modelo_fluxo==="fluxo_2";
    for(const [bloco,campo,titulo] of blocos) {
      if(bloco==="libera_orc"?!isAco:!isAcp)continue;
      if(bloco.startsWith("f2_")&&!fluxo2)continue;
      if(["rel_tecnico","rel_analise","etapa4"].includes(bloco)&&fluxo2)continue;
      if(bloco==="etapa1"&&l.sefaz_etapa1_em)continue;
      if(bloco==="libera_orc"&&!l.numero_empenho)continue;
      if(bloco==="etapa5"&&!l.link_solicitacao_anulacao)continue;
      const slots:Slot[]=bloco==="etapa1"?(fluxo2?SLOTS_ETAPA4_F2:SLOTS_ETAPA1):
        bloco==="libera_orc"?SLOTS_LIBERA_ORC:
        bloco==="f2_minuta"?SLOTS_F2_MINUTA:
        bloco==="f2_memorando"?SLOTS_F2_MEMORANDO:
        bloco==="f2_liquidacao"?SLOTS_F2_LIQUIDACAO:
        bloco==="f2_aviso"?SLOTS_F2_AVISO:
        bloco==="rel_tecnico"?relTecnico:
        bloco==="rel_analise"?relAnalise:SLOTS_PADRAO;
      adicionar(linhas,{
        tipo:"convenios",registroId:l.id,bloco,documento:titulo,
        competencia:l.competencia??"",instituicao:nome(l.prestadores),
        linkSei:normalizarLinkSei(l[campo]??""),
      },slots,assinaturas.filter(a=>a.lancamento_id===l.id&&a.bloco===bloco));
    }
  }
  return linhas;
}

export function candidatosPiso(docs:any[], comps:any[], parts:any[], matriz:any[],assinaturas:any[]) {
  const comp=new Map(comps.map(c=>[c.id,c]));
  const part=new Map(parts.map(p=>[p.id,p]));
  const lista:LinhaAssinaturaLote[]=[];
  for(const doc of docs){
    const c=comp.get(doc.competencia_id);
    if(!c||c.status==="encerrada")continue;
    const slots:Slot[]=matriz.filter(m=>m.tipo_documento===doc.tipo)
      .sort((a,b)=>a.ordem-b.ordem).map(m=>({
        key:m.slot_key,label:m.label,cargos:m.cargos??[],manual:m.manual,
        opcional:m.opcional,qualquer:m.qualquer,
        cargoManual:m.manual?(m.slot_key==="comissao"?
          "Membro da Comissão de Gestão e Controle de Despesa":"SEFAZ"):undefined,
      }));
    if(!slots.length)continue;
    adicionar(lista,{
      tipo:"piso",registroId:doc.id,bloco:doc.tipo,documento:labelPiso(doc.tipo),
      competencia:c.competencia, instituicao:nome(part.get(doc.participante_id)?.prestadores)
        .replace(/^—$/,doc.obrigacao_id?"Obrigação financeira":"Competência geral"),
      linkSei:normalizarLinkSei(doc.link_sei),
    },slots,assinaturas.filter(a=>a.documento_id===doc.id));
  }
  return lista;
}

export function candidatosPvh({
  competencias, empenhos, documentos, subempenhos, alocacoes, participantes,
  assinaturasSolicitacao, assinaturasDocumento, assinaturasSub,
}:Record<string,any[]>) {
  const comps=new Map(competencias.map(c=>[c.id,c]));
  const parts=new Map(participantes.map(p=>[p.id,p]));
  const alocs=new Map(alocacoes.map(a=>[a.id,a]));
  const lista:LinhaAssinaturaLote[]=[];
  for(const e of empenhos){
    const c=comps.get(e.solicitacao_competencia_id);
    if(!c||c.status==="encerrada"||e.solicitacao_enviada_sefaz)continue;
    adicionar(lista,{
      tipo:"pvh_solicitacao",registroId:e.id,bloco:"solicitacao_ne",
      documento:"Solicitação de NE",competencia:c.competencia,
      instituicao:nome(e.prestadores),linkSei:normalizarLinkSei(e.solicitacao_sei_link),
    },SLOTS_SOLICITACAO_EMPENHO_PVH.map(s=>({
      key:s.key,label:s.label,cargos:s.cargos,manual:s.manual,cargoManual:s.cargoManual,
      opcional:!s.obrigatoria,
    })),assinaturasSolicitacao.filter(a=>a.empenho_id===e.id&&ativo(a)));
  }
  for(const d of documentos){
    const c=comps.get(d.competencia_id);
    if(!c||c.status==="encerrada")continue;
    const slots=d.tipo_codigo==="minuta_portaria_municipal"?SLOTS_MINUTA_PVH:
      d.tipo_codigo==="memorando_portaria_municipal"?SLOTS_MEMORANDO_PVH:[];
    if(!slots.length)continue;
    adicionar(lista,{
      tipo:"pvh_documento",registroId:d.id,bloco:d.tipo_codigo,
      documento:d.tipo_codigo==="minuta_portaria_municipal"?"Minuta municipal":"Memorando municipal",
      competencia:c.competencia,instituicao:"Competência geral",
      linkSei:normalizarLinkSei(d.link_documento),
    },slots.map(s=>({...s,manual:false})),assinaturasDocumento.filter(a=>a.documento_id===d.id&&ativo(a)));
  }
  for(const sub of subempenhos){
    const a=alocs.get(sub.alocacao_id);const p=parts.get(a?.participante_id);
    const c=comps.get(p?.competencia_id);
    if(!c||c.status==="encerrada")continue;
    for(const [bloco,campo,titulo] of [
      ["solicitacao","solicitacao_sei_link","Solicitação de subempenho"],
      ["movimento_liquidacao","movimento_liquidacao_sei_link","Movimento em liquidação"],
    ] as const){
      const s:Slot[]=[
        {key:"comissao",label:"Comissão",cargos:[],manual:true,
          cargoManual:"Membro da Comissão de Gestão e Controle de Despesa"},
        {key:"fiscal",label:"Fiscal (opcional)",cargos:["Fiscal"],opcional:true},
      ];
      adicionar(lista,{
        tipo:"pvh_subempenho",registroId:sub.id,bloco,documento:titulo,
        competencia:c.competencia,instituicao:nome(p?.prestadores),
        linkSei:normalizarLinkSei(sub[campo]),
      },s,assinaturasSub.filter(x=>x.subempenho_id===sub.id&&x.documento_tipo===bloco&&ativo(x)));
    }
  }
  return lista;
}

export function elegiveisParaLinha(linha:LinhaAssinaturaLote,pool:any[]){
  return pool.filter(p=>p.ativo!==false && linha.cargos.includes(p.cargo));
}

export function resumoCandidatos(linhas:LinhaAssinaturaLote[]){
  const ordem = (l:LinhaAssinaturaLote) => l.bloco==="etapa1"
    ? ({coord_orc:0,fiscal:1,comissao:2,gerente:3,diretor:4,financeira:5} as Record<string,number>)[l.slot]??9 : 0;
  return [...linhas].sort((a,b)=>a.competencia.localeCompare(b.competencia,"pt-BR")||
    a.instituicao.localeCompare(b.instituicao,"pt-BR")||
    a.documento.localeCompare(b.documento,"pt-BR")||ordem(a)-ordem(b)||
    a.label.localeCompare(b.label,"pt-BR"));
}
