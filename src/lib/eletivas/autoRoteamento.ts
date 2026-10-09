/** Reconhecimento de evidências TabWin/SES conforme HTML original.
 * Priorizamos assinatura do conteúdo; não inferimos categoria apenas pelo nome. */
import * as XLSX from "xlsx";
import type {FonteId} from "./fontes";
export type FonteDetectada={id:FonteId;motivo:string};
const normal=(v:unknown)=>String(v??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
function lerCamposDbf(buf:ArrayBuffer){
  if(buf.byteLength<33)throw Error("DBF vazio ou corrompido.");
  const dv=new DataView(buf),fim=dv.getUint16(8,true);
  if(fim<33||fim>buf.byteLength)throw Error("Cabeçalho DBF inválido.");
  const dec=new TextDecoder("latin1"),names:string[]=[];
  for(let i=32;i+32<=fim;i+=32){
    if(dv.getUint8(i)===0x0d)break;
    names.push(dec.decode(new Uint8Array(buf,i,11)).replace(/\0.*$/,"").trim().toUpperCase());
  }
  return new Set(names);
}
function classificarDbf(buf:ArrayBuffer):FonteDetectada|null{
  const f=lerCamposDbf(buf);
  if(f.has("PRD_PA")||f.has("PRD_QT_A")||f.has("PRD_VL_A"))
    return {id:"dbf_sia",motivo:"campos PRD_* ambulatoriais"};
  if(f.has("N_AIH")&&f.has("PROC_REA")&&(f.has("VAL_SH_FED")||f.has("VAL_SP_FED")))
    return {id:"dbf_faec",motivo:"campos federais SIH"};
  if(f.has("N_AIH")&&f.has("PROC_REA")&&f.has("VAL_TOT"))
    return {id:"dbf_mac",motivo:"N_AIH/PROC_REA/VAL_TOT"};
  return null;
}
function classificarPlanilha(buf:ArrayBuffer):FonteDetectada|null{
  const wb=XLSX.read(buf,{type:"array"}),names=wb.SheetNames.map(normal);
  const has=(v:string)=>names.includes(normal(v)),any=(re:RegExp)=>names.some(v=>re.test(v));
  if(any(/^original para consultas$|^727cib|^399cib|tabela fpo diferenca/))
    return {id:"wb_aih",motivo:"abas de AIH e CIB"};
  for(const name of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name],{header:1,raw:true,defval:null});
    if(rows.slice(0,10).some(row=>{
      const h=(row??[]).map(normal);
      return h.includes("codigo")&&h.includes("descricao")&&
        h.some(x=>x.includes("financiam"))&&h.includes("eletiva")&&
        h.some(x=>x.includes("maximo"));
    }))return {id:"fpo_official",motivo:"estrutura oficial de FPO"};
  }
  if(names.length&&names.every(x=>/^delib_/.test(x)))
    return {id:"ec_delib",motivo:"abas Delib_*"};
  if(has("delibms")||any(/fisico principal/))
    return {id:"s_mac_ms",motivo:"DelibMS/Físico Principal"};
  if((has("hospital")&&has("procedimentos"))||(has("hospitais")&&has("aih"))||
     (has("n_aih")&&has("estab")))
    return {id:"s_faec_ms",motivo:"matrizes de múltiplas FAEC"};
  for(const [aba,id] of [
    ["delibffe","s_mac_faec"],["delibfsc","s_faec_est"],
    ["delibmf","s_mac_fed"],["delibfp","sia_faec_p"],
  ] as const) if(has(aba))return {id,motivo:"aba "+aba};
  const fis=wb.SheetNames.find(x=>/f.sico/i.test(normal(x)));
  let titulo="";
  if(fis){
    const row=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[fis],
      {header:1,raw:true,defval:null})[0]??[];
    titulo=normal(row.slice(0,2).join(" "));
  }
  if(has("delibf"))return {id:titulo.includes("estabelecimentos cnes")?
    "sia_faec":"s_faec",motivo:"DelibF e tipo de matriz"};
  if(has("delibm"))return {id:titulo.includes("estabelecimentos cnes")?
    "sia_mac":"s_mac",motivo:"DelibM e tipo de matriz"};
  return null;
}
export async function identificarFonte(file:File):Promise<FonteDetectada|null>{
  if(file.size<=0||file.size>50*1024*1024)return null;
  const buffer=await file.arrayBuffer();
  if(/\.dbf$/i.test(file.name))return classificarDbf(buffer);
  if(/\.(?:xlsx?|ods)$/i.test(file.name))return classificarPlanilha(buffer);
  return null;
}
