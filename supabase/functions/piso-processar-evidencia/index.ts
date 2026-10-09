import { createClient } from "npm:@supabase/supabase-js@2.57.4";
type Ocorrencia = {
  severidade: "erro" | "alerta" | "info";
  regra: string;
  linha?: number;
  descricao: string;
  cpf_mascarado?: string;
  cnes?: string;
  instituicao_nome?: string;
  dados?: Record<string, unknown>;
};
type RegistroCarga = Record<string, any>;
const carregarRegras = () => import("../_shared/piso-evidencias.ts");

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

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function baixarArquivo(service: any, arquivo: any) {
  const { data, error } = await service.storage
    .from("piso-arquivos")
    .download(arquivo.storage_path);
  if (error || !data) throw new Error("Não foi possível ler a evidência armazenada.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (arquivo.sha256) {
    const atual = await sha256Hex(bytes);
    if (atual.toLowerCase() !== String(arquivo.sha256).toLowerCase())
      throw new Error("A integridade SHA-256 do arquivo não confere com a evidência registrada.");
  }
  return bytes;
}

async function registrarOcorrencias(
  service: any,
  competenciaId: string,
  arquivoId: string,
  categoria: "carga" | "investsus" | "conciliacao",
  ocorrencias: Ocorrencia[],
  participanteId: string | null = null,
  instituicaoFallback = "",
) {
  if (!ocorrencias.length) return;
  const payload = ocorrencias.map((o) => ({
    competencia_id: competenciaId,
    participante_id: participanteId,
    arquivo_id: arquivoId,
    categoria,
    severidade: o.severidade,
    regra: o.regra,
    linha: o.linha || null,
    descricao: o.descricao,
    cpf_mascarado: o.cpf_mascarado || null,
    cnes: o.cnes || null,
    instituicao_nome: o.instituicao_nome || instituicaoFallback || null,
    dados: o.dados || {},
  }));
  const { error } = await service.from("piso_ocorrencias").insert(payload);
  if (error) throw error;
}

const nomePrestador = (rel: any) =>
  Array.isArray(rel) ? rel[0]?.nome_instituicao ?? null : rel?.nome_instituicao ?? null;

async function processarCarga(
  service: any,
  competenciaId: string,
  arquivo: any,
  actor: { id: string; nome: string | null },
) {
  const { auditarCarga, lerPlanilha } = await carregarRegras();
  if (!arquivo.participante_id)
    throw new Error("A Planilha de Carga não está vinculada a uma instituição.");

  const { data: participante, error: partErr } = await service
    .from("piso_participantes")
    .select("id,prestador_id,prestadores(nome_instituicao)")
    .eq("id", arquivo.participante_id)
    .eq("competencia_id", competenciaId)
    .single();
  if (partErr || !participante) throw new Error("Instituição participante não encontrada.");

  const { data: cnesRows, error: cnesErr } = await service
    .from("prestador_cnes")
    .select("cnes")
    .eq("prestador_id", participante.prestador_id);
  if (cnesErr) throw cnesErr;

  const permitidos = (cnesRows ?? []).map((x: any) => String(x.cnes)).filter(Boolean);
  if (!permitidos.length)
    throw new Error("Cadastre ao menos um CNES no prestador antes de auditar a Planilha de Carga.");

  const bytes = await baixarArquivo(service, arquivo);
  const rows = lerPlanilha(bytes, "carga");
  const audit = auditarCarga(rows, permitidos);

  const { error: limpar } = await service
    .from("piso_ocorrencias")
    .delete()
    .eq("arquivo_id", arquivo.id)
    .eq("categoria", "carga");
  if (limpar) throw limpar;

  await registrarOcorrencias(
    service,
    competenciaId,
    arquivo.id,
    "carga",
    audit.ocorrencias,
    participante.id,
    nomePrestador(participante.prestadores) ?? "Instituição",
  );

  const resumo = {
    linhas: rows.length,
    erros: audit.ocorrencias.filter((o) => o.severidade === "erro").length,
    alertas: audit.ocorrencias.filter((o) => o.severidade === "alerta").length,
    ocorrencias: audit.ocorrencias.length,
    processado_em: new Date().toISOString(),
    arquivo_id: arquivo.id,
    origem_calculo: "edge_function",
  };

  const { error: updateErr } = await service
    .from("piso_participantes")
    .update({ auditoria_resumo: resumo, sem_elegiveis: false })
    .eq("id", participante.id)
    .eq("competencia_id", competenciaId);
  if (updateErr) throw updateErr;

  await service.from("historico_logs").insert({
    piso_competencia_id: competenciaId,
    usuario_id: actor.id,
    usuario_nome: actor.nome,
    acao: "Piso · Planilha de Carga auditada no servidor",
    detalhes: {
      arquivo_id: arquivo.id,
      participante_id: participante.id,
      instituicao_nome: nomePrestador(participante.prestadores),
      sha256: arquivo.sha256,
      linhas: resumo.linhas,
      erros: resumo.erros,
      alertas: resumo.alertas,
    },
  });

  return { tipo: "planilha_carga", audit: resumo };
}

