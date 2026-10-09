import { describe, expect, it, vi } from "vitest";
import { encaminharDepoisDePersistir } from "./encaminhamento";

describe("encaminhamento do Aviso de Movimento à SEFAZ", () => {
  it("aguarda a persistência terminar antes de confirmar envio", async () => {
    const ordem: string[] = [];
    let liberar!: (ok: boolean) => void;
    const persistir = vi.fn(() => new Promise<boolean>((resolve) => {
      liberar = resolve;
      ordem.push("iniciou salvamento");
    }));
    const confirmar = vi.fn(async () => { ordem.push("confirmou envio"); });

    const operacao = encaminharDepoisDePersistir(persistir, confirmar);
    expect(confirmar).not.toHaveBeenCalled();
    liberar(true);
    await operacao;
    expect(ordem).toEqual(["iniciou salvamento", "confirmou envio"]);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });

  it("impede confirmação quando o autosave retorna falha", async () => {
    const confirmar = vi.fn(async () => {});
    await expect(encaminharDepoisDePersistir(
      async () => false, confirmar,
    )).rejects.toThrow("ainda não foram salvos");
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("não confirma quando o autosave rejeita com erro SQL", async () => {
    const confirmar = vi.fn(async () => {});
    await expect(encaminharDepoisDePersistir(
      async () => { throw new Error('record "old" has no field "documento_id"'); },
      confirmar,
    )).rejects.toThrow("documento_id");
    expect(confirmar).not.toHaveBeenCalled();
  });
});
