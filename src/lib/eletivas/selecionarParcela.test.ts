import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const ler=(path:string)=>readFileSync(fileURLToPath(new URL("../../../"+path,import.meta.url)),"utf8");
const sql=ler("supabase/migrations/20261015203000_eletivas_selecao_legado_cnes.sql");
const tela=ler("src/routes/_authenticated/eletivas.index.tsx");

describe("Parcela de origem: correções de interface e vínculo fiscal",()=>{
 it("é migration incremental e preserva 07/2026 com atesto anterior",()=>{
  expect(sql).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
  expect(sql).not.toMatch(/DELETE FROM public\.eletivas_competencias|TRUNCATE/);
  const lista=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_listar_parcelas_encontro"),
    sql.indexOf("REVOKE ALL ON FUNCTION public.ec_listar_parcelas_encontro"));
  expect(lista).toContain("e.prestador_id=l.prestador_id AND e.competencia=l.competencia");
  expect(lista).toContain("e.id AS");
  expect(lista).toContain("AND NOT l.concluido");
  expect(lista).toContain("AND l.data_pagamento IS NULL");
  expect(lista).not.toContain("l.valor_atestado IS NULL");
  expect(lista).not.toContain("l.valor_atestado=0");
  expect(lista).toContain("e.lancamento_id IS NULL");
  expect(lista).toContain("e.lancamento_id=l.id");
 });
 it("CNES vem do prestador e não do formulário",()=>{
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ec_cnes_instituicoes");
  expect(sql).toContain("SELECT c.cnes INTO cnes_oficial");
  expect(sql).toContain("cnes_oficial,p_lanc,auth.uid()");
  expect(tela).not.toContain("CNES da instituição");
  expect(tela).not.toContain("maxLength={7}");
  expect(tela).toContain("ec_listar_parcelas_encontro");
  expect(tela).toContain("ec_criar_competencia_vinculada");
 });
 it("lista não exibe partes de IDs nas opções",()=>{
  expect(tela).toContain('x.competencia} · Parcela');
  expect(tela).not.toContain("x.lancamento_id.slice");
  expect(tela).not.toContain("x.id.slice");
  expect(tela).not.toContain("x.convenio_id.slice");
  expect(tela).toContain("Encontro existente");
  expect(tela).toContain("Vincular e abrir encontro existente");
 });
 it("editar e excluir aparecem para cada competência; não apaga evidências",()=>{
  expect(tela).not.toContain('editor&&c.status==="preparacao"&&');
  expect(tela).toContain('aria-label={"Editar "+c.competencia}');
  expect(tela).toContain('aria-label={"Excluir "+c.competencia}');
  expect(tela).toContain("ec_atualizar_observacao_competencia");
  expect(tela).toContain("Já entrou em auditoria");
  expect(sql).toContain("observacao_encontro_editada");
  expect(sql).not.toContain("DROP TABLE public.eletivas_itens");
 });
});
