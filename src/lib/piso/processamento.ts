import { processarCargaPisoServidor } from "@/lib/piso/processar-carga";
import { processarInvestsusPisoServidor } from "@/lib/piso/processar-investsus";
import {
  processarPortariaPisoServidor,
  processarMemoria13PisoServidor,
} from "@/lib/piso/processar-evidencias-oficiais";

/** Todas as evidências são processadas no servidor da aplicação Lovable.
 * O arquivo original já está no Storage privado e é relido/validado por SHA-256.
 * Não chamar a antiga Edge Function: ela não está disponível no deploy atual.
 */
export async function processarEvidenciaPiso(
  competenciaId: string,
  arquivoId: string,
  categoria?: "planilha_carga" | "investsus" | "portaria_gm" | "afc13_cnes",
) {
  const data = { competenciaId, arquivoId };
  switch (categoria) {
    case "planilha_carga":
      return processarCargaPisoServidor({ data });
    case "investsus":
      return processarInvestsusPisoServidor({ data });
    case "portaria_gm":
      return processarPortariaPisoServidor({ data });
    case "afc13_cnes":
      return processarMemoria13PisoServidor({ data });
    default:
      throw new Error("Categoria da evidência do Piso não informada ou não processável.");
  }
}
