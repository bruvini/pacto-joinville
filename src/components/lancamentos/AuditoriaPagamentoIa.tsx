import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSearch, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { enviarPdfAuditoria } from "@/lib/lancamentos/auditoria-ia-upload";
import { analisarPagamentoComIa } from "@/lib/lancamentos/auditoria-ia.functions";
import { ResultadoAuditoriaIa } from "./ResultadoAuditoriaIa";

export function AuditoriaPagamentoIa({
  lancamentoId, podeAuditar,
}: { lancamentoId: string; podeAuditar: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const qc = useQueryClient();
  const chave = ["auditoria-pagamento-ia", lancamentoId];
  const { data: documentos = [], error } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const r = await supabase.from("auditoria_pagamento_documentos")
        .select("*").eq("lancamento_id", lancamentoId)
        .order("enviado_em", { ascending: false });
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const atualizar = () => { void qc.invalidateQueries({ queryKey: chave }); };
  const enviar = async (arquivo?: File) => {
    if (!arquivo || !podeAuditar) return;
    setBusy(true);
    try {
      await enviarPdfAuditoria(arquivo, lancamentoId);
      toast.success("PDF armazenado com sucesso.");
      atualizar();
    } catch (e: any) { toast.error(e?.message ?? "Erro no envio."); }
    finally {
      setBusy(false);
      if (entrada.current) entrada.current.value = "";
    }
  };
  const analisar = async (id: string) => {
    setAnalisando(id);
    try {
      const r = await analisarPagamentoComIa({ data: { documentoId: id } });
      toast.success(`Parecer disponível: ${r.quantidade} possível(is) divergência(s).`);
    } catch (e: any) { toast.error(e?.message ?? "Erro no AI Gateway."); }
    finally { setAnalisando(null); atualizar(); }
  };
  return <Card>
    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">
      <FileSearch className="h-4 w-4" /> Auditoria documental assistida por IA
    </CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Confronte valores, empenho e informações do lançamento com PDFs financeiros.
        Ao analisar, o documento é enviado ao Lovable AI Gateway. Parecer preliminar:
        não altera o processo e exige revisão do auditor.
      </p>
      {podeAuditar && <>
        <input ref={entrada} type="file" accept=".pdf,application/pdf"
          className="hidden" onChange={e => { void enviar(e.target.files?.[0]); }} />
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => entrada.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />{busy ? "Enviando…" : "Anexar PDF"}
        </Button>
      </>}
      {error && <p className="text-xs text-destructive">
        Não foi possível listar os documentos. Confira a migration da auditoria IA.
      </p>}
      {!error && !documentos.length && <p className="text-xs text-muted-foreground">
        Nenhum documento registrado.
      </p>}
      {documentos.map(doc => <div key={doc.id} className="space-y-2">
        <ResultadoAuditoriaIa documento={doc} podeAuditar={podeAuditar}
          onChange={atualizar} />
        {podeAuditar && ["pendente", "erro"].includes(doc.status) && (
          <Button size="sm" disabled={!!analisando || busy}
            onClick={() => { void analisar(doc.id); }}>
            {analisando === doc.id ? "Analisando…" :
              doc.status === "erro" ? "Tentar novamente" : "Analisar com IA"}
          </Button>
        )}
      </div>)}
    </CardContent>
  </Card>;
}
