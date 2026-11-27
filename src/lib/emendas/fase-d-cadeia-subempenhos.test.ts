import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const base="../../../supabase/migrations/";
const d1=readFileSync(new URL(base+"20261126120000_emendas_fase_d1_evidencias_subempenho.sql",import.meta.url),"utf8");
const d2=readFileSync(new URL(base+"20261126121500_emendas_fase_d2_fluxo_documental_rpc.sql",import.meta.url),"utf8");
const d3=readFileSync(new URL(base+"20261126123000_emendas_fase_d3_painel_documentos.sql",import.meta.url),"utf8");
const fluxo=readFileSync(new URL("../../components/emendas/FluxoSubempenhosEmenda.tsx",import.meta.url),"utf8");
const matriz=readFileSync(new URL("../../components/emendas/MatrizSubempenhosEmenda.tsx",import.meta.url),"utf8");
const rota=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const types=readFileSync(new URL("../../integrations/supabase/types.ts",import.meta.url),"utf8");
describe("Emendas · D · contratos estruturais",()=>{
 it("três migrations aditivas e transacionais, sem alteração de pagamentos",()=>{
  for(const f of [d1,d2,d3]){
   expect(f).toMatch(/^BEGIN;/m);
   expect(f).toMatch(/^COMMIT;/m);
   expect(f).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\.emenda_|UPDATE\s+public\.emenda_blocos_pagamento)\b/i);
  }
 });
 it("mantém cada assinatura, encaminhamento e conclusão ligados ao documento individual",()=>{
  for(const table of ["emenda_subempenho_matrizes","emenda_subempenho_assinaturas",
   "emenda_subempenho_encaminhamentos","emenda_subempenho_conclusoes"]){
   expect(d1).toContain("CREATE TABLE public."+table);
   expect(d1).toContain("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY");
  }
  expect((d1.match(/FOREIGN KEY\(documento_id,emenda_id,subempenho_id\)/g)||[]).length).toBe(3);
  expect(d1).toContain("UNIQUE(documento_id,grupo)");
  expect(d1).toContain("UNIQUE(documento_id)");
 });
 it("matriz versionada por emenda e por tipo sem copiar PVH",()=>{
  expect(d1).toContain("UNIQUE (emenda_id,tipo,versao)");
  expect(d1).toContain("CREATE UNIQUE INDEX emenda_sub_matriz_unica_ativa");
  expect(d1).toContain("ADD COLUMN politica_id uuid");
  expect(d2).toContain("Somente administrador homologa a matriz de assinaturas.");
  expect(d2).toContain("Homologue as matrizes das três subetapas");
  expect(d2).toContain("SEFAZ.UAF.ADE");
  expect(matriz).toContain("Nenhuma assinatura");
 });
 it("preserva matriz original quando for homologada outra versão",()=>{
  expect(d2).toContain("UPDATE public.emenda_subempenho_matrizes SET ativa=false");
  expect(d2).toContain("Matriz homologada é imutável");
  expect(d2).toContain("politica_id,registrado_por");
  expect(d3).toContain("ON m.id=d.politica_id");
 });
 it("segurança de leitura, RPCs e trilha de auditoria",()=>{
  for(const t of ["matrizes","assinaturas","encaminhamentos","conclusoes"]){
   expect(d1).toContain("emenda_subempenho_"+t);
  }
  expect(d1).toContain("GRANT SELECT ON public.emenda_subempenho_matrizes");
  expect(d2).toContain("SECURITY DEFINER SET search_path=''");
  expect(d2).toContain("public.has_any_role");
  expect(d2).toContain("FROM PUBLIC,anon");
  expect(d1).toContain("public.emenda_auditar_lancamento()");
  expect(d2).toContain("Evidência documental registrada é imutável");
 });
});
describe("Emendas · D · etapas operacionais",()=>{
 it("a documentação NÃO avança status automaticamente",()=>{
  const inicio=d2.indexOf("CREATE OR REPLACE FUNCTION public.emenda_subempenho_documentar(");
  const fim=d2.indexOf("CREATE FUNCTION public.emenda_subempenho_assinar(",inicio);
  const corpo=d2.slice(inicio,fim);
  expect(corpo).toContain("INSERT INTO public.emenda_subempenho_documentos");
  expect(corpo).not.toContain("UPDATE public.emenda_subempenhos SET status");
 });
 it("cada etapa conclui somente após documentos e assinaturas do grupo validado",()=>{
  expect(d2).toContain("CREATE FUNCTION public.emenda_subempenho_concluir_etapa");
  expect(d2).toContain("p_tipo='aviso_subempenho'");
  expect(d2).toContain("Faltam assinaturas obrigatórias");
  expect(d2).toContain("Confirme o encaminhamento documental antes de concluir");
  expect(d2).toContain("INSERT INTO public.emenda_subempenho_conclusoes");
  expect(d2).toContain("UPDATE public.emenda_subempenhos SET status=novo_estado");
 });
 it("encaminhamento deve ser manual e posterior às assinaturas",()=>{
  expect(d2).toContain("CREATE FUNCTION public.emenda_subempenho_encaminhar");
  expect(d2).toContain("Confira todos os grupos de assinatura");
  expect(d2).toContain("p_data<doc.data_documento");
  expect(d2).toContain("grupo_codigo");
  expect(fluxo).toContain("Confirmar encaminhamento realizado");
  expect(fluxo).toContain("não emite atos no e-Pública");
 });
 it("o valor do Aviso não apaga o solicitado",()=>{
  expect(d2).toContain("p_valor_aviso");
  expect(d2).toContain("valor_subempenhado=CASE");
  expect(d2).not.toContain("SET valor_solicitado=p_valor_aviso");
  expect(fluxo).toContain("Solicitado:");
  expect(fluxo).toContain("Aviso efetivo:");
 });
 it("há várias solicitações dentro de uma mesma NE e competência",()=>{
  expect(fluxo).toContain("emenda_subempenho_criar");
  expect(fluxo).toContain("p_lancamento:lancamentoId");
  expect(fluxo).toContain("p_competencia:competencia");
  expect(fluxo).toContain("p_chave:chave");
  expect(fluxo).toContain("dados.data!.sub.filter(sub=>sub.competencia_id===id)");
   expect(fluxo).toContain("subs.map(sub=>");
   expect(fluxo).toContain("Nova solicitação nesta competência");
 });
 it("status do documento é independente, sem sobrescrever evidências",()=>{
  expect(d3).toContain("CASE");
  for(const status of ["concluido","aguardando_assinaturas","aguardando_encaminhamento","pronto_concluir"])
   expect(d3).toContain("'"+status+"'");
  expect(d3).toContain("security_invoker=true");
  expect(fluxo).toContain("documento.status_documental");
  expect(fluxo).toContain("documento.matriz_versao");
 });
 it("a execução de Emendas usa subempenho; fluxo legado fica somente leitura",()=>{
  expect(rota).not.toContain("liberacaoLegadaPermitida");
  expect(rota).not.toContain("<FluxoParcelasEmenda");
  expect(rota).toContain("<ConsultaLegadoEmenda");
  expect(rota).toContain("<FluxoSubempenhosEmenda");
  expect(rota).toContain('supabase.from("emenda_subempenho_conclusoes")');
  expect(rota).toContain('emenda_subempenho_encaminhamentos:"Encaminhamento à SEFAZ"');
 });
 it("não libera pagamento antes da futura fase E",()=>{
  expect(d1).not.toContain("ALTER TABLE public.emenda_blocos_pagamento");
  expect(d2).not.toContain("INSERT INTO public.emenda_blocos_pagamento");
 });
});
