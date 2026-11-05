import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasObrigatoriasMemorandoColetadas,
  destinoEncaminhamentoMemorando,
  memorandoEncaminhadoParaDestinatarios,
  unidadesDestinatariasMemorando,
} from "@/lib/piso/encaminhamento-memorando";
import type { CtxPiso } from "@/lib/piso/regras";

interface Props {
  ctx: CtxPiso;
  canEdit: boolean;
  onChange: () => void;
}

/** Confirmação de envio ao(s) setor(es) SEI, somente depois da coleta das assinaturas. */
export function ConfirmacaoEncaminhamentoMemorandoPiso({ ctx, canEdit, onChange }: Props) {
  const [salvando, setSalvando] = useState(false);
  const memorando = ctx.docs.find(
    (d) => d.tipo === "memorando" && !d.participante_id && !d.obrigacao_id,
  );
  const assinaturasCompletas = assinaturasObrigatoriasMemorandoColetadas(ctx);
  const setores = unidadesDestinatariasMemorando(ctx.comp.municipal_config?.destinatarios);
  const confirmado = memorandoEncaminhadoParaDestinatarios(ctx);

  // Não antecipar confirmação: este bloco só surge após todas as assinaturas.
  if (!memorando || !assinaturasCompletas) return null;

  const registrar = async (marcado: boolean) => {
    if (!canEdit || salvando) return;
    if (!setores.length) return toast.error("Informe os setores destinatários do Memorando.");
    setSalvando(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user)
        throw authError ?? new Error("Faça login novamente para registrar o encaminhamento.");
      const { data: perfil } = await supabase
        .from("profiles").select("nome").eq("id", auth.user.id).maybeSingle();

      const { error } = await supabase.from("piso_encaminhamentos").insert({
        documento_id: memorando.id,
        acao: marcado ? "encaminhado" : "revertido",
        destino: destinoEncaminhamentoMemorando(setores),
        motivo: marcado
          ? "Encaminhamento do Memorando confirmado na Etapa 3 para os destinatários SEI informados."
          : "Confirmação de encaminhamento do Memorando desmarcada na Etapa 3.",
        usuario_id: auth.user.id,
        usuario_nome: perfil?.nome ?? auth.user.email ?? "Usuário",
      });
      if (error) throw error;
      toast.success(marcado
        ? "Encaminhamento do Memorando confirmado e registrado no histórico."
        : "Confirmação desfeita, com registro no histórico.");
      onChange();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao registrar encaminhamento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div>
        <h4 className="text-sm font-semibold">Confirmação de encaminhamento do Memorando</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Todas as assinaturas obrigatórias foram registradas. Confirme o encaminhamento
          no SEI para os setores destinatários cadastrados acima.
        </p>
      </div>
      {setores.length ? (
        <div className="flex items-start gap-3 rounded-md border bg-background p-3">
          <Checkbox
            id="piso-memorando-encaminhado-sei"
            checked={confirmado}
            disabled={!canEdit || salvando}
            onCheckedChange={(valor) => void registrar(valor === true)}
            className="mt-0.5"
          />
          <label htmlFor="piso-memorando-encaminhado-sei" className="cursor-pointer text-sm leading-relaxed">
            Confirmo que o Memorando foi encaminhado no SEI para{" "}
            <strong>{setores.join(" e ")}</strong>.
          </label>
        </div>
      ) : (
        <p className="text-sm text-destructive">
          Cadastre ao menos um Setor / Unidade SEI como destinatário para confirmar o encaminhamento.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Este registro documenta o envio realizado no SEI; não encaminha o documento automaticamente.
        A confirmação permanece auditável e deve ser refeita se os destinatários ou signatários mudarem.
      </p>
    </div>
  );
}
