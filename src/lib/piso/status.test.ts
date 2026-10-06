import { describe, expect, it } from "vitest";
import { statusParticipantePiso } from "./status";

describe("status automático do participante do Piso", () => {
  it.each([
    [{}, false, 0, "Aguardando envio"],
    [{ data_envio: "2026-09-05" }, false, 0, "Aguardando retorno"],
    [{ data_envio: "2026-09-05", data_retorno: "2026-09-10" }, false, 0, "Aguardando planilha"],
    [
      { data_envio: "2026-09-05", data_retorno: "2026-09-10", sem_elegiveis: true },
      false,
      0,
      "Retorno sem elegíveis",
    ],
    [
      { data_envio: "2026-09-05", data_retorno: "2026-09-10", auditoria_resumo: { linhas: 2 } },
      true,
      0,
      "Planilha auditada",
    ],
    [
      { data_envio: "2026-09-05", data_retorno: "2026-09-10", auditoria_resumo: { linhas: 2 } },
      true,
      2,
      "2 ocorrência(s) registrada(s)",
    ],
  ])("deriva o rótulo sem escolha manual", (participante, planilha, ocorrencias, esperado) => {
    expect(statusParticipantePiso(participante, planilha, ocorrencias).rotulo).toBe(esperado);
  });
});
