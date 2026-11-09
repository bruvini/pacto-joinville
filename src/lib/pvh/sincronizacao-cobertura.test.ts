import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const etapa3 = readFileSync(
  new URL("../../components/pvh/EtapaEmpenhosPvh.tsx", import.meta.url), "utf8",
);
const rota = readFileSync(
  new URL("../../routes/_authenticated/pvh.$id.tsx", import.meta.url), "utf8",
);

describe("PVH 10/2026 — recuperação segura da cobertura de NEs emitidas", () => {
  it("oferece sincronização explícita da cobertura quando a emissão não foi alocada", () => {
    expect(etapa3).toContain("const emissaoSemCobertura = !todosCobertos");
    expect(etapa3).toContain('e.solicitacao_competencia_id === competenciaId');
    expect(etapa3).toContain('e.status === "ativo"');
    expect(etapa3).toContain("Sincronizar cobertura e abrir Etapa 4");
    expect(etapa3).toContain('supabase.rpc("pvh_preparar_etapa4"');
  });
  it("consulta novamente as alocações e só então prepara a navegação", () => {
    expect(etapa3).toContain('qc.invalidateQueries({ queryKey: ["pvh_alocacoes_acesso", competenciaId] })');
    expect(etapa3.indexOf("onPreparada?.()")).toBeGreaterThan(
      etapa3.indexOf('qc.invalidateQueries({ queryKey: ["pvh_alocacoes_acesso", competenciaId] })'),
    );
    expect(rota).toContain("onPreparada={() => setAvancoPendente(4)}");
    expect(rota).toContain("if (avancoPendente == null || !acessos[avancoPendente]) return;");
  });
  it("preserva a dependência de confirmação FMS para concluir, não para lançar os subempenhos", () => {
    const etapa4 = readFileSync(
      new URL("../../components/pvh/EtapaSubempenhosPvh.tsx", import.meta.url), "utf8",
    );
    expect(etapa4).toContain('supabase.rpc("pvh_concluir_etapa4"');
    expect(etapa4).toContain('supabase.rpc("pvh_preparar_etapa4"');
    expect(etapa3).not.toContain('supabase.rpc("pvh_concluir_etapa4"');
  });
});