import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acessosCompetenciaPvh } from "./acesso";
const d=readFileSync(new URL("../../../supabase/migrations/20261109190000_pvh_esteira_independente_fase_d.sql",import.meta.url),"utf8");
const e=readFileSync(new URL("../../../supabase/migrations/20261109200000_pvh_anulacao_residual_fase_e.sql",import.meta.url),"utf8");
const patch=readFileSync(new URL("../../../supabase/migrations/20261110100000_pvh_homologacao_integrada_cde_preparacao_etapa4.sql",import.meta.url),"utf8");
describe("Homologação integrada C+D+E: pré-condições persistidas no banco",()=>{
  it("exige cobertura integral também no RPC de preparação da Etapa 4",()=>{
    expect(patch).toContain("CREATE OR REPLACE FUNCTION public.pvh_preparar_etapa4");
    expect(patch).toContain("abs(v_coberto-v_devido) >= 0.01");
    expect(patch).toContain("v_invalido>0");
    expect(patch).toContain("public.pvh_sincronizar_cobertura_competencia(p_comp)");
    expect(patch).toContain("portaria_municipal_publicada");
    expect(patch).toContain("pg_advisory_xact_lock");
    expect(patch).not.toContain("recurso_fms_data IS NULL");
    expect(patch).not.toContain("recurso_fms_valor");
  });
  it("não altera dados financeiros históricos no patch",()=>{
    expect(patch.trimEnd()).toMatch(/COMMIT;$/);
    expect(patch).not.toMatch(/UPDATE\s+public\.pvh_empenho_alocacoes/i);
    expect(patch).not.toMatch(/DELETE\s+FROM\s+public\.pvh_empenho_alocacoes/i);
    expect(patch).not.toMatch(/INSERT\s+INTO\s+public\.pvh_empenho_anulacoes/i);
  });
  it("preserva a conclusão orçamentária da 3 sem o FMS e a financeira da 4 dependente",()=>{
    expect(d).toContain("Conclua/reconfira a Portaria Estadual antes dos empenhos.");
    expect(d).toContain("portaria_municipal_publicada");
    expect(d).not.toContain("Conclua a Etapa 2 antes dos empenhos.");
    expect(d).not.toContain("CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa4");
  });
  it("a anulação da E é contábil, única e restrita com documento SEI",()=>{
    expect(e).toContain("p_valor_contabil <> v_saldo");
    expect(e).toContain("auth.uid()");
    expect(e).toContain("ARRAY['admin','acp']");
    expect(e).toContain("pvh_empenho_anulacoes");
    expect(e).toContain("p_numero_sei");
    expect(e).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(e).toContain("trg_pvh_ne_anulacao_imutavel");
  });
  it("mesma regra frontend e banco: parcial não prepara",()=>{
    const c={portaria_estadual_numero:"416/2026",portaria_estadual_data:"2026-10-01",portaria_estadual_url:"https://saude.sc.gov.br/"};
    const participantes=[{id:"hmsj",valor_estadual:1775502.09}];
    const concluidas={"1":true,"2":false};
    const parcial=[{participante_id:"hmsj",valor_alocado:1000000,pvh_empenhos:{numero_ne:"6604/2026",status:"ativo"}}];
    const completo=[{participante_id:"hmsj",valor_alocado:1775502.09,pvh_empenhos:{numero_ne:"6604/2026",status:"ativo"}}];
    expect(acessosCompetenciaPvh({competencia:c,participantes,alocacoes:parcial,concluidas,reconferir:[]})[4]).toBe(false);
    expect(acessosCompetenciaPvh({competencia:c,participantes,alocacoes:completo,concluidas,reconferir:[]})[4]).toBe(true);
  });
});
