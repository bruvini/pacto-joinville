
import { describe, expect, it } from "vitest";
import { gerarRelatorioExecutivoPiso } from "./relatorio";

describe("Relatório Executivo Piso — integração do documento imprimível", () => {
  it("inclui documentos SEI, nomes de signatários, conciliação e histórico integral no HTML final", () => {
    let html = "";
    let fechado = false;
    const janela = {
      document: {
        write: (texto: string) => { html += texto; },
        close: () => { fechado = true; },
      },
    } as unknown as Window;
    const link = "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=123";
    const comp = {
      id: "c1", competencia: "10/2026", tipo_parcela: "mensal", status: "em_andamento",
      etapas_concluidas: { "1": true, "2": true, "3": true },
      etapas_reconferir: [4],
      valor_apurado_investsus: 9876.68, valor_homologado: 9876.68,
      desconto_saldo: 8114.28, valor_transferido: 1762.4,
      credito_fms_valor: null,
      municipal_config: {
        processo: "26.0.123456-7", consulta_investsus: "2026-10-20",
        autoridade: "Secretária", cargo: "Saúde",
        portaria_numero: "550/2026",
        destinatarios: [{ unidade: "SES.UAP", nome: "Ana", cargo: "Gerente" }],
      },
    };
    const docs = [
      { id: "d1", tipo: "minuta", numero_sei: "31492469", link_sei: link,
        data_documento: "2026-11-04", participante_id: null, obrigacao_id: null },
      { id: "d2", tipo: "memorando", numero_sei: "31492522", link_sei: link,
        data_documento: "2026-11-04", participante_id: null, obrigacao_id: null },
    ];
    const assinatura = [
      { documento_id: "d1", slot: "fiscal", servidor_nome: "Bruno", cargo: "Fiscal",
        assinado_em: "2026-11-04T15:00:00Z" },
      { documento_id: "d2", slot: "fiscal", servidor_nome: "Renata", cargo: "Gerente",
        assinado_em: "2026-11-04T16:00:00Z" },
    ];
    const matriz = [
      { tipo_documento: "minuta", slot_key: "fiscal", opcional: false, label: "Fiscal", ordem: 1 },
      { tipo_documento: "memorando", slot_key: "fiscal", opcional: false, label: "Gestora", ordem: 1 },
    ];
    const logs = Array.from({ length: 132 }, (_,i) => ({
      id: String(i), acao: "Competência atualizada", data_hora: "2026-10-20T12:00:00Z",
      usuario_nome: "Fiscal", detalhes: {},
    }));
    const ok = gerarRelatorioExecutivoPiso(comp, [], [], docs, logs, "Fiscal", {
      assinaturas: assinatura,
      matriz,
      encaminhamentos: [{ documento_id: "d2", acao: "encaminhado", destino: "SES.UAP",
        ocorrido_em: "2026-11-04T17:00:00Z", usuario_nome: "Fiscal" }],
    }, janela);
    expect(ok).toBe(true);
    expect(fechado).toBe(true);
    expect(html).toContain("31492469");
    expect(html).toContain("31492522");
    expect(html).toContain("Bruno");
    expect(html).toContain("Renata");
    expect(html).toContain("Encaminhamento confirmado");
    expect(html).toContain("4B. Fundamentação da conciliação");
    expect(html).toContain("15. Histórico cronológico");
    expect(html).toContain("132 registros disponíveis");
    expect(html).toContain("text-align");
    expect(html).toContain("A4 landscape");
  });

  it("não confunde reserva em reconferência com saldo liberado", () => {
    let html = "";
    const win = { document: { write: (s: string) => { html += s; }, close: () => {} } } as unknown as Window;
    const comp = {
      id: "c1", competencia: "10/2026", tipo_parcela: "mensal", status: "em_andamento",
      etapas_concluidas: {}, etapas_reconferir: [],
      valor_homologado: 100, valor_transferido: 80,
      municipal_config: {},
    };
    gerarRelatorioExecutivoPiso(comp, [], [], [], [], "Fiscal", {
      conciliacaoAfc: {
        situacao: "reconferir", valor_reservado: 100,
        piso_afc_contas_fms: { id: "conta1", identificacao: "Conta FMS",
          saldo_bancario: 100, compromissos_preexistentes: 0 },
      },
      reservasAfc: [],
    }, win);
    expect(html).toContain("Reserva desta competência (confirmada ou em reconferência)");
    expect(html).toMatch(/R\$\\s*100,00/);
    expect(html).toContain("Reservas em reconferência permanecem comprometidas");
  });
});
