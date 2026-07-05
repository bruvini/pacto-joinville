import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_lancamentos",
  title: "Listar lançamentos de pagamento",
  description:
    "Lista lançamentos de pagamento de convênios (empenhos, atestos, anulações) visíveis ao usuário autenticado. Suporta filtros opcionais por competência, status ACO e conclusão.",
  inputSchema: {
    competencia: z.string().optional().describe("Filtrar por competência (formato YYYY-MM ou texto conforme cadastro)."),
    status_aco: z
      .string()
      .optional()
      .describe("Filtrar por status ACO (ex.: em_analise, empenhado, pago, anulado)."),
    concluido: z.boolean().optional().describe("Filtrar por processos concluídos (true) ou em andamento (false)."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ competencia, status_aco, concluido, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("lancamentos_pagamento")
      .select(
        "id, parcela, competencia, mes_pagamento_previsto, valor_solicitado, valor_atestado, status_aco, numero_empenho, concluido, responsavel_atual, prestador_id, convenio_id, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (competencia) q = q.eq("competencia", competencia);
    if (status_aco) q = q.eq("status_aco", status_aco as never);
    if (typeof concluido === "boolean") q = q.eq("concluido", concluido);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
