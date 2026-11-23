import { describe, expect, it } from "vitest";
import {
  descricaoAusenciaHomologacao, descricaoOcorrenciaPiso, tituloOcorrenciaPiso,
} from "./ocorrencias-apresentacao";

describe("Piso · apresentação de divergências carga x InvestSUS", () => {
  it("explica os R$ 825,00 de dois vínculos sem afirmar motivo de indeferimento", () => {
    const texto = descricaoAusenciaHomologacao({
      complementoEstimado: 825,
      pisoReferencia: 3325,
      salarioBaseDeclarado: 2500,
      jornadaSemanal: 44,
    });
    expect(texto).toContain("44h semanais");
    expect(texto).toContain("R$ 3.325,00");
    expect(texto).toContain("R$ 2.500,00");
    expect(texto).toContain("R$ 825,00");
    expect(texto).toContain("não deve ser somado ao repasse");
    expect(texto).toContain("não informam o motivo");
    expect(texto).not.toMatch(/foi rejeitado|foi indeferido|foi depurado/i);
  });

  it("reformula alertas persistidos na versão antiga sem precisar importar novamente", () => {
    const antigo = {
      regra: "nao_homologado_investsus",
      descricao: "Registro da Planilha de Carga não consta na saída homologada do InvestSUS. A União pode depurar registros por critérios próprios de homologação; confira o motivo no InvestSUS. Pela carga local, o complemento estimado seria R$ 825,00.",
    };
    const texto = descricaoOcorrenciaPiso(antigo);
    expect(tituloOcorrenciaPiso(antigo.regra)).toBe("Registro da carga ausente na homologação");
    expect(texto).toContain("R$ 825,00");
    expect(texto).toContain("inclusão na carga");
    expect(texto).not.toContain("A União pode depurar");
  });

  it("usa o cálculo detalhado de novas auditorias sem CPF ou nome", () => {
    const texto = descricaoOcorrenciaPiso({
      regra:"nao_homologado_investsus",
      descricao:"Outra mensagem",
      dados:{complemento_estimado:825,piso_referencia:3325,
        salario_base_declarado:2500,jornada_semanal:44},
    });
    expect(texto).toContain("R$ 825,00");
    expect(texto).toContain("R$ 3.325,00");
    expect(texto).not.toContain("Outra mensagem");
  });

  it("não inventa valor nem motivo quando não há estimativa local", () => {
    const texto = descricaoOcorrenciaPiso({
      regra:"nao_homologado_investsus",
      descricao:"Registro não consta na saída homologada.",
      dados:{},
    });
    expect(texto).not.toContain("diferença potencial estimada");
    expect(texto).toContain("não informam o motivo");
  });

  it("não muda a apresentação das demais ocorrências", () => {
    expect(descricaoOcorrenciaPiso({
      regra:"salario_divergente", descricao:"Conferir bases salariais.",
    })).toBe("Conferir bases salariais.");
    expect(tituloOcorrenciaPiso("salario_divergente")).toBe("salario divergente");
    expect(tituloOcorrenciaPiso("ausencia_sem_complemento"))
      .toBe("Ausente da homologação · sem diferença positiva");
  });
});
