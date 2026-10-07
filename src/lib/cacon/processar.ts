import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entradaSchema = z.object({
  competenciaId: z.string().uuid(),
  arquivoId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  textoPdf: z.string().min(20).max(3_000_000),
  paginas: z.number().int().positive().max(500).nullable().optional(),
});

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
      pacientes_oral: null as number | null,
      dias_oral: null as number | null,
      pacientes_enteral: null as number | null,
      dias_enteral: null as number | null,
      anexo_encontrado: false,
      competencia_ok: null as boolean | null,
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
      `Valor médio unitário informado (R$ ${resumo.valor_medio_unitario.toFixed(2)}) não fecha exatamente com valor fornecido ÷ unidades (R$ ${mediaUnitaria.toFixed(2)}).`,
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
      "A linha TOTAL do ANEXO I não pôde ser extraída. Os indicadores de pacientes/dias ficaram sem preenchimento.",
    );
  } else {
    const dias = Number(boletim.dias_oral ?? 0) + Number(boletim.dias_enteral ?? 0);
    const mediaDia = dias > 0 ? resumo.valor_fornecido / dias : NaN;
    if (!quaseIgual(mediaDia, resumo.valor_medio_dia, 0.03))
      add(
        "alerta",
        "media_dia",
        `Valor médio por dia informado (R$ ${resumo.valor_medio_dia.toFixed(2)}) não fecha exatamente com valor fornecido ÷ dias de suplementação (R$ ${mediaDia.toFixed(2)}).`,
      );

    if (Number(boletim.pacientes_oral ?? 0) + Number(boletim.pacientes_enteral ?? 0) <= 0)
      add("alerta", "pacientes_zero", "O Boletim Nutricional não apresenta pacientes na competência.");
  }

  add(
    "info",
    "privacidade",
    "A relação nominal de pacientes foi utilizada apenas para leitura do PDF e não foi persistida no banco.",
  );

  return {
    criticas: ocorrencias.filter((o) => o.severidade === "critica").length,
    alertas: ocorrencias.filter((o) => o.severidade === "alerta").length,
    informacoes: ocorrencias.filter((o) => o.severidade === "info").length,
    ocorrencias,
  };
}

async function tentarExtracaoServidor(bytes: Uint8Array) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const totalPaginas = pdf.numPages;
    const paginas: string[] = [];
    for (let n = 1; n <= totalPaginas; n++) {
      const pagina = await pdf.getPage(n);
      const conteudo = await pagina.getTextContent();
      paginas.push(
        conteudo.items
          .map((item: any) => ("str" in item ? String(item.str) : ""))
          .filter(Boolean)
          .join(" "),
      );
      pagina.cleanup();
    }
    await loadingTask.destroy();
    const texto = normalizar(paginas.join(" "));
    return texto ? { texto, paginas: totalPaginas } : null;
  } catch (error) {
    console.warn("[CACON] PDF.js server-side indisponível; usando extração do navegador.", error);
    return null;
  }
}

export const processarRelatorioCacon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entradaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão não identificada.");

    const { data: roles, error: roleError } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) throw roleError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp"].includes(r.role)))
      throw new Error("Você não tem permissão para processar Dieta CACON.");

    const { data: competencia, error: compError } = await (supabaseAdmin as any)
      .from("cacon_competencias")
      .select("id,competencia")
      .eq("id", data.competenciaId)
      .single();
    if (compError || !competencia) throw new Error("Competência CACON não encontrada.");

    const { data: arquivo, error: arquivoError } = await (supabaseAdmin as any)
      .from("cacon_arquivos")
      .select("*")
      .eq("id", data.arquivoId)
      .eq("competencia_id", data.competenciaId)
      .eq("categoria", "relatorio_cacon")
      .single();
    if (arquivoError || !arquivo) throw new Error("Relatório CACON não encontrado.");

    const { data: binario, error: downloadError } = await (supabaseAdmin as any).storage
      .from("cacon-arquivos")
      .download(arquivo.storage_path);
    if (downloadError || !binario)
      throw new Error("Não foi possível ler o PDF original armazenado.");

    const bytes = new Uint8Array(await binario.arrayBuffer());
    const hashServidor = await sha256Hex(bytes);
    if (
      hashServidor.toLowerCase() !== String(arquivo.sha256).toLowerCase() ||
      hashServidor.toLowerCase() !== data.sha256.toLowerCase()
    ) {
      throw new Error("A integridade SHA-256 do PDF não confere com a evidência registrada.");
    }

    const extraidoServidor = await tentarExtracaoServidor(bytes);
    const texto = normalizar(extraidoServidor?.texto || data.textoPdf);
    if (!texto) throw new Error("O relatório não possui texto extraível.");

    const resumo = extrairResumo(texto, competencia.competencia);
    const boletim = extrairBoletim(texto, competencia.competencia);
    const auditoria = auditar(resumo, boletim);

    const { data: perfil } = await (supabaseAdmin as any)
      .from("profiles")
      .select("nome,email")
      .eq("id", userId)
      .maybeSingle();

    const processadoEm = new Date().toISOString();
    const { error: updateError } = await (supabaseAdmin as any)
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
          modo: extraidoServidor ? "server_pdfjs" : "browser_pdfjs_validado_por_hash",
          status: "aguardando_confirmacao",
          arquivo_id: arquivo.id,
          sha256: arquivo.sha256,
          paginas: extraidoServidor?.paginas ?? data.paginas ?? null,
          extraido_em: processadoEm,
          confirmada_em: null,
          confirmada_por: null,
          confirmada_por_nome: null,
        },
        auditoria,
        processado_em: processadoEm,
        updated_by: userId,
      })
      .eq("id", data.competenciaId);
    if (updateError) throw updateError;

    await (supabaseAdmin as any).from("cacon_logs").insert({
      competencia_id: data.competenciaId,
      acao: "Relatório CACON processado",
      usuario_id: userId,
      usuario_nome: perfil?.nome ?? perfil?.email ?? "Usuário",
      detalhes: {
        descricao: `PDF auditado; ${auditoria.criticas} crítica(s) e ${auditoria.alertas} alerta(s). Aguardando conferência humana dos dados extraídos.`,
        arquivo_id: arquivo.id,
        sha256: arquivo.sha256,
        modo_extracao: extraidoServidor ? "server_pdfjs" : "browser_pdfjs_validado_por_hash",
        valor_fornecido: resumo.valor_fornecido,
        total_unidades: resumo.total_unidades,
      },
    });

    return {
      ok: true,
      resumo,
      boletim: {
        pacientes_oral: boletim.pacientes_oral,
        dias_oral: boletim.dias_oral,
        pacientes_enteral: boletim.pacientes_enteral,
        dias_enteral: boletim.dias_enteral,
      },
      auditoria,
      processado_em: processadoEm,
      modo_extracao: extraidoServidor ? "server_pdfjs" : "browser_pdfjs_validado_por_hash",
    };
  });