async function processarInvestsus(
  service: any,
  competenciaId: string,
  arquivo: any,
  actor: { id: string; nome: string | null },
) {
  // A planilha mensal contém complemento por CPF/CNES. Para a 13ª,
  // as regras federais são anuais e podem usar memória distinta.
  // Não produzir valores financeiros autoritativos a partir do modelo mensal.
  const { data: parcela, error: tipoError } = await service
    .from("piso_competencias")
    .select("tipo_parcela,exercicio_referencia")
    .eq("id", competenciaId)
    .single();
  if (tipoError) throw tipoError;
  if (parcela?.tipo_parcela === "decimo_terceiro") {
    throw new Error(
      "A saída mensal do InvestSUS não pode gerar valores da 13ª parcela. " +
      "Anexe a memória oficial específica da 13ª e aguarde a conferência do " +
      "formato da fonte. Nenhum valor será copiado das competências mensais.",
    );
  }
  const {
    INVESTSUS_AUDIT_RULES_VERSION,
    auditarCarga,
    auditarInvestsus,
    conciliar,
    lerPlanilha,
  } = await carregarRegras();
  const bytes = await baixarArquivo(service, arquivo);
  const rows = lerPlanilha(bytes, "investsus");
  const audit = auditarInvestsus(rows);

  const { data: participantes, error: partErr } = await service
    .from("piso_participantes")
    .select("id,prestador_id,prestadores(nome_instituicao)")
    .eq("competencia_id", competenciaId);
  if (partErr) throw partErr;

  const prestadorIds = [...new Set((participantes ?? []).map((p: any) => p.prestador_id).filter(Boolean))];
  const { data: cnesRows, error: cnesErr } = prestadorIds.length
    ? await service.from("prestador_cnes").select("prestador_id,cnes").in("prestador_id", prestadorIds)
    : { data: [], error: null };
  if (cnesErr) throw cnesErr;

  const { data: cargasArquivos, error: cargasErr } = await service
    .from("piso_arquivos")
    .select("*")
    .eq("competencia_id", competenciaId)
    .eq("categoria", "planilha_carga")
    .order("enviado_em", { ascending: false });
  if (cargasErr) throw cargasErr;

  const ultimoPorParticipante = new Map<string, any>();
  for (const arq of cargasArquivos ?? []) {
    if (arq.participante_id && !ultimoPorParticipante.has(arq.participante_id))
      ultimoPorParticipante.set(arq.participante_id, arq);
  }

  const cargas: Array<RegistroCarga & { instituicao_nome?: string }> = [];
  for (const p of participantes ?? []) {
    const arq = ultimoPorParticipante.get(p.id);
    if (!arq) continue;
    const cargaBytes = await baixarArquivo(service, arq);
    const cargaRows = lerPlanilha(cargaBytes, "carga");
    const permitidos = (cnesRows ?? [])
      .filter((x: any) => x.prestador_id === p.prestador_id)
      .map((x: any) => String(x.cnes));
    const auditCarga = auditarCarga(cargaRows, permitidos);
    cargas.push(
      ...auditCarga.registros.map((r) => ({
        ...r,
        instituicao_nome: nomePrestador(p.prestadores) ?? "Instituição",
      })),
    );
  }

  const cruzada = conciliar(cargas, audit.registros);

  const { error: limpar } = await service
    .from("piso_ocorrencias")
    .delete()
    .eq("arquivo_id", arquivo.id)
    .in("categoria", ["investsus", "conciliacao"]);
  if (limpar) throw limpar;

  await registrarOcorrencias(service, competenciaId, arquivo.id, "investsus", audit.ocorrencias);
  await registrarOcorrencias(service, competenciaId, arquivo.id, "conciliacao", cruzada.ocorrencias);

  const resumoPersistido = {
    ...audit.resumo,
    processado_em: new Date().toISOString(),
    arquivo_id: arquivo.id,
    versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
    origem_calculo: "edge_function",
  };

  const { error: compErr } = await service
    .from("piso_competencias")
    .update({
      investsus_resumo: resumoPersistido,
      investsus_auditoria: {
        versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
        origem_calculo: "edge_function",
        interna: {
          erros: audit.resumo.erros,
          alertas: audit.resumo.alertas,
        },
        conciliacao: cruzada.resumo,
      },
      valor_apurado_investsus: audit.resumo.total_complemento,
      total_publicado_municipal: audit.resumo.total_complemento,
    })
    .eq("id", competenciaId);
  if (compErr) throw compErr;

  for (const p of participantes ?? []) {
    const cnesPart = new Set(
      (cnesRows ?? [])
        .filter((x: any) => x.prestador_id === p.prestador_id)
        .map((x: any) => String(x.cnes)),
    );
    const valor = Object.entries(audit.resumo.por_cnes)
      .filter(([codigo]) => cnesPart.has(codigo))
      .reduce((t, [, v]) => t + Number(v), 0);

    const { error } = await service
      .from("piso_participantes")
      .update({ valor_devido: Math.round(valor * 100) / 100 })
      .eq("id", p.id)
      .eq("competencia_id", competenciaId);
    if (error) throw error;
  }

  await service.from("historico_logs").insert({
    piso_competencia_id: competenciaId,
    usuario_id: actor.id,
    usuario_nome: actor.nome,
    acao: "Piso · InvestSUS processado no servidor",
    detalhes: {
      arquivo_id: arquivo.id,
      sha256: arquivo.sha256,
      versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
      total_complemento: audit.resumo.total_complemento,
      criticas: cruzada.resumo.criticas,
      alertas: cruzada.resumo.alertas,
    },
  });

  return {
    tipo: "investsus",
    audit: {
      linhas: audit.resumo.linhas,
      erros: audit.resumo.erros,
      alertas: audit.resumo.alertas,
      total_complemento: audit.resumo.total_complemento,
    },
    conciliacao: cruzada.resumo,
  };
}

