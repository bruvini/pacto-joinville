import { supabase } from "@/integrations/supabase/client";
import { processarCargaPisoServidor } from "@/lib/piso/processar-carga";
import { processarInvestsusPisoServidor } from "@/lib/piso/processar-investsus";

export async function processarEvidenciaPiso(
  competenciaId: string,
  arquivoId: string,
  categoria?: "planilha_carga" | "investsus" | "portaria_gm" | "afc13_cnes",
) {
  if (categoria === "planilha_carga") {
    return processarCargaPisoServidor({
      data: { competenciaId, arquivoId },
    });
  }

  if (categoria === "investsus") {
    return processarInvestsusPisoServidor({
      data: { competenciaId, arquivoId },
    });
  }

  // Somente Portaria e memória anual da 13ª permanecem na Edge Function legada.
  const { data, error } = await supabase.functions.invoke("piso-processar-evidencia", {
    body: { competencia_id: competenciaId, arquivo_id: arquivoId },
  });

  if (error) {
    let mensagem = error.message;
    try {
      const detalhe = await (error as any).context?.json?.();
      if (detalhe?.error) mensagem = detalhe.error;
    } catch {
      // Sem corpo HTTP: falha de rede, preflight ou boot da Edge Function.
    }

    if (/failed to send a request to the edge function/i.test(mensagem)) {
      throw new Error(
        "O arquivo foi preservado, mas o serviço de auditoria do Piso está indisponível no momento. " +
          "Não reenvie o arquivo. Verifique a implantação da função Edge da Portaria/13ª antes de reprocessar.",
      );
    }
    throw new Error(mensagem);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}
