import { hrefSei, linkValido, normalizarLinkSei } from "@/lib/sei";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Emenda = Tables<"emendas">;
export type EmendaInserir = TablesInsert<"emendas">;
export type EmendaDocumento = Tables<"emenda_documentos">;
export type EmendaFonte = Tables<"emenda_fontes">;
export type EmendaAjuste = Tables<"emenda_ajustes_valor">;

export const SITUACOES = ["cadastrada","ativa","suspensa","encerrada"] as const;
export const MODALIDADES_EMENDA = [
  "Individual", "Bancada", "Comissão", "Relator", "Outra modalidade",
] as const;
export const ORIGENS_RECURSO_EMENDA = [
  "Federal", "Estadual", "Municipal", "Outra origem",
] as const;
export const PERIODICIDADES = ["mensal","trimestral","anual"] as const;
export const CATEGORIAS_DOCUMENTO = ["normativa","administrativa","processo","financeira","outros"] as const;

export type CadastroEmenda = Pick<Emenda,
  "numero" | "exercicio" | "modalidade" | "autoria_parlamentar" | "origem_recurso" |
  "objeto" | "finalidade" | "descricao" | "valor_autorizado_inicial" | "valor_rendimento" |
  "numero_portaria_municipal" | "portaria_municipal_numero_sei" | "portaria_municipal_link_sei" |
  "situacao" | "prestador_id" | "convenio_id" | "termo_aditivo_id" |
  "numero_proposta" | "data_publicacao" | "competencia_inicial" | "periodicidade_padrao" |
  "prazo_execucao_dias" | "exige_atesto" | "responsavel_id" |
  "processo_sei_numero" | "processo_sei_link" | "observacoes"
>;
export const formularioVazioEmenda = (ano=new Date().getFullYear()): CadastroEmenda => ({
  numero:"", exercicio:ano, modalidade:"", autoria_parlamentar:"",
  origem_recurso:"", objeto:"", finalidade:"", descricao:"",
  valor_autorizado_inicial:0, valor_rendimento:0, numero_portaria_municipal:null, portaria_municipal_numero_sei:null, portaria_municipal_link_sei:null,
  situacao:"cadastrada", prestador_id:"",
  convenio_id:null, termo_aditivo_id:null, numero_proposta:null,
  data_publicacao:null, competencia_inicial:null, periodicidade_padrao:"mensal",
  prazo_execucao_dias:null, exige_atesto:true, responsavel_id:null,
  processo_sei_numero:null, processo_sei_link:null, observacoes:"",
});
/** URL apresentada pelo SEI, com esquema HTTPS explícito exigido pelo PostgreSQL.
 * A verificação do valor ORIGINAL acontece antes de acrescentar o esquema.
 */
export function normalizarLinkHttpsSei(url: string | null | undefined): string | null {
  const original = normalizarLinkSei(url);
  if (!original) return null;
  if (!linkValido(original)) return original;
  const completo = hrefSei(original);
  return completo.startsWith("https://") ? completo : original;
}

