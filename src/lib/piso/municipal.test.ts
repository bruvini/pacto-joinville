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
    expect(txt.startsWith("Dispõe sobre")).toBe(true);
    expect(txt).not.toContain("MINUTA SEI Nº");
    expect(txt).not.toContain("Joinville, 24 de setembro");
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

  it("não insere texto-placeholder de identificação do saldo quando não informado", () => {
    const nota = notaFederalMunicipal({
      ...base, descontoSaldo: 8114.28,
      descontoIdentificacao: "", valorTransferido: 1762.4,
    });
    expect(nota).toContain("desconto de saldo em conta de R$");
    expect(nota).not.toContain("[IDENTIFICAR O SALDO UTILIZADO]");
    expect(nota).not.toContain("Identificação do saldo:");
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
    expect(nota).toContain("memória interna");
    expect(nota).toContain("conciliados com a");
    expect(nota).not.toContain("[DATA DA CONSULTA]");
  });

  it("gera memorando completo com destinatários, sem cabeçalho ou data do SEI", () => {
    const txt = gerarMemorandoMunicipal(base);
    expect(txt.startsWith("À SES.UAP\nAna Paula Barauna\nGerente")).toBe(true);
    expect(txt).toContain("Assunto: Publicação de Portaria");
    expect(txt).toContain("Prezadas(os),");
    expect(txt).toContain("Conforme estabelecido na Portaria Nº 307/2023/SES");
    expect(txt).toContain("Atenciosamente,");
    expect(txt).not.toContain("MEMORANDO SEI Nº");
    expect(txt).not.toContain("Joinville, 24 de setembro");
    expect(txt).toContain("Publicação de Portaria - Minuta SEI Nº 31028992/2026");
  });

  it("inclui todos os destinatários cadastrados e seus cargos como no memorando do SEI", () => {
    const txt = gerarMemorandoMunicipal({
      ...base,
      destinatarios: [
        { unidade: "SES.UAP", nome: "Sra Ana Paula Barauna", cargo: "Gerente" },
        { unidade: "SES.UAP.APA", nome: "Sra Renata Oliveira Mira", cargo: "Coordenadora" },
      ],
    });
    expect(txt).toContain("À SES.UAP e\nSra Ana Paula Barauna\nGerente");
    expect(txt).toContain("SES.UAP.APA\nSra Renata Oliveira Mira\nCoordenadora");
    expect(txt.indexOf("SES.UAP.APA")).toBeLessThan(txt.indexOf("Assunto:"));
    expect(txt).not.toContain("Joinville,");
  });

  it("sinaliza destinatário não informado sem inventar nomes", () => {
    const txt = gerarMemorandoMunicipal({ ...base, destinatarios: [] });
    expect(txt.startsWith("[DESTINATÁRIOS]")).toBe(true);
  });
});
