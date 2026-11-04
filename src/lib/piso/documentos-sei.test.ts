import { describe, expect, it } from "vitest";
import { gerarMinutaMunicipal, gerarMemorandoMunicipal } from "./municipal";
import { gerarHtmlDocumentoSeiPiso } from "./documentos-sei";

const dados = {
  competencia: "10/2026",
  minutaSei: "31028992",
  minutaData: "2026-11-04",
  memorandoSei: "31029969",
  memorandoData: "2026-11-04",
  autoridade: "Secretária Municipal",
  cargo: "Secretária da Saúde",
  portariaFederal: "12.295",
  portariaFederalData: "2026-11-03",
  consultaInvestsus: "2026-11-04",
  valorHomologado: 9876.68,
  valorTransferido: 1762.4,
  descontoSaldo: 8114.28,
  descontoIdentificacao: "Saldo excedente",
  totalPublicado: 9876.68,
  linhas: [{ cnes: "7728557", nome: "Hospital Exemplo", total: 9876.68 }],
  destinatarios: [{ unidade: "SES.UCP", nome: "Destinatário", cargo: "Gerente" }],
};

describe("documentos do Piso para colagem no SEI", () => {
  it("produz minuta com ementa recuada, artigos e tabela financeira", () => {
    const html = gerarHtmlDocumentoSeiPiso(gerarMinutaMunicipal(dados), "minuta");
    expect(html).toContain("margin:12pt 0 20pt 40%");
    expect(html).toContain("text-indent:1.25cm");
    expect(html).toContain("<table");
    expect(html).toContain("<strong>Art. 1º</strong>");
    expect(html).toContain("Hospital Exemplo");
    expect(html).toContain("9.876,68");
    expect(html).toContain("8.114,28");
  });
  it("formata todos os destinatários antes do assunto, sem cabeçalho do SEI", () => {
    const texto = gerarMemorandoMunicipal({
      ...dados,
      destinatarios: [
        { unidade: "SES.UAP", nome: "Sra Ana Paula Barauna", cargo: "Gerente" },
        { unidade: "SES.UAP.APA", nome: "Sra Renata Oliveira Mira", cargo: "Coordenadora" },
      ],
    });
    const html = gerarHtmlDocumentoSeiPiso(texto, "memorando");
    expect(html).not.toContain("MEMORANDO SEI Nº");
    expect(html).not.toContain("Joinville, 04 de novembro");
    expect(html).toContain("À SES.UAP e<br>Sra Ana Paula Barauna<br>Gerente");
    expect(html).toContain("SES.UAP.APA<br>Sra Renata Oliveira Mira<br>Coordenadora");
    expect(html.indexOf("SES.UAP.APA")).toBeLessThan(html.indexOf("<strong>Assunto:</strong>"));
    expect(html).toContain("<strong>Assunto:</strong>");
    expect(html).toContain("text-align:justify");
    expect(html).toContain("text-align:left;text-indent:0");
  });
  it("escapa valores dinâmicos para impedir HTML inserido no documento", () => {
    const texto = gerarMinutaMunicipal({
      ...dados, autoridade: "<script>alert(1)</script>",
    });
    const html = gerarHtmlDocumentoSeiPiso(texto, "minuta");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
