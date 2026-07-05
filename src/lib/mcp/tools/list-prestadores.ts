import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_prestadores",
  title: "Listar prestadores",
  description: "Lista prestadores (organizações conveniadas) visíveis ao usuário autenticado.",
  inputSchema: {
    search: z.string().optional().describe("Busca por nome ou CNPJ (contém)."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    let q = supabaseForUser(ctx).from("prestadores").select("*").order("nome").limit(limit);
    if (search) q = q.or(`nome.ilike.%${search}%,cnpj.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
