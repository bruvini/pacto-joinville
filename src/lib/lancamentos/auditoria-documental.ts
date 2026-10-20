/** Comparação determinística: a IA extrai evidências, não decide valores financeiros. */
export const CAMPOS_AUDITORIA = [
  "numero_empenho","competencia","valor_solicitado","valor_atestado",
  "valor_liquidado","dotacao_orcamentaria","fonte_pagamento","data_pagamento",
] as const;
export type CampoAuditoria = (typeof CAMPOS_AUDITORIA)[number];

export const ROTULOS_AUDITORIA: Record<CampoAuditoria,string> = {
  numero_empenho: "Nota de empenho",
  competencia: "Competência",
  valor_solicitado: "Valor solicitado",
  valor_atestado: "Valor atestado",
  valor_liquidado: "Valor liquidado",
  dotacao_orcamentaria: "Dotação orçamentária",
  fonte_pagamento: "Fonte de recursos",
  data_pagamento: "Data do pagamento/crédito",
};

export type CampoExtraido = {
  campo: CampoAuditoria;
  valor: string;
  pagina?: number | null;
  evidencia?: string;
};

export type DivergenciaDocumental = {
  campo: CampoAuditoria;
  rotulo: string;
  valor_documento: string;
  valor_sistema: string;
  gravidade: "critica" | "atencao";
  pagina: number | null;
  evidencia: string;
};

function texto(valor: unknown): string {
  return String(valor ?? "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();
}
export function lerMoeda(valor: unknown): number | null {
  if (typeof valor==="number") return Number.isFinite(valor) ? valor : null;
  const t=String(valor ?? "").replace(/R\$/gi,"").replace(/\s/g,"");
  if (!t || /[^\d,.-]/.test(t)) return null;
  let normal=t;
  if (normal.includes(",")) normal=normal.replace(/\./g,"").replace(",",".");
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(normal)) normal=normal.replace(/\./g,"");
  const n=Number(normal);
  return Number.isFinite(n)&&n>=0 ? n : null;
}
function dataIso(valor: unknown): string {
  const s=String(valor??"").trim();
  const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s.slice(0,10);
}
function valorTexto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}
export function compararCamposExtraidos(
  extraidos: CampoExtraido[],
  snapshot: Record<string, unknown>,
): DivergenciaDocumental[] {
  const resultados: DivergenciaDocumental[]=[];
  const vistos=new Set<CampoAuditoria>();
  for(const item of extraidos){
    if(!CAMPOS_AUDITORIA.includes(item.campo)||vistos.has(item.campo))continue;
    vistos.add(item.campo);
    const sistema=snapshot[item.campo], documento=item.valor;
    if(sistema===null||sistema===undefined||String(sistema).trim()===""||!documento?.trim())continue;
    let diferente=false;
    if(item.campo.startsWith("valor_")){
      const a=lerMoeda(documento),b=lerMoeda(sistema);
      // Caso a extração não gere número confiável, não fabricar divergência.
      if(a===null||b===null)continue;
      diferente=Math.abs(a-b)>0.02;
    }else if(item.campo==="data_pagamento"){
      diferente=dataIso(documento)!==dataIso(sistema);
    }else{
      diferente=texto(documento)!==texto(sistema);
    }
    if(diferente){
      resultados.push({
        campo:item.campo,rotulo:ROTULOS_AUDITORIA[item.campo],
        valor_documento:documento.slice(0,160),
        valor_sistema:valorTexto(sistema).slice(0,160),
        gravidade: item.campo==="numero_empenho"||item.campo.startsWith("valor_")?"critica":"atencao",
        pagina:item.pagina??null,evidencia:String(item.evidencia??"").slice(0,360),
      });
    }
  }
  return resultados;
}

export function resumoSnapshot(lancamento: Record<string,unknown>): Record<string,unknown> {
  return Object.fromEntries(CAMPOS_AUDITORIA.map((c)=>[c,lancamento[c]??null]));
}
