import { describe, expect, it } from "vitest";
import { filtrarProcessosPiso, grupoProcessoPiso, resumoListagemPiso, type ProcessoResumoPiso } from "./listagem";

const base: ProcessoResumoPiso = {
  id: "a", competencia: "11/2026", tipo_parcela: "mensal", exercicio_referencia: 2026,
  status: "em_andamento", etapas_concluidas: { "1": true, "2": true, "3": true, "4": true, "5": true, "6": true },
  etapas_reconferir: [], valor_homologado: 1000, valor_transferido: 980,
  credito_fms_valor: 980,
  piso_participantes: [
    { id: "p1", prestador_id: "hospital", situacao: "retornado", sem_elegiveis: false, valor_devido: 500, data_retorno: "2026-11-10", piso_obrigacoes: [{ id: "o1", data_pagamento: "2026-11-20", valor_pago: 500 }] },
    { id: "p2", prestador_id: "betesda", situacao: "retornado", sem_elegiveis: false, valor_devido: 480, data_retorno: "2026-11-10", piso_obrigacoes: [{ id: "o2", data_pagamento: null, valor_pago: null }] },
  ],
};
const padrao = { texto: "", tipo: "todos", exercicio: "todos", etapa: "todos", prestador: "todos", atencao: "todos" };

describe("listagem executiva do Piso", () => {
  it("separa a etapa 9 de processos efetivamente encerrados", () => {
    expect(grupoProcessoPiso({ status: "em_andamento", etapas_concluidas: Object.fromEntries(Array.from({length: 8}, (_, i) => [String(i + 1), true])) })).toBe(9);
    expect(grupoProcessoPiso({ status: "encerrada", etapas_concluidas: {} })).toBe(10);
  });
  it("mostra apenas pagamento com data e valor, sem inventar crédito recebido", () => {
    expect(resumoListagemPiso(base)).toMatchObject({
      pagamentosRegistrados: 1, valorPago: 500, valorPrevisto: 980,
      codigoAtencao: "pagamento_pendente", grupo: 7,
    });
    expect(resumoListagemPiso({ ...base, credito_fms_valor: null }).codigoAtencao).toBe("credito_pendente");
  });
  it("não mostra pendências de retorno mensal na 13ª e permite exercícios distintos", () => {
    const c = { ...base, tipo_parcela: "decimo_terceiro" as const, piso_participantes: [{
      ...base.piso_participantes![0], situacao: "aguardando_envio", data_retorno: null,
    }] };
    expect(resumoListagemPiso(c).aguardamRetorno).toBe(0);
  });
  it("prioriza reconferência e identifica divergência de valor pago", () => {
    expect(resumoListagemPiso({ ...base, etapas_reconferir: [2] }).codigoAtencao).toBe("reconferencia");
    const c = { ...base, piso_participantes: [{
      ...base.piso_participantes![0], piso_obrigacoes: [{ id: "o1", data_pagamento: "2026-11-20", valor_pago: 300 }],
    }] };
    expect(resumoListagemPiso(c).codigoAtencao).toBe("pagamento_divergente");
  });
  it("filtra por fase, tipo, instituição, atenção e busca por nome", () => {
    const outra = { ...base, id: "b", tipo_parcela: "decimo_terceiro" as const, status: "encerrada" };
    const dados = [base, outra];
    expect(filtrarProcessosPiso(dados, { ...padrao, etapa: "7" })).toHaveLength(1);
    expect(filtrarProcessosPiso(dados, { ...padrao, tipo: "decimo_terceiro" })).toHaveLength(1);
    expect(filtrarProcessosPiso(dados, { ...padrao, prestador: "betesda" })).toHaveLength(2);
    expect(filtrarProcessosPiso(dados, { ...padrao, atencao: "pagamentos" })).toHaveLength(1);
    expect(filtrarProcessosPiso(dados, { ...padrao, texto: "são josé" }, { hospital: "Hospital São José" })).toHaveLength(2);
    expect(filtrarProcessosPiso(dados, { ...padrao, texto: "sao jose" }, { hospital: "Hospital São José" })).toHaveLength(2);
  });
  it("filtro de pagamentos inclui processos em reconferência com pagamento pendente", () => {
    const c = { ...base, etapas_reconferir: [3] };
    expect(resumoListagemPiso(c)).toMatchObject({
      codigoAtencao: "reconferencia",
      sinais: ["reconferencia", "pagamento_pendente"],
    });
    expect(filtrarProcessosPiso([c], { ...padrao, atencao: "pagamentos" })).toHaveLength(1);
  });
  it("a ausência de crédito FMS não é confundida com transferência zerada", () => {
    const semCredito = { ...base, credito_fms_valor: null, etapas_reconferir: [1] };
    expect(resumoListagemPiso(semCredito).sinais).toContain("credito_pendente");
    expect(filtrarProcessosPiso([semCredito], { ...padrao, atencao: "credito" })).toHaveLength(1);
  });

  it("ignora valores financeiros não informados, inclusive zero conhecido", () => {
    expect(resumoListagemPiso({ ...base, piso_participantes: [{...base.piso_participantes![0], valor_devido: null}] }).valorPrevisto).toBeNull();
    expect(resumoListagemPiso({ ...base, piso_participantes: [{...base.piso_participantes![0], valor_devido: 0}] }).valorPrevisto).toBe(0);
  });
});
