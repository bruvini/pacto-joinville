import { describe, expect, it } from "vitest";
import { etapaAposConclusao, pendenciasConclusao, validarConclusao } from "./conclusao";
import type { CtxPiso } from "./regras";

const contexto = (): CtxPiso => ({
  comp: { etapas_concluidas: {} },
  parts: [
    { id: "boj", prestador_id: "prest-boj", prestadores: { nome_instituicao: "BOJ" } },
    { id: "bethesda", prestador_id: "prest-bethesda", prestadores: { nome_instituicao: "Bethesda" } },
  ],
  docs: [],
  obrigs: [],
  assinaturas: [],
  matriz: [],
  encaminhamentos: [],
  arquivos: [],
  ocorrencias: [],
  cnes: [
    { prestador_id: "prest-boj", cnes: "7728557" },
    { prestador_id: "prest-bethesda", cnes: "3678385" },
  ],
});

describe("conclusão fail-closed do Piso", () => {
  it.each([undefined, null])("bloqueia contexto indisponível: %s", (ctx) => {
    expect(pendenciasConclusao(1, ctx).length).toBeGreaterThan(0);
    expect(() => validarConclusao(1, ctx)).toThrow("Não foi possível validar");
  });
  it("bloqueia contexto parcial", () => {
    const ctx = contexto();
    delete ctx.arquivos;
    expect(() => validarConclusao(1, ctx)).toThrow("carregamento completo");
  });
  it("BOJ e Bethesda recém-criadas exigem envio, retorno e InvestSUS", () => {
    const ctx = contexto();
    const pend = pendenciasConclusao(1, ctx);
    expect(pend).toHaveLength(5);
    for (const nome of ["BOJ", "Bethesda"]) {
      expect(pend).toContain(`${nome}: informe a data do envio`);
      expect(pend).toContain(`${nome}: informe a data do retorno`);
    }
    expect(() => validarConclusao(1, ctx)).toThrow();
  });
  it("envio sem retorno não permite concluir", () => {
    const ctx = contexto();
    ctx.parts.forEach((p) => {
      p.data_envio = "2026-09-01";
    });
    expect(() => validarConclusao(1, ctx)).toThrow("data do retorno");
  });
  it("retorno exige arquivo E auditoria, exceto sem elegíveis", () => {
    const ctx = contexto();
    Object.assign(ctx.comp, {
      investsus_carga_em: "2026-09-15",
    });
    ctx.parts.forEach((p) =>
      Object.assign(p, { data_envio: "2026-09-01", data_retorno: "2026-09-10" }),
    );
    expect(() => validarConclusao(1, ctx)).toThrow("Planilha de Carga ainda não auditada");
    ctx.arquivos = ctx.parts.map((p) => ({ participante_id: p.id, categoria: "planilha_carga" }));
    expect(() => validarConclusao(1, ctx)).toThrow("Planilha de Carga ainda não auditada");
    ctx.arquivos = [];
    ctx.parts.forEach((p) => {
      p.sem_elegiveis = true;
    });
    expect(pendenciasConclusao(1, ctx)).toEqual([]);
  });
  it("carga auditada/sem elegíveis e InvestSUS completo permitem concluir", () => {
    const ctx = contexto();
    Object.assign(ctx.comp, {
      investsus_carga_em: "2026-09-15",
    });
    ctx.parts.forEach((p) =>
      Object.assign(p, { data_envio: "2026-09-01", data_retorno: "2026-09-10" }),
    );
    ctx.parts[0].auditoria_resumo = { linhas: 1 };
    ctx.parts[1].sem_elegiveis = true;
    ctx.arquivos = [{ participante_id: "boj", categoria: "planilha_carga" }];
    expect(() => validarConclusao(1, ctx)).not.toThrow();
    ctx.comp.investsus_carga_em = null;
    expect(() => validarConclusao(1, ctx)).toThrow("envio das Planilhas de Carga");
  });
  it("bloqueia cronologia inválida", () => {
    const ctx = contexto();
    ctx.parts.forEach((p) =>
      Object.assign(p, {
        data_envio: "2026-09-10",
        data_retorno: "2026-09-01",
        sem_elegiveis: true,
      }),
    );
    Object.assign(ctx.comp, {
      investsus_carga_em: "2026-08-31",
    });
    const pend = pendenciasConclusao(1, ctx);
    expect(pend).toContain("BOJ: retorno anterior ao envio");
    expect(pend).toContain("Envio ao InvestSUS anterior ao último retorno institucional.");
  });
  it("não permite saltar etapas e avança de 1 para 2 após conclusão", () => {
    expect(() => validarConclusao(4, contexto())).toThrow("etapas pré-requisito");
    expect(etapaAposConclusao(1)).toBe(2);
    expect(etapaAposConclusao(8)).toBe(9);
    expect(etapaAposConclusao(9)).toBe(9);
  });
});
