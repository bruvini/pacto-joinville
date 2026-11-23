import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DocumentoCard, MatrizAssinaturasDocumentoPiso } from "@/components/piso/DocumentoCard";
import { acharDoc, type CtxPiso } from "@/lib/piso/regras";
import {
  assinaturasAnulacaoCompletas, DESTINO_ANULACAO_PISO,
  envioAnulacaoConfirmado, matrizAnulacaoConfigurada,
} from "@/lib/piso/anulacao-envio";

/** Solicitação: signatários -> confirmação auditada de envio -> evidências SEI. */
export function SolicitacaoAnulacaoPiso({
  ctx, obrigacaoId, pool, canEdit, onChange,
}: {
  ctx: CtxPiso; obrigacaoId: string; pool: any[]; canEdit: boolean; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const documento = acharDoc(ctx.docs, "solicitacao_anulacao", { obrigacao_id: obrigacaoId });
  const configurada = matrizAnulacaoConfigurada(ctx);
  const assinadas = assinaturasAnulacaoCompletas(ctx, documento?.id);
  const confirmado = envioAnulacaoConfirmado(ctx, documento?.id);

  const iniciar = async () => {
    if (!canEdit || busy || documento) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("piso_documentos").insert({
        competencia_id: ctx.comp.id, obrigacao_id: obrigacaoId,
        tipo: "solicitacao_anulacao",
      });
      if (error) throw error;
      toast.success("Solicitação iniciada. Registre os quatro signatários.");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a solicitação.");
    } finally { setBusy(false); }
  };

  const registrarEnvio = async (marcado: boolean) => {
    if (!canEdit || busy || !documento?.id || !assinadas) return;
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Faça login novamente.");
      const { data: perfil } = await supabase.from("profiles")
        .select("nome").eq("id", auth.user.id).maybeSingle();
      const { error } = await supabase.from("piso_encaminhamentos").insert({
        documento_id: documento.id,
        acao: marcado ? "encaminhado" : "revertido",
        destino: DESTINO_ANULACAO_PISO,
        motivo: marcado
          ? "Confirmado envio da solicitação de anulação no SEI após registro dos quatro signatários."
          : "Confirmação de envio da solicitação de anulação desfeita.",
        usuario_id: auth.user.id,
        usuario_nome: perfil?.nome ?? auth.user.email ?? "Usuário",
      });
      if (error) throw error;
      toast.success(marcado ? "Envio à SEFAZ.UCG.AEO confirmado e auditado." : "Confirmação desfeita e registrada no histórico.");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar a confirmação.");
    } finally { setBusy(false); }
  };

  return <div className="space-y-3">
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">1. Matriz de assinaturas</strong>
        {assinadas && <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5"/> Completa</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Mesmos quatro signatários dos convênios: Fiscal, Gerente / Coordenador ACP,
        Diretor de Serviços Complementares e Diretoria Financeira / Secretária de Saúde.
      </p>
      {!configurada && <p className="text-xs text-destructive" role="alert">
        A matriz institucional da anulação ainda não está atualizada no banco.
        Aplique a migração SQL desta alteração antes de registrar as assinaturas.
      </p>}
      {!documento ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void iniciar()}
          disabled={!canEdit || busy || !configurada}>
          <ClipboardCheck className="mr-2 h-4 w-4" /> Iniciar solicitação e registrar assinaturas
        </Button>
      ) : <MatrizAssinaturasDocumentoPiso
        ctx={ctx} tipo="solicitacao_anulacao" obrigacaoId={obrigacaoId}
        pool={pool} canEdit={canEdit && !busy && configurada} onChange={onChange} />}
    </div>

    {assinadas ? (
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
        <strong className="text-sm">2. Confirmação de envio à {DESTINO_ANULACAO_PISO}</strong>
        <div className="flex items-start gap-2 rounded border bg-background p-3">
          <Checkbox id={`envio-anulacao-${obrigacaoId}`} checked={confirmado}
            disabled={!canEdit || busy}
            onCheckedChange={v => void registrarEnvio(v === true)} className="mt-0.5"/>
          <label htmlFor={`envio-anulacao-${obrigacaoId}`} className="text-sm cursor-pointer">
            Confirmo que a Solicitação de Anulação foi encaminhada pelo SEI à
            <strong> {DESTINO_ANULACAO_PISO}</strong>.
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          <Send className="inline h-3.5 w-3.5 mr-1"/>
          Esta confirmação registra o envio realizado. O PACTO não encaminha automaticamente no SEI.
        </p>
      </div>
    ) : <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
      2. A confirmação de envio à {DESTINO_ANULACAO_PISO} será liberada após as quatro assinaturas.
    </p>}

    {confirmado ? <div className="space-y-2">
      <strong className="text-sm">3. Número, link e data do documento SEI</strong>
      <DocumentoCard ctx={ctx} competenciaId={ctx.comp.id} tipo="solicitacao_anulacao"
        obrigacaoId={obrigacaoId} pool={pool} canEdit={canEdit}
        assinaturasSeparadas onChange={onChange}/>
    </div> : <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
      3. Após confirmar o envio, informe o número, link e data SEI da solicitação.
      Dados já cadastrados permanecem preservados.
    </p>}
  </div>;
}
