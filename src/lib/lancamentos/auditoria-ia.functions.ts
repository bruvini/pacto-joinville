import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compararCamposExtraidos, resumoSnapshot } from "./auditoria-documental";
import { exigirPapelAuditor, verificarPdfOriginal } from "./auditoria-ia-auth";
import { analisarPdfComModelo } from "./auditoria-ia-modelo";

const entrada = z.object({ documentoId: z.string().uuid() });

export const analisarPagamentoComIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entrada.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const userId = String((context as any).userId ?? "");
    await exigirPapelAuditor(admin, userId);
    const { data: doc, error: docError } = await admin
      .from("auditoria_pagamento_documentos").select("*")
      .eq("id", data.documentoId).single();
    if (docError || !doc) throw new Error("Documento não encontrado.");
    if (!["pendente", "erro"].includes(doc.status)) {
      throw new Error("Análise já concluída ou em processamento.");
    }
    if (!String(doc.storage_path).startsWith(doc.lancamento_id + "/")) {
      throw new Error("Documento sem vínculo com o lançamento.");
    }
    const { data: lanc, error: lancError } = await admin
      .from("lancamentos_pagamento").select("*").eq("id", doc.lancamento_id).single();
    if (lancError || !lanc) throw new Error("Lançamento não encontrado.");
    if (!process.env.LOVABLE_API_KEY) throw new Error("AI Gateway indisponível.");

    const { data: bloqueio, error: bloqueioErro } = await admin
      .from("auditoria_pagamento_documentos")
      .update({ status: "processando", erro: null })
      .eq("id", doc.id).in("status", ["pendente", "erro"])
      .select("id").maybeSingle();
    if (bloqueioErro || !bloqueio) throw new Error("Outra sessão iniciou a análise.");

    try {
      const { data: arquivo, error: storageError } = await admin.storage
        .from("auditoria-pagamentos").download(doc.storage_path);
      if (storageError || !arquivo) throw new Error("Falha ao obter documento privado.");
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      await verificarPdfOriginal(bytes, Number(doc.tamanho_bytes), doc.sha256);
      const snapshot = resumoSnapshot(lanc as Record<string, unknown>);
      const resultado = await analisarPdfComModelo(bytes, snapshot);
      const divergencias = compararCamposExtraidos(resultado.campos, snapshot);
      const { error: salvarErro } = await admin.from("auditoria_pagamento_documentos")
        .update({
          status: "concluido", resumo_ia: resultado.resumo,
          campos_extraidos: resultado.campos, divergencias,
          snapshot_lancamento: snapshot,
          modelo_ia: resultado.modelo, modo_leitura: resultado.modo, erro: null,
        }).eq("id", doc.id).eq("status", "processando");
      if (salvarErro) throw salvarErro;
      return { documentoId: doc.id, quantidade: divergencias.length };
    } catch (e) {
      console.error("[Auditoria documental] Falha na análise:", e);
      await admin.from("auditoria_pagamento_documentos")
        .update({ status: "erro", erro: "A análise não pôde ser concluída. Verifique PDF e AI Gateway." })
        .eq("id", doc.id).eq("status", "processando");
      throw new Error("Análise não concluída. Verifique o documento e a disponibilidade do AI Gateway.");
    }
  });

export const revisarPagamentoComIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entrada.extend({
    observacao: z.string().trim().min(5).max(1500),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const userId = String((context as any).userId ?? "");
    await exigirPapelAuditor(admin, userId);
    const { data: doc, error } = await admin.from("auditoria_pagamento_documentos")
      .select("id,status").eq("id", data.documentoId).single();
    if (error || !doc || doc.status !== "concluido") throw new Error("Análise ainda não concluída.");
    const { error: revisaoErro } = await admin.from("auditoria_pagamento_documentos")
      .update({
        revisado_por: userId, revisado_em: new Date().toISOString(),
        revisao_observacao: data.observacao,
      }).eq("id", doc.id).eq("status", "concluido");
    if (revisaoErro) throw revisaoErro;
    return { documentoId: doc.id, revisado: true };
  });
