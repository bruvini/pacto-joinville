/** Catálogo de evidências preservado do HTML de auditoria de Cirurgias Eletivas. */
export const FONTES_ELETIVAS = [
  {id:"dbf_faec",grupo:"TabWin",rotulo:"Tabulação SIH FAEC",obrigatoria:true},
  {id:"dbf_mac",grupo:"TabWin",rotulo:"Tabulação SIH MAC",obrigatoria:true},
  {id:"dbf_sia",grupo:"TabWin",rotulo:"Tabulação SIA",obrigatoria:false},
  {id:"s_faec",grupo:"SES/SC · Hospitalar",rotulo:"SIH FAEC",obrigatoria:true},
  {id:"s_faec_ms",grupo:"SES/SC · Hospitalar",rotulo:"FAEC múltiplas e sequenciais",obrigatoria:false},
  {id:"s_faec_est",grupo:"SES/SC · Hospitalar",rotulo:"FAEC prêmio estadual",obrigatoria:false},
  {id:"s_mac_faec",grupo:"SES/SC · Hospitalar",rotulo:"FAEC faixa estadual / MAC proc FAEC",obrigatoria:false},
  {id:"s_mac",grupo:"SES/SC · Hospitalar",rotulo:"SIH MAC",obrigatoria:true},
  {id:"s_mac_ms",grupo:"SES/SC · Hospitalar",rotulo:"MAC múltiplas e sequenciais",obrigatoria:false},
  {id:"s_mac_fed",grupo:"SES/SC · Hospitalar",rotulo:"MAC prêmio federal",obrigatoria:false},
  {id:"sia_faec",grupo:"SES/SC · Ambulatorial",rotulo:"SIA FAEC",obrigatoria:false},
  {id:"sia_faec_p",grupo:"SES/SC · Ambulatorial",rotulo:"SIA FAEC puro",obrigatoria:false},
  {id:"sia_mac",grupo:"SES/SC · Ambulatorial",rotulo:"SIA MAC",obrigatoria:false},
  {id:"ec_delib",grupo:"Apoio",rotulo:"EC deliberações especiais",obrigatoria:false},
  {id:"fpo_official",grupo:"Apoio",rotulo:"FPO oficial (Art. 19)",obrigatoria:false},
  {id:"wb_aih",grupo:"Apoio",rotulo:"Workbook AIH",obrigatoria:false},
  {id:"rtma",grupo:"SEI",rotulo:"Relatório Técnico",obrigatoria:false},
  {id:"ra",grupo:"SEI",rotulo:"Relatório de Análise",obrigatoria:false},
  {id:"outros",grupo:"Apoio",rotulo:"Outras evidências",obrigatoria:false},
] as const;
export type FonteId=typeof FONTES_ELETIVAS[number]["id"];
export const fontesObrigatorias=FONTES_ELETIVAS.filter(x=>x.obrigatoria).map(x=>x.id);
export const validarCompetenciaEletivas=(v:string)=>/^(0[1-9]|1[0-2])\/\d{4}$/.test(v);
export const ordemCompetenciaEletivas=(v:string)=>{
  const [m,a]=v.split("/").map(Number);return a*100+m;
};
