import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import pdfParse from "npm:pdf-parse@1.1.1";
import { Buffer } from "node:buffer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

const uuidValido = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );

const MESES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARCO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const normalizar = (valor: string) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const moeda = (valor: string) =>
  Number(
    String(valor ?? "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );

const quaseIgual = (a: number, b: number, tolerancia = 0.03) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerancia;

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extrairResumo(texto: string, competencia: string) {
  const [mesRaw, ano] = competencia.split("/");
  const mes = MESES[Number(mesRaw) - 1];
  if (!mes || !ano) throw new Error("Competência inválida.");

  const padrao = new RegExp(
    `${mes}\\s*\\/\\s*${ano}\\s+(\\d+)\\s+R\\$\\s*([\\d.,]+)\\s+R\\$\\s*([\\d.,]+)\\s+R\\$\\s*([\\d.,]+)`,
    "i",
  );
  const m = texto.match(padrao);
  if (!m)
    throw new Error(
      `Não foi possível localizar a linha financeira de ${mes}/${ano} no relatório CACON.`,
    );

  return {
    total_unidades: Number(m[1]),
    valor_medio_unitario: moeda(m[2]),
    valor_medio_dia: moeda(m[3]),
    valor_fornecido: moeda(m[4]),
  };
}

function extrairBoletim(texto: string, competencia: string) {
  const [mesRaw, ano] = competencia.split("/");
  const mes = MESES[Number(mesRaw) - 1];
  const inicio = texto.search(/ANEXO\s+I\b/i);

  if (inicio < 0) {
    return {
      pacientes_oral: null,
      dias_oral: null,
      pacientes_enteral: null,
      dias_enteral: null,
      anexo_encontrado: false,
      competencia_ok: null,
      total_encontrado: false,
    };
  }

  const trecho = texto.slice(inicio, Math.min(texto.length, inicio + 18000));
  const competenciaBoletim = trecho.match(
    /MES\s*:?\s*([A-Z]+)\s+ANO\s*:?\s*(\d{4})/i,
  );
  const competenciaOk = Boolean(
    competenciaBoletim &&
      normalizar(competenciaBoletim[1]).toUpperCase() === mes &&
      competenciaBoletim[2] === ano,
  );

  const total = trecho.match(/\bTOTAL\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/i);
  return {
    pacientes_oral: total ? Number(total[1]) : null,
    dias_oral: total ? Number(total[2]) : null,
    pacientes_enteral: total ? Number(total[3]) : null,
    dias_enteral: total ? Number(total[4]) : null,
    anexo_encontrado: true,
    competencia_ok: competenciaOk,
    total_encontrado: Boolean(total),
  };
}

function auditar(
  resumo: ReturnType<typeof extrairResumo>,
  boletim: ReturnType<typeof extrairBoletim>,
) {
  const ocorrencias: Array<{
    severidade: "critica" | "alerta" | "info";
    regra: string;
    descricao: string;
  }> = [];

  const add = (
    severidade: "critica" | "alerta" | "info",
    regra: string,
    descricao: string,
  ) => ocorrencias.push({ severidade, regra, descricao });

  if (!(resumo.total_unidades > 0))
    add("critica", "total_unidades", "O total de frascos/latas deve ser maior que zero.");
  if (!(resumo.valor_fornecido > 0))
    add("critica", "valor_fornecido", "O valor fornecido deve ser maior que zero.");

  const mediaUnitaria =
    resumo.total_unidades > 0 ? resumo.valor_fornecido / resumo.total_unidades : NaN;
  if (!quaseIgual(mediaUnitaria, resumo.valor_medio_unitario, 0.03))
    add(
      "alerta",
      "media_unitaria",
      `Valor médio unitário informado (R$ ${resumo.valor_medio_unitario.toFixed(2)}) não fecha com valor fornecido ÷ unidades (R$ ${mediaUnitaria.toFixed(2)}).`,
    );

  if (!boletim.anexo_encontrado) {
    add(
      "alerta",
      "anexo_i_nao_localizado",
      "O ANEXO I do Boletim Nutricional não foi localizado; o resumo financeiro foi extraído normalmente.",
    );
  } else if (boletim.competencia_ok === false) {
    add(
      "critica",
      "competencia_anexo_divergente",
      "A competência identificada no ANEXO I diverge da competência do lançamento.",
    );
  }

  if (!boletim.total_encontrado) {
    add(
      "alerta",
      "total_anexo_nao_extraido",
      "A linha TOTAL do ANEXO I não pôde ser extraída. Os indicadores de pacientes/dias ficaram sem preenchimento, sem impedir o uso do resumo financeiro.",
    );
  } else {
    const dias = Number(boletim.dias_oral ?? 0) + Number(boletim.dias_enteral ?? 0);
    const mediaDia = dias > 0 ? resumo.valor_fornecido / dias : NaN;
    if (!quaseIgual(mediaDia, resumo.valor_medio_dia, 0.03))
      add(
        "alerta",
        "media_dia",
        `Valor médio por dia informado (R$ ${resumo.valor_medio_dia.toFixed(2)}) não fecha com valor fornecido ÷ dias de suplementação (R$ ${mediaDia.toFixed(2)}).`,
      );

    if (Number(boletim.pacientes_oral ?? 0) + Number(boletim.pacientes_enteral ?? 0) <= 0)
      add("alerta", "pacientes_zero", "O Boletim Nutricional não apresenta pacientes na competência.");
  }

  add(
    "info",
    "privacidade",
    "O detalhamento individual dos pacientes foi utilizado apenas durante o processamento do PDF e não foi persistido no banco.",
  );

  return {
    criticas: ocorrencias.filter((o) => o.severidade === "critica").length,
    alertas: ocorrencias.filter((o) => o.severidade === "alerta").length,
    informacoes: ocorrencias.filter((o) => o.severidade === "info").length,
    ocorrencias,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE)
      return json({ error: "Configuração do servidor incompleta" }, 503);

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return json({ error: "Não autenticado" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida" }, 401);

    const user = authData.user;
    const { data: roles, error: roleError } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp"].includes(r.role)))
      return json({ error: "Usuário sem permissão para processar Dieta CACON" }, 403);

    const body = await req.json().catch(() => null);
    const competenciaId = body?.competencia_id;
    const arquivoId = body?.arquivo_id;
    if (!uuidValido(competenciaId) || !uuidValido(arquivoId))
      return json({ error: "competencia_id e arquivo_id são obrigatórios" }, 400);

    const { data: competencia, error: compError } = await service
      .from("cacon_competencias")
      .select("id,competencia")
      .eq("id", competenciaId)
      .single();
    if (compError || !competencia)
      return json({ error: "Competência CACON não encontrada" }, 404);

    const { data: arquivo, error: arquivoError } = await service
      .from("cacon_arquivos")
      .select("*")
      .eq("id", arquivoId)
      .eq("competencia_id", competenciaId)
      .eq("categoria", "relatorio_cacon")
      .single();
    if (arquivoError || !arquivo)
      return json({ error: "Relatório CACON não encontrado" }, 404);

    const { data: binario, error: downloadError } = await service.storage
      .from("cacon-arquivos")
      .download(arquivo.storage_path);
    if (downloadError || !binario)
      throw new Error("Não foi possível ler o PDF original armazenado.");

    const bytes = new Uint8Array(await binario.arrayBuffer());
    const hash = await sha256Hex(bytes);
    if (hash.toLowerCase() !== String(arquivo.sha256).toLowerCase())
      throw new Error("A integridade SHA-256 do PDF não confere com a evidência registrada.");

    const pdf = await pdfParse(Buffer.from(bytes));
    const texto = normalizar(pdf.text ?? "");
    if (!texto) throw new Error("Não foi possível extrair texto do PDF.");

    const resumo = extrairResumo(texto, competencia.competencia);
    const boletim = extrairBoletim(texto, competencia.competencia);
    const auditoria = auditar(resumo, boletim);

    const { data: perfil } = await service
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle();

    const processadoEm = new Date().toISOString();
    const { error: updateError } = await service
      .from("cacon_competencias")
      .update({
        ...resumo,
        pacientes_oral: boletim.pacientes_oral,
        dias_oral: boletim.dias_oral,
        pacientes_enteral: boletim.pacientes_enteral,
        dias_enteral: boletim.dias_enteral,
        extracao: {
          versao: 3,
          origem: "pdf_original",
          modo: "edge_pdf_parse",
          status: "aguardando_confirmacao",
          arquivo_id: arquivo.id,
          sha256: arquivo.sha256,
          paginas: pdf.numpages ?? null,
          extraido_em: processadoEm,
          confirmada_em: null,
          confirmada_por: null,
          confirmada_por_nome: null,
        },
        auditoria,
        processado_em: processadoEm,
        updated_by: user.id,
      })
      .eq("id", competenciaId);
    if (updateError) throw updateError;

    await service.from("cacon_logs").insert({
      competencia_id: competenciaId,
      acao: "Relatório CACON processado no servidor · aguardando conferência",
      usuario_id: user.id,
      usuario_nome: perfil?.nome ?? user.email ?? "Usuário",
      detalhes: {
        arquivo_id: arquivo.id,
        sha256: arquivo.sha256,
        valor_fornecido: resumo.valor_fornecido,
        total_unidades: resumo.total_unidades,
        criticas: auditoria.criticas,
        alertas: auditoria.alertas,
      },
    });

    return json({
      ok: true,
      resumo,
      boletim,
      auditoria,
      processado_em: processadoEm,
    });
  } catch (e) {
    console.error("cacon-processar-relatorio:", e);
    return json(
      { error: e instanceof Error ? e.message : "Falha ao processar o relatório CACON" },
      500,
    );
  }
});
