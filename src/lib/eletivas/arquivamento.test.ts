import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolverDestinoEncontro} from "./competencias";
const read=(p:string)=>readFileSync(fileURLToPath(new URL("../../../"+p,import.meta.url)),"utf8");
const sql=read("supabase/migrations/20261016180000_eletivas_arquivamento_auditado.sql");
const lista=read("src/routes/_authenticated/eletivas.index.tsx");
const detalhe=read("src/routes/_authenticated/eletivas.$id.tsx");
describe("Eletivas — arquivamento em lugar de destruir auditoria",()=>{
 it("não transforma arquivada em competência nova",()=>{
  const p=resolverDestinoEncontro({lancamento_id:"x",encontro_id:"id",
   encontro_lancamento_id:null,encontro_status:"arquivada"});
  expect(p.acao).toBe("bloquear");
 });
 it("migração mantém unicidade, dados e trilha original",()=>{
  expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
  expect(sql).not.toContain("DELETE FROM public.eletivas_competencias");
  expect(sql).not.toContain("UPDATE public.lancamentos_pagamento");
  expect(sql).not.toContain("DROP INDEX");
  expect(sql).toContain("eletivas_eventos(competencia_id,tipo,dados,autor)");
  expect(sql).toContain("encontro_arquivado");
  expect(sql).toContain("encontro_restaurado");
 });
 it("não arquiva depois de fechamento, integração ou escolha de atesto",()=>{
  const f=sql.split("CREATE OR REPLACE FUNCTION public.ec_arquivar_competencia(")[1]
   .split("CREATE OR REPLACE FUNCTION public.ec_restaurar_competencia(")[0];
  for(const x of ["c.status='encerrada'","eletivas_fechamentos",
   "eletivas_integracoes","eletivas_atesto_escolhas",
   "length(btrim(coalesce(p_motivo,'')))<20"])expect(f).toContain(x);
 });
 it("SQL bloqueia escrita em fontes, itens e demais evidências arquivadas",()=>{
  for(const x of ["ec_proteger_evidencia_arquivada",
    "'eletivas_arquivos'","'eletivas_itens'",
    "'eletivas_correcoes'","'eletivas_fpo_programacoes'",
    "'eletivas_decisoes_revisoes'"])expect(sql).toContain(x);
 });
 it("UI distingue excluir rascunho vazio, arquivar auditoria e restaurar",()=>{
  for(const x of ["ec_excluir_competencia","ec_arquivar_competencia",
   "ec_restaurar_competencia","Mostrar arquivadas","Excluir rascunho vazio",
   "Arquivar e retirar da lista"])expect(lista).toContain(x);
  expect(detalhe).toContain("!c.arquivada_em");
 });
});
