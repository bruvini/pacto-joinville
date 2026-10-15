import {describe,expect,it} from "vitest";
import {construirManifestoEC,type FonteEscolhida} from "./manifesto";
const make=(id:string,categoria:string,sha:string):FonteEscolhida=>({
 id,categoria,sha256:sha,competencia_id:"competencia",
 nome_original:categoria+".xlsx",storage_path:"path/"+id,
 tamanho:100,enviado_em:"2026-10-15T12:00:00Z",enviado_por:null,
});
const arquivos=[
 make("a","dbf_faec","a".repeat(64)),make("b","dbf_mac","b".repeat(64)),
 make("c","s_faec","c".repeat(64)),make("d","s_mac","d".repeat(64)),
 make("e","s_mac","e".repeat(64)),make("f","s_mac_ms","f".repeat(64)),
];
const versoes={dbf_faec:"a",dbf_mac:"b",s_faec:"c",s_mac:"d"};
describe("manifesto de fontes do Encontro de Contas",()=>{
 it("exige seleção explícita de todos os quatro papéis básicos",()=>{
   expect(()=>construirManifestoEC(arquivos,{}, "06/2026")).toThrow(/Escolha explicitamente/);
   const r=construirManifestoEC(arquivos,versoes,"06/2026");
   expect(r.manifesto).toHaveLength(4);
   expect(r.manifesto[0]).toEqual({id:"a",categoria:"dbf_faec",sha256:"a".repeat(64)});
 });
 it("congela versão antiga selecionada, mesmo com upload mais recente",()=>{
   const r=construirManifestoEC(arquivos,{...versoes,s_mac:"d"},"06/2026");
   expect(r.manifesto.find(x=>x.categoria==="s_mac")?.id).toBe("d");
 });
 it("exige o layout MAC mult/seq desde julho de 2026",()=>{
   expect(()=>construirManifestoEC(arquivos,versoes,"07/2026")).toThrow(/s_mac_ms/);
   expect(construirManifestoEC(arquivos,{...versoes,s_mac_ms:"f"},"08/2026").manifesto).toHaveLength(5);
 });
 it("rejeita troca de papel, versão inexistente e hash repetido em papéis distintos",()=>{
   expect(()=>construirManifestoEC(arquivos,{...versoes,s_faec:"e"},"06/2026")).toThrow(/não pertence/);
   expect(()=>construirManifestoEC(arquivos,{...versoes,s_mac:"z"},"06/2026")).toThrow(/não pertence/);
   const trocado=[...arquivos,make("z","sia_mac","c".repeat(64))];
   expect(()=>construirManifestoEC(trocado,{...versoes,sia_mac:"z"},"06/2026")).toThrow(/mesmo arquivo/);
 });
});
