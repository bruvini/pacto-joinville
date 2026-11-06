
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  registrarAssinaturasRelatorioPiso,
  secaoAtosMunicipaisDetalhadaPiso,
  secaoEvidenciasOriginaisPiso,
  secaoHistoricoIntegralPiso,
  secaoInventarioDocumentalPiso,
  secaoPanoramaExecutivoPiso,
  type FontesDetalhamentoPiso,
} from "./relatorio-detalhamento";

const sei = "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=123";
function fonte(): FontesDetalhamentoPiso {
  return {
    comp: {
      id: "piso1", competencia: "10/2026", tipo_parcela: "mensal", status: "em_andamento",
      etapas_concluidas: { "1": true, "2": true },
      etapas_reconferir: [4],
      valor_homologado: 9876.68, valor_transferido: 1762.4, credito_fms_valor: null,
      valor_apurado_investsus: 9876.68, total_publicado_municipal: null,
      link_processo_sei: sei,
      municipal_config: {
        processo: "26.0.123456-7", consulta_investsus: "2026-10-20",
        autoridade: "Autoridade Teste", cargo: "Secretária da Saúde",
        portaria_numero: "",
        destinatarios: [
          { unidade: "SES.UAP", nome: "Ana", cargo: "Gerente" },
          { unidade: "SES.UAP.APA", nome: "Renata", cargo: "Coordenadora" },
        ],
      },
    },
    participantes: [{ id: "p1", prestadores: { nome_instituicao: "Hospital Teste" } }],
    obrigacoes: [{ id: "o1", participante_id: "p1", data_pagamento: null, valor_pago: null }],
    documentos: [
      { id: "m1", tipo: "minuta", participante_id: null, obrigacao_id: null,
        numero_sei: "31492469", data_documento: "2026-11-04", link_sei: sei },
      { id: "m2", tipo: "memorando", participante_id: null, obrigacao_id: null,
        numero_sei: "31492522", data_documento: "2026-11-04", link_sei: sei },
      { id: "m3", tipo: "portaria_municipal", participante_id: null, obrigacao_id: null,
        numero_sei: null, data_documento: null, link_sei: null },
      { id: "o1doc", tipo: "nota_empenho", participante_id: null, obrigacao_id: "o1",
        numero_sei: "31462376", numero: "7691/2026",
        data_documento: "2026-11-03", link_sei: sei },
    ],
    matriz: [
      { tipo_documento: "minuta", slot_key: "fiscal", opcional: false, label: "Fiscal", ordem: 1 },
      { tipo_documento: "minuta", slot_key: "gestora", opcional: false, label: "Gestora", ordem: 2 },
      { tipo_documento: "memorando", slot_key: "fiscal", opcional: false, label: "Fiscal", ordem: 1 },
      { tipo_documento: "memorando", slot_key: "gestora", opcional: false, label: "Gestora", ordem: 2 },
      { tipo_documento: "memorando", slot_key: "opcional", opcional: true, label: "Apoio", ordem: 3 },
    ],
    assinaturas: [
      { documento_id: "m1", slot: "fiscal", servidor_nome: "Bruno", cargo: "Fiscal",
        assinado_em: "2026-11-04T13:00:00Z" },
      { documento_id: "m1", slot: "gestora", servidor_nome: "Bárbara", cargo: "Gestora",
        assinado_em: "2026-11-04T13:30:00Z" },
      { documento_id: "m2", slot: "fiscal", servidor_nome: "Bruno", cargo: "Fiscal",
        assinado_em: "2026-11-04T14:00:00Z" },
      { documento_id: "m2", slot: "gestora", servidor_nome: "Renata", cargo: "Gerente",
        assinado_em: "2026-11-04T14:20:00Z" },
    ],
    encaminhamentos: [{ documento_id: "m2", acao: "encaminhado",
      destino: "SES.UAP; SES.UAP.APA", usuario_nome: "Bruno",
      ocorrido_em: "2026-11-04T15:00:00Z" }],
    arquivos: [{
      categoria: "investsus", nome_original: "InvestSUS Out.xlsx",
      sha256: "abc0123", enviado_em: "2026-10-20T12:00:00Z",
      enviado_por_nome: "Bruno", participante_id: null,
    }],
    logs: [
      { id: "1", acao: "Competência atualizada", data_hora: "2026-10-20T12:00:00Z", usuario_nome: "Bruno", detalhes: {} },
      { id: "2", acao: "Memorando registrado", data_hora: "2026-11-04T13:00:00Z", usuario_nome: "Bárbara", detalhes: {} },
    ],
  };
}

