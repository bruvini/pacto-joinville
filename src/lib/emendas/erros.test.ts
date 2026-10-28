import { describe, expect, it } from "vitest";
import { explicarErroCadastro } from "./erros";

describe("erros do cadastro de emendas",()=>{
 it("apresenta código e motivo real de constraint sem esconder o erro",()=>{
   const result=explicarErroCadastro({code:"23514",message:"new row violates check constraint emendas_link_processo"});
   expect(result.codigo).toBe("23514");
   expect(result.mensagem).toContain("regra do banco");
   expect(result.diagnostico).toContain("emendas_link_processo");
 });
 it("identifica inconsistência de migration/cache do PostgREST",()=>{
   const result=explicarErroCadastro({code:"PGRST204",message:"Could not find column 'portaria_municipal_numero_sei'"});
   expect(result.mensagem).toContain("migration");
   expect(result.diagnostico).toContain("portaria_municipal_numero_sei");
 });
 it("identifica referência inválida em trigger ou função SQL",()=>{
   const r=explicarErroCadastro({code:"42703",message:'record "new" has no field "emenda_id"'});
   expect(r.codigo).toBe("42703");
   expect(r.mensagem).toContain("gatilho SQL");
   expect(r.diagnostico).toContain("emenda_id");
 });
 it("não concatena detalhes potencialmente sensíveis do registro recusado",()=>{
   const result=explicarErroCadastro({code:"23502",message:"null value in column \"created_by\"",details:"Failing row contains sensitive data"});
   expect(result.diagnostico).toContain("created_by");
   expect(result.diagnostico).not.toContain("sensitive");
 });
});
