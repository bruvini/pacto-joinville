import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Teste estrutural: a confirmação de execução no PostgreSQL exige aplicar
// a migration em cada ambiente, sem inserir registros fictícios na produção.
const sql = readFileSync(
  new URL("../../../supabase/migrations/20261028211000_emendas_corrige_trigger_auditoria.sql", import.meta.url),
  "utf8",
);

describe("auditoria das emendas: correção PostgreSQL 42703", () => {
  it("acessa id e emenda_id via JSONB, sem campos RECORD ausentes", () => {
    expect(sql).toContain("to_jsonb(NEW)");
    expect(sql).toContain("to_jsonb(OLD)");
    expect(sql).toContain("v_registro ->> 'id'");
    expect(sql).toContain("v_registro ->> 'emenda_id'");
    expect(sql).not.toMatch(/\b(?:NEW|OLD)\.emenda_id\b/i);
  });

  it("diferencia a emenda principal das tabelas filhas", () => {
    expect(sql).toContain("IF TG_TABLE_NAME = 'emendas' THEN");
    expect(sql).toContain("v_emenda_id := v_registro_id");
    for (const tabela of [
      "emenda_documentos", "emenda_fontes", "emenda_ajustes_valor",
      "emenda_competencias", "emenda_solicitacoes", "emenda_competencias_filhas",
    ]) expect(sql).toContain("'" + tabela + "'");
  });

  it("protege também o validador das tabelas filhas contra campos RECORD ausentes",()=>{
    const reparo = readFileSync(new URL(
      "../../../supabase/migrations/20261028231500_emendas_validador_filhas_jsonb.sql",
      import.meta.url,
    ),"utf8");
    expect(reparo).toContain("CREATE OR REPLACE FUNCTION public.emenda_validar_filho()");
    expect(reparo).toContain("to_jsonb(NEW)");
    expect(reparo).toContain("->> 'emenda_id'");
    expect(reparo).not.toMatch(/\bNEW\.emenda_id\b/);
    expect(reparo).toContain("REVOKE ALL");
  });
  it("é pontual, não remove gatilhos nem afrouxa permissões", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.emenda_registrar_historico\(\)/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+(?:TABLE|TRIGGER)\b/i);
    expect(sql).toContain("INSERT INTO public.emenda_historico");
  });
});
