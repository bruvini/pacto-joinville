import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  empenhoAbrangeMesPvh,
  empenhoRelacionadoCompetenciaPvh,
  saldoDisponivelEmpenhoPvh,
} from "./empenhos";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261109180000_pvh_motor_alocacao_global_fase_c.sql", import.meta.url),
  "utf8",
);
const etapa3 = readFileSync(
  new URL("../../components/pvh/EtapaEmpenhosPvh.tsx", import.meta.url),
  "utf8",
);

type Nota = {
  id: string;
  valor: number;
  usado: number;
  anulado?: number;
  data: string;
  meses: string[];
};

/**
 * Modelo de referência dos cálculos em centavos; NÃO escreve banco.
 * Concorrência verdadeira requer duas conexões PostgreSQL em homologação.
 */
function coberturaPrevista(
  necessidade: number, jaCoberto: number, competencia: string, notas: Nota[],
) {
  let faltante = Math.max(0, Math.round((necessidade - jaCoberto) * 100));
  const novas: Array<{ id: string; centavos: number }> = [];
  for (const n of [...notas].sort((a, b) =>
    a.data.localeCompare(b.data) || a.id.localeCompare(b.id))) {
    if (!n.meses.includes(competencia)) continue;
    const saldo = Math.max(0, Math.round(
      (n.valor - n.usado - (n.anulado ?? 0)) * 100));
    const valor = Math.min(faltante, saldo);
    if (valor > 0) {
      novas.push({ id: n.id, centavos: valor });
      faltante -= valor;
    }
    if (!faltante) break;
  }
  return { novas, faltante };
}

describe("PVH Fase C — motor de alocação global", () => {
  it("mantém janeiro/fevereiro/março dentro de uma NE de R$ 100 mil sem reservar por mês", () => {
    const notas = [{id:"ne1",valor:100000,usado:0,data:"2026-01-01",meses:["01/2026","02/2026","03/2026"]}];
    const jan = coberturaPrevista(30000,0,"01/2026",notas);
    expect(jan.novas).toEqual([{id:"ne1",centavos:3000000}]);
    notas[0].usado += jan.novas[0].centavos / 100;
    const fev = coberturaPrevista(40000,0,"02/2026",notas);
    expect(fev.novas).toEqual([{id:"ne1",centavos:4000000}]);
    notas[0].usado += fev.novas[0].centavos / 100;
    const mar = coberturaPrevista(25000,0,"03/2026",notas);
    expect(mar.novas).toEqual([{id:"ne1",centavos:2500000}]);
    notas[0].usado += mar.novas[0].centavos / 100;
    expect(notas[0].valor-notas[0].usado).toBe(5000);
  });

  it("utiliza primeiro a NE mais antiga e complementa sem redistribuir o que já foi usado", () => {
    const notas = [
      {id:"ne-nova",valor:60000,usado:0,data:"2026-03-05",meses:["03/2026"]},
      {id:"ne-antiga",valor:100000,usado:70000,data:"2026-01-05",meses:["01/2026","02/2026","03/2026"]},
    ];
    const r = coberturaPrevista(50000,0,"03/2026",notas);
    expect(r.novas).toEqual([
      {id:"ne-antiga",centavos:3000000},
      {id:"ne-nova",centavos:2000000},
    ]);
    expect(r.faltante).toBe(0);
  });

  it("não utiliza recursos fora dos meses autorizados nem saldo efetivamente anulado", () => {
    const notas = [
      {id:"ne1",valor:100,usado:25,anulado:15,data:"2026-01-01",meses:["01/2026","02/2026"]},
    ];
    expect(coberturaPrevista(80,0,"03/2026",notas)).toEqual({novas:[],faltante:8000});
    expect(coberturaPrevista(80,0,"02/2026",notas).novas)
      .toEqual([{id:"ne1",centavos:6000}]);
  });

  it("é idempotente quando a competência já está coberta", () => {
    const notas = [{id:"ne1",valor:100,usado:30,data:"2026-01-01",meses:["01/2026"]}];
    expect(coberturaPrevista(30,30,"01/2026",notas).novas).toEqual([]);
  });

  it("distingue previsão autorizada de vínculo histórico não confirmado", () => {
    const confirmado = {
      id:"ne1",solicitacao_competencia_id:"comp-jan",status:"ativo",numero_ne:"100/2026",valor_total:100000,
      valor_solicitado:120000,
      pvh_empenho_competencias:[
        {competencia:"01/2026",origem_vinculo:"confirmada"},
        {competencia:"02/2026",origem_vinculo:"confirmada"},
      ],
      pvh_empenho_alocacoes:[],
    };
    expect(empenhoAbrangeMesPvh(confirmado,"02/2026")).toBe(true);
    expect(empenhoRelacionadoCompetenciaPvh(confirmado,"comp-fev","part-fev","02/2026")).toBe(true);
    expect(empenhoAbrangeMesPvh(confirmado,"03/2026")).toBe(false);
    expect(empenhoAbrangeMesPvh({
      ...confirmado,valor_solicitado:null,
      pvh_empenho_competencias:[{competencia:"02/2026",origem_vinculo:"historica_origem_pendente"}],
      pvh_competencias:{competencia:"01/2026"},
    },"02/2026")).toBe(false);
  });

  it("desconta anulação efetiva do saldo global sem alterar o valor nominal da NE", () => {
    const e = {
      id:"ne1",valor_total:100000,
      pvh_empenho_alocacoes:[{valor_alocado:30000},{valor_alocado:40000}],
      pvh_empenho_anulacoes:[{valor_anulado:5000}],
    };
    expect(saldoDisponivelEmpenhoPvh(e)).toBe(25000);
    expect(e.valor_total).toBe(100000);
  });

  it("garante invariantes no SQL para CRUD, alocação automática, reuso e emissão", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.pvh_sincronizar_cobertura_competencia");
    expect(sql).toContain("CREATE TRIGGER trg_pvh_ne_guard_alocacao");
    expect(sql).toContain("CREATE TRIGGER trg_pvh_ne_guard_emissao");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("ORDER BY COALESCE(e.data_emissao,e.solicitacao_data,e.created_at::date)");
    expect(sql).toContain("public.pvh_ne_competencia_elegivel");
    expect(sql).toContain("v_emp.valor_total-v_total_ne-v_anulado");
    expect(sql).toContain("pvh_subempenhos WHERE alocacao_id = OLD.id");
    expect(sql).toContain("v_emp.status = 'ativo'");
    expect(sql).not.toContain("ORDER BY e.created_at DESC");
    expect(sql).not.toMatch(/UPDATE\s+public\.pvh_empenho_alocacoes\s+SET\s+valor_alocado/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.pvh_empenho_alocacoes/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.pvh_empenho_anulacoes/i);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(etapa3).toContain("pvh_sincronizar_cobertura_competencia");
  });
});
