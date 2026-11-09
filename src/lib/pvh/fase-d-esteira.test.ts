import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acessosCompetenciaPvh } from "./acesso";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261109190000_pvh_esteira_independente_fase_d.sql", import.meta.url),
  "utf8",
);
const etapa3 = readFileSync(
  new URL("../../components/pvh/EtapaEmpenhosPvh.tsx", import.meta.url), "utf8",
);
const etapa4 = readFileSync(
  new URL("../../components/pvh/EtapaSubempenhosPvh.tsx", import.meta.url), "utf8",
);
const esteira = readFileSync(
  new URL("../../components/pvh/EsteiraCompetenciaPvh.tsx", import.meta.url), "utf8",
);

const base = {
  competencia: {
    portaria_estadual_numero: "416/2026",
    portaria_estadual_data: "2026-10-01",
    portaria_estadual_url: "https://www.saude.sc.gov.br/",
  },
  participantes: [
    { id: "bethesda", valor_estadual: 1240000 },
    { id: "hmsj", valor_estadual: 1775502.09 },
  ],
  concluidas: { "1": true, "2": false, "3": true },
  reconferir: [],
};
const alocacoes = [
  { participante_id:"bethesda",valor_alocado:1240000,pvh_empenhos:{status:"ativo",numero_ne:"6606/2026"}},
  { participante_id:"hmsj",valor_alocado:1775502.09,pvh_empenhos:{status:"ativo",numero_ne:"6604/2026"}},
];

describe("PVH Fase D: independência da Etapa 3 e conclusão financeira da 4", () => {
  it("aceita preparação da etapa 4 com 2 pendente e cobertura integral", () => {
    expect(acessosCompetenciaPvh({...base,alocacoes})[4]).toBe(true);
  });
  it("não abre etapa 4 com alocação parcial ou NE não emitida", () => {
    expect(acessosCompetenciaPvh({...base,alocacoes:[alocacoes[0], {...alocacoes[1], valor_alocado:1000}]})[4]).toBe(false);
    expect(acessosCompetenciaPvh({...base,alocacoes:[alocacoes[0], {...alocacoes[1],pvh_empenhos:{status:"solicitada",numero_ne:null}}]})[4]).toBe(false);
  });
  it("aceita duas NEs complementares somando exatamente a necessidade", () => {
    const lista = [
      alocacoes[0],
      {...alocacoes[1], valor_alocado:775502.09},
      {...alocacoes[1], valor_alocado:1000000,pvh_empenhos:{status:"ativo",numero_ne:"6605/2026"}},
    ];
    expect(acessosCompetenciaPvh({...base,alocacoes:lista})[4]).toBe(true);
  });
  it("permanece independente quando há reconferência 2 por crédito FMS", () => {
    expect(acessosCompetenciaPvh({...base,alocacoes,reconferir:[2]})[4]).toBe(true);
    expect(acessosCompetenciaPvh({...base,alocacoes,reconferir:[2]})[5]).toBe(false);
  });
  it("a Etapa 3 exige Portaria estadual e municipal publicada, mas não a etapa 2 concluída", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa3");
    expect(sql).toContain("portaria_municipal_publicada");
    expect(sql).toContain("etapas_concluidas ->> '1'");
    expect(sql).not.toContain("Conclua a Etapa 2 antes dos empenhos.");
    expect(sql).toContain("Toda NE utilizada precisa ter Solicitação e Nota de Empenho integralmente rastreadas.");
    expect(sql).toContain("pvh_assinaturas_obrigatorias_empenho_ok");
  });
  it("FMS exige reconferência 2 e 4–7, sem invalidar 3", () => {
    expect(sql).toContain("ARRAY[2,4,5,6,7]::integer[]");
    expect(sql).toContain("pvh_reconferir_recurso_fms_etapa2");
    expect(sql).toContain("pvh_reconferir_etapa2_por_comp");
    expect(sql).toContain("pvh_marcar_reconferencia_etapa2_financeira(NEW.id)");
  });
  it("mantém a conclusão da Etapa 4 bloqueada até FMS + etapas 2 e 3", () => {
    expect(etapa4).toContain("!recursoFmsCompleto");
    expect(etapa4).toContain('concluidas["2"] !== true');
    expect(etapa4).toContain('concluidas["3"] !== true');
    expect(etapa4).toContain('supabase.rpc("pvh_concluir_etapa4"');
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa4");
  });
  it("mostra somente NE (SEI) e acesso direto ao documento na cadeia", () => {
    expect(etapa4).toContain("nota_empenho_sei_numero,nota_empenho_sei_link");
    expect(etapa4).toContain("empenho.nota_empenho_sei_numero");
    expect(etapa4).toContain("Abrir Nota de Empenho no SEI");
  });
  it("exibe aguardando FMS na esteira sem alterar status verde da Etapa 3", () => {
    expect(esteira).toContain("aguardandoFmsEtapa2");
    expect(esteira).toContain("Aguardando FMS");
    expect(etapa3).toContain("A conclusão desta etapa independe do crédito no FMS");
  });
  it("a migração é aditiva, sem mudar valores financeiros", () => {
    expect(sql).toMatch(/\nBEGIN;\n/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql).not.toMatch(/UPDATE\s+public\.pvh_empenho_alocacoes/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.pvh_empenho_alocacoes/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.pvh_subempenhos/i);
  });
});
