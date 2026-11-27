import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");
const h1=read("supabase/migrations/20261126160000_emendas_fase_h1_classificacao_legado.sql");
const h0=read("scripts/emendas-fase-h0-baseline-readonly.sql");
const h2=read("scripts/emendas-fase-h2-seguranca-readonly.sql");
const h3=read("scripts/emendas-fase-h3-pos-implantacao-readonly.sql");
const smoke=read("scripts/emendas-fase-h-smoke-rls.mjs");
const tipos=read("src/integrations/supabase/types.ts");
const painel=read("src/components/emendas/PainelConferenciaLegadoEmenda.tsx");
const principal=read("src/components/emendas/PainelGerencialEmenda.tsx");

describe("Emendas · H1 · legado sem criação de atos fictícios",()=>{
 it("view aditiva e security_invoker com acesso RLS, sem conversão financeira",()=>{
  expect(h1).toContain("CREATE VIEW public.emenda_h_legado_conferencia");
  expect(h1).toContain("WITH (security_invoker = true)");
  expect(h1).toContain("false AS elegivel_conversao_automatica");
  expect(h1).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.emenda_|DELETE\s+FROM|TRUNCATE)\b/i);
  expect(h1).not.toContain("SECURITY DEFINER");
  expect(h1).toContain("REVOKE ALL ON public.emenda_h_legado_conferencia FROM PUBLIC,anon");
 });
 it("classifica todas as fontes legadas sem somar documentos como pagamento",()=>{
  for(const fonte of ["public.emenda_liberacoes","public.emenda_blocos_pagamento",
    "public.emenda_comprovantes","public.emenda_fluxo_documentos"])
   expect(h1).toContain(fonte);
  expect(h1).toContain("'pendente_conferencia'");
  expect(h1).toContain("'evidencia_documental_presente'");
  expect(h1).toContain("o registro não comprova, isoladamente, pagamento financeiro");
  expect(h1).toContain("d.liberacao_id IS NOT NULL OR d.pagamento_id IS NOT NULL");
 });
 it("um documento sem liberação vinculada aparece para análise, sem subempenho inferido",()=>{
  expect(h1).toContain("NOT f.tem_relacao_original");
  expect(h1).toContain("Documento ou pagamento sem vínculo comprovado ao ato financeiro original");
  expect(h1).not.toMatch(/INSERT\s+INTO\s+public\.emenda_subempenhos/i);
 });
 it("tipo Supabase e painel de conferência preservam os links SEI, o estado e IDs originais",()=>{
  expect(tipos).toContain("emenda_h_legado_conferencia: {");
  expect(painel).toContain("pendente_conferencia");
  expect(painel).toContain("Não crie Aviso de Movimento");
  expect(painel).toContain("csvExcelSeguro");
  expect(painel).not.toContain(".rpc(");
  expect(principal).toContain("<PainelConferenciaLegadoEmenda");
 });
});
describe("Emendas · H0/H2/H3 · verificações não destrutivas",()=>{
 it("todos os relatórios usam transação somente leitura e não executam alterações",()=>{
  for(const script of [h0,h2,h3]){
   expect(script).toContain("BEGIN TRANSACTION");
   expect(script).toContain("READ ONLY;");
   expect(script).toMatch(/^COMMIT;/m);
   expect(script).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM\s+public\.|TRUNCATE|DROP\s+TABLE)\b/i);
  }
 });
 it("baseline inclui todas as trilhas e fingerprints necessários à comparação",()=>{
  for(const x of ["fluxo_documentos_legado","pagamentos_legados","subempenhos",
    "hash_auditoria","hash_livros_financeiros","financeiro","integridade"])
   expect(h0).toContain(x);
 });
 it("inspeção verifica RLS, grant, caminho, invocador e vedação de acesso anônimo",()=>{
  for(const x of ["relrowsecurity","security_invoker=true",
    "anon_consegue_executar","sem_search_path_restrito",
    "sem_verificacao_explicita_de_papel","financeiras_com_politica_update_delete_direto"])
   expect(h2).toContain(x);
 });
 it("pós-flight diferencia cenários não exercitados dos invariantes provados",()=>{
  for(const x of ["ne_multicompetencia","competencia_atendida_por_multiplas_nes",
    "multiplos_subempenhos_na_mesma_competencia","pagamentos_parciais",
    "devolucoes_ou_estornos","retificacoes_documentais","anulacoes",
    "ne_conciliada_com_pendencia","sem_evidencia_suficiente"])
   expect(h3).toContain(x);
  expect(h3).toContain("AINDA NÃO TESTADO");
 });
 it("não permite publicação baseada apenas em testes unitários",()=>{
  const docs=read("docs/EMENDAS_FASE_H_HOMOLOGACAO_ACP_20261126.md");
  for(const x of ["backup restaurável","ACP","ACO","concorrência","rollback",
    "aceite","produção","homologação"])
   expect(docs.toLocaleLowerCase("pt-BR")).toContain(x.toLocaleLowerCase("pt-BR"));
 });
});
describe("Emendas · H · smoke de permissões em homologação",()=>{
 it("requer ambiente distinto da produção e perfis autenticados reais",()=>{
  for(const x of ["HOMO_ASSERT_ISOLATED","PROD_SUPABASE_URL",
    "HOMO_TOKEN_ADMIN","HOMO_TOKEN_ACP","HOMO_TOKEN_ACO"])
   expect(smoke).toContain(x);
  expect(smoke).toContain("url.origin===prod.origin");
 });
 it("tenta apenas RPCs impossíveis de gravar, validando códigos de autorização",()=>{
  expect(smoke).toContain("p_valor_solicitado:0");
  expect(smoke).toContain("p_lancamento:null");
  expect(smoke).toContain('user.edit?"23514":"42501"');
  expect(smoke).toContain('db.rpc("emenda_subempenho_criar"');
  expect(smoke).toContain('db.rpc("emenda_conciliar_encerrar_ne"');
  expect(smoke).not.toMatch(/\.from\(.*?\)\.insert\(/s);
 });
});
