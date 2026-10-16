import {auditarAihNormativa} from "./eletivas-auditor-faixa.ts";
import {classificacaoCIB,normaNotaFpo,normaParaCompetencia} from "./eletivas-normativas.ts";
/**
 * Motor financeiro do Encontro de Contas de Eletivas — primeira migração do
 * HTML Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado(4).html.
 *
 * Conserva produção FAEC/MAC, complementos simples, SIA e recortes de faixa.
 * Múltiplas e sequenciais só são reconhecidas quando há detalhamento de AIH;
 * sem esse suporte, o motor devolve pendência NÃO conciliada.
 */
export type CatEC =
  | "faec_prod" | "faec_compl" | "faec_mult" | "faec_fxmac"
  | "mac_prod" | "mac_compl" | "mac_mult" | "mac_fxfaec"
  | "mac_fxfed" | "sia_faec" | "sia_mac";

export type RegistroSIH = {
  aih: string; proc: string; valor: number; qt_procedimento?: number;
  proc_original?:string;origem_linha?:number;origem_campo?:string;
  qt_origem?:"workbook_aih"|"dbf"|"presumida_1_sem_qt";
  nome?: string;
};
export type RegistroSIA = { proc: string; qt: number; valor: number; nome?: string;
  proc_original?:string;origem_linha?:number;origem_campo?:string };
export type OrigemCelulaEC={aba:string;celula:string;campo:string;codigo_original:string;cnes:string;
  formula?:boolean;valor_cache?:unknown};
export type MatrizSES = {
  proveniencia?:Record<string,Record<string,OrigemCelulaEC>>;
  fisico: Record<string,number>;
  financeiro: Record<string,number>;
  complemento: Record<string,number>;
  delib: Record<string,number>;
  nomes?: Record<string,string>;
  formulasSemCache?: string[];
  formulasCacheZero?: string[];
  abasSemCnes?:string[];
  ausenteDoPrestador?:boolean;
};
export type ComponenteEC = {
  chave: string; categoria: CatEC; descricao: string;
  procedimento: string | null; aih: string | null;
  valor_publicado: number; valor_esperado: number;
  situacao: "ok" | "info" | "div" | "nc" | "fora" | "pendente";
  detalhe: Record<string,unknown>;
};
export type FonteEC = {
  dbf_faec: RegistroSIH[]; dbf_mac: RegistroSIH[];
  dbf_sia?: RegistroSIA[];
  s_faec: MatrizSES; s_mac: MatrizSES;
  s_faec_est?: MatrizSES; s_mac_fed?: MatrizSES;
  s_mac_faec?: MatrizSES;
  sia_faec?: MatrizSES; sia_faec_p?: MatrizSES; sia_mac?: MatrizSES;
  // Dados detalhados do Estado por AIH quando encontrados em outra etapa do parser.
  mult_faec?: Array<{ aih:string; proc:string; pago:number; esperado:number; filhos?:unknown[];
    publicado_independente?:number|null; evidencia_publicacao?:string }>;
  mult_mac?: { publicado:number; esperado:number; quantidade_local:number; quantidade_estado:number;
    pagas?:number;unitario?:number;eligiveis?:number;excluidas?:number;
    publicado_independente?:boolean };
  workbook_aih?: { rows: Array<{aih:string;proc:string;qt:number;faixa:string;principal:string;
      proc_original?:string;origem_aba?:string;origem_linha?:number}>;
    cib:Record<string,{nature:"Estadual"|"Federal"|"";compl:number;nome:string}> };
  fpo_oficial?: Record<string,{nome:string;fin:string;sigtap:number;federal:number;
    eletiva:string;pct:string;nota5:boolean;aba?:string;linha?:number;codigo_original?:string}>;
  delib_especial?: string[];
  /** Prova externa de fechamento da SES: NÃO alimenta valores de produção. */
  ec_consolidado?: {
    found:boolean;aba:string;linha:number|null;cnes:string;competencia:string;
    competenciaConfere:boolean;valorCompetencia:number;ajustes:number;
    totalEstabelecimento:number;totalDerivado:boolean;conferenciaInterna:boolean;
    origens:{aba:string;celulaValor:string;celulaTotal:string};
  };
  competencia?:string;
};
export type ResultadoEC = {
  itens: ComponenteEC[];
  impedimentos: string[];
  totais: { publicado: number; esperado: number; incontroverso: number };
};

