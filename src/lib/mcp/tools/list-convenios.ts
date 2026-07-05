import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_convenios",
  title: "Listar convênios",
  description: "Lista convênios/parcerias visíveis ao usuário autenticado.",
  inputSchema: {
    prestador_id: z.string().uuid().optional().describe("Filtrar por prestador."),
    status: z.string().optional().describe("Filtrar por status (ativo, suspenso, encerrado)."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ prestador_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    let q = supabaseForUser(ctx).from("convenios").select("*").order("created_at", { ascending: false }).limit(limit);
    if (prestador_id) q = q.eq("prestador_id", prestador_id);
    if (status) q = q.eq("status", status as never);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
