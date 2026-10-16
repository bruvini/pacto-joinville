import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL("../../../"+p,import.meta.url)),"utf8");
const legacy=read("supabase/migrations/20261016210000_eletivas_reparo_exclusao_legado.sql");
const guard=read("supabase/migrations/20261016213000_eletivas_fase4_guard_normativo.sql");
describe("Legado julho + Fase 4: contrato SQL fiscal",()=>{
 it("legado sem lancamento_id pode ser excluído sem vincular parcela por inferência",()=>{
  expect(legacy).toContain("ALTER COLUMN lancamento_id DROP NOT NULL");
  expect(legacy).not.toContain("Competência sem origem vinculada");
  expect(legacy).not.toMatch(/UPDATE public\.lancamentos_pagamento/);
  expect(legacy).not.toMatch(/DELETE FROM public\.lancamentos_pagamento/);
  expect(legacy).toContain("l2.prestador_id=v.prestador_id");
  expect(legacy).toContain("l2.competencia=v.competencia");
  // Apenas convênio de Eletivas: pagamentos de outros convênios HMSJ
  // no mesmo mês não devem impedir a limpeza de teste desta modalidade.
  expect(legacy).toContain("cv2.modelo_fluxo='fluxo_1'");
  expect(legacy).toContain("cv2.objeto ILIKE '%eletiv%'");
  expect(legacy).toContain("eletivas_atesto_escolhas");
  expect(legacy).toContain("v.lancamento_id IS NULL");
  expect(legacy).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
 });
 it("impede aceitar múltiplas sem prova e compara norma CIB no banco",()=>{
  for(const x of ["ec_norma_cib_competencia","030/CIB/2025","727/CIB/2025",
   "399/CIB/2026","BETWEEN 202509 AND 202607",
   "BETWEEN 202608 AND 202612",
   "ec_normativa_fase4_guard","NEW.categoria='faec_mult'",
   "NEW.categoria='mac_mult'","publicacao_independente",
   "base_independente_comprovada","exige_programacao_fpo",
   "NEW.detalhe->>'regra_normativa'"])expect(guard).toContain(x);
  expect(guard).not.toMatch(/UPDATE public\.eletivas_competencias SET/);
  expect(guard).not.toMatch(/DELETE FROM public\.eletivas_itens/);
  expect(guard).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
 });
});
