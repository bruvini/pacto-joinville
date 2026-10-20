import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSearch, Upload, CircleHelp, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [confirmarDocumentoId, setConfirmarDocumentoId] = useState<string | null>(null);
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
    <CardHeader className="pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-4 w-4" /> Auditoria documental assistida por IA
        </CardTitle>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <CircleHelp className="mr-1.5 h-4 w-4" />
              Como funciona? Documentos e custos
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Como funciona a auditoria documental com IA?</DialogTitle>
              <DialogDescription>
                Orientações para o enfermeiro auditor utilizar a conferência assistida com segurança.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <section className="space-y-1">
                <h3 className="font-semibold">1. Para que serve?</h3>
                <p>O sistema lê um PDF financeiro e procura divergências entre as informações
                  encontradas e as que estão registradas neste lançamento. É uma segunda leitura
                  para ajudar a fiscalização, não uma aprovação automática de pagamento.</p>
              </section>
              <section className="space-y-1">
                <h3 className="font-semibold">2. Que documentos posso anexar?</h3>
                <p>Exemplos: Nota de Empenho, Aviso de Movimento ou Subempenho, solicitação de
                  liquidação, programação de pagamento, ordem bancária ou comprovante de crédito.
                  Utilize o PDF que realmente pertence a este lançamento e que contenha dados
                  financeiros legíveis. Cada PDF é analisado individualmente.</p>
                <p className="text-muted-foreground">A planilha do InvestSUS pertence à Etapa 2
                  do Piso da Enfermagem, não a esta ferramenta.</p>
              </section>
              <section className="space-y-1">
                <h3 className="font-semibold">3. O que a IA confere?</h3>
                <p>Número de empenho, competência, valor solicitado, valor atestado,
                  valor liquidado, dotação, fonte de recursos e data de pagamento quando
                  identificáveis no documento. A comparação indica o valor no PDF,
                  o valor no sistema, a gravidade sugerida e a página/trecho de referência.</p>
                <p className="text-muted-foreground">Não encontrar divergência não significa
                  que o processo está correto: campos ausentes ou ilegíveis podem não ser comparados.</p>
              </section>
              <section className="space-y-1">
                <h3 className="font-semibold">4. Como usar?</h3>
                <p>Primeiro clique em <b>Anexar PDF</b>: o original é guardado de forma privada,
                  sem iniciar a IA. Depois clique em <b>Analisar com IA</b> e confirme o envio ao
                  modelo. Confira os achados com o documento e com o SEI. Por fim,
                  registre sua conclusão no campo de revisão do auditor.</p>
              </section>
              <section className="space-y-1">
                <h3 className="font-semibold">5. Tem custo? Quanto?</h3>
                <p><b>O anexo e a consulta ao parecer não acionam o modelo.</b> Cada clique
                  confirmado em <b>Analisar com IA</b> faz uma solicitação que pode consumir
                  créditos do workspace. O valor não é fixo por PDF: depende do modelo,
                  do tamanho do documento e dos tokens processados. Créditos incluídos no plano
                  podem cobrir parte ou todo o uso, conforme o saldo disponível.</p>
                <p>Consulte o consumo real em Lovable → Cloud → AI, ou em
                  Workspace settings → Plans &amp; credit usage → Usage details.</p>
                <a href="https://docs.lovable.dev/features/ai#usage-and-pricing"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline">
                  Consultar documentação oficial de custos
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </section>
              <section className="space-y-1">
                <h3 className="font-semibold">6. Segurança e responsabilidade</h3>
                <p>O PDF é transmitido ao AI Gateway somente ao iniciar a análise.
                  Não envie documentos com dados pessoais de pacientes ou outras informações
                  desnecessárias; observe as regras institucionais de confidencialidade.
                  A IA não modifica valores, assinatura, empenho ou pagamento.</p>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Anexe um PDF financeiro deste lançamento para conferir divergências de valores,
        empenho, competência e dotação. O upload não inicia a análise. A utilização da IA
        consome créditos e depende de confirmação. O parecer exige revisão humana.
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
            onClick={() => setConfirmarDocumentoId(doc.id)}>
            {analisando === doc.id ? "Analisando…" :
              doc.status === "erro" ? "Tentar novamente" : "Analisar com IA"}
          </Button>
        )}
      </div>)}
    </CardContent>
    <AlertDialog open={!!confirmarDocumentoId}
      onOpenChange={aberto => { if (!aberto) setConfirmarDocumentoId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Analisar este PDF com IA?</AlertDialogTitle>
          <AlertDialogDescription>
            O arquivo será encaminhado ao Lovable AI Gateway. Esta solicitação pode consumir
            créditos do workspace, com custo variável segundo o modelo e o documento.
            O resultado é apenas uma sugestão de auditoria e não modifica o processo.
            Confirme que o envio respeita as regras de confidencialidade da instituição.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            const id = confirmarDocumentoId;
            setConfirmarDocumentoId(null);
            if (id) void analisar(id);
          }}>Confirmar análise com IA</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
