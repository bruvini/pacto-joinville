import { describe, expect, it } from "vitest";
import {
  atraso,
  diaCalendarioCompetencia,
  enesimoDiaUtilCompetencia,
  feriadosNacionaisFixos,
  pendenciasPrazosEtapa1Piso,
  prazosEtapa1Piso,
} from "./prazos";

describe("prazos operacionais do Piso", () => {
  it("mantém o utilitário genérico de dias úteis para outras rotinas", () => {
    expect(feriadosNacionaisFixos(2026)).toContain("2026-09-07");
    expect(enesimoDiaUtilCompetencia("09/2026", 5)).toBe("2026-09-08");
  });

  it("usa datas-calendário fixas 5, 10 e 15 na Etapa 1", () => {
    expect(diaCalendarioCompetencia("09/2026", 5)).toBe("2026-09-05");
    expect(prazosEtapa1Piso("09/2026")).toEqual({
      envioInstituicoes: "2026-09-05",
      retornoInstituicoes: "2026-09-10",
      envioInvestsus: "2026-09-15",
    });
  });

  it("não desloca o dia 5 mesmo quando cai em sábado", () => {
    expect(new Date("2026-09-05T12:00:00").getDay()).toBe(6);
    expect(prazosEtapa1Piso("09/2026").envioInstituicoes).toBe("2026-09-05");
  });

  it("classifica data tardia e pendência vencida como atraso", () => {
    expect(atraso("2026-09-06", "2026-09-05")).toBe(true);
    expect(atraso(null, "2026-09-05", "2026-09-04")).toBe(false);
    expect(atraso(null, "2026-09-05", "2026-09-06")).toBe(true);
  });

  it("gera gatilho do envio às instituições e não duplica retorno antes do envio", () => {
    const itens = pendenciasPrazosEtapa1Piso(
      [
        {
          id: "p1",
          competencia: "10/2026",
          status: "em_andamento",
          piso_participantes: [
            {
              id: "i1",
              prestador_id: "prest1",
              prestadores: { nome_instituicao: "Instituição A" },
              data_envio: null,
              data_retorno: null,
            },
          ],
          investsus_carga_em: null,
        },
      ],
      new Date(2026, 9, 7),
    );

    expect(itens.some((item) => item.tipo === "envio_instituicao")).toBe(true);
    expect(itens.some((item) => item.tipo === "retorno_instituicao")).toBe(false);
    expect(
      itens.find((item) => item.tipo === "envio_instituicao")?.severidade,
    ).toBe("critico");
  });

  it("passa a cobrar retorno até dia 10 depois que o envio foi registrado", () => {
    const itens = pendenciasPrazosEtapa1Piso(
      [
        {
          id: "p1",
          competencia: "10/2026",
          status: "em_andamento",
          piso_participantes: [
            {
              id: "i1",
              prestador_id: "prest1",
              prestadores: { nome_instituicao: "Instituição A" },
              data_envio: "2026-10-05",
              data_retorno: null,
            },
          ],
          investsus_carga_em: null,
        },
      ],
      new Date(2026, 9, 7),
    );

    const retorno = itens.find((item) => item.tipo === "retorno_instituicao");
    expect(retorno?.prazo).toBe("2026-10-10");
    expect(retorno?.dias).toBe(3);
    expect(retorno?.severidade).toBe("alerta");
  });

  it("cobra o envio ao InvestSUS até dia 15", () => {
    const itens = pendenciasPrazosEtapa1Piso(
      [
        {
          id: "p1",
          competencia: "10/2026",
          status: "em_andamento",
          piso_participantes: [],
          investsus_carga_em: null,
        },
      ],
      new Date(2026, 9, 10),
    );

    const investsus = itens.find((item) => item.tipo === "envio_investsus");
    expect(investsus?.prazo).toBe("2026-10-15");
    expect(investsus?.dias).toBe(5);
    expect(investsus?.severidade).toBe("preventivo");
  });
});
