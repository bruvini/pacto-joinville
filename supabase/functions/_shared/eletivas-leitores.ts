import { proc9, type FonteEC, type MatrizSES, type RegistroSIH, type RegistroSIA } from "./eletivas-motor.ts";

/**
 * Adaptadores fiéis aos layouts de entrada descritos no HTML original:
 * DBF TabWin, planilhas físico/financeiro/complemento da SES e aba Delib.
 * Não tenta reconstruir múltiplas e sequenciais sem a memória por AIH.
 */
type Livro = { SheetNames: string[]; Sheets: Record<string,unknown> };
type LeitorXLSX = {
  read: (buffer: Uint8Array, opts: {type:"array"}) => Livro;
  utils: {
    sheet_to_json: (sheet:unknown,opts:{header:1;raw:true;defval:null}) => unknown[][];
  };
};
const txt=(v:unknown)=>String(v??"").trim();
const moeda=(v:unknown)=>{
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  let t=txt(v).replace(/R\$/gi,"");
  if(!t||t==="-")return 0;
  if(/,\d{1,2}$/.test(t))t=t.replace(/\./g,"").replace(",",".");
  else t=t.replace(/,/g,"");
  const n=Number(t);return Number.isFinite(n)?n:0;
};
function planilha(wb:Livro,re:RegExp,XLSX:LeitorXLSX){
  const name=wb.SheetNames.find(s=>re.test(s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")));
  if(!name)return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
}
function matrizAba(wb:Livro,re:RegExp,cnes:string,XLSX:LeitorXLSX){
  const plan=planilha(wb,re,XLSX);
  if(!plan)return null;
  let header=-1, coluna=-1;
  for(let i=0;i<Math.min(10,plan.length);i++){
    const cells=plan[i]??[];
    for(let j=0;j<cells.length;j++)
      if(txt(cells[j]).includes(cnes)){header=i;coluna=j;break;}
    if(coluna>=0)break;
  }
  if(coluna<0)throw Error(`CNES ${cnes} não localizado na aba ${re.source} da SES.`);
  const valores:Record<string,number>={},nomes:Record<string,string>={};
  for(let i=header+1;i<plan.length;i++){
    const row=plan[i]??[];
    if([row[0],row[1]].some(x=>/^total$/i.test(txt(x))))continue;
    const field=[row[0],row[1],row[2]].map(txt).find(x=>/^\d{8,10}\b/.test(x));
    if(!field)continue;
    const code=field.match(/^\d{8,10}/)?.[0]??"";
    const k=proc9(code);if(!k)continue;
    if(field.length>code.length)nomes[k]=field.slice(code.length).trim();
    const n=moeda(row[coluna]);
    if(n!==0)valores[k]=(valores[k]??0)+n;
  }
  return {valores,nomes};
}
function delib(wb:Livro,XLSX:LeitorXLSX){
  const candidates=wb.SheetNames.filter(x=>/^delib/i.test(x));
  const name=candidates.find(x=>x.toLowerCase()==="delib")??candidates.sort((a,b)=>a.length-b.length)[0];
  const out:Record<string,number>={};if(!name)return out;
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
  for(const row of rows){
    if(!/^\d{8,10}$/.test(txt(row[0])))continue;
    const amount=moeda(row[1])||moeda(row[2]);
    out[proc9(row[0])]=amount;
  }
  return out;
}
export function lerSES(buffer:Uint8Array,cnes:string,XLSX:LeitorXLSX):MatrizSES{
  const wb=XLSX.read(buffer,{type:"array"});
  const fis=matrizAba(wb,/f.sico/i,cnes,XLSX);
  const fin=matrizAba(wb,/financeiro/i,cnes,XLSX);
  const comp=matrizAba(wb,/complemento/i,cnes,XLSX);
  if(!fis&&!fin&&!comp)throw Error("Arquivo da SES não contém abas físico, financeiro ou complemento.");
  return {fisico:fis?.valores??{},financeiro:fin?.valores??{},
    complemento:comp?.valores??{},delib:delib(wb,XLSX),
    nomes:{...fis?.nomes,...fin?.nomes,...comp?.nomes}};
}
export function lerDBF(buf:ArrayBuffer):Array<Record<string,string|number>>{
  if(buf.byteLength<33)throw Error("DBF vazio ou inválido.");
  const dv=new DataView(buf),dec=new TextDecoder("latin1");
  const count=dv.getUint32(4,true),header=dv.getUint16(8,true),stride=dv.getUint16(10,true);
  if(header<33||stride<2||header>buf.byteLength||count>1_000_000||
    header+count*stride>buf.byteLength)throw Error("DBF corrompido: dimensões incompatíveis.");
  const fields:Array<{name:string;type:string;len:number}>=[];
  for(let i=32;i<header;i+=32){
    if(dv.getUint8(i)===0x0d)break;
    if(i+32>header)throw Error("Descritor DBF incompleto.");
    const name=dec.decode(new Uint8Array(buf,i,11)).replace(/\0.*$/,"").trim();
    fields.push({name,type:String.fromCharCode(dv.getUint8(i+11)),len:dv.getUint8(i+16)});
  }
  const rows:Array<Record<string,string|number>>=[];
  for(let k=0;k<count;k++){
    let offset=header+k*stride;
    if(dv.getUint8(offset)===0x2a)continue;
    offset++;
    const row:Record<string,string|number>={};
    for(const f of fields){
      if(offset+f.len>header+(k+1)*stride)throw Error("DBF com campo fora do registro.");
      const raw=dec.decode(new Uint8Array(buf,offset,f.len)).trim();
      row[f.name]=f.type==="N"||f.type==="F"?(raw?Number(raw):0):raw;
      offset+=f.len;
    }
    rows.push(row);
  }
  return rows;
}
const n=(v:unknown)=>Number(v??0)||0;
export function lerSIH(buffer:ArrayBuffer):RegistroSIH[]{
  return lerDBF(buffer).map(r=>({
    aih:txt(r.N_AIH),proc:txt(r.PROC_REA),valor:n(r.VAL_TOT),
    qt_procedimento:n(r.QT)||1,
  })).filter(r=>r.aih&&proc9(r.proc));
}
export function lerSIA(buffer:ArrayBuffer):RegistroSIA[]{
  return lerDBF(buffer).map(r=>({
    proc:txt(r.PRD_PA||r.PA||r.PROC_REA),
    qt:n(r.PRD_QT_A||r.QT),valor:n(r.PRD_VL_A||r.VAL_TOT),
  })).filter(r=>proc9(r.proc));
}
export type ArquivoBrutoEC={categoria:string;bytes:ArrayBuffer};
export function lerFontesEC(
  fontes:ArquivoBrutoEC[],cnes:string,XLSX:LeitorXLSX,
):FonteEC{
  const by=new Map(fontes.map(x=>[x.categoria,x.bytes]));
  for(const required of ["dbf_faec","dbf_mac","s_faec","s_mac"])
    if(!by.has(required))throw Error("Fonte obrigatória ausente: "+required);
  const matriz=(cat:string)=>{
    const bytes=by.get(cat);
    return bytes?lerSES(new Uint8Array(bytes),cnes,XLSX):undefined;
  };
  const dbf=(cat:string)=>{
    const bytes=by.get(cat);
    return bytes?lerSIH(bytes):[];
  };
  const sia=(cat:string)=>{
    const bytes=by.get(cat);
    return bytes?lerSIA(bytes):[];
  };
  return {
    dbf_faec:dbf("dbf_faec"),dbf_mac:dbf("dbf_mac"),dbf_sia:sia("dbf_sia"),
    s_faec:matriz("s_faec")!,s_mac:matriz("s_mac")!,
    s_faec_est:matriz("s_faec_est"),s_mac_fed:matriz("s_mac_fed"),
    s_mac_faec:matriz("s_mac_faec"),
    sia_faec:matriz("sia_faec"),sia_faec_p:matriz("sia_faec_p"),
    sia_mac:matriz("sia_mac"),
  };
}
