import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../../../supabase/migrations/20261109140000_pvh_ne_multicompetencia_fase_a.sql", import.meta.url), "utf8");
const pre = readFileSync(new URL("../../../scripts/pvh-fase-a-preflight.sql", import.meta.url), "utf8");
const post = readFileSync(new URL("../../../scripts/pvh-fase-a-postflight.sql", import.meta.url), "utf8");

describe("PVH · Fase A · NE multicompetência", () => {
  it("migra em transação única e não reescreve empenhos, alocações ou subempenhos existentes", () => {
    expect(migration.trimStart()).toMatch(/^--/);
    expect(migration).toContain("\nBEGIN;\n");
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM|TRUNCATE)\s+public\.(?:pvh_empenho_alocacoes|pvh_subempenhos)/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.pvh_empenhos/i);
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/i);
  });
  it("separa o valor solicitado sem inventar pedidos históricos", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS valor_solicitado numeric(16,2)");
    expect(migration).toContain("CHECK (valor_solicitado IS NULL OR valor_solicitado > 0)");
    expect(migration).not.toMatch(/SET\s+valor_solicitado\s*=\s*valor_total/i);
  });
  it("só confirma meses históricos realmente usados e identifica origem como pendente", () => {
    expect(migration).toContain("historica_alocacao");
    expect(migration).toContain("historica_origem_pendente");
    expect(migration).toContain("FROM public.pvh_empenho_alocacoes a");
    expect(migration).toContain("JOIN public.pvh_competencias c");
    expect(migration).toMatch(/ON CONFLICT \(empenho_id, competencia\) DO NOTHING/g);
    expect(migration).toContain("UNIQUE (empenho_id, competencia)");
  });
  it("prepara anulação residual apenas documental e protege o vínculo da NE", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pvh_empenho_anulacoes");
    expect(migration).toContain("valor_anulado numeric(16,2) NOT NULL CHECK (valor_anulado > 0)");
    expect(migration).toContain("data_anulacao date NOT NULL");
    expect(migration).toContain("numero_sei text NOT NULL");
    expect(migration).toContain("REFERENCES public.pvh_empenhos(id) ON DELETE RESTRICT");
    expect(migration).not.toMatch(/INSERT INTO public\.pvh_empenho_anulacoes/i);
  });
  it("RLS habilitado: apenas leitura institucional na Fase A, sem escrita direta do navegador", () => {
    expect(migration).toContain("ALTER TABLE public.pvh_empenho_competencias ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.pvh_empenho_anulacoes ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("GRANT SELECT ON TABLE public.pvh_empenho_competencias TO authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.pvh_empenho_anulacoes TO authenticated");
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.pvh_empenho_(?:competencias|anulacoes) TO authenticated/i);
    expect(migration).toContain("ARRAY['admin','acp','aco']::public.app_role[]");
  });
  it("audita mudanças futuras e preserva os vínculos na consulta de verificação", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.pvh_ne_fase_a_auditar()");
    expect(migration).toContain("INSERT INTO public.historico_logs");
    expect(migration).toContain("trg_pvh_ne_competencias_audit");
    expect(migration).toContain("trg_pvh_ne_anulacoes_audit");
    expect(pre).toContain("c.competencia='10/2026'");
    expect(post).toContain("alocacoes_historicas_sem_mes");
    expect(post).toContain("anulacoes_registradas_na_migration");
    expect(post).toContain("c.competencia='10/2026'");
  });
});