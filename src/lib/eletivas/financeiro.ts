/** Encontro de Contas — regra financeira preservada do HTML de referência. */
export const CATEGORIAS_ELETIVAS = [
  ["faec_prod","Produção FAEC SIH"], ["faec_compl","Complemento FAEC SIH"],
  ["faec_mult","Múltiplas e sequenciais FAEC"],
  ["faec_fxmac","FAEC faixa MAC (somente controle, não soma)"],
  ["mac_compl","Complemento MAC"],["mac_mult","Múltiplas e sequenciais MAC"],
  ["mac_fxfaec","MAC faixa FAEC"],["mac_prod","Produção MAC"],
  ["mac_fxfed","MAC faixa Federal"],["sia_faec","SIA FAEC"],
  ["sia_mac","SIA MAC"],
] as const;
export type CategoriaEletivas = typeof CATEGORIAS_ELETIVAS[number][0];
export type ItemEC = {
  id?: string; chave: string; categoria: CategoriaEletivas; descricao: string;
  valor_publicado: number; valor_esperado: number;
  situacao: "ok" | "info" | "div" | "nc" | "fora" | "pendente";
  decisao?: "aceito" | "oficio" | "erro" | "analise" | null;
  justificativa?: string | null;
};
export type CorrecaoEC = { competencia_origem: string; valor: number; documento_sei: string; motivo: string };
const cents = (v:number)=>Math.round((Number(v)||0)*100);
export const reais = (n:number)=>(n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function valorConciliadoCentavos(item:ItemEC):number {
  if (item.categoria==="faec_fxmac") return 0;
  const publicado=cents(item.valor_publicado), esperado=cents(item.valor_esperado);
  if (item.situacao==="ok" || item.situacao==="info" || item.decisao==="aceito") return publicado;
  if (item.decisao==="erro" || publicado<=0) return 0;
  return esperado>0?Math.min(publicado,esperado):publicado;
}
export function resumoEncontro(itens:ItemEC[], correcoes:CorrecaoEC[] = []) {
  const componentes = Object.fromEntries(CATEGORIAS_ELETIVAS.map(([id])=>[id,0])) as Record<CategoriaEletivas,number>;
  for(const item of itens) componentes[item.categoria]+=valorConciliadoCentavos(item);
  const correcoesCentavos=correcoes.reduce((a,c)=>a+cents(c.valor),0);
  const pendencias=itens.filter(i=>
    (i.situacao==="div"||i.situacao==="nc"||i.situacao==="fora"||i.situacao==="pendente")
    && !i.decisao);
  const faec=componentes.faec_prod+componentes.faec_compl+componentes.faec_mult;
  const mac=componentes.mac_compl+componentes.mac_mult+componentes.mac_fxfaec+
    componentes.mac_prod+componentes.mac_fxfed;
  const sia=componentes.sia_faec+componentes.sia_mac;
  return {componentes,faec,mac,sia,correcoes:correcoesCentavos,
    encontro:faec+mac+sia,total:faec+mac+sia+correcoesCentavos,
    pendencias, itens:itens.length};
}
