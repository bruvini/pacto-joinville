import { linkValido } from "@/lib/sei";
import { etapa2Completa } from "./etapas";

/**
 * As mesmas pré-condições usadas pela tela e pelo ato de encaminhamento.
 * O SEI produz o cabeçalho com a data do memorando. Por isso,
 * sms_memorando_data é metadado opcional e NÃO bloqueia o envio.
 */
export function pendenciasEncaminhamentoCacon(
  competencia: any,
  assinaturas: Array<{ slot?: string | null }> = [],
): string[] {
  const pendencias: string[] = [];

  if (!etapa2Completa(competencia)) {
    pendencias.push("Conclua a conferência da produção CACON.");
  }
  if (!String(competencia?.sms_memorando_numero ?? "").trim()) {
    pendencias.push("Informe o Nº SEI do Memorando SMS.");
  }
  if (!linkValido(competencia?.sms_memorando_link ?? "")) {
    pendencias.push("Informe o link válido do Memorando SMS no SEI.");
  }
  if (!String(competencia?.portaria_referencia ?? "").trim()) {
    pendencias.push("Confira a base normativa.");
  }
  if (!String(competencia?.portaria_sei_numero ?? "").trim()) {
    pendencias.push("Informe o Nº SEI da Portaria.");
  }
  if (!assinaturas.some((assinatura) => assinatura.slot === "fiscal")) {
    pendencias.push("Registre ao menos uma assinatura fiscal.");
  }

  return pendencias;
}