async function processarMemoria13(
  service: any,
  competenciaId: string,
  arquivo: any,
  actor: { id: string; nome: string | null },
) {
  const { lerMemoria13PorCnes } = await carregarRegras();
  const bytes = await baixarArquivo(service, arquivo);
  const linhas = lerMemoria13PorCnes(bytes);

  // Validação e gravação financeira em transação no banco. A RPC só pode
  // ser executada pela service_role e não aceita valores do navegador.
  const { data: total, error } = await service.rpc("piso_aplicar_memoria_13_cnes", {
    p_competencia: competenciaId,
    p_arquivo: arquivo.id,
    p_linhas: linhas,
    p_autor: actor.id,
  });
  if (error) throw error;
  return {
    tipo: "afc13_cnes",
    audit: { linhas: linhas.length, total_complemento: Number(total ?? 0), erros: 0, alertas: 0 },
    conciliacao: { criticas: 0, alertas: 0 },
  };
}

async function processarPortaria(
  service: any,
  competenciaId: string,
  arquivo: any,
  actor: { id: string; nome: string | null },
) {
  const { extrairPortaria } = await carregarRegras();
  const bytes = await baixarArquivo(service, arquivo);
  const dados = await extrairPortaria(bytes);

  if (!dados.joinville_localizada)
    throw new Error("Não foi possível localizar a linha financeira de Joinville na Portaria GM/MS.");

  const patch = Object.fromEntries(
    Object.entries({
      portaria_gm_numero: dados.numero,
      portaria_gm_data_ato: dados.data_ato,
      portaria_gm_data_publicacao: dados.data_publicacao,
      portaria_gm_edicao: dados.edicao,
      portaria_gm_secao: dados.secao,
      portaria_gm_pagina: dados.pagina,
      valor_homologado: dados.valor_homologado,
      desconto_saldo: dados.desconto_saldo,
      acerto_contas: dados.acerto_contas,
      valor_transferido: dados.valor_transferido,
    }).filter(([, valor]) => valor !== null && valor !== undefined),
  );

  const { error } = await service
    .from("piso_competencias")
    .update(patch)
    .eq("id", competenciaId);
  if (error) throw error;

  await service.from("historico_logs").insert({
    piso_competencia_id: competenciaId,
    usuario_id: actor.id,
    usuario_nome: actor.nome,
    acao: "Piso · Portaria GM/MS processada no servidor",
    detalhes: {
      arquivo_id: arquivo.id,
      sha256: arquivo.sha256,
      portaria: dados.numero,
      valor_homologado: dados.valor_homologado,
      valor_transferido: dados.valor_transferido,
    },
  });

  return { tipo: "portaria_gm", dados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE)
      return json({ error: "Configuração do servidor incompleta" }, 503);

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

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
    const permitido = (roles ?? []).some((r: any) => ["admin", "acp", "aco"].includes(r.role));
    if (!permitido) return json({ error: "Usuário sem papel autorizado" }, 403);

    const body = await req.json().catch(() => null);
    const competenciaId = body?.competencia_id;
    const arquivoId = body?.arquivo_id;
    if (!uuidValido(competenciaId) || !uuidValido(arquivoId))
      return json({ error: "competencia_id e arquivo_id são obrigatórios" }, 400);

    const { data: perfil } = await service
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle();

    const { data: arquivo, error: arqError } = await service
      .from("piso_arquivos")
      .select("*")
      .eq("id", arquivoId)
      .eq("competencia_id", competenciaId)
      .single();
    if (arqError || !arquivo) return json({ error: "Evidência não encontrada" }, 404);

    const actor = { id: user.id, nome: perfil?.nome ?? user.email ?? null };

    if (arquivo.categoria === "planilha_carga")
      return json(await processarCarga(service, competenciaId, arquivo, actor));
    if (arquivo.categoria === "investsus")
      return json(await processarInvestsus(service, competenciaId, arquivo, actor));
    if (arquivo.categoria === "afc13_cnes")
      return json(await processarMemoria13(service, competenciaId, arquivo, actor));
    if (arquivo.categoria === "portaria_gm")
      return json(await processarPortaria(service, competenciaId, arquivo, actor));

    return json({ error: "Categoria de evidência não processável por esta função" }, 400);
  } catch (e) {
    console.error("piso-processar-evidencia:", e);
    return json(
      { error: e instanceof Error ? e.message : "Falha ao processar a evidência" },
      500,
    );
  }
});
