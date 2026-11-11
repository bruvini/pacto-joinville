import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  new URL("../../components/pvh/EtapaPortariaEstadualPvh.tsx", import.meta.url), "utf8",
);
const rota = readFileSync(
  new URL("../../routes/_authenticated/pvh.$id.tsx", import.meta.url), "utf8",
);

describe("Incidente PVH 10/2026 · prevenção de limpeza silenciosa da Etapa 1", () => {
  it("hidrata Portaria SES e valores estaduais reais, não campos vazios", () => {
    expect(fonte).toContain("competencia.portaria_estadual_numero ??");
    expect(fonte).toContain("competencia.portaria_estadual_data ??");
    expect(fonte).toContain("competencia.portaria_estadual_url ??");
    expect(fonte).toContain("Number(item.valor_estadual ?? 0)");
    expect(fonte).toContain("[competencia.id, chaveOrigem]");
  });

  it("refetch não marca edição humana nem autoriza autosave", () => {
    expect(fonte).toContain("if (editadoPeloUsuarioRef.current || salvandoRef.current) return;");
    expect(fonte).toContain("!editadoPeloUsuarioRef.current");
    expect(fonte).toContain("ultimoSnapshotSalvoRef.current = origem");
  });

  it("navegar ou desmontar formulário jamais grava seu snapshot automaticamente", () => {
    const unmount = fonte.slice(
      fonte.indexOf("NUNCA persistir dados no unmount") - 50,
      fonte.indexOf("NUNCA persistir dados no unmount") + 230,
    );
    expect(unmount).toContain("window.clearTimeout(timerRef.current)");
    expect(unmount).not.toContain("enfileirarPersistencia");
    expect(rota).toContain("key={comp.id}");
  });

  it("apenas campos alterados podem ser atualizados no banco", () => {
    expect(fonte).toContain("const alteracoes: Record<string, string | null>");
    expect(fonte).toContain("Object.keys(alteracoes).length > 0");
    expect(fonte).toContain("Math.abs(item.valor - valorAnterior) < 0.005");
    expect(fonte).toContain('.eq("valor_estadual", valorAnterior)');
    expect(fonte).toContain("atualizada em outra sessão");
  });

  it("todas as entradas editáveis marcam ação do usuário", () => {
    expect(fonte.match(/editadoPeloUsuarioRef\.current = true/g)?.length).toBeGreaterThanOrEqual(4);
    expect(fonte).toContain("snapshotAtualRef.current");
  });
});
