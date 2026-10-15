import {describe,expect,it} from "vitest";
import {construirManifestoEC,type FonteEscolhida} from "./manifesto";
const make=(id:string,categoria:string,sha:string,data="2026-10-15T12:00:00Z"):FonteEscolhida=>({
 id,categoria,sha256:sha,competencia_id:"competencia",
 nome_original:categoria+".xlsx",storage_path:"path/"+id,
 tamanho:100,enviado_em:data,enviado_por:null,
});
const arquivos=[
 make("a","dbf_faec","a".repeat(64)),make("b","dbf_mac","b".repeat(64)),
 make("c","s_faec","c".repeat(64)),make("d","s_mac","d".repeat(64)),
 make("e","s_mac","e".repeat(64),"2026-10-15T12:20:00Z"),
 make("f","s_mac_ms","f".repeat(64)),
];
describe("Fase 2: manifesto automático e reproduzível",()=>{
 it("exige os arquivos essenciais e não requer múltiplas escolhas manuais",()=>{
   expect(()=>construirManifestoEC([],"06/2026")).toThrow(/faltam/i);
   const r=construirManifestoEC(arquivos,"06/2026");
   expect(r.manifesto).toHaveLength(5);
   expect(r.manifesto.find(x=>x.categoria==="dbf_faec")).toEqual({
     id:"a",categoria:"dbf_faec",sha256:"a".repeat(64),
   });
 });
 it("usa envio mais recente, registra SHA original e avisa em caso de reenvio",()=>{
   const r=construirManifestoEC(arquivos,"06/2026");
   expect(r.manifesto.find(x=>x.categoria==="s_mac")?.id).toBe("e");
   expect(r.manifesto.find(x=>x.categoria==="s_mac")?.sha256).toBe("e".repeat(64));
   expect(r.avisos.some(x=>x.includes("uploads encontrados"))).toBe(true);
 });
 it("mantém MAC múltiplas obrigatório desde julho",()=>{
   expect(()=>construirManifestoEC(arquivos.filter(a=>a.categoria!=="s_mac_ms"),
     "07/2026")).toThrow(/MAC múltiplas/);
   expect(construirManifestoEC(arquivos,"07/2026").manifesto).toHaveLength(5);
 });
 it("bloqueia mesmo hash classificado em papéis diferentes",()=>{
   const alterados=[...arquivos,make("z","sia_mac","c".repeat(64))];
   expect(()=>construirManifestoEC(alterados,"06/2026")).toThrow(/mesmo arquivo/);
 });
 it("ignora papéis auxiliares sem planilha, mantendo manifesto mínimo completo",()=>{
   const r=construirManifestoEC(arquivos.filter(x=>x.categoria!=="s_mac_ms"),"06/2026");
   expect(r.manifesto).toHaveLength(4);
   expect(r.avisos).toHaveLength(1);
 });
});
