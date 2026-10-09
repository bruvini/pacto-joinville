import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {lerFontesEC,lerDBF,type ArquivoBrutoEC} from "../../../supabase/functions/_shared/eletivas-leitores";
import {conciliarEletivas} from "./motor";
const CNES="2436469";
function livro(abas:Record<string,unknown[][]>){
  const wb=XLSX.utils.book_new();
  for(const [name,values] of Object.entries(abas))
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(values),name);
  return XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer;
}
const cab=["Procedimento",CNES+" HMSJ"];
const proc="0415010010",aih="1234567890123";
function ses(fin:number){
  return livro({
    "Físico":[cab,[proc,fin?1:0]],
    "Financeiro":[cab,[proc,fin]],
    "Complemento":[cab,[proc,0]],
    "Delib":[[proc,0]],
  });
}
function dbf(campos:Array<{name:string;type:string;size:number}>,cells:string[]){
  const head=32+campos.length*32+1,
    stride=1+campos.reduce((s,x)=>s+x.size,0);
  const b=new ArrayBuffer(head+stride);
  const v=new DataView(b),out=new Uint8Array(b),enc=new TextEncoder();
  out[0]=3;v.setUint32(4,1,true);v.setUint16(8,head,true);v.setUint16(10,stride,true);
  for(let i=0;i<campos.length;i++){
    const f=campos[i],off=32+i*32;
    out.set(enc.encode(f.name),off);
    out[off+11]=f.type.charCodeAt(0);out[off+16]=f.size;
  }
  out[head-1]=0x0d;out[head]=0x20;
  let pos=head+1;
  for(let i=0;i<cells.length;i++){
    const data=enc.encode(cells[i].padStart(campos[i].size," ").slice(-campos[i].size));
    out.set(data,pos);pos+=campos[i].size;
  }
  return b;
}
function sih(){
  return dbf([
    {name:"N_AIH",type:"C",size:13},
    {name:"PROC_REA",type:"C",size:10},
    {name:"VAL_TOT",type:"N",size:12},
  ],[aih,proc,"100.00"]);
}
function arquivos(extra:ArquivoBrutoEC[]=[]):ArquivoBrutoEC[]{
  return [
    {categoria:"dbf_faec",bytes:sih()},
    {categoria:"dbf_mac",bytes:dbf([{name:"N_AIH",type:"C",size:13},
      {name:"PROC_REA",type:"C",size:10},
      {name:"VAL_TOT",type:"N",size:12}],[aih,"0407040255","0"])},
    {categoria:"s_faec",bytes:ses(100)},
    {categoria:"s_mac",bytes:ses(0)},
    ...extra,
  ];
}
describe("leitores oficiais e conciliação SIH",()=>{
  it("lê DBF com esquema SIH e mantém AIH original",()=>{
    expect(lerDBF(sih())[0]).toMatchObject({N_AIH:aih,PROC_REA:proc,VAL_TOT:100});
  });
  it("faz o match da matriz hospital/AIH/procedimento (jul/2026)",()=>{
    const ms=livro({
      "Hospital":[["AIH",CNES+" HMSJ"],[aih,1]],
      "Procedimentos":[["AIH","0401010010 R$ 200,00"],[aih,1]],
    });
    const normal=lerFontesEC(arquivos([{categoria:"s_faec_ms",bytes:ms}]),
      CNES,XLSX as unknown as Parameters<typeof lerFontesEC>[2]);
    expect(normal.mult_faec?.[0]).toMatchObject({aih,pago:200,esperado:200});
    const r=conciliarEletivas(normal);
    expect(r.impedimentos).toHaveLength(0);
    expect(r.itens.find(i=>i.categoria==="faec_mult")?.valor_publicado).toBe(200);
  });
  it("não transforma deliberação especial em complemento sem regra",()=>{
    const esp=livro({"Delib_Extra":[["CNES",CNES],["valor",1000]]});
    const normal=lerFontesEC(arquivos([{categoria:"ec_delib",bytes:esp}]),
      CNES,XLSX as unknown as Parameters<typeof lerFontesEC>[2]);
    expect(normal.delib_especial).toContain("Delib_Extra");
    expect(conciliarEletivas(normal).impedimentos.some(x=>x.includes("Deliberações"))).toBe(true);
  });
});
