import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_lancamento",
  title: "Detalhar lançamento",
  description:
    "Retorna todos os campos de um lançamento de pagamento, incluindo links SEI, valores e status, para o usuário autenticado.",
  inputSchema: {
    id: z.string().uuid().describe("ID (uuid) do lançamento."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("lancamentos_pagamento")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Lançamento não encontrado." }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { row: data },
    };
  },
});
