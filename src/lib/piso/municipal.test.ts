import { describe, expect, it } from "vitest";
import {
  competenciaExtenso,
  gerarMemorandoMunicipal,
  gerarMinutaMunicipal,
  notaFederalMunicipal,
} from "./municipal";

const base = {
  competencia: "09/2026",
  minutaSei: "31028992",
  minutaData: "2026-09-24",
  memorandoSei: "31029969",
  memorandoData: "2026-09-24",
  autoridade: "Daniela Aparecida Gregório França Cavalcante",
  cargo: "Secretária da Saúde",
  portariaFederal: "12.207",
  portariaFederalData: "2026-09-23",
  consultaInvestsus: "2026-09-24",
  totalPublicado: 9700.68,
  valorHomologado: 9700.68,
  valorTransferido: 9700.68,
  linhas: [{ cnes: "7728557", nome: "BOJ Filial", total: 9700.68 }],
  destinatarios: [{ nome: "Ana Paula Barauna", cargo: "Gerente", unidade: "SES.UAP" }],
};

describe("modelos municipais do Piso", () => {
  it("formata a competência como o HTML de referência", () => {
    expect(competenciaExtenso("09/2026")).toBe("setembro de 2026");
  });

  it("gera a Minuta com artigos, Anexo I e nota federal", () => {
    const txt = gerarMinutaMunicipal(base);
    expect(txt).toContain("MINUTA SEI Nº 31028992/2026 - SES.UCP.ACP");
    expect(txt).toContain("RESOLVE:");
    expect(txt).toContain("Art. 1º");
    expect(txt).toContain("ANEXO I");
    expect(txt).toContain("CNES\tNOME\tSETEMBRO DE 2026");
    expect(txt).toContain("Portaria GM/MS nº 12.207");
  });

  it("incorpora identificação de saldo e acerto na nota", () => {
    const nota = notaFederalMunicipal({
      ...base,
      descontoSaldo: 100,
      descontoIdentificacao: "Revisão Maio-Agosto/2023",
      acertoContas: 50,
      acertoIdentificacao: "Ajuste da competência anterior",
    });
    expect(nota).toContain("Revisão Maio-Agosto/2023");
    expect(nota).toContain("Ajuste da competência anterior");
  });

  it("identifica a décima terceira parcela em textos municipais", () => {
    const dados = { ...base, competencia: "11/2026",
      tipo_parcela: "decimo_terceiro" as const, exercicio_referencia: 2026 };
    expect(gerarMinutaMunicipal(dados)).toContain(
      "décima terceira parcela da AFC do exercício de 2026");
    expect(gerarMemorandoMunicipal(dados)).toContain(
      "Publicação de Portaria sobre décima terceira parcela da AFC do exercício de 2026");
  });

  it("não atribui à 13ª consulta mensal de carga ao InvestSUS", () => {
    const nota = notaFederalMunicipal({
      ...base, competencia: "11/2026", tipo_parcela: "decimo_terceiro",
      exercicio_referencia: 2026, consultaInvestsus: null,
    });
    expect(nota).toContain("distribuição por CNES oficialmente documentada");
    expect(nota).not.toContain("[DATA DA CONSULTA]");
  });

  it("gera Memorando com destinatários e assunto fixo", () => {
    const txt = gerarMemorandoMunicipal(base);
    expect(txt).toContain("MEMORANDO SEI Nº 31029969/2026 - SES.UCP.ACP");
    expect(txt).toContain("À SES.UAP");
    expect(txt).toContain("Ana Paula Barauna");
    expect(txt).toContain("Publicação de Portaria - Minuta SEI Nº 31028992/2026");
  });
});
