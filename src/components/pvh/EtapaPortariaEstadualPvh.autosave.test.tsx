import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { EtapaPortariaEstadualPvh } from "./EtapaPortariaEstadualPvh";

const fonte = readFileSync(
  new URL("./EtapaPortariaEstadualPvh.tsx", import.meta.url),
  "utf8",
);
const rota = readFileSync(
  new URL("../../routes/_authenticated/pvh.$id.tsx", import.meta.url),
  "utf8",
);

const competencia = {
  id: "competencia-outubro",
  updated_at: "2026-11-10T17:55:00Z",
  portaria_estadual_numero: "SES Nº 3531",
  portaria_estadual_data: "2026-10-21",
  portaria_estadual_url: "https://saude.sc.gov.br/portaria-3531",
};
const participantes = [
  { id: "bethesda", prestadores: { nome_instituicao: "Instituição Bethesda" },
    valor_estadual: 1240000 },
  { id: "hmsj", prestadores: { nome_instituicao: "Hospital Municipal São José" },
    valor_estadual: 1775502.09 },
];

describe("PVH · regressão do incidente 10/2026 — autosave Etapa 1", () => {
  it("renderiza valores oficiais que já estão salvos em vez de um formulário vazio", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <EtapaPortariaEstadualPvh
          competenciaId={competencia.id}
          competencia={competencia}
          participantes={participantes}
          concluidas={{ "1": true }} reconferir={[]} podeEditar={true}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('value="SES Nº 3531"');
    expect(html).toContain('value="2026-10-21"');
    expect(html).toContain("https://saude.sc.gov.br/portaria-3531");
    expect(html).toContain("Instituição Bethesda");
    expect(html).toContain("Hospital Municipal São José");
  });

  it("nenhum efeito de montagem ou saída da tela dispara gravação dos dados financeiros", () => {
    expect(fonte).toContain("editadoPeloUsuarioRef.current");
    expect(fonte).toContain("!editadoPeloUsuarioRef.current");
    expect(fonte).toContain("NUNCA persistir dados no unmount");
    expect(fonte).not.toContain("primeiroCicloAutosaveRef");
    expect(fonte).toContain("[competencia.id, chaveOrigem]");
    expect(rota).toContain("key={comp.id}");
  });

  it("só atualiza os campos efetivamente alterados e protege concorrência", () => {
    expect(fonte).toContain("const alteracoes: Record<string, string | null>");
    expect(fonte).toContain("Object.keys(alteracoes).length > 0");
    expect(fonte).toContain("Math.abs(item.valor - valorAnterior) < 0.005");
    expect(fonte).toContain('.eq("valor_estadual", valorAnterior)');
    expect(fonte).toContain("atualizada em outra sessão");
  });

  it("hidratação/refetch não equivale a edição do usuário", () => {
    expect(fonte).toContain("if (editadoPeloUsuarioRef.current || salvandoRef.current) return;");
    expect(fonte).toContain("ultimoSnapshotSalvoRef.current = origem");
    expect(fonte).toContain("chaveAtual === ultimoSalvoRef.current");
  });
});