export const proc9 = (v: unknown) => {
  const d=String(v??"").replace(/\D/g,"");
  if (!d) return "";
  if(d.length>=10) return d.slice(0,9);
  if(d.length===9) return d[0]==="0" ? d : ("0"+d).slice(0,9);
  return d.length===8 ? "0"+d : d;
};
export const ENVELOPES_MULT = new Set([
  "041501001","041502003","041502004","041502005","041502006","041502007",
]);
const cent=(v:number)=>Math.round(Number(v??0)*100);
const reais=(centavos:number)=>Math.round(centavos)/100;
const prox=(a:number,b:number)=>Math.abs(a-b)<=2;
const centMapa=(x:Record<string,number>,k:string)=>cent(x[k]??0);
const valor=(x:Record<string,number>,k:string)=>Number(x[k]??0);
const tem=(m:Record<string,number>,k:string)=>Object.prototype.hasOwnProperty.call(m,k);
const dinheiro=(n:number)=>"R$ "+(n/100).toFixed(2).replace(".",",");
const dif=(a:number,b:number)=>dinheiro(Math.abs(a-b));
const admitidoProvisorio=(publicado:number,esperado:number,situacao:ComponenteEC["situacao"])=>
  situacao==="ok"||situacao==="info"?publicado:
  publicado<=2?0:esperado>2?Math.min(publicado,esperado):publicado;

type Grupo = { quantidade:number; procedimentos:number; produzido:number;
  aihs:Array<{aih:string;quantidade:number;valor:number;qt_origem?:RegistroSIH["qt_origem"]}> };
