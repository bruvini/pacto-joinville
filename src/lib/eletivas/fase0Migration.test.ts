import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/migrations/20261015101500_eletivas_fase0_integridade_execucao.sql", import.meta.url),
  ),
  "utf8",
);

describe("Fase 0 — estrutura SQL da auditoria de Eletivas", () => {
  it("não duplica nem deixa comandos de encerramento fora da função", () => {
    const identificador = "CREATE OR REPLACE FUNCTION public.ec_encerrar(p_comp uuid)";
    expect(migration.split(identificador)).toHaveLength(2);
    const trecho = migration.split(identificador)[1];
    const [corpo, restante] = trecho.split(
      "REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon;",
    );
    expect(corpo).toBeDefined();
    expect(restante).toBeDefined();
    expect(corpo.match(/RETURN v_total;/g)).toHaveLength(1);
    expect(corpo).toMatch(/RETURN v_total;\s*END;\s*\$\$;/);
    expect(restante).not.toMatch(/^\s*(?:AND|OR|IF|THEN|END IF|RAISE EXCEPTION)\b/m);
  });

  it("mantém as salvaguardas financeiras dentro da função", () => {
    const corpo = migration.split("CREATE OR REPLACE FUNCTION public.ec_encerrar(p_comp uuid)")[1]
      .split("REVOKE ALL ON FUNCTION public.ec_encerrar(uuid)")[0];
    expect(corpo).toContain("v.ec_execucao_id IS NULL");
    expect(corpo).toContain("v.ec_fontes_snapshot IS NULL");
    expect(corpo).toContain(">= 202607");
    expect(corpo).toContain("f->>'categoria'='s_mac_ms'");
    expect(corpo).toContain("categoria IN ('dbf_faec','dbf_mac','s_faec','s_mac')");
    expect(corpo).toContain("conferido_por IS NULL");
    expect(corpo).toContain("Relatório Técnico");
  });

  it("fecha os delimitadores PostgreSQL e a transação", () => {
    expect(migration.trim()).toMatch(/^--[\s\S]*\bBEGIN;[\s\S]*COMMIT;$/);
    for (const tag of ["preflight","audit","guard","reconferencia","conf","rpc","fn"]) {
      expect(migration.split("$" + tag + "$")).toHaveLength(3);
    }
    const blocos = migration.split("$$");
    expect(blocos).toHaveLength(3);
    expect(migration).toContain("to_jsonb(OLD)");
  });
});
