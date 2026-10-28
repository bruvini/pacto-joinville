import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261029000500_emendas_fase4_liberacoes_pagamentos.sql",import.meta.url),"utf8");
describe("Emendas Fase 4: integridade documental e financeira",()=>{
 it("registra confirmação da dotação sem exigir SEI",()=>{
  expect(sql).toContain("emenda_confirmar_dotacao(");
  expect(sql).toContain("coord_orcamentos_confirmada");
  expect(sql).toContain("ALTER COLUMN numero_sei DROP NOT NULL");
  expect(sql).toContain("ALTER COLUMN link_sei DROP NOT NULL");
  expect(sql).toContain("p_confirmado IS DISTINCT FROM true");
  expect(sql).toContain("gate_emenda_formalizacao_orcamentos");
 });
 it("mantém autorização, solicitação e assinaturas após a dotação",()=>{
  expect(sql).toContain("emenda_salvar_etapa_documental(");
  expect(sql).toContain("emenda_assinaturas_conferidas");
  expect(sql).toContain("DELETE FROM public.emenda_assinaturas_conferidas");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.emenda_salvar_etapa(");
 });
 it("distingue liberação original e complementar e proíbe soma acima da NE",()=>{
  expect(sql).toContain("emenda_liberacao_original_unica");
  expect(sql).toContain("AND NOT original_existe");
  expect(sql).toContain("total+p_valor>nota");
  expect(sql).toContain("FOR UPDATE");
 });
 it("não permite pagamento acima da liberação e exige atesto",()=>{
  expect(sql).toContain("emenda_registrar_bloco_pagamento(");
  expect(sql).toContain("total+p_valor>lib.valor");
  expect(sql).toContain("public.emenda_comprovantes");
  expect(sql).toContain("p_data<lib.data_liberacao");
 });
 it("encerra apenas sem liberação, sem liberar NE automaticamente",()=>{
  expect(sql).toContain("emenda_encerrar_competencia_sem_execucao(");
  expect(sql).toContain("Competência não pertence ao lançamento");
  expect(sql).toContain("status='sem_execucao'");
  expect(sql).toContain("não libera NE nem reserva automaticamente");
 });
 it("aplica RLS, revogação de grants e auditoria para todas as tabelas novas",()=>{
  for(const name of ["emenda_comprovantes","emenda_liberacoes","emenda_blocos_pagamento","emenda_encerramentos_sem_execucao"]){
   expect(sql).toContain("CREATE TABLE public."+name);
   expect(sql).toContain("ALTER TABLE public."+name+" ENABLE ROW LEVEL SECURITY");
  }
  expect(sql).toContain("REVOKE ALL ON public.emenda_comprovantes");
  expect(sql).toContain("CREATE TRIGGER audit_emenda_pagamentos");
 });
});
