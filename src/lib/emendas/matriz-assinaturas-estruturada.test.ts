import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const sql=readFileSync(new URL("../../../supabase/migrations/20261127140500_emendas_matriz_assinaturas_estruturada.sql",import.meta.url),"utf8");
const matriz=read("components/emendas/MatrizSubempenhosEmenda.tsx");
const assinaturas=read("components/emendas/AssinaturasSubempenhoEmenda.tsx");
const fluxo=read("components/emendas/FluxoSubempenhosEmenda.tsx");
const pv=read("components/pvh/AssinaturasSubempenhoPvh.tsx");
const pvhFluxo=read("components/pvh/CadeiaSubempenhoPvh.tsx");

describe("Emendas · matriz estruturada de assinatura como PVH",()=>{
 it("usa as funções reais do PVH e distingue Fiscal opcional da Comissão obrigatória",()=>{
  expect(pv).toContain('item.slot === "fiscal"');
  expect(pv).toContain('item.slot === "comissao"');
  expect(pv).toContain("Membro da Comissão de Gestão e Controle de Despesa");
  expect(matriz).toContain("Membro da Comissão de Gestão e Controle de Despesa");
  expect(sql).toContain("modelo_obrigatorios:=ARRAY[comissao]");
  expect(sql).toContain("modelo_opcionais:=ARRAY['Fiscal']");
  expect(sql).toContain("modelo_obrigatorios:=ARRAY[]::text[]");
  expect(sql).toContain("modelo_opcionais:=ARRAY[]::text[]");
  expect(pvhFluxo).toContain("SEFAZ.UAF.ADE");
 });
 it("não exige escrever grupos nem três homologações manuais",()=>{
  expect(matriz).not.toContain('p_grupos:nomes');
  expect(matriz).not.toContain("Grupos de assinatura exigíveis");
  expect(matriz).not.toContain("<Textarea");
  expect(matriz).toContain("emenda_sub_matriz_padrao_homologar");
  expect(matriz).toContain("Aprovar regras das três subetapas");
  expect(matriz).toContain("setConfirmada");
  expect(sql).toContain("RETURN alteracoes;");
  expect(sql).toContain("CONTINUE;");
 });
 it("a matriz de Emendas não é homologada automaticamente só por existir PVH",()=>{
  expect(sql).toContain("has_any_role(ator,ARRAY['admin'::public.app_role])");
  expect(sql).toContain("p_link_sei");
  expect(sql).toContain("p_numero_sei");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("grupos_opcionais");
  expect(sql).toContain("NOT (grupos_opcionais && grupos_obrigatorios)");
  expect(sql).toContain("DROP TRIGGER IF EXISTS guard_emenda_d_matriz_criar_sub");
  expect(sql).toContain("emenda_subempenho_documentar continua exigindo matriz ativa");
  expect(matriz).toContain("Confirmo que a referência SEI");
 });
 it("permite assinatura opcional apenas onde explicitamente autorizada",()=>{
  expect(sql).toContain("p_grupo=ANY(politica.grupos_opcionais)");
  expect(sql).toContain("p_grupo=ANY(politica.grupos_obrigatorios)");
  expect(sql).toContain("p_data<doc.data_documento");
  expect(sql).toContain("emenda_subempenho_conclusoes");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.emenda_sub_matriz_padrao_homologar");
 });
 it("reutiliza cadastro de fiscais e histórico de comissão sem alterar tabelas PVH",()=>{
  expect(assinaturas).toContain('supabase.from("assinaturas_config")');
  expect(assinaturas).toContain("useHistoricoAssinaturasManuais");
  expect(assinaturas).toContain("Selecionar fiscal cadastrado");
  expect(assinaturas).toContain("Digite ou selecione um nome já registrado");
  expect(assinaturas).toContain("GRUPO_COMISSAO_SUBEMPENHO");
  expect(assinaturas).toContain("GRUPO_FISCAL_SUBEMPENHO");
  expect(assinaturas).not.toContain('from("pvh_subempenho_assinaturas").insert');
  expect(assinaturas).toContain('supabase.rpc("emenda_subempenho_assinar"');
 });
 it("assinatura real precisa de confirmação e prova documental, sem simular autossignatura",()=>{
  expect(assinaturas).toContain("Conferir assinatura");
  expect(assinaturas).toContain("Data real da assinatura");
  expect(assinaturas).toContain("Número SEI");
  expect(assinaturas).toContain("Link SEI");
  expect(assinaturas).not.toContain("onBlur={()=>salvar.mutate");
  expect(fluxo).toContain("<AssinaturasSubempenhoEmenda");
  expect(fluxo).toContain("<PainelPagamentosEmenda");
 });
});