describe("Piso — Relatório executivo documental", () => {
  it("mostra números e links SEI de Minuta/Memorando, nome, cargo e data dos signatários", () => {
    const html = secaoAtosMunicipaisDetalhadaPiso(fonte());
    expect(html).toContain("31492469");
    expect(html).toContain("31492522");
    expect(html).toContain('href="https://sei.joinville.sc.gov.br/');
    expect(html).toContain("Bruno");
    expect(html).toContain("Bárbara");
    expect(html).toContain("Renata");
    expect(html).toContain("Obrigatórias registradas: 2/2");
    expect(html).toContain("3A. Minuta");
    expect(html).toContain("3B. Memorando");
    expect(html).toContain("3C. Portaria");
  });

  it("mostra os setores destinatários e comprovação do encaminhamento atual", () => {
    const html = secaoAtosMunicipaisDetalhadaPiso(fonte());
    expect(html).toContain("SES.UAP.APA");
    expect(html).toContain("Coordenadora");
    expect(html).toContain("Encaminhamento confirmado para os destinatários atuais");
    expect(html).toContain("Bruno");
  });

  it("assinala assinatura ausente e encaminhamento a reconferir sem inventar confirmação", () => {
    const f = fonte();
    f.assinaturas = f.assinaturas.filter(a => !(a.documento_id === "m2" && a.slot === "gestora"));
    expect(registrarAssinaturasRelatorioPiso(f.documentos[1], f.matriz, f.assinaturas))
      .toContain("Pendente");
    const html = secaoAtosMunicipaisDetalhadaPiso(f);
    expect(html).toContain("Encaminhamento ainda não comprovado");
    expect(html).toContain("Obrigatórias registradas: 1/2");
  });

  it("não considera o encaminhamento válido quando os setores mudam", () => {
    const f = fonte();
    f.comp.municipal_config.destinatarios[1].unidade = "SES.UFI";
    expect(secaoAtosMunicipaisDetalhadaPiso(f)).toContain("Encaminhamento ainda não comprovado");
  });

  it("inventaria toda a documentação sem omitir documentos financeiros da obrigação", () => {
    const html = secaoInventarioDocumentalPiso(fonte());
    expect(html).toContain("31462376");
    expect(html).toContain("Hospital Teste");
    expect(html).toContain("31492522");
    expect(html).toContain("Nota de Empenho");
    expect(html).toContain("31492469");
    expect(html).toContain("Bruno");
  });

  it("inclui arquivos originais e hash, sem ocultar evidências antigas", () => {
    const html = secaoEvidenciasOriginaisPiso(fonte());
    expect(html).toContain("InvestSUS Out.xlsx");
    expect(html).toContain("abc0123");
    expect(html).toContain("Bruno");
  });

  it("inclui integralmente os registros fornecidos em ordem cronológica, sem limite de 100", () => {
    const f = fonte();
    f.logs = Array.from({ length: 132 }, (_,i) => ({
      id: String(i), acao: "Competência atualizada", usuario_nome: "Fiscal",
      data_hora: "2026-10-20T12:00:00Z", detalhes: { sequencia: i },
    }));
    const html = secaoHistoricoIntegralPiso(f);
    expect(html).toContain("132 registros disponíveis");
    expect((html.match(/<tr>/g) ?? []).length).toBe(133);
  });

  it("separa transferência prevista, crédito não informado e pagamento sem registro", () => {
    const html = secaoPanoramaExecutivoPiso(fonte(), null, "Aguardando conciliação");
    expect(html).toContain("1.762,40");
    expect(html).toContain("Não informado");
    expect(html).toContain("pagamento");
    expect(html).not.toContain("9.876,68 efetivamente creditado");
  });

  it("escapa texto de usuário antes de inserir em HTML imprimível", () => {
    const f = fonte();
    f.comp.municipal_config.destinatarios[0].nome = "<img src=x onerror=alert(1)>";
    const html = secaoAtosMunicipaisDetalhadaPiso(f);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("relatório passa as matrizes e assinaturas reais e abre janela antes do histórico assíncrono", () => {
    const route = readFileSync(
      new URL("../../routes/_authenticated/piso.$id.tsx", import.meta.url), "utf8",
    );
    const relatorio = readFileSync(new URL("./relatorio.ts", import.meta.url), "utf8");
    expect(route).toContain("assinaturas: extra.data?.assinaturas ?? []");
    expect(route).toContain("matriz: extra.data?.matriz ?? []");
    expect(route.indexOf('const janelaRelatorio = window.open')).toBeLessThan(
      route.indexOf("const historicoCompleto: typeof eventosHistorico"),
    );
    expect(relatorio).toContain("secaoAtosMunicipaisDetalhadaPiso(fontesRelatorio)");
    expect(relatorio).toContain("secaoInventarioDocumentalPiso(fontesRelatorio)");
    expect(relatorio).toContain("secaoHistoricoIntegralPiso(fontesRelatorio)");
  });
});
