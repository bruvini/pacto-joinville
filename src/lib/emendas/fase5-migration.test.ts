import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261029004500_emendas_fase5_conciliacao_pareceres.sql",import.meta.url),"utf8");
describe("Emendas Fase 5",()=>{
 it("pareceres, matriz e envio",()=>{
  for(const t of ["emenda_pareceres_financeiros","emenda_envios_sefaz","emenda_anulacoes","emenda_conciliacoes_ne"])
   expect(sql).toContain("CREATE TABLE public."+t);
  expect(sql).toContain("p_desfecho NOT IN ('aprovado','recusado')");
  expect(sql).toContain("'orcamentos','fiscal','gerencia_acp','diretor_servicos','diretoria_financeira'");
  expect(sql).toContain("emenda_confirmar_envio_sefaz(");
 });
 it("novo parecer após reconfirmar dotação",()=>{
  expect(sql).toContain("ocorrido_em >= (SELECT conferido_em FROM public.emenda_etapas_documentais");
 });
 it("exclusão lógica sem apagar o histórico",()=>{
  expect(sql).toContain("emenda_excluir_cadastro(");
  expect(sql).toContain("emenda_excluir_lancamento(");
  expect(sql).toContain("excluida_em=now()");
  expect(sql).toContain("excluido_em=now()");
 });
 it("anulação residual não excede saldo não liberado",()=>{
  expect(sql).toContain("p_valor>nota-anulada-liberada");
  expect(sql).toContain("total+p_valor>nota-anulada");
  expect(sql).toContain("CREATE OR REPLACE VIEW public.emendas_resumo WITH (security_invoker=true)");
 });
 it("conciliação e bloqueio posterior",()=>{
  expect(sql).toContain("meses=0 OR pendentes>0");
  expect(sql).toContain("nota-anulada<>liberada OR liberada<>paga");
  expect(sql).toContain("status='concluida'");
  expect(sql).toContain("status='encerrada'");
  expect(sql).toContain("emenda_bloquear_movimento_conciliado");
 });
 it("segurança, transações e auditoria",()=>{
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("CREATE TRIGGER audit_emenda_anulacoes");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.emenda_parecer_financeiro");
  expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
 });
});
