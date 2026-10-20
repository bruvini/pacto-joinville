import { z } from "zod";
import { CAMPOS_AUDITORIA } from "./auditoria-documental";

const schema = z.object({
  resumo: z.string().min(8).max(2200),
  campos: z.array(z.object({
    campo: z.enum(CAMPOS_AUDITORIA),
    valor: z.string().max(170),
    pagina: z.number().int().min(1).max(999).nullable().optional(),
    evidencia: z.string().max(450).optional(),
  })).max(35),
});

export function lerResultadoAuditoriaIa(raw: string) {
  const texto = raw.replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "").trim();
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new Error("Resposta do modelo sem JSON válido.");
  return schema.parse(JSON.parse(texto.slice(inicio, fim + 1)));
}