function agregarSIH(rows:RegistroSIH[]):Record<string,Grupo>{
  const map:Record<string,Grupo>={};
  for(const r of rows){
    const k=proc9(r.proc);
    if(!k)continue;
    const q=r.qt_procedimento??1;
    if(!Number.isFinite(q)||q<=0||!Number.isFinite(r.valor)||r.valor<0)
      throw Error("Tabulação SIH com quantidade ou valor inválido.");
    const g=map[k]??(map[k]={quantidade:0,procedimentos:0,produzido:0,aihs:[]});
    g.quantidade++;g.procedimentos+=q;g.produzido+=cent(r.valor);
    g.aihs.push({aih:r.aih,quantidade:q,valor:r.valor,qt_origem:r.qt_origem});
  }
  return map;
}
function agregarSIA(rows:RegistroSIA[]){
  const map:Record<string,{quantidade:number;produzido:number}>={};
  for(const r of rows){
    const k=proc9(r.proc);if(!k)continue;
    if(!Number.isFinite(r.qt)||r.qt<0||!Number.isFinite(r.valor)||r.valor<0)
      throw Error("Tabulação SIA com quantidade/valor inválido.");
    const g=map[k]??(map[k]={quantidade:0,produzido:0});
    g.quantidade+=r.qt;g.produzido+=cent(r.valor);
  }
  return map;
}
const consolidar=(...mapas:Record<string,unknown>[])=>new Set(mapas.flatMap(m=>Object.keys(m)));
export function conciliarEletivas(f:FonteEC):ResultadoEC {
  const itens:ComponenteEC[]=[];
  const impedimentos:string[]=[];
  const faec=agregarSIH(f.dbf_faec),mac=agregarSIH(f.dbf_mac);
  const sia=agregarSIA(f.dbf_sia??[]);
  // CIB versionada: o workbook não redefine o Anexo I/II da competência.
  const normaAtiva=normaParaCompetencia(f.competencia??"");
  if(!normaAtiva)impedimentos.push(
    "Competência sem Anexos CIB versionados no HTML: a classificação financeira"+
    " de múltiplas exige revisão antes de reconhecimento.");
  const perfil=(aih:string)=>auditarAihNormativa(aih,f.competencia??"",f.workbook_aih);
  const push=(cat:CatEC,proc:string, pub:number,exp:number,situacao:ComponenteEC["situacao"],
              detail:Record<string,unknown>,aih:string|null=null,descricao?:string)=>{
    const chave=`${cat}|${aih||proc}`;
    if(itens.some(i=>i.chave===chave))throw Error("Chave duplicada na conciliação: "+chave);
    const fonteSia=(cat==="sia_faec"&&detail.fonte==="sia_faec_p")?
      f.sia_faec_p:f.sia_faec;
    const refFonte=cat.startsWith("faec")?(cat==="faec_fxmac"?f.s_faec_est:f.s_faec)
      :cat.startsWith("mac")?(cat==="mac_fxfed"?f.s_mac_fed:
        cat==="mac_fxfaec"?f.s_mac_faec:f.s_mac)
      :cat==="sia_mac"?f.sia_mac:(fonteSia??f.sia_faec_p);
    const proveniencia=refFonte?.proveniencia;
    const origem=proc&&proveniencia?Object.fromEntries(Object.entries(proveniencia)
      .filter(([,codigos])=>codigos[proc]).map(([sec,codigos])=>[sec,codigos[proc]])):{};
    const resumoFinanceiro={
      estadual_publicado:reais(pub),esperado:reais(exp),
      fiscalmente_admitido_provisorio:reais(cat==="faec_fxmac"?0:
        admitidoProvisorio(pub,exp,situacao)),
      observacao:"Conferência fiscal e decisões posteriores podem alterar o valor admitido.",
      controle_nao_somar:cat==="faec_fxmac",
    };
    const cib=proc?classificacaoCIB(proc,f.competencia??""):null;
    itens.push({chave,categoria:cat,descricao:descricao??proc,procedimento:proc||null,
      aih,valor_publicado:reais(pub),valor_esperado:reais(exp),situacao,
      detalhe:{...detail,regra_normativa:normaAtiva?.rotulo??null,
        norma_vigencia:normaAtiva?[normaAtiva.inicio,normaAtiva.fim]:null,
        classificacao_cib:cib?.classificacao??"Não localizado",
        complemento_cib_informativo:true,
        financeiro:resumoFinanceiro,procedimento_normalizado:proc||null,
        origem_ses:origem,
        origem_sih:((cat.startsWith("faec")?f.dbf_faec:
          cat.startsWith("mac")?f.dbf_mac:[]) as RegistroSIH[])
          .filter(x=>proc9(x.proc)===proc&&(!aih||x.aih===aih))
          .slice(0,30).map(x=>({procedimento_original:x.proc_original??x.proc,
            linha_dbf:x.origem_linha,campo:x.origem_campo,
            qt_origem:x.qt_origem??"presumida_1_sem_qt",
            qt_procedimento:x.qt_procedimento??1})),
      }});

  };
  // FAEC: conciliação física, financeira e de complemento — três grandezas distintas.
  // Os status seguem reconcile() do HTML, com motivos explícitos por procedimento.
  for(const k of consolidar(f.s_faec.fisico,f.s_faec.financeiro,f.s_faec.complemento,faec)){
    const g=faec[k],qt=g?.quantidade??0,qtInterna=g?.procedimentos??qt;
    const qtSes=valor(f.s_faec.fisico,k);
    const financeiroSES=centMapa(f.s_faec.financeiro,k);
    const financeiroLocal=g?.produzido??0;
    const complementoSES=centMapa(f.s_faec.complemento,k);
    const unitario=centMapa(f.s_faec.delib,k);
    const temDelib=tem(f.s_faec.delib,k);
    const envelope=ENVELOPES_MULT.has(k);
    if(!qt&&!qtSes&&!financeiroSES&&!complementoSES)continue;
    const esperadoCompl=Math.round(qtInterna*unitario);
    const cacheZero=(f.s_faec as MatrizSES).formulasCacheZero?.includes(k)??false;
    const complementoConfere=prox(complementoSES,esperadoCompl);
    const fisicoConfere=qt===qtSes ||
      (unitario>0&&complementoConfere&&complementoSES>0) ||
      (unitario===0&&prox(financeiroLocal,financeiroSES));
    const financeiroConfere=prox(financeiroLocal,financeiroSES);
    const apenasSES=qt===0&&(qtSes>0||financeiroSES>0||complementoSES>0);
    const ausenciaSES=qt>0&&qtSes===0&&financeiroSES===0&&complementoSES===0;
    const fora=qt>0&&!temDelib&&ausenciaSES&&!envelope;
    const situacaoProd:ComponenteEC["situacao"]=
      fora?"fora":ausenciaSES?"nc":apenasSES?"info":
      fisicoConfere&&financeiroConfere?"ok":"div";
    const motivoProd=fora?
      "Procedimento tabulado não consta da Delib nem da produção estadual: fora do rol, sem complemento automático.":
      ausenciaSES?"Não contemplado: "+qt+" AIH tabulada(s), sem físico, financeiro ou complemento no EC estadual.":
      apenasSES?"Publicado pela SES sem correspondente na tabulação SIH do mês; verificar competência de origem.":
      (fisicoConfere&&financeiroConfere)?"":
      (!fisicoConfere?"Físico: tabulação "+qt+" AIH × SES "+qtSes+". ":"")+
      (!financeiroConfere?"Financeiro: tabulação "+dinheiro(financeiroLocal)+
        " × SES "+dinheiro(financeiroSES)+" (diferença "+dif(financeiroLocal,financeiroSES)+").":"");
    const detalhe={qt_aihs:qt,qt_procedimentos:qtInterna,qt_ses:qtSes,
      financeiro_local:reais(financeiroLocal),financeiro_ses:reais(financeiroSES),
      unitario_delib:reais(unitario),complemento_previsto:reais(esperadoCompl),
      possui_delib:temDelib,justificativa:situacaoProd==="ok"?"Conciliado":motivoProd,
      regra:"reconcile: faec_prod, físico das AIHs e financeiro separado do complemento",
      quantidade_interna_confirmada:g?.aihs.every(a=>a.qt_origem!=="presumida_1_sem_qt")??false,
      qt_nao_comprovada:(g?.aihs??[]).some(a=>a.qt_origem==="presumida_1_sem_qt")};
    push("faec_prod",k,financeiroSES,financeiroLocal,situacaoProd,detalhe,
      null,f.s_faec.nomes?.[k]??k);
    if(envelope){
      for(const a of g?.aihs??[]){
        if(!f.mult_faec?.some(x=>x.aih===a.aih&&proc9(x.proc)===k)){
          const p=perfil(a.aih);
          if(!p.conferido)impedimentos.push("Múltiplas FAEC "+a.aih+
            ": falta detalhe SES ou composição/faixa verificável no workbook AIH.");
        }
      }
      continue;
    }
    if(unitario>0||complementoSES>0){
      const situacaoCompl:ComponenteEC["situacao"]=
        fora?"fora":ausenciaSES?"nc":apenasSES?"info":complementoConfere?"ok":"div";
      const motivoCompl=situacaoCompl==="ok"?"Complemento conforme físico interno e Delib":
        ausenciaSES?"Não contemplado no complemento estadual para "+qt+
          " AIH; esperado "+dinheiro(esperadoCompl)+".":
        apenasSES?"Complemento publicado pela SES sem tabulação correspondente; investigar competência de origem.":
        complementoSES<esperadoCompl-2?
          "Complemento a menor: "+qtInterna+" procedimento(s) em "+qt+
          " AIH × "+dinheiro(unitario)+" = "+dinheiro(esperadoCompl)+
          "; publicado "+dinheiro(complementoSES)+". Faltam "+dif(esperadoCompl,complementoSES)+".":
          "Complemento a maior: previsto "+dinheiro(esperadoCompl)+
          ", publicado "+dinheiro(complementoSES)+".";
      push("faec_compl",k,complementoSES,esperadoCompl,situacaoCompl,
        {...detalhe,justificativa:motivoCompl,formula_cache_zero:cacheZero,
          regra:"Complemento SIH FAEC = QT interna × Delib (sem somar financeiro de produção)"},
        null,f.s_faec.nomes?.[k]??k);
    }
  }
  for(const m of f.mult_faec??[]){
    const k=proc9(m.proc),p=perfil(m.aih);
    // QT × unitário no arquivo SES NÃO é publicação financeira independente.
    const comprovado=typeof m.publicado_independente==="number"&&
      Number.isFinite(m.publicado_independente)&&!!m.evidencia_publicacao;
    const pub=comprovado?cent(m.publicado_independente!):0;
    const exp=p.conferido&&p.elegivel?cent(p.complemento):0;
    const situacao:ComponenteEC["situacao"]=!p.conferido||!comprovado||
      p.estado!=="ok"?"pendente":prox(pub,exp)?"ok":"div";
    const motivo=!p.conferido||p.estado==="bad"||p.estado==="review"?p.motivo:
      !comprovado?"Soma de procedimentos-filhos SES não comprova valor pago. "+
        "Falta publicação financeira independente por AIH.":
      p.natureza==="Federal"?"Faixa federal: necessário conferir programação FPO efetiva "+
        "antes de imputar responsabilidade à SES.":
      situacao==="ok"?"Publicação SES independente e CIB compatíveis.":
      "SES "+dinheiro(pub)+" × CIB "+dinheiro(exp)+"; diferença "+dif(pub,exp)+".";
    push("faec_mult",k,pub,exp,situacao,{
      origem:"ses_mult_seq",regra_normativa:normaAtiva?.rotulo??null,
      classificacao_auditor:p.estado,principal:p.principal,
      filhos:m.filhos??[],perfil:p,total_filhos_ses:m.pago,
      publicacao_independente:comprovado,evidencia_publicacao:m.evidencia_publicacao??null,
      base_independente_comprovada:p.conferido,
      exige_programacao_fpo:p.natureza==="Federal",
      cobranca_automatica:false,justificativa:motivo,
      regra:"Análise por AIH; SES filhos vs CIB independente; FPO em documento separado",
    },m.aih,"Múltipla/sequencial FAEC — "+m.aih);
  }
  // A ausência na SES não implica automaticamente cobrança: exige enquadramento,
  // inclusive análise federal FPO, conforme retorno da GEMAS ao HTML original.
  for(const [k,g] of Object.entries(faec).filter(([k])=>ENVELOPES_MULT.has(k))){
    for(const a of g.aihs){
      if(f.mult_faec?.some(x=>x.aih===a.aih))continue;
      const p=perfil(a.aih);
      push("faec_mult",k,0,p.conferido&&p.elegivel?cent(p.complemento):0,"pendente",
        {origem:"ausente_ses_mult_seq",perfil:p,
          regra_normativa:normaAtiva?.rotulo??null,classificacao_auditor:p.estado,
          principal:p.principal,filhos:p.filhos,
          publicacao_independente:false,base_independente_comprovada:p.conferido,
          exige_programacao_fpo:p.natureza==="Federal",
          cobranca_automatica:false,
          justificativa:"AIH ausente da publicação SES; ausência não prova dívida estadual. "+p.motivo},
        a.aih,"Múltipla FAEC sem publicação — "+a.aih);
    }
  }
  // MAC: complementos simples, publicação física, fora do rol e produção MC separada.
  for(const k of consolidar(f.s_mac.fisico,f.s_mac.financeiro,f.s_mac.complemento,mac)){
    const g=mac[k],qt=g?.quantidade??0,qtInterna=g?.procedimentos??qt;
    const qtSes=valor(f.s_mac.fisico,k);
    const financeiroSES=centMapa(f.s_mac.financeiro,k),financeiroLocal=g?.produzido??0;
    const complementoSES=centMapa(f.s_mac.complemento,k);
    const unitario=centMapa(f.s_mac.delib,k),comDelib=tem(f.s_mac.delib,k);
    const envelope=ENVELOPES_MULT.has(k);
    if(!qt&&!qtSes&&!financeiroSES&&!complementoSES)continue;
    const somenteSES=qt===0&&(qtSes>0||complementoSES>0||financeiroSES>0);
    const ausenciaSES=qt>0&&!qtSes&&!complementoSES&&!financeiroSES;
    const qtRemunerada=envelope?qt:qtInterna;
    const esperadoCompl=Math.round(qtRemunerada*(envelope?200000:unitario));
    const compConfere=prox(esperadoCompl,complementoSES);
    const fisConfere=qt===qtSes||(esperadoCompl>0&&compConfere&&complementoSES>0)
      ||(esperadoCompl===0&&complementoSES===0);
    const detalhe={qt_aihs:qt,qt_procedimentos:qtInterna,qt_ses:qtSes,
      financeiro_local:reais(financeiroLocal),financeiro_ses:reais(financeiroSES),
      unitario_delib:reais(envelope?200000:unitario),
      complemento_previsto:reais(esperadoCompl),possui_delib:comDelib,
      regra:"reconcile: MAC complemento e produção financeira separados"};
    if(financeiroSES>0){
      const statusProd:ComponenteEC["situacao"]=somenteSES?"info":
        prox(financeiroSES,financeiroLocal)?"ok":"div";
      push("mac_prod",k,financeiroSES,financeiroLocal,statusProd,
        {...detalhe,justificativa:statusProd==="info"?
          "Estado publicou produção MAC sem tabulação correspondente do mês.":
          statusProd==="div"?"Produção MAC: tabulação "+dinheiro(financeiroLocal)+
          " × SES "+dinheiro(financeiroSES)+".":""},null,f.s_mac.nomes?.[k]??k);
    }
    if(envelope&&f.mult_mac)continue; // complemento fixo vem do arquivo próprio
    if(!comDelib&&!envelope){
      if(qt>0)push("mac_compl",k,complementoSES,0,"fora",
        {...detalhe,justificativa:"Sem Delib aplicável: fora do rol do complemento. Produção regular MAC não gera complemento do EC."},
        null,f.s_mac.nomes?.[k]??k);
      else if(complementoSES>0)push("mac_compl",k,complementoSES,0,"info",
        {...detalhe,justificativa:"Complemento estadual sem correspondência na Delib ou tabulação; analisar antes do atesto."},
        null,f.s_mac.nomes?.[k]??k);
      continue;
    }
    if(!unitario&&!complementoSES&&!envelope)continue;
    const sit:ComponenteEC["situacao"]=ausenciaSES&&esperadoCompl>0?"nc":
      somenteSES?"info":compConfere&&fisConfere?"ok":"div";
    const justificativa=sit==="nc"?"Não contemplado: "+qt+
      " AIH com expectativa "+dinheiro(esperadoCompl)+" e ausência total de registro estadual.":
      sit==="info"?"Complemento publicado sem tabulação correspondente; verificar competência de origem.":
      sit==="ok"?"Complemento conforme físico e Delib":
      (!fisConfere?"Físico: tabulação "+qt+" AIH × SES "+qtSes+". ":"")+
      (!compConfere?"Complemento previsto "+dinheiro(esperadoCompl)+
        " × publicado "+dinheiro(complementoSES)+" (diferença "+dif(esperadoCompl,complementoSES)+").":"");
    push(envelope?"mac_mult":"mac_compl",k,complementoSES,esperadoCompl,sit,
      {...detalhe,justificativa},null,f.s_mac.nomes?.[k]??k);
  }
  if(f.mult_mac){
    const m=f.mult_mac;
    const aihs=[...new Set(f.dbf_mac.filter(r=>ENVELOPES_MULT.has(proc9(r.proc)))
      .map(r=>r.aih))];
    const perfis=aihs.map(aih=>({aih,...perfil(aih)}));
    const completos=!!f.workbook_aih&&aihs.length>0&&perfis.every(p=>p.conferido);
    const elegiveis=completos?perfis.filter(p=>p.elegivel):[];
    const unit=Number(m.unitario??0),pub=cent(m.publicado);
    const exp=completos&&unit>0?cent(elegiveis.length*unit):0;
    const federal=perfis.some(p=>p.natureza==="Federal");
    const baseConfirmada=completos&&unit>0&&Number.isInteger(m.pagas)&&
      m.publicado_independente!==false;
    const normaPendente=perfis.some(p=>p.estado!=="ok");
    const situacao:ComponenteEC["situacao"]=!baseConfirmada||federal||normaPendente?
      "pendente":prox(pub,exp)&&m.quantidade_estado===aihs.length?"ok":"div";
    push("mac_mult","041500000",pub,exp,situacao,{
      origem:"s_mac_ms",aihs:perfis,regra_normativa:normaAtiva?.rotulo??null,
      pendencia_normativa:normaPendente,qt_local:aihs.length,
      qt_ses:m.quantidade_estado,qt_pagas:m.pagas,
      qt_elegiveis:elegiveis.length,qt_excluidas:completos?aihs.length-elegiveis.length:null,
      unitario:unit,publicacao_independente:m.publicado_independente!==false,
      base_independente_comprovada:baseConfirmada,
      exige_programacao_fpo:federal,cobranca_automatica:false,
      justificativa:!baseConfirmada?"Valor SES, QT/faixa/CIB por AIH ou unitário "+
        "não foram comprovados independentemente.":federal?
        "Há AIH federal; FPO efetiva deve ser comprovada antes de atribuir valor à SES.":
        situacao==="ok"?"Total estadual confere com AIHs elegíveis × unitário.":
        "Valor SES "+dinheiro(pub)+" × esperado "+dinheiro(exp)+
        ", diferença "+dif(pub,exp)+".",
      regra:"Publicação MAC por hospital + trilha de cada AIH sem alocação individual artificial"},
      "mult","Múltiplas/sequenciais MAC — total estadual");
  }else if(Object.keys(mac).some(k=>ENVELOPES_MULT.has(k))){
    impedimentos.push("Múltiplas MAC encontradas; falta arquivo específico para conferir complemento.");
  }
  // Recortes de financiamento: nunca somar recorte de controle FAEC faixa MAC.
  // Cache zero em fórmula é válido como cache, porém pode ocultar VLOOKUP/IFERROR
  // sem referência: distinguir publicação zero de estimativa Físico × Delib.
  const recortes:[keyof FonteEC,CatEC,"faec"|"mac"][]=[
    ["s_faec_est","faec_fxmac","faec"],["s_mac_faec","mac_fxfaec","mac"],
    ["s_mac_fed","mac_fxfed","mac"],
  ];
  for(const [src,cat,origem] of recortes){
    const mat=f[src] as MatrizSES|undefined;
    if(!mat)continue;
    const meus=origem==="faec"?faec:mac;
    for(const k of consolidar(mat.fisico,mat.complemento)){
      const fis=valor(mat.fisico,k);
      const publicado=centMapa(mat.complemento,k);
      const unit=centMapa(mat.delib,k)||
        (cat==="faec_fxmac"&&ENVELOPES_MULT.has(k)?200000:0);
      const esperado=Math.round(fis*unit);
      if(fis===0&&publicado===0)continue;
      const cacheZero=!!mat.formulasCacheZero?.includes(k);
      const difere=!prox(publicado,esperado);
      const motivo=cacheZero&&fis>0&&unit>0&&publicado===0?
        "Fórmula da SES com cache zero; físico "+fis+" × Delib "+
          dinheiro(unit)+" sugere "+dinheiro(esperado)+
          ". O cache zero não prova pagamento nem autoriza presumir crédito estadual.":
        difere?"Recorte: físico "+fis+" × unitário "+dinheiro(unit)+
          " = "+dinheiro(esperado)+"; complemento efetivamente publicado "+
          dinheiro(publicado)+" (diferença "+dif(publicado,esperado)+").":
        "Recorte de faixa conciliado com referência unitária.";
      push(cat,k,publicado,esperado,difere?"div":"ok",
        {qt_ses:fis,qt_local:meus[k]?.quantidade??0,
          unitario_delib:reais(unit),cache_zero_formula:cacheZero,
          nao_somar:cat==="faec_fxmac",
          procedimento_sem_tabulacao:(meus[k]?.quantidade??0)===0,
          justificativa:motivo,regra:"recorte: físico × Delib; publicação financeira independente"},
        null,mat.nomes?.[k]??k);
    }
  }

  // As duas fontes SIA FAEC podem informar a mesma produção. Sobreposição
  // exatamente igual equivale à mesma publicação, não a dois pagamentos.
  // Se divergem, bloquear a competência com motivo para apuração fiscal.
  const classificacaoSia=new Map<string,CatEC>();
  if(f.dbf_sia?.length&&!f.sia_faec&&!f.sia_faec_p&&!f.sia_mac)
    impedimentos.push("SIA: tabulação DBF importada sem planilha SES FAEC/FAEC puro/MAC correspondente.");
  for(const [cat,fontes] of [
    ["sia_faec",[["sia_faec",f.sia_faec],["sia_faec_p",f.sia_faec_p]]],
    ["sia_mac",[["sia_mac",f.sia_mac]]],
  ] as const){
    const matrizes=fontes.filter((x):x is readonly [string,MatrizSES]=>x[1]!==undefined);
    const allCodes=new Set([
      ...consolidar(...matrizes.flatMap(([,m])=>[
        m.fisico,m.financeiro,m.complemento,
      ])),
      ...Object.keys(sia).filter(k=>matrizes.some(([,m])=>tem(m.delib,k))),
    ]);
    for(const k of allCodes){
      const regioes=matrizes.filter(([,m])=>(
        tem(m.fisico,k)||tem(m.financeiro,k)||tem(m.complemento,k)
      ));
      if(!regioes.length)continue;
      const [fonteEscolhida,mat]=regioes[0];
      if(regioes.length>1){
        const iguais=regioes.every(([,x])=>
          centMapa(x.financeiro,k)===centMapa(mat.financeiro,k)&&
          centMapa(x.complemento,k)===centMapa(mat.complemento,k)&&
          valor(x.fisico,k)===valor(mat.fisico,k)
          &&centMapa(x.delib,k)===centMapa(mat.delib,k));
        if(!iguais){
          impedimentos.push("SIA FAEC "+k+
            ": mesmo procedimento nas fontes FAEC e FAEC puro com físico/financeiro/complemento diferentes. "+
            "Revisar segmentação dos arquivos; a pré-conciliação NÃO foi gravada.");
          continue;
        }
      }
      const local=sia[k],qt=local?.quantidade??0,qtSes=valor(mat.fisico,k);
      const vLocal=local?.produzido??0;
      const vSES=centMapa(mat.financeiro,k),cSES=centMapa(mat.complemento,k);
      const unit=centMapa(mat.delib,k);
      const qCalculada=qt||qtSes;
      const esperadoCompl=Math.round(qCalculada*unit);
      const esperado=vLocal+esperadoCompl,publicado=vSES+cSES;
      if(!qt&&!qtSes&&!vSES&&!cSES)continue;
      const anterior=classificacaoSia.get(k);
      if(anterior&&anterior!==cat){
        impedimentos.push("SIA procedimento "+k+
          ": aparece simultaneamente em FAEC e MAC; confirmar financiamento na SES antes de admitir valor.");
        continue;
      }
      classificacaoSia.set(k,cat);
      const semReferencia=!tem(mat.delib,k);
      const soSES=!qt&&(qtSes>0||vSES>0||cSES>0);
      const semSES=qt>0&&!qtSes&&!vSES&&!cSES;
      const fisConfere=qt===qtSes||(!qt&&qtSes>0)||
        (unit>0&&prox(cSES,Math.round(qtSes*unit)));
      const compConfere=prox(cSES,esperadoCompl);
      const status:ComponenteEC["situacao"]=
        semReferencia&&semSES?"fora":semSES?"nc":soSES?"info":
        fisConfere&&compConfere?"ok":"div";
      const explicacao=status==="fora"?
        "Produção ambulatorial fora do rol da Delib e sem publicação SES; não gera complemento automático.":
        status==="nc"?"Tabulação SIA registra "+qt+
          " procedimento(s), mas a SES não publicou físico, financeiro nem complemento.":
        status==="info"?"Publicação SES sem tabulação SIA no mês; investigar competência de origem.":
        status==="ok"?"Produção ambulatorial e complemento compatíveis dentro de R$ 0,02.":
        (!fisConfere?"Físico SIA "+qt+" × SES "+qtSes+". ":"")+
        (!compConfere?"Complemento: esperado "+dinheiro(esperadoCompl)+
          " × publicado "+dinheiro(cSES)+" (diferença "+dif(esperadoCompl,cSES)+").":"");
      push(cat,k,publicado,esperado,status,
        {fonte:fonteEscolhida,proveniencias:regioes.map(x=>x[0]),
          sobreposicao_idêntica:regioes.length>1,
          qt_local:qt,qt_ses:qtSes,
          producao_local:reais(vLocal),producao_ses:reais(vSES),
          complemento_ses:reais(cSES),
          qt_complemento:qCalculada,unitario_delib:reais(unit),
          complemento_esperado:reais(esperadoCompl),
          possui_delib:!semReferencia,justificativa:explicacao,
          regra:"siaFile: produção financeira + complemento, sem recontar FAEC puro"},
        null,mat.nomes?.[k]??k);
    }
  }
  // Fórmulas publicadas sem valor calculado no XLSX não equivalem a zero.
  // Impedir atesto até a SES fornecer cache válido ou conferência documentada.
  for(const [nome,mat] of [
    ["s_faec",f.s_faec],["s_mac",f.s_mac],
    ["s_faec_est",f.s_faec_est],["s_mac_fed",f.s_mac_fed],
    ["s_mac_faec",f.s_mac_faec],["sia_faec",f.sia_faec],
    ["sia_faec_p",f.sia_faec_p],["sia_mac",f.sia_mac],
  ] as const){
    for(const codigo of mat?.formulasSemCache??[])
      impedimentos.push("SES "+nome+" "+codigo+
        ": complemento tem fórmula sem valor em cache; atualizar o arquivo antes de conciliar.");
  }
  if(f.delib_especial?.length)
    impedimentos.push("EC Deliberações especiais / competência "+(f.competencia??"não informada")+": CNES nas abas "+
      f.delib_especial.join(", ")+". Comprovar norma, vigência e regra por ato/SEI. Não atribuir valores automaticamente.");
  // A FPO é um valor a programar, jamais prova isolada de programação efetiva.
  if(f.fpo_oficial){
    for(const item of itens){
      const ref=item.procedimento?f.fpo_oficial[item.procedimento]:undefined;
      if(ref)item.detalhe.fpo_oficial={...ref,
        cib_complemento:item.procedimento?
          (f.workbook_aih?.cib[item.procedimento]?.compl??null):null,
        programacao_comprovada:false,competencia:f.competencia??null,
        nota5_aplicavel:!!normaNotaFpo(f.competencia??"")&&ref.nota5,
        norma_da_competencia:normaAtiva?.rotulo??null,
        instrumento_fpo:normaNotaFpo(f.competencia??"")?.nota??null,
        classificacao_procedimento:classificacaoCIB(item.procedimento??"",f.competencia??"").classificacao,
        observacao:"FPO oficial é parâmetro, não comprovação da programação efetiva do prestador."};
    }
  }
  // A origem local é pré-conciliação, não confirmação de pagamento.
  // O banco aplica exatamente ec_valor_item na confirmação fiscal e no fechamento.
  const contabilizaveis=itens.filter(i=>i.categoria!=="faec_fxmac");
  return {itens,impedimentos,totais:{
    publicado:reais(contabilizaveis.reduce((a,i)=>a+cent(i.valor_publicado),0)),
    esperado:reais(contabilizaveis.reduce((a,i)=>a+cent(i.valor_esperado),0)),
    incontroverso:reais(contabilizaveis.reduce((a,i)=>
      a+admitidoProvisorio(cent(i.valor_publicado),cent(i.valor_esperado),i.situacao),0)),
  }};
}
