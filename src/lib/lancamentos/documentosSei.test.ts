import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linksSeiLancamento, numeroSeiDeLink, numerosSeiLancamento } from "./documentosSei";
import { CAMPOS_REVERSAO_CONVENIOS } from "./reversao";

const fonte = (caminho: string) =>
  readFileSync(new URL(caminho, import.meta.url), "utf8");

const telaLancamento = fonte("../../routes/_authenticated/lancamentos.$id.tsx");
const telaConvenio = fonte("../../routes/_authenticated/convenios.tsx");
const prestacao = fonte("../../components/PrestacaoContas.tsx");
const relatorio = fonte("../pdf-lancamento.ts");
const migracaoLancamentos = fonte("../../../supabase/migrations/20261113180000_convenios_numeros_sei_documentos.sql");
const migracaoPrestacao = fonte("../../../supabase/migrations/20261113183000_convenios_prestacao_contas_numeros_sei.sql");

describe("Convênios · número e link SEI de cada documento", () => {
  it("mapeia os 16 links dos fluxos 1/2 para um número SEI distinto", () => {
    expect(linksSeiLancamento).toHaveLength(16);
    expect(new Set(linksSeiLancamento).size).toBe(16);
    expect(new Set(linksSeiLancamento.map(numeroSeiDeLink)).size).toBe(16);
    expect(numeroSeiDeLink("link_empenho_sei")).toBe("numero_sei_empenho");
    expect(numeroSeiDeLink("link_solicitacao_anulacao")).toBe("numero_sei_solicitacao_anulacao");
  });

  it("salva apenas os números informados, sem inventar números a partir do id_documento do link", () => {
    const dados = numerosSeiLancamento({
      numero_sei_empenho: " 31567825 ",
      link_empenho_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?id_documento=10000034337620",
    });
    expect(dados.numero_sei_empenho).toBe("31567825");
    expect(dados.numero_sei_solicitacao).toBeNull();
    expect(Object.keys(dados)).toHaveLength(16);
    expect(Object.keys(dados).some(k => k.startsWith("link_"))).toBe(false);
  });

  it("os dois fluxos e o processo pai mostram número+link em todas as 22 ocorrências", () => {
    const ocorrencias = [...telaLancamento.matchAll(/campoSei\("(link_[a-z_]+)"/g)]
      .map(match => match[1]);
    expect(ocorrencias).toHaveLength(22);
    expect(new Set(ocorrencias)).toEqual(new Set(linksSeiLancamento));
    expect(telaLancamento).toContain("...numerosSeiLancamento(merged)");
    expect(telaLancamento).toContain("numero_sei_solicitacao: lanc.numero_sei_solicitacao");
    expect(telaLancamento).toContain("numero_sei_empenho: lanc.numero_sei_empenho");
    expect(telaLancamento).toContain("ResumoAnulacaoConvenio");
    for (const link of linksSeiLancamento) {
      expect(migracaoLancamentos).toContain("ADD COLUMN IF NOT EXISTS " + numeroSeiDeLink(link) + " text");
    }
  });

  it("reverter etapas financeiras limpa números SEI junto com os links antigos", () => {
    expect(CAMPOS_REVERSAO_CONVENIOS[5]).toMatchObject({
      link_empenho_sei: null, numero_sei_empenho: null,
    });
    expect(CAMPOS_REVERSAO_CONVENIOS[7]).toMatchObject({
      link_solicitacao_anulacao: null,
      numero_sei_solicitacao_anulacao: null,
      link_anulacao_sei: null,
      numero_sei_anulacao: null,
    });
  });

  it("o cadastro de convênios e termos aditivos tem nº SEI e link distintos", () => {
    expect(telaConvenio).toContain("numero_processo_sei_mae: form.numero_processo_sei_mae");
    expect(telaConvenio).toContain("numero={ta.numero_sei ?? \"\"}");
    expect(telaConvenio).toContain("numero={ta.numero_sei_extrato ?? \"\"}");
    expect(migracaoLancamentos).toContain("numero_sei_extrato text");
  });

  it("a prestação de contas e os ofícios também persistem números SEI", () => {
    const keys = [
      "numero_sei_prestacao","numero_sei_relatorio_analise",
      "numero_sei_parecer_ses","numero_sei_manifestacao_cgm",
    ];
    for (const key of keys) {
      expect(prestacao).toContain(key);
      expect(migracaoPrestacao).toContain("ADD COLUMN IF NOT EXISTS " + key + " text");
    }
    expect(prestacao).toContain("numero_sei: inter.numero_sei.trim() || null");
    expect(migracaoPrestacao).toContain("ADD COLUMN IF NOT EXISTS numero_sei text");
    expect(prestacao).toContain("onNumeroChange");
  });

  it("o relatório do lançamento inclui número SEI e link para todos os documentos", () => {
    expect(relatorio).toContain("const docSei");
    for (const link of linksSeiLancamento) {
      expect(relatorio).toContain("lanc." + link);
    }
    expect(relatorio).toContain("termo?.numero_sei_extrato");
    expect(relatorio).toContain("convenio?.numero_processo_sei_mae");
  });

  it("migrations são aditivas e não alteram lançamentos históricos", () => {
    for (const sql of [migracaoLancamentos, migracaoPrestacao]) {
      expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\./i);
      expect(sql).toContain("NOTIFY pgrst");
    }
  });
});
