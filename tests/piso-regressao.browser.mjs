// Executa a aplicação real no navegador com backend isolado em memória.
// Não autentica nem grava no Supabase real. Requer Playwright disponível no Node.
// NODE_PATH=/opt/codex/cua_node/lib/node_modules node tests/piso-regressao.browser.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const { chromium, expect } = createRequire(import.meta.url)("playwright/test");
const base = process.env.PISO_TEST_URL || "http://127.0.0.1:3000";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Este teste só pode usar servidor local.",
);
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const host = new URL(env.VITE_SUPABASE_URL).hostname;
const uid = "00000000-0000-4000-8000-000000000001";
const cid = "00000000-0000-4000-8000-000000000009";
const user = {
  id: uid,
  email: "teste@joinville.sc.gov.br",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") +
  "." +
  Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800, role: "authenticated" })).toString(
    "base64url",
  ) +
  ".fixture";
const session = {
  access_token: jwt,
  refresh_token: "fixture",
  expires_in: 360000000,
  expires_at: 4102444800,
  token_type: "bearer",
  user,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const out = process.env.PISO_SCREENSHOTS || "/tmp/piso-regressao";
mkdirSync(out, { recursive: true });
let checks = 0;

async function fixture({
  failure,
  loading = false,
  optionalError = false,
  concluida = false,
  fechada = false,
  falhaReconferencia = false,
} = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const state = {
    failure,
    loading,
    optionalError,
    writes: 0,
    reconferenciaWrites: 0,
    reconferenciaAttempts: 0,
    falhaReconferencia,
    comp: {
      id: cid,
      competencia: "09/2026",
      status: fechada ? "encerrada" : "aberta",
      updated_at: "2026-10-06T12:00:00.000Z",
      etapas_concluidas: fechada
        ? Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), true]))
        : concluida
          ? { 1: true }
          : {},
      etapas_reconferir: [],
      investsus_carga_em: null,
      investsus_confirmacao_em: null,
    },
    parts: ["BOJ", "Bethesda"].map((nome, i) => ({
      id: `p${i}`,
      competencia_id: cid,
      prestador_id: `prest${i}`,
      data_envio: null,
      data_retorno: null,
      sem_elegiveis: false,
      auditoria_resumo: null,
      prestadores: { nome_instituicao: nome },
    })),
    arquivos: [],
  };
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: `sb-${host.split(".")[0]}-auth-token`, session },
  );
  await context.route(`https://${host}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const json = (data, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname.includes("/storage/v1/")) return json({ Key: "fixture", Id: "fixture" });
    const table = url.pathname.split("/").at(-1);
    if (url.pathname.includes("/rpc/")) return json(null);
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      if (table === "piso_competencias") {
        if (body.etapas_reconferir && !body.etapas_concluidas) {
          state.reconferenciaAttempts++;
          if (state.falhaReconferencia)
            return json({ code: "42501", message: "permission denied to save reconference" }, 403);
          if (url.searchParams.get("updated_at") !== `eq.${state.comp.updated_at}`)
            return json(null);
          state.reconferenciaWrites++;
        }
        Object.assign(state.comp, body);
        state.comp.updated_at = new Date().toISOString();
        if (body.etapas_concluidas) state.writes++;
        if (url.searchParams.has("select")) return json({ id: cid });
      }
      if (table === "piso_participantes")
        Object.assign(
          state.parts.find((p) => `eq.${p.id}` === url.searchParams.get("id")),
          body,
        );
      return json(null);
    }
    if (request.method() === "POST") {
      if (table === "piso_arquivos") {
        const arq = {
          ...request.postDataJSON(),
          id: "arquivo",
          enviado_em: new Date().toISOString(),
        };
        state.arquivos.push(arq);
        return json(arq);
      }
      return json(null);
    }
    if (table === "prestador_cnes") {
      while (state.loading) await new Promise((r) => setTimeout(r, 25));
      if (state.failure)
        return json(
          {
            code: "PGRST205",
            message: "Could not find the table 'public.prestador_cnes' in the schema cache",
          },
          404,
        );
      return json(
        state.parts.map((p, i) => ({
          prestador_id: p.prestador_id,
          cnes: i ? "7654321" : "1234567",
        })),
      );
    }
    if (state.optionalError && table === "piso_feriados")
      return json({ code: "42501", message: "permission denied for table piso_feriados" }, 403);
    if (table === "user_roles") return json([{ role: "admin" }]);
    if (table === "profiles")
      return json({ nome: "Teste", email: user.email, cargo: "Auditor", setor: "ACP" });
    if (table === "piso_competencias")
      return json(request.headers().accept?.includes("object") ? state.comp : [state.comp]);
    if (table === "piso_participantes") return json(state.parts);
    if (table === "piso_arquivos") return json(state.arquivos);
    if (table === "prestadores")
      return json(
        state.parts.map((p) => ({
          id: p.prestador_id,
          nome_instituicao: p.prestadores.nome_instituicao,
          status: "ativo",
        })),
      );
    return json([]);
  });
  return { context, page, state };
}

const painel = (page) => page.locator("#piso-etapa-detalhe");
const concluir = (page) =>
  page
    .locator("ol > li")
    .filter({ has: page.getByRole("button", { name: /Preparar a competência/ }) })
    .getByRole("button", { name: "Concluir", exact: true });
const instituicao = (page, nome) =>
  painel(page)
    .locator("div.rounded-lg.border.p-4")
    .filter({ has: page.getByRole("heading", { name: nome, exact: true }) });
async function ready(page) {
  await expect(
    painel(page).getByText("1A. Coleta e auditoria das Planilhas de Carga", { exact: true }),
  ).toBeVisible();
}
async function date(page, input, value) {
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value);
  await ready(page);
}

try {
  {
    const { context, page, state } = await fixture({ loading: true });
    await page.goto(`${base}/piso/${cid}`);
    await expect(painel(page).getByRole("status")).toBeVisible();
    await expect(concluir(page)).toBeDisabled();
    state.loading = false;
    await ready(page);
    await expect(concluir(page)).toBeDisabled();
    assert.equal(state.writes, 0);
    checks++;
    await context.close();
  }
  {
    const { context, page, state } = await fixture({ failure: true });
    await page.goto(`${base}/piso/${cid}`);
    await expect(painel(page).getByRole("alert")).toContainText(
      "Não foi possível carregar os dados operacionais",
      { timeout: 15000 },
    );
    await expect(painel(page)).toContainText("prestador_cnes: Could not find");
    await expect(concluir(page)).toBeDisabled();
    assert.equal(state.writes, 0);
    await page.screenshot({ path: `${out}/erro-extra.png`, fullPage: true });
    state.failure = false;
    await painel(page).getByRole("button", { name: "Tentar novamente" }).click();
    await ready(page);
    checks++;
    await context.close();
  }
  {
    const { context, page, state } = await fixture({ optionalError: true });
    await page.goto(`${base}/piso/${cid}`);
    await ready(page);
    await expect(painel(page).getByRole("alert")).toContainText(
      "permission denied for table piso_feriados",
      { timeout: 15000 },
    );
    await expect(concluir(page)).toBeDisabled();
    for (const nome of ["BOJ", "Bethesda"]) {
      await expect(instituicao(page, nome)).toContainText("Data do envio");
      await expect(instituicao(page, nome)).toContainText("Data do retorno");
      await expect(instituicao(page, nome).locator('input[type="file"]')).toBeDisabled();
    }
    await page.screenshot({ path: `${out}/etapa1-inicial.png`, fullPage: true });
    for (const nome of ["BOJ", "Bethesda"]) {
      await date(page, instituicao(page, nome).locator('input[type="date"]').nth(0), "2026-09-01");
      await expect(concluir(page)).toBeDisabled();
      await date(page, instituicao(page, nome).locator('input[type="date"]').nth(1), "2026-09-10");
      await expect(concluir(page)).toBeDisabled();
    }
    // Exercita o upload e a auditoria existentes para BOJ; Bethesda sem elegíveis.
    await instituicao(page, "BOJ")
      .locator('input[type="file"]')
      .setInputFiles({
        name: "carga.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "CPF;CNES;CBO;Jornada;Salário Base\n52998224725;1234567;223505;40;5000\n",
        ),
      });
    await expect(instituicao(page, "BOJ")).toContainText("registros");
    assert(state.parts[0].auditoria_resumo);
    await instituicao(page, "Bethesda").getByRole("checkbox").click();
    await expect(instituicao(page, "Bethesda").getByRole("checkbox")).toBeChecked();
    await expect(concluir(page)).toBeDisabled();
    const invest = painel(page).locator("div.border-primary\\/30");
    await date(page, invest.locator('input[type="date"]').nth(0), "2026-09-15");
    await expect(concluir(page)).toBeDisabled();
    await date(page, invest.locator('input[type="date"]').nth(1), "2026-09-16");
    await expect(concluir(page)).toBeEnabled();
    // Alteração no banco após renderizar o botão exige nova validação na mutation.
    state.parts[0].data_retorno = null;
    await concluir(page).click();
    await expect(page.getByText("Não foi possível alterar a etapa", { exact: true })).toBeVisible();
    await expect(concluir(page)).toBeDisabled();
    assert.equal(state.writes, 0);
    await expect(instituicao(page, "BOJ").locator('input[type="date"]').nth(1)).toHaveValue("");
    await date(page, instituicao(page, "BOJ").locator('input[type="date"]').nth(1), "2026-09-10");
    await expect(concluir(page)).toBeEnabled();
    await concluir(page).click();
    await expect(
      painel(page).getByText("Etapa 2 — Auditar e conciliar", { exact: true }),
    ).toBeVisible();
    await expect(painel(page)).toContainText("Planilha exportada do InvestSUS");
    assert.equal(state.comp.etapas_concluidas["1"], true);
    assert.equal(state.writes, 1);
    await page.screenshot({ path: `${out}/etapa2-apos-conclusao.png`, fullPage: true });
    await page.getByRole("button", { name: /Preparar a competência/ }).click();
    await ready(page);
    checks++;
    await context.close();
  }
  {
    const { context, page, state } = await fixture({ concluida: true });
    await page.goto(`${base}/piso/${cid}`);
    await ready(page);
    const etapa1 = page
      .locator("ol > li")
      .filter({ has: page.getByRole("button", { name: /Preparar a competência/ }) });
    const etapa2 = page
      .locator("ol > li")
      .filter({ has: page.getByRole("button", { name: /Auditar e conciliar/ }) });
    await expect(etapa1).toContainText("Reconferir");
    await expect(
      etapa1.getByRole("button", { name: "Reconferir etapa", exact: true }),
    ).toBeDisabled();
    await expect(etapa2.getByRole("button", { name: "Concluir", exact: true })).toBeDisabled();
    await expect.poll(() => state.reconferenciaWrites).toBe(1);
    assert.deepEqual(state.comp.etapas_reconferir, [1]);
    assert.equal(state.comp.etapas_concluidas["1"], true);
    await page.reload();
    await ready(page);
    assert.equal(state.reconferenciaWrites, 1);
    for (const nome of ["BOJ", "Bethesda"]) {
      await date(page, instituicao(page, nome).locator('input[type="date"]').nth(0), "2026-09-01");
      await date(page, instituicao(page, nome).locator('input[type="date"]').nth(1), "2026-09-10");
      await instituicao(page, nome).getByRole("checkbox").click();
      await expect(instituicao(page, nome).getByRole("checkbox")).toBeChecked();
    }
    const invest = painel(page).locator("div.border-primary\\/30");
    await date(page, invest.locator('input[type="date"]').nth(0), "2026-09-15");
    await date(page, invest.locator('input[type="date"]').nth(1), "2026-09-16");
    const reconferir = etapa1.getByRole("button", { name: "Reconferir etapa", exact: true });
    await expect(reconferir).toBeEnabled();
    assert.deepEqual(state.comp.etapas_reconferir, [1]);
    await reconferir.click();
    await expect(
      painel(page).getByText("Etapa 2 — Auditar e conciliar", { exact: true }),
    ).toBeVisible();
    assert.equal(state.comp.etapas_concluidas["1"], true);
    assert.deepEqual(state.comp.etapas_reconferir, []);
    assert.equal(state.writes, 1);
    // Uma nova alteração upstream deve voltar a marcar a conclusão antiga.
    state.parts[0].data_retorno = null;
    await page.reload();
    await ready(page);
    await expect.poll(() => state.reconferenciaWrites).toBe(2);
    assert.deepEqual(state.comp.etapas_reconferir, [1]);
    await expect(etapa2.getByRole("button", { name: "Concluir", exact: true })).toBeDisabled();
    await page.screenshot({ path: `${out}/reconferencia.png`, fullPage: true });
    checks++;
    await context.close();
  }
  {
    const { context, page, state } = await fixture({ concluida: true, falhaReconferencia: true });
    await page.goto(`${base}/piso/${cid}`);
    await ready(page);
    const aviso = page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível registrar a reconferência no banco" });
    await expect(aviso).toContainText("permission denied to save reconference");
    await expect.poll(() => state.reconferenciaAttempts).toBe(1);
    await page.getByRole("button", { name: /Auditar e conciliar/ }).click();
    await expect(
      painel(page).getByText("Etapa 2 — Auditar e conciliar", { exact: true }),
    ).toBeVisible();
    assert.equal(state.reconferenciaAttempts, 1);
    state.falhaReconferencia = false;
    await aviso.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await expect.poll(() => state.reconferenciaWrites).toBe(1);
    assert.equal(state.reconferenciaAttempts, 2);
    checks++;
    await context.close();
  }
  {
    const { context, page, state } = await fixture({ fechada: true });
    const concluidasAntes = { ...state.comp.etapas_concluidas };
    await page.goto(`${base}/piso/${cid}`);
    await ready(page);
    await expect.poll(() => state.comp.status).toBe("em_andamento");
    assert.deepEqual(state.comp.etapas_concluidas, concluidasAntes);
    assert(state.comp.etapas_reconferir.includes(1));
    assert.equal(state.reconferenciaWrites, 1);
    await expect(instituicao(page, "BOJ").locator('input[type="date"]').nth(0)).toBeEnabled();
    checks++;
    await context.close();
  }
  {
    const { context, page } = await fixture();
    await page.goto(`${base}/piso`);
    for (const width of [1366, 1440, 1920, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const hero = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Piso da Enfermagem", exact: true }) });
      await expect(hero).toBeVisible();
      const img = hero.getByRole("img", { name: "Profissionais da enfermagem de Joinville" });
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
      assert.equal(await img.evaluate((e) => getComputedStyle(e).objectFit), "contain");
      assert.match(await img.evaluate((e) => getComputedStyle(e).maskImage), /linear-gradient/);
      await hero.screenshot({ path: `${out}/hero-${width}.png` });
    }
    checks++;
    await context.close();
  }
  console.log(`${checks} cenários de navegador passaram. Screenshots: ${out}`);
} finally {
  await browser.close();
}
