import { supabase } from "@/integrations/supabase/client";

export async function processarEvidenciaPiso(
  competenciaId: string,
  arquivoId: string,
) {
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
          "Use “Reprocessar” quando a função estiver disponível; não é necessário reenviar a planilha.",
      );
    }
    throw new Error(mensagem);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}