export function linkHttpsValido(url: string | null | undefined) {
  const original = normalizarLinkSei(url);
  if (!original) return true;
  const normalizado = normalizarLinkHttpsSei(original);
  return normalizado !== null &&
    normalizado.startsWith("https://") && linkValido(normalizado);
}
export function normalizarCadastroEmenda(d:CadastroEmenda):CadastroEmenda {
  const trim=(value:string|null)=>value?.trim()||null;
  return {
    ...d,
    numero:d.numero.trim(),exercicio:anoDaEmenda(d.numero,d.exercicio),modalidade:d.modalidade.trim(),
    autoria_parlamentar:d.autoria_parlamentar.trim(),origem_recurso:d.origem_recurso.trim(),
    objeto:d.objeto.trim(),finalidade:d.finalidade.trim(),descricao:d.descricao.trim(),
    prestador_id:d.prestador_id,
    convenio_id:trim(d.convenio_id),termo_aditivo_id:trim(d.termo_aditivo_id),
    numero_proposta:trim(d.numero_proposta),data_publicacao:trim(d.data_publicacao),
    competencia_inicial:trim(d.competencia_inicial),processo_sei_numero:trim(d.processo_sei_numero),
    processo_sei_link:normalizarLinkHttpsSei(d.processo_sei_link),
    numero_portaria_municipal:trim(d.numero_portaria_municipal),
    portaria_municipal_numero_sei:trim(d.portaria_municipal_numero_sei),
    portaria_municipal_link_sei:normalizarLinkHttpsSei(d.portaria_municipal_link_sei),
    prazo_execucao_dias:d.prazo_execucao_dias||null,
    exige_atesto:true,
    observacoes:d.observacoes.trim(),
  };
}
export function validarCadastroEmenda(d:CadastroEmenda, editando=false):string[] {
  const erros:string[]=[];
  if(d.numero.trim().length<3)erros.push("Informe o número da emenda.");
  if(!Number.isInteger(d.exercicio)||d.exercicio<2000||d.exercicio>2100)erros.push("Exercício inválido.");
  if(!d.prestador_id)erros.push("Selecione a instituição.");
  if(d.modalidade.trim().length<2)erros.push("Informe a modalidade.");
  if(d.autoria_parlamentar.trim().length<2)erros.push("Informe a autoria parlamentar.");
  if(d.origem_recurso.trim().length<2)erros.push("Informe a origem do recurso.");
  if(d.objeto.trim().length<3)erros.push("Descreva o objeto.");
  if(!Number.isFinite(d.valor_rendimento)||d.valor_rendimento<0)
    erros.push("Rendimento deve ser zero ou positivo.");
  if(!editando && (!Number.isFinite(d.valor_autorizado_inicial)||d.valor_autorizado_inicial<=0))
    erros.push("Informe o valor autorizado inicial, maior que zero.");
  if(d.termo_aditivo_id && !d.convenio_id)erros.push("Um termo aditivo exige convênio.");
  if(d.competencia_inicial && !/^(0[1-9]|1[0-2])\/20\d{2}$/.test(d.competencia_inicial))
    erros.push("Competência inicial: use MM/AAAA.");
  if(d.prazo_execucao_dias && (!Number.isInteger(d.prazo_execucao_dias)||d.prazo_execucao_dias<1||d.prazo_execucao_dias>3650))
    erros.push("Prazo de execução inválido.");
  if(!linkHttpsValido(d.processo_sei_link))erros.push("Informe um link SEI HTTPS válido.");
  if(!linkHttpsValido(d.portaria_municipal_link_sei))erros.push("Link da portaria municipal deve utilizar HTTPS.");
  // Espelha os limites das constraints do PostgreSQL para não depender de erro 400.
  const limites = [
    [d.numero,50,"Número da emenda"],
    [d.modalidade,120,"Modalidade"],
    [d.autoria_parlamentar,200,"Autoria parlamentar"],
    [d.origem_recurso,160,"Origem do recurso"],
    [d.objeto,1000,"Objeto"],
  ] as const;
  for (const [valor,limite,campo] of limites)
    if (valor.length>limite) erros.push(`${campo}: limite de ${limite} caracteres.`);
  if(d.valor_autorizado_inicial>99999999999999.99 ||
     d.valor_rendimento>99999999999999.99)
    erros.push("Valor acima do limite monetário permitido.");

  return erros;
}
export function saldoCadastro(initial:number, ajustes:Pick<EmendaAjuste,"variacao">[]){
  const cents=(n:number)=>Math.round(n*100);
  const base=cents(initial);
  const valor=ajustes.reduce((acc,item)=>acc+cents(Number(item.variacao)),base);
  return valor/100;
}
export function anoDaEmenda(numero:string, fallback=new Date().getFullYear()) {
  const match=numero.trim().match(/\/(20\d{2})$/);
  return match?Number(match[1]):fallback;
}
/** Limite cadastral = emenda + rendimento + ajustes formais; não é saldo líquido. */
export const totalAutorizado=(base:number,rendimento:number,ajustes:Pick<EmendaAjuste,"variacao">[])=>
  saldoCadastro(base+rendimento,ajustes);
export const nomeSituacao=(s:string)=>({
  cadastrada:"Cadastrada",ativa:"Ativa",suspensa:"Suspensa",encerrada:"Encerrada",
} as Record<string,string>)[s] ?? s;
