import { createOpenAI } from "@ai-sdk/openai";

export function clienteAuditoriaIa() {
  const chave = process.env.LOVABLE_API_KEY;
  if (!chave) throw new Error("AI Gateway não está configurado no servidor.");
  const cliente = createOpenAI({
    apiKey: chave,
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": chave,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  return {
    model: cliente.chat(process.env.LOVABLE_AI_MODEL ?? "google/gemini-2.5-flash"),
    nome: process.env.LOVABLE_AI_MODEL ?? "google/gemini-2.5-flash",
  };
}
