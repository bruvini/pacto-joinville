import * as XLSX from "xlsx";

/** A memória oficial da 13ª deve identificar CNES e valor anual da parcela.
 * Não derivar valores de planilhas mensais ou de colunas genéricas.
 */
const normalizar = (s: unknown) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function numeroPlanilha(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[^\d,.\-]/g, "");
  if (!s) return NaN;
  const virgula = s.lastIndexOf(","), ponto = s.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    const decimal = virgula > ponto ? "," : ".";
    return Number(s.replaceAll(decimal === "," ? "." : ",", "").replace(decimal, "."));
  }
  if (virgula >= 0) return /^-?\d{1,3}(?:,\d{3})+$/.test(s)
    ? Number(s.replaceAll(",", "")) : Number(s.replace(",", "."));
  if (ponto >= 0 && /^-?\d{1,3}(?:\.\d{3})+$/.test(s))
    return Number(s.replaceAll(".", ""));
  return Number(s);
}

export function lerMemoria13PorCnes(buffer: ArrayBuffer): Array<{cnes:string;valor:string}> {
  const livro = XLSX.read(new Uint8Array(buffer), {type:"array"});
  for (const aba of livro.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets[aba],{
      header:1,defval:"",raw:true,
    });
    for (let i=0;i<Math.min(30,matriz.length);i++) {
      const cabecalhos = (matriz[i]??[]).map(normalizar);
      const posCnes = cabecalhos.findIndex(n=>n==="cnes"||n==="cnes empregador");
      const posValor = cabecalhos.findIndex(n=>/valor/.test(n) &&
        /(13|decima terceira|decimo terceiro)/.test(n) &&
        /(afc|parcela|homologado|repasse)/.test(n));
      if(posCnes<0||posValor<0)continue;
      const linhas:Array<{cnes:string;valor:string}>=[];
      const vistos=new Set<string>();
      for(const linha of matriz.slice(i+1)){
        const bruto=String(linha[posCnes]??"").trim();
        const brutoValor=linha[posValor];
        if(!bruto && (brutoValor==null||String(brutoValor).trim()===""))continue;
        if(/^total\b/i.test(bruto))continue;
        const cnes=digitos(bruto);
        const valor=numeroPlanilha(brutoValor);
        if(!/^\d{7}$/.test(cnes)||vistos.has(cnes))
          throw new Error(`CNES inválido ou duplicado na memória da 13ª: ${bruto}.`);
        if(!Number.isFinite(valor)||valor<0||
          Math.abs(valor*100-Math.round(valor*100))>0.001)
          throw new Error(`Valor da 13ª inválido para CNES ${cnes}.`);
        vistos.add(cnes);
        linhas.push({cnes,valor:(Math.round(valor*100)/100).toFixed(2)});
        if(linhas.length>20000)throw new Error("Memória da 13ª excede 20 mil CNES.");
      }
      if(!linhas.length)throw new Error("Memória da 13ª sem CNES ou valores.");
      return linhas;
    }
  }
  throw new Error("Planilha da 13ª não identificada. Use cabeçalhos CNES e VALOR AFC 13ª (ou VALOR HOMOLOGADO DA 13ª).");
}
