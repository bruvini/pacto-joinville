import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acessosCompetenciaPvh } from "./acesso";
import {
  etapaLiberadaPvh,
  etapaPrincipalPvh,
  prerequisitosEtapaPvh,
} from "./etapas";
import { proximaEtapaAposConclusaoPvh } from "./fluxoNavegacao";

const migracao = readFileSync(
  new URL("../../../supabase/migrations/20261110130000_pvh_etapas5_6_paralelas.sql", import.meta.url),
  "utf8",
);

const participantes = [
  { id: "bethesda", valor_estadual: 1240000 },
  { id: "hmsj", valor_estadual: 1775502.09 },
];
const alocacoes = participantes.map((p) => ({
  participante_id: p.id,
  valor_alocado: p.valor_estadual,
  pvh_empenhos: { status: "ativo", numero_ne: "6604/2026" },
}));
const competencia = {
  portaria_estadual_numero: "416/2026",
  portaria_estadual_data: "2026-11-02",
  portaria_estadual_url: "https://saude.sc.gov.br/",
};

const acesso = (concluidas: Record<string, boolean>, reconferir: number[] = []) =>
  acessosCompetenciaPvh({
    competencia, participantes, alocacoes, concluidas, reconferir,
  });

describe("PVH · etapas 5 e 6 paralelas, 7 condicionada às seis", () => {
  it("o SQL libera conclusão da 6 após a 4, sem ler estado de conclusão da 5", () => {
    expect(migracao).toContain("CREATE OR REPLACE FUNCTION public.pvh_concluir_etapa6(p_comp uuid)");
    expect(migracao).toMatch(/v_comp\.etapas_concluidas\s*->>\s*'4'/);
    expect(migracao).toMatch(/4\s*=\s*ANY\(COALESCE\(v_comp\.etapas_reconferir/);
    expect(migracao).not.toMatch(/v_comp\.etapas_concluidas\s*->>\s*'5'/);
    expect(migracao).not.toMatch(/5\s*=\s*ANY\(COALESCE\(v_comp\.etapas_reconferir/);
  });
  it("preserva a conferência de e-mail, SEI, destinatários e identidade de envio no banco", () => {
    expect(migracao).toContain("p.notificar_email = true");
    expect(migracao).toContain("n.enviado_em IS NOT NULL");
    expect(migracao).toContain("n.destinatarios");
    expect(migracao).toContain("n.processo_sei_numero");
    expect(migracao).toContain("n.processo_sei_link");
    expect(migracao).toContain("n.enviado_por IS NOT NULL");
    expect(migracao).toContain("n.enviado_por_nome");
    expect(migracao).toContain("v_comp.status = 'encerrada'");
  });
  it("não altera marcações históricas, pagamentos, comunicados nem encerramento", () => {
    expect(migracao).toContain("UPDATE public.pvh_competencias");
    expect(migracao).toContain("'{6}', 'true'::jsonb");
    expect(migracao).not.toContain("CREATE OR REPLACE FUNCTION public.pvh_encerrar_competencia");
    expect(migracao).not.toMatch(/UPDATE\s+public\.pvh_pagamentos/i);
    expect(migracao).not.toMatch(/UPDATE\s+public\.pvh_notificacoes_email/i);
    expect(migracao.trimEnd()).toMatch(/COMMIT;$/);
  });
  it("a etapa 6 pode ser concluída com 5 pendente; a 7 permanece bloqueada", () => {
    const estado = { "1": true, "2": true, "3": true, "4": true, "5": false, "6": true };
    expect(prerequisitosEtapaPvh(6)).toEqual([4]);
    expect(etapaLiberadaPvh(6, estado)).toBe(true);
    expect(acesso(estado)).toMatchObject({ 5: true, 6: true, 7: false });
    expect(etapaPrincipalPvh(estado, "ativa", [])).toBe(5);
    expect(proximaEtapaAposConclusaoPvh(6, estado)).toBe(5);
  });
  it("só abre 7 após 5 e 6 concluídas e sem reconferências", () => {
    const so5 = { "1": true, "2": true, "3": true, "4": true, "5": true, "6": false };
    const tudo = { ...so5, "6": true };
    expect(acesso(so5)[7]).toBe(false);
    expect(acesso(tudo)[7]).toBe(true);
    expect(acesso(tudo, [5])[7]).toBe(false);
    expect(acesso(tudo, [6])[7]).toBe(false);
  });
  it("se 4 estiver ausente ou aguardando reconferência, não libera uma nova 6", () => {
    const parcial = { "1": true, "2": true, "3": true, "4": false, "5": false, "6": false };
    expect(acesso(parcial)[6]).toBe(false);
    expect(acesso({ ...parcial, "4": true }, [4])[6]).toBe(false);
  });
});
