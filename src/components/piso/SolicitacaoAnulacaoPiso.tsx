import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import { acharDoc, docCompleto, type CtxPiso } from "@/lib/piso/regras";
import {
  assinaturasAnulacaoCompletas, DESTINO_ANULACAO_PISO,
  envioAnulacaoConfirmado, matrizAnulacaoConfigurada,
} from "@/lib/piso/anulacao-envio";

/**
 * O número/link/data SEI são da SOLICITAÇÃO e são informados antes das
 * assinaturas. Após as assinaturas e a confirmação de envio à SEFAZ,
 * a EtapaAnulacaoPiso libera o documento separado de AVISO DE MOVIMENTO.
 */
export function SolicitacaoAnulacaoPiso({
  ctx, obrigacaoId, pool, canEdit, onChange,
}: {
  ctx: CtxPiso; obrigacaoId: string; pool: any[]; canEdit: boolean; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const documento = acharDoc(ctx.docs, "solicitacao_anulacao", { obrigacao_id: obrigacaoId });
  const configurada = matrizAnulacaoConfigurada(ctx);
  const assinadas = assinaturasAnulacaoCompletas(ctx, documento?.id);
  const solicitacaoCompleta = configurada && assinadas && docCompleto(ctx, documento);
  const confirmado = envioAnulacaoConfirmado(ctx, documento?.id);

  const registrarEnvio = async (marcado: boolean) => {
    if (!canEdit || busy || !documento?.id || !solicitacaoCompleta) return;
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
          ? "Confirmado envio da Solicitação de Anulação no SEI após documentação e quatro assinaturas."
          : "Confirmação de envio da Solicitação de Anulação desfeita.",
        usuario_id: auth.user.id,
        usuario_nome: perfil?.nome ?? auth.user.email ?? "Usuário",
      });
      if (error) throw error;
      toast.success(marcado
        ? "Encaminhamento à SEFAZ.UCG.AEO confirmado. O Aviso de Movimento pode ser registrado após o retorno."
        : "Confirmação desfeita e registrada no histórico.");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar a confirmação.");
    } finally { setBusy(false); }
  };

  return <div className="space-y-3">
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Informe primeiro número, link e data SEI da Solicitação de Anulação e registre
        as quatro assinaturas, conforme a matriz de Convênios.
      </p>
      {!configurada && <p className="text-xs text-destructive" role="alert">
        A matriz institucional ainda não foi atualizada no banco. Execute a
        migração da matriz antes de confirmar o encaminhamento.
      </p>}
      <DocumentoCard
        ctx={ctx} competenciaId={ctx.comp.id} tipo="solicitacao_anulacao"
        obrigacaoId={obrigacaoId} pool={pool} canEdit={canEdit}
        onChange={onChange}
      />
    </div>

    {solicitacaoCompleta ? (
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
        <strong className="text-sm">Confirmação de encaminhamento à {DESTINO_ANULACAO_PISO}</strong>
        <div className="flex items-start gap-2 rounded border bg-background p-3">
          <Checkbox id={`envio-anulacao-${obrigacaoId}`} checked={confirmado}
            disabled={!canEdit || busy}
            onCheckedChange={v => void registrarEnvio(v === true)} className="mt-0.5" />
          <label htmlFor={`envio-anulacao-${obrigacaoId}`} className="text-sm cursor-pointer">
            Confirmo que a Solicitação de Anulação foi encaminhada pelo SEI à
            <strong> {DESTINO_ANULACAO_PISO}</strong>.
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          <Send className="inline h-3.5 w-3.5 mr-1" />
          Esta confirmação registra o encaminhamento realizado, não envia documentos automaticamente.
          Após confirmá-la, o bloco seguinte permitirá registrar o Aviso de Movimento de Anulação.
        </p>
      </div>
    ) : <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
      A confirmação de envio à {DESTINO_ANULACAO_PISO} será liberada quando os dados SEI
      da solicitação e as quatro assinaturas estiverem completos.
    </p>}
  </div>;
}
