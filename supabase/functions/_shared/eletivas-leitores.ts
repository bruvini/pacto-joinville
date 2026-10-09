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
  const sheetName=wb.SheetNames.find(n=>re.test(n.normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")));
  if(!sheetName)return null;
  const plan=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],
    {header:1,raw:true,defval:null});
  const formulasSemCache:string[]=[];
  const ws=wb.Sheets[sheetName] as Record<string,{f?:string;v?:unknown}>;
  const excelCell=(row:number,col:number)=>{
    let name="",n=col;
    do{name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26)-1}
    while(n>=0);
    return name+(row+1);
  };
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
    const cell=ws[excelCell(i,coluna)];
    if(cell?.f&&(cell.v===undefined||cell.v===null||cell.v===""))
      formulasSemCache.push(k);
    const n=moeda(row[coluna]);
    if(n!==0)valores[k]=(valores[k]??0)+n;
  }
  return {valores,nomes,formulasSemCache};
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
    nomes:{...fis?.nomes,...fin?.nomes,...comp?.nomes},
    formulasSemCache:[...new Set(comp?.formulasSemCache??[])]};
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
  const wb=(cat:string)=>{
    const bytes=by.get(cat);
    return bytes?XLSX.read(new Uint8Array(bytes),{type:"array"}):undefined;
  };
  const aih=wb("wb_aih"), detalhes=aih?workbookAih(aih,XLSX):undefined;
  const qty=new Map<string,number>();
  for(const r of detalhes?.rows??[]){
    const k=r.aih+"|"+r.proc;qty.set(k,(qty.get(k)??0)+r.qt);
  }
  const withQt=(rows:RegistroSIH[])=>rows.map(r=>({
    ...r,qt_procedimento:qty.get(r.aih+"|"+proc9(r.proc))??r.qt_procedimento??1,
  }));
  const faec=withQt(dbf("dbf_faec")),mac=withQt(dbf("dbf_mac"));
  const sm=matriz("s_mac")!,sf=matriz("s_faec")!;
  const multWb=wb("s_faec_ms"),macWb=wb("s_mac_ms"),fpo=wb("fpo_official");
  const special=wb("ec_delib");
  const mult=multWb?multSeqFaec(multWb,cnes,sf.delib,XLSX):undefined;
  const macMult=macWb?multSeqMac(macWb,cnes,XLSX):undefined;
  const macAihs=mac.filter(r=>["041501001","041502003","041502004","041502005","041502006","041502007"].includes(proc9(r.proc)));
  const distinctAihs=[...new Set(macAihs.map(r=>r.aih))];
  const eligible=distinctAihs.map(aih=>{
    const rows=detalhes?.rows.filter(r=>r.aih===aih)??[];
    const faixa=rows.find(r=>r.faixa)?.faixa??"";
    const nature=faixa==="1"?"Estadual":faixa==="5"?"Federal":"";
    const found=rows.some(r=>detalhes?.cib[r.proc]?.nature===nature);
    const checked=!!nature&&rows.some(r=>detalhes?.cib[r.proc]?.nature);
    return {checked,found};
  });
  if(macMult&&distinctAihs.length&&!eligible.every(x=>x.checked))
    throw Error("Múltiplas MAC: workbook AIH incompleto para classificação de faixa/composição.");
  const eligCount=eligible.every(x=>x.checked)?
    eligible.filter(x=>x.found).length:distinctAihs.length;
  return {
    dbf_faec:faec,dbf_mac:mac,dbf_sia:sia("dbf_sia"),
    s_faec:sf,s_mac:sm,
    s_faec_est:matriz("s_faec_est"),s_mac_fed:matriz("s_mac_fed"),
    s_mac_faec:matriz("s_mac_faec"),
    sia_faec:matriz("sia_faec"),sia_faec_p:matriz("sia_faec_p"),
    sia_mac:matriz("sia_mac"),workbook_aih:detalhes,
    fpo_oficial:fpo?fpoOficial(fpo,XLSX):undefined,
    delib_especial:special?delibEspecial(special,cnes,XLSX):undefined,
    mult_faec:mult?Object.entries(mult).map(([aih,m])=>({
      aih,proc:faec.find(r=>r.aih===aih)?.proc??"041501001",
      pago:m.publicado,esperado:m.publicado,filhos:m.filhos
    })):undefined,
    mult_mac:macMult?{
      publicado:macMult.publicado,
      esperado:eligCount*macMult.unitario,
      quantidade_local:distinctAihs.length,
      quantidade_estado:macMult.fisico,pagas:macMult.pagas,
      unitario:macMult.unitario,eligiveis:eligCount,
      excluidas:eligible.every(x=>x.checked)?distinctAihs.length-eligCount:0,
    }:undefined,
  };
}

