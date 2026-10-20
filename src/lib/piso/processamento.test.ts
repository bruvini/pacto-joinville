import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invest: vi.fn(async ({ data }: any) => ({
    tipo: "investsus", audit: { linhas: 4 }, arquivoId: data.arquivoId,
  })),
  carga: vi.fn(async () => ({ tipo: "planilha_carga" })),
  invoke: vi.fn(async () => ({ data: { tipo: "portaria_gm" }, error: null })),
}));
vi.mock("@/lib/piso/processar-investsus", () => ({
  processarInvestsusPisoServidor: mocks.invest,
}));
vi.mock("@/lib/piso/processar-carga", () => ({
  processarCargaPisoServidor: mocks.carga,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { processarEvidenciaPiso } from "./processamento";

describe("roteamento das evidências do Piso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("InvestSUS mensal usa o servidor da aplicação e o arquivo já cadastrado", async () => {
    const resultado = await processarEvidenciaPiso("competencia", "arquivo-historico", "investsus");
    expect(resultado.tipo).toBe("investsus");
    expect((resultado as any).arquivoId).toBe("arquivo-historico");
    expect(mocks.invest).toHaveBeenCalledWith({
      data: { competenciaId: "competencia", arquivoId: "arquivo-historico" },
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("Planilha de Carga mantém seu processamento próprio", async () => {
    await processarEvidenciaPiso("c", "a", "planilha_carga");
    expect(mocks.carga).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("Portaria e memória da 13ª seguem em caminho separado", async () => {
    await processarEvidenciaPiso("c", "p", "portaria_gm");
    await processarEvidenciaPiso("c", "a13", "afc13_cnes");
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
});
