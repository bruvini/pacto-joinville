import { describe, expect, it } from "vitest";
import { conflitoParcelaPiso, identidadeParcelaPiso, parcelaPisoValida, periodoAfcDocumentoPiso, rotuloParcelaPiso } from "./parcelas";

describe("identidade de parcelas da AFC/Piso", () => {
  const mensal = { competencia: "11/2026", tipo_parcela: "mensal" as const, exercicio_referencia: 2026 };
  const decimo = { competencia: "11/2026", tipo_parcela: "decimo_terceiro" as const, exercicio_referencia: 2026 };

  it("permite novembro mensal e novembro 13ª como processos diferentes", () => {
    expect(parcelaPisoValida(mensal)).toBeNull();
    expect(parcelaPisoValida(decimo)).toBeNull();
    expect(conflitoParcelaPiso([mensal], decimo)).toBe(false);
    expect(conflitoParcelaPiso([decimo], mensal)).toBe(false);
  });

  it("impede duplicar 13ª do mesmo exercício mesmo que o repasse ocorra em outro mês", () => {
    expect(conflitoParcelaPiso([decimo], { ...decimo, competencia: "12/2026" })).toBe(true);
    expect(conflitoParcelaPiso([mensal], mensal)).toBe(true);
  });

  it("não confunde 13ª paga em exercício seguinte com 13ª de outro exercício", () => {
    const posterior = { ...decimo, competencia: "01/2027" };
    expect(parcelaPisoValida(posterior)).toBeNull();
    expect(rotuloParcelaPiso(posterior)).toContain("exercício 2026 · repasse 01/2027");
  });

  it("mantém competências antigas como mensais", () => {
    expect(identidadeParcelaPiso({ competencia: "08/2026" })).toEqual({
      competencia: "08/2026", tipo_parcela: "mensal", exercicio_referencia: 2026,
    });
  });

  it("deriva o exercício da 13ª diretamente do MM/AAAA, sem campo separado", () => {
    const inicial = identidadeParcelaPiso({
      competencia: "11/2026", tipo_parcela: "decimo_terceiro",
    });
    expect(inicial).toEqual(decimo);
    expect(parcelaPisoValida(inicial)).toBeNull();

    const novoMes = identidadeParcelaPiso({
      competencia: "12/2027", tipo_parcela: "decimo_terceiro",
    });
    expect(novoMes.exercicio_referencia).toBe(2027);
    expect(parcelaPisoValida(novoMes)).toBeNull();
    expect(conflitoParcelaPiso([decimo], novoMes)).toBe(false);
    expect(conflitoParcelaPiso([decimo], inicial)).toBe(true);
  });

  it("não permite criar 13ª com mês/ano incompleto ou inexistente", () => {
    const incompleta = identidadeParcelaPiso({
      competencia: "11/20", tipo_parcela: "decimo_terceiro",
    });
    expect(parcelaPisoValida(incompleta)).not.toBeNull();
    expect(incompleta.exercicio_referencia).toBe(0);
  });

  it("não altera automaticamente os valores nem presume cálculo do 13º", () => {
    expect(periodoAfcDocumentoPiso(decimo)).toBe("décima terceira parcela da AFC do exercício de 2026");
    expect(parcelaPisoValida({ ...mensal, exercicio_referencia: 2025 })).not.toBeNull();
  });
});