/** Layouts complementares do HTML v2.25: três gerações FAEC, MAC jul/26+, AIH,
 * FPO art. 19 e deliberações especiais. Nunca retorna identificação do paciente. */
const normal=(v:unknown)=>txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const aba=(wb:Livro,re:RegExp,XLSX:LeitorXLSX)=>
  planilha(wb,re,XLSX);
const headerProc=(v:unknown)=>{
  const m=txt(v).match(/^(\d{8,10})\b(.*)$/);
  return m?{proc:proc9(m[1]),unit:moeda(m[2])}:null;
};
function workbookAih(wb:Livro,XLSX:LeitorXLSX):NonNullable<FonteEC["workbook_aih"]>{
  const rows:NonNullable<FonteEC["workbook_aih"]>["rows"]=[];
  const cib:NonNullable<FonteEC["workbook_aih"]>["cib"]={};
  const a=aba(wb,/original para consultas|consultas/i,XLSX);
  if(a){
    const h=(a[0]??[]).map(txt),col=(re:RegExp)=>h.findIndex(x=>re.test(x));
    const ca=col(/num_aih/i),cp=col(/^procedimento$/i),cq=col(/^qt$/i);
    const cf=col(/faixas da aih/i),cr=col(/procedimento principal$/i);
    if(ca<0||cp<0)throw Error("Workbook AIH sem NUM_AIH ou Procedimento.");
    for(const r of a.slice(1)){
      const aih=txt(r[ca]),proc=proc9(r[cp]);
      if(!/^\d{13}$/.test(aih)||!proc)continue;
      rows.push({aih,proc,qt:cq<0?1:Math.max(1,moeda(r[cq])),
        faixa:cf<0?"":txt(r[cf]),principal:cr<0?"":proc9(r[cr])});
    }
  }
  const c=aba(wb,/cib\s*20|727|cib2025|399/i,XLSX);
  if(c){
    const h=(c[0]??[]).map(txt),idx=(re:RegExp)=>h.findIndex(x=>re.test(x));
    const cc=idx(/complemento/i),fins=h.map((s,i)=>/tipo de financiamento/i.test(s)?i:-1).filter(i=>i>=0);
    const nature=fins.length>1?fins[fins.length-1]:-1;
    for(const r of c.slice(1)){
      const k=proc9(r[0]);if(!k)continue;
      const n=nature<0?"":txt(r[nature]);
      cib[k]={nature:/estad/i.test(n)?"Estadual":/feder/i.test(n)?"Federal":"",
        compl:cc<0?0:moeda(r[cc]),nome:txt(r[1])};
    }
  }
  if(!rows.length)throw Error("Workbook AIH sem registros na aba de consultas.");
  return {rows,cib};
}
function multSeqFaec(wb:Livro,cnes:string,ref:Record<string,number>,XLSX:LeitorXLSX){
  const layouts:[RegExp,RegExp][]=[
    [/^n_aih$/i,/^estab$/i],[/^hospitais$/i,/^aih$/i],
    [/^hospital$/i,/^procedimentos$/i],
  ];
  let own:unknown[][]|null=null,det:unknown[][]|null=null;
  for(const [o,d] of layouts){
    const a=aba(wb,o,XLSX),b=aba(wb,d,XLSX);
    if(a&&b){own=a;det=b;break;}
  }
  if(!own||!det)throw Error("Mult e Seq FAEC: layout SES não reconhecido.");
  let hc=-1,hr=0;
  for(let i=0;i<Math.min(4,own.length)&&hc<0;i++)
    for(let j=0;j<(own[i]??[]).length;j++)
      if(txt(own[i][j]).includes(cnes)){hc=j;hr=i;break;}
  if(hc<0)throw Error("Mult e Seq FAEC: CNES não localizado.");
  const mine=new Set(own.slice(hr+1).filter(r=>/^\d{13}$/.test(txt(r[0]))&&moeda(r[hc])>0)
    .map(r=>txt(r[0])));
  const units:Record<string,number>={};
  const u=aba(wb,/^mult\s*(?:e\s*)?seq/i,XLSX);
  if(u){
    const row=u.find(r=>r.slice(1).some(x=>headerProc(x)))??u[0]??[];
    for(const cell of row.slice(1)){
      const v=headerProc(cell);if(v&&v.unit>0)units[v.proc]=v.unit;
    }
  }
  const head=det.findIndex(r=>r.slice(1).some(x=>headerProc(x)));
  if(head<0)throw Error("Mult e Seq FAEC sem colunas de procedimentos-filhos.");
  const cols=(det[head]??[]).map((v,i)=>({i,h:headerProc(v)}))
    .filter((x):x is {i:number;h:{proc:string;unit:number}}=>!!x.h&&x.i>0);
  const result:Record<string,{filhos:Array<{proc:string;qt:number;unit:number;valor:number}>;publicado:number}>={};
  for(const row of det.slice(head+1)){
    const aih=txt(row[0]);if(!mine.has(aih))continue;
    const filhos=cols.map(({i,h})=>{
      const qt=moeda(row[i]),unit=h.unit||units[h.proc]||ref[h.proc]||0;
      return {proc:h.proc,qt,unit,valor:Math.round(qt*unit*100)/100};
    }).filter(x=>x.qt>0);
    if(filhos.some(x=>x.unit<=0))
      throw Error("Mult e Seq FAEC: valor unitário de filho não identificado na AIH "+aih);
    result[aih]={filhos,publicado:Math.round(filhos.reduce((s,x)=>s+x.valor,0)*100)/100};
  }
  return result;
}
function multSeqMac(wb:Livro,cnes:string,XLSX:LeitorXLSX){
  const fis=aba(wb,/f.sico\s*principal/i,XLSX);
  const compl=aba(wb,/^complemento$/i,XLSX);
  if(!fis||!compl)throw Error("Mult e Seq MAC: faltam Físico Principal e Complemento.");
  const fr=fis.find(r=>txt(r[0]).includes(cnes)),cr=compl.find(r=>txt(r[0]).includes(cnes));
  if(!fr&&!cr)throw Error("Mult e Seq MAC: CNES não localizado.");
  const del=delib(wb,XLSX);
  const unit=Object.entries(del).find(([k,v])=>k.startsWith("0415")&&v>0)?.[1]||
    moeda(compl[0]?.[1])||2000;
  return {fisico:moeda(fr?.[1]),pagas:moeda(cr?.[1]),
    publicado:moeda(cr?.[2])||moeda(cr?.[1])*unit,unitario:unit};
}
function fpoOficial(wb:Livro,XLSX:LeitorXLSX):NonNullable<FonteEC["fpo_oficial"]>{
  const out:NonNullable<FonteEC["fpo_oficial"]>={};
  let found=false;
  for(const name of wb.SheetNames){
    const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    for(let i=0;i<Math.min(a.length,12);i++){
      const h=(a[i]??[]).map(normal);
      if(!h.some(x=>x==="codigo")||!h.some(x=>x==="descricao")||
        !h.some(x=>x.includes("financiam"))||!h.some(x=>x.includes("eletiva"))||
        !h.some(x=>x.includes("maximo")))continue;
      const idx=(re:RegExp)=>h.findIndex(x=>re.test(x));
      const c=idx(/^codigo$/),nm=idx(/^descricao$/),fin=idx(/financiam/);
      const el=idx(/^eletiva$/),pc=idx(/maximo/);
      const tot=h.map((x,j)=>/tot\.?\s*hosp/.test(x)?j:-1).filter(j=>j>=0);
      const sig=tot[0]??6,fed=tot[tot.length-1]??14;
      for(const row of a.slice(i+1)){
        const proc=proc9(row[c]);if(!proc)continue;
        out[proc]={nome:txt(row[nm]),fin:txt(row[fin]),sigtap:moeda(row[sig]),
          federal:moeda(row[fed]),eletiva:txt(row[el]),pct:txt(row[pc]),
          nota5:["040701003","041304002","040901018"].includes(proc)};
      }
      found=true;break;
    }
    if(found)break;
  }
  if(!found)throw Error("FPO oficial: cabeçalho não reconhecido.");
  return out;
}
function delibEspecial(wb:Livro,cnes:string,XLSX:LeitorXLSX){
  return wb.SheetNames.filter(name=>{
    const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    return a.some(r=>r.some(x=>txt(x).includes(cnes)));
  });
}
