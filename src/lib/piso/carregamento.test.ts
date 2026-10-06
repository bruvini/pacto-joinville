import { describe, expect, it } from "vitest";
import { consultarFonte, reunirFontes } from "./carregamento";

describe("diagnóstico do contexto operacional", () => {
  it("preserva tabela, código e mensagem real do Supabase", async () => {
    await expect(
      consultarFonte(
        "prestador_cnes",
        Promise.resolve({
          data: null,
          error: {
            code: "PGRST205",
            message: "Could not find the table 'public.prestador_cnes' in the schema cache",
          },
        }),
      ),
    ).rejects.toThrow(
      "prestador_cnes: Could not find the table 'public.prestador_cnes' in the schema cache (PGRST205)",
    );
  });
  it("mostra todas as falhas simultâneas sem construir contexto parcial", async () => {
    await expect(
      reunirFontes({
        cnes: consultarFonte(
          "prestador_cnes",
          Promise.resolve({ data: null, error: { message: "tabela ausente" } }),
        ),
        ocorrencias: consultarFonte(
          "piso_ocorrencias",
          Promise.resolve({ data: null, error: { message: "coluna categoria ausente" } }),
        ),
      }),
    ).rejects.toThrow("prestador_cnes: tabela ausente\npiso_ocorrencias: coluna categoria ausente");
  });
  it("aceita listas vazias válidas e identifica falhas de transporte", async () => {
    await expect(
      reunirFontes({ docs: consultarFonte("piso_documentos", Promise.resolve({ data: [] })) }),
    ).resolves.toEqual({ docs: [] });
    await expect(
      consultarFonte("piso_documentos", Promise.reject(new Error("Failed to fetch"))),
    ).rejects.toThrow("piso_documentos: Failed to fetch");
  });
});
