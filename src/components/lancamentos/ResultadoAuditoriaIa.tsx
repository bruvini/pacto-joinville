import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { revisarPagamentoComIa } from "@/lib/lancamentos/auditoria-ia.functions";
import type { DivergenciaDocumental } from "@/lib/lancamentos/auditoria-documental";

export function ResultadoAuditoriaIa({
  documento, podeAuditar, onChange,
}: {
  documento: any; podeAuditar: boolean; onChange: () => void;
}) {
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const divergencias = Array.isArray(documento.divergencias)
    ? documento.divergencias as DivergenciaDocumental[] : [];
  const baixar = async () => {
    const { data, error } = await supabase.storage.from("auditoria-pagamentos")
      .createSignedUrl(documento.storage_path, 60);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Link indisponível.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const revisar = async () => {
    setSalvando(true);
    try {
      await revisarPagamentoComIa({ data: {
        documentoId: documento.id, observacao: observacao.trim(),
      } });
      setObservacao("");
      toast.success("Revisão fiscal registrada.");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível registrar a revisão.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-all">{documento.nome_arquivo}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(documento.enviado_em).toLocaleString("pt-BR")} · {documento.status}
            {documento.revisado_em ? " · Revisado" : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={baixar}>Abrir PDF original</Button>
      </div>
      {documento.status === "concluido" && (
        <>
          <p className="whitespace-pre-wrap rounded-md bg-muted/30 p-3">{documento.resumo_ia}</p>
          <p className="font-semibold">Divergências sugeridas: {divergencias.length}</p>
          {divergencias.length ? (
            <div className="space-y-2">
              {divergencias.map((d, i) => (
                <div key={d.campo + i} className="rounded-md border p-3 space-y-1">
                  <p className="font-semibold">{d.rotulo} · {d.gravidade === "critica" ? "Crítica" : "Atenção"}</p>
                  <div className="grid gap-1 sm:grid-cols-2 text-xs">
                    <p><b>No documento:</b> {d.valor_documento}</p>
                    <p><b>No lançamento:</b> {d.valor_sistema}</p>
                  </div>
                  {d.evidencia && <p className="text-xs text-muted-foreground">Evidência{d.pagina ? " · pág. " + d.pagina : ""}: {d.evidencia}</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">Nenhuma divergência identificada entre os campos extraídos e preenchidos. Isso não confirma a regularidade do pagamento.</p>}
          <p className="text-xs text-muted-foreground">
            Análise preliminar realizada pelo modelo {documento.modelo_ia || "IA"}.
            Confira o PDF e os documentos SEI antes de qualquer decisão fiscal.
            A análise não altera valores no lançamento.
          </p>
          {documento.revisado_em ? (
            <p className="rounded-md border p-2 text-xs">
              Revisão registrada em {new Date(documento.revisado_em).toLocaleString("pt-BR")}.
              {documento.revisao_observacao && " Observações: " + documento.revisao_observacao}
            </p>
          ) : podeAuditar && (
            <div className="space-y-2">
              <Textarea placeholder="Registre o resultado da conferência humana e providências (mínimo 5 caracteres)."
                value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} />
              <Button type="button" size="sm" disabled={salvando || observacao.trim().length < 5}
                onClick={revisar}>{salvando ? "Registrando…" : "Registrar revisão do auditor"}</Button>
            </div>
          )}
        </>
      )}
      {documento.status === "erro" && (
        <p className="text-xs text-destructive">{documento.erro || "Não foi possível concluir."}</p>
      )}
    </div>
  );
}
