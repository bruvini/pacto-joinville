import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  abrangenciaValidaPvh, mesesDoExercicioPvh, normalizarMesesPvh,
  valorSolicitadoValidoPvh, exibicaoValorSolicitadoPvh,
} from "./meses-solicitacao";

const sql = readFileSync(new URL("../../../supabase/migrations/20261109160000_pvh_solicitacao_multicompetencia_fase_b.sql", import.meta.url), "utf8");
const form = readFileSync(new URL("../../components/pvh/SolicitacaoEmpenhoModalPvh.tsx", import.meta.url), "utf8");
const etapa3 = readFileSync(new URL("../../components/pvh/EtapaEmpenhosPvh.tsx", import.meta.url), "utf8");

describe("PVH · Fase B — pedido e abrangência sem divisão antecipada", () => {
  it("representa os doze meses do exercício sem exigir competências previamente criadas", () => {
    const meses = mesesDoExercicioPvh(2026);
    expect(meses).toHaveLength(12);
    expect(meses[0].valor).toBe("01/2026");
    expect(meses[11].valor).toBe("12/2026");
    expect(abrangenciaValidaPvh(["01/2026", "02/2026", "03/2026"], "01/2026")).toBe(true);
    expect(abrangenciaValidaPvh(["02/2026", "03/2026"], "01/2026")).toBe(false);
    expect(abrangenciaValidaPvh(["01/2026", "01/2027"], "01/2026")).toBe(false);
    expect(abrangenciaValidaPvh([], "01/2026")).toBe(false);
  });
  it("não duplica meses nem os reordena por valor monetário", () => {
    expect(normalizarMesesPvh(["03/2026", "01/2026", "03/2026", "02/2026"]))
      .toEqual(["01/2026","02/2026","03/2026"]);
  });
  it("separa valor pedido do definitivo e nunca presume pedido legado", () => {
    expect(valorSolicitadoValidoPvh(120000)).toBe(true);
    expect(valorSolicitadoValidoPvh(null)).toBe(false);
    expect(valorSolicitadoValidoPvh(0)).toBe(false);
    expect(valorSolicitadoValidoPvh(-2)).toBe(false);
    expect(valorSolicitadoValidoPvh(120000.001)).toBe(false);
    expect(exibicaoValorSolicitadoPvh(null)).toContain("Não informado");
  });
  it("RPC confere origem e prestador e salva valor+meses na mesma transação", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.pvh_salvar_solicitacao_multicompetencia");
    expect(sql).toContain("SELECT * INTO v_part FROM public.pvh_participantes");
    expect(sql).toContain("v_part.competencia_id IS DISTINCT FROM p_competencia");
    expect(sql).toContain("v_emp.prestador_id IS DISTINCT FROM v_part.prestador_id");
    expect(sql).toContain("p_valor_solicitado numeric");
    expect(sql).toContain("p_meses text[]");
    expect(sql).toContain("INSERT INTO public.pvh_empenho_competencias");
    expect(sql).toContain("UPDATE public.pvh_empenhos");
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql).not.toContain("INSERT INTO public.pvh_empenho_alocacoes");
  });
  it("bloqueia mudança de pedido e meses após encaminhamento ou emissão", () => {
    expect(sql).toContain("trg_pvh_proteger_valor_solicitado");
    expect(sql).toContain("trg_pvh_validar_multicompetencia_aco");
    expect(sql).toContain("v_bloqueado AND");
    expect(sql).toContain("v_meses IS DISTINCT FROM v_meses_atuais");
    expect(sql).toContain("auth.uid() IS NULL");
    expect(sql).toContain("ARRAY['admin','acp','aco']::public.app_role[]");
  });
  it("formulário não solicita prestador novamente nem antecipa alocações", () => {
    expect(form).toContain("instituicaoNome");
    expect(form).toContain("p_participante: participanteId");
    expect(form).toContain("Valor solicitado à SEFAZ");
    expect(form).toContain("Competências abrangidas");
    expect(form).toContain("Valor efetivamente emitido pela SEFAZ");
    expect(form).toContain("pvh_salvar_solicitacao_multicompetencia");
    expect(form).not.toContain('supabase.from("pvh_empenho_alocacoes").insert');
    expect(etapa3).toContain("pvh_empenho_competencias(competencia,origem_vinculo)");
    expect(etapa3).toContain("Valor solicitado:");
  });
});
