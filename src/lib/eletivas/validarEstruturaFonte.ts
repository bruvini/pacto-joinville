import * as XLSX from "xlsx";
import type {FonteId} from "./fontes";
import {lerDBF} from "../../../supabase/functions/_shared/eletivas-leitores";

// A análise de estrutura é obrigatória antes de chamar o motor. Não altera valores.
const norm=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
const cabecalho=(s:unknown)=>norm(s).replace(/[^a-z0-9]+/g," ").trim()
  .replace(/\s+/g," ");
const baseOrigem=(arquivo:string,aba:string,celula:string)=>`${arquivo} / aba "${aba}" / célula ${celula}`;
export function validarFormulaCache(
 celula:{f?:string;v?:unknown},arquivo:string,aba:string,celulaRef:string){
 if(!celula.f)return;
 if(celula.v===null||celula.v===undefined||celula.v===""||
   (typeof celula.v==="number"&&!Number.isFinite(celula.v)))
   throw Error(baseOrigem(arquivo,aba,celulaRef)+
     ": fórmula sem resultado no cache; não é possível assumir valor zero.");
}
export function validarEstruturaFonte(papel:FonteId,bytes:ArrayBuffer,cnes:string,arquivo:string){
 if(!bytes.byteLength||bytes.byteLength>50*1024*1024)throw Error("Tamanho inválido (0 a 50 MB).");
 if(["dbf_faec","dbf_mac","dbf_sia"].includes(papel)){
   if(new DataView(bytes).getUint8(0)!==0x03&&![0x83,0x8b,0xf5].includes(new DataView(bytes).getUint8(0)))
     throw Error("Cabeçalho DBF inválido na posição 0.");
   const registros=lerDBF(bytes),colunas=Object.keys(registros[0]??{}).map(x=>x.toUpperCase());
   const precisa=papel==="dbf_sia"?["PRD_PA","PRD_QT_A","PRD_VL_A"]:["N_AIH","PROC_REA"];
   if(papel!=="dbf_sia"&&!colunas.some(k=>["VAL_TOT","VAL_SH_FED","VAL_SP_FED"].includes(k)))
     precisa.push("VAL_TOT ou VAL_*_FED");
   const ausentes=precisa.filter(k=>!colunas.includes(k));
   if(ausentes.length)throw Error("DBF: campos obrigatórios ausentes: "+ausentes.join(", "));
   if(!registros.length)throw Error("DBF sem registros para conciliação.");
   return {layout:"DBF",abas:[],origem:arquivo,avisos:[] as string[]};
 }
 let wb:XLSX.WorkBook;
 try{wb=XLSX.read(bytes,{type:"array",cellFormula:true});}
 catch(e){throw Error("Workbook XLSX/XLS/ODS inválido: "+String(e));}
 const abas=wb.SheetNames;
 const has=(re:RegExp)=>abas.some(a=>re.test(norm(a)));
 const precisaMatriz=["s_faec","s_faec_est","s_mac_faec","s_mac","s_mac_fed","sia_faec","sia_faec_p","sia_mac"].includes(papel);
 if(precisaMatriz&&!has(/f.sico/i))
   throw Error("Aba Físico ausente (layout "+papel+").");
 if(papel==="s_faec_ms"&&!((has(/^n_aih$/)&&has(/^estab$/))||
   (has(/^hospitais$/)&&has(/^aih$/))||(has(/^hospital$/)&&has(/^procedimentos$/))))
   throw Error("Múltiplas FAEC: esperado N_AIH+Estab, Hospitais+AIH ou Hospital+Procedimentos.");
 if(papel==="s_mac_ms"&&!(has(/f.sico\s*principal/)&&has(/^complemento$/)))
   throw Error("Múltiplas MAC: abas Físico Principal e Complemento obrigatórias.");
 if(papel==="wb_aih"&&!has(/original para consultas|consultas/))
   throw Error("Workbook AIH: aba Original para Consultas ausente.");
 if(papel==="ec_delib"&&!abas.some(s=>/^delib_/i.test(norm(s))))
   throw Error("EC Delib: abas Delib_* ausentes.");
 if(papel==="ec_consolidado"){
   const encontrado=abas.some(n=>XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n],
      {header:1,raw:true,defval:null}).slice(0,20).some(row=>{
       const h=(row??[]).map(cabecalho);
       return h.includes("estabelecimentos sc")&&h.includes("municipios sc")&&
        h.includes("total estabelecimentos");
     }));
   if(!encontrado)throw Error("Consolidado SES: cabeçalho Estabelecimentos-SC, Municípios-SC e Total Estabelecimentos ausente.");
 }
 if(papel==="fpo_official"){
   const ok=abas.some(n=>XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n],
      {header:1,raw:true,defval:null}).slice(0,12).some(row=>{
       const h=(row??[]).map(norm);
       return h.includes("codigo")&&h.includes("descricao")&&
         h.some(x=>x.includes("financiam"))&&h.includes("eletiva")&&
         h.some(x=>x.includes("maximo"));
     }));
   if(!ok)throw Error("FPO oficial: cabeçalho Código/Descrição/Financiamento/Eletiva/% Máximo não reconhecido.");
 }
 const opcional = ["s_faec_est","s_mac_faec","s_mac_fed",
   "sia_faec","sia_faec_p","sia_mac"].includes(papel);
 const avisos:string[]=[];
 const colunas=new Map<string,number>();
 if(precisaMatriz){
   for(const aba of abas.filter(x=>/f.sico|financeiro|complemento/i.test(norm(x)))){
     const rows=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba],
       {header:1,raw:true,defval:null});
     let coluna=-1;
     for(const linha of rows.slice(0,12)){
       coluna=linha.findIndex(v=>String(v??"").includes(cnes));
       if(coluna>=0)break;
     }
     colunas.set(aba,coluna);
   }
   const fis=abas.find(s=>/f.sico/i.test(norm(s)));
   if(fis && colunas.get(fis)===-1 && !opcional)
     throw Error(baseOrigem(arquivo,fis,"A1:L12")+
       ": CNES "+cnes+" não encontrado na fonte obrigatória.");
   for(const [aba,coluna] of colunas)
     if(coluna<0){
       if(!opcional)throw Error(baseOrigem(arquivo,aba,"A1:L12")+
         ": CNES "+cnes+" ausente na fonte obrigatória.");
       avisos.push("Aba "+aba+": CNES "+cnes+
         " não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado.");
     }
 }
 // Fórmula com cache numérico 0 é um resultado salvo, NÃO ausência de cache.
 // Para matrizes da SES, inspecionar apenas a coluna do CNES auditado em cada
 // aba. Outros hospitais não podem bloquear o encontro de contas do HMSJ.
 for(const aba of abas){
   const sheet=wb.Sheets[aba];
   let alvo:number|undefined;
   if(precisaMatriz&&/f.sico|financeiro|complemento/i.test(norm(aba))){
     const coluna=colunas.get(aba)??-1;
     if(coluna<0)continue; // matriz opcional sem publicação para este CNES
     alvo=coluna;
   }
   for(const [celula,v] of Object.entries(sheet)){
     if(celula.startsWith("!")||!v||typeof v!=="object")continue;
     const c=v as XLSX.CellObject;
     if(alvo!==undefined&&XLSX.utils.decode_cell(celula).c!==alvo)continue;
     validarFormulaCache(c,arquivo,aba,celula);
   }
 }
 return {layout:papel,abas,origem:arquivo,avisos};
}
