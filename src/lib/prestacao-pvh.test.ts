import { describe, expect, it } from "vitest";
import { convenioVisualPrestacao, lancamentosPrestacaoPvh } from "./prestacao-pvh";
import { prazoLimitePrestacao } from "./prestacao";

const participante = {
  prestador_id: "prestador-bethesda",
  prestadores: { nome_instituicao: "Instituição Bethesda" },
};

describe("Prestação de contas por parcela PVH", () => {
  const pcs = [
    {
      id: "pc-1", pvh_pagamento_id: "pvh-pg-1",
      pvh_prazo_dias: 30, pvh_data_limite: "2026-10-03",
    },
    {
      id: "pc-2", pvh_pagamento_id: "pvh-pg-2",
      pvh_prazo_dias: 45, pvh_data_limite: "2026-11-17",
    },
  ];

  const pagamentos = [
    {
      id: "pvh-pg-2", participante_id: "p-1", competencia_id: "comp-1",
      data_pagamento: "2026-10-03", valor_pago: 400,
      pvh_participantes: participante, pvh_competencias: { competencia: "08/2026" },
    },
    {
      id: "pvh-pg-1", participante_id: "p-1", competencia_id: "comp-1",
      data_pagamento: "2026-09-03", valor_pago: 600,
      pvh_participantes: participante, pvh_competencias: { competencia: "08/2026" },
    },
    {
      id: "sem-pc", participante_id: "p-2", competencia_id: "comp-1",
      data_pagamento: "2026-09-03", valor_pago: 100,
      pvh_participantes: participante, pvh_competencias: { competencia: "08/2026" },
    },
  ];

  it("cria uma linha visual para cada pagamento vinculado, sem incluir não elegíveis", () => {
    const linhas = lancamentosPrestacaoPvh(pcs, pagamentos);
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.id === "pvh-pg-1")).toMatchObject({
      parcela: "1", valor_atestado: 600, prestador_id: "prestador-bethesda",
      pvh_competencia_id: "comp-1", origem_prestacao: "pvh",
    });
    expect(linhas.find((l) => l.id === "pvh-pg-2")?.parcela).toBe("2");
  });

  it("conserva o vencimento gravado, independentemente de futuras alterações cadastrais", () => {
    const linha = lancamentosPrestacaoPvh(pcs, pagamentos)[0];
    const convenio = convenioVisualPrestacao(linha, {});
    const prazo = prazoLimitePrestacao(linha, convenio);
    expect(prazo?.getFullYear()).toBe(2026);
    expect(prazo?.getMonth()).toBe(10);
    expect(prazo?.getDate()).toBe(17);
  });

  it("não interfere na resolução normal de convênios", () => {
    const original = { id: "c-1", exige_prestacao_contas: true };
    expect(convenioVisualPrestacao({ convenio_id: "c-1" }, { "c-1": original })).toBe(original);
  });
});
