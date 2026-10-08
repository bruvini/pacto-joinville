import { CheckCircle2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  SLOTS_SOLICITACAO_EMPENHO_PVH,
} from "@/lib/pvh/empenhos";

export function AssinaturasSolicitacaoEmpenhoPvh({
  empenhoId,
  assinaturas,
  pool,
  podeEditar,
  onChange,
}: {
  empenhoId: string;
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const ativas = assinaturas.filter(
    (assinatura) =>
      assinatura.empenho_id === empenhoId &&
      !assinatura.revogado_em,
  );
  const completo = assinaturasSolicitacaoEmpenhoCompletasPvh(ativas);

  const registrar = useMutation({
    mutationFn: async ({
      slot,
      pessoa,
    }: {
      slot: (typeof SLOTS_SOLICITACAO_EMPENHO_PVH)[number];
      pessoa: any;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase
        .from("pvh_empenho_solicitacao_assinaturas")
        .insert({
          empenho_id: empenhoId,
          slot: slot.key,
          servidor_nome: pessoa.nome_servidor,
          cargo: pessoa.cargo,
          codigo_sei: pessoa.codigo_sei ?? null,
          assinado_por: auth.user?.id ?? null,
          assinado_por_nome: profile?.nome ?? auth.user?.email ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      onChange();
      toast.success("Assinatura registrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const revogar = useMutation({
    mutationFn: async (assinatura: any) => {
      const motivo = prompt(
        `Motivo para retirar a assinatura de ${assinatura.servidor_nome}:`,
      );
      if (!motivo?.trim()) return;

      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase
        .from("pvh_empenho_solicitacao_assinaturas")
        .update({
          revogado_em: new Date().toISOString(),
          revogado_por: auth.user?.id ?? null,
          revogado_por_nome: profile?.nome ?? auth.user?.email ?? null,
          motivo_revogacao: motivo.trim(),
        })
        .eq("id", assinatura.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChange();
      toast.success(
        "Assinatura retirada. Se a solicitação já havia sido enviada, a confirmação será reaberta.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  const usados = new Set(ativas.map((assinatura) => assinatura.servidor_nome));

  return (
    <div className={`rounded-lg border p-3 ${completo ? "border-success/40 bg-success/5" : "bg-muted/10"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assinaturas da Solicitação de NE
        </span>
        {completo ? (
          <Badge className="bg-success text-success-foreground">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            5/5
          </Badge>
        ) : (
          <Badge variant="outline">
            {ativas.length}/5
          </Badge>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {SLOTS_SOLICITACAO_EMPENHO_PVH.map((slot) => {
          const assinatura = ativas.find((item) => item.slot === slot.key);
          const elegiveis = pool.filter(
            (pessoa) =>
              pessoa.ativo !== false &&
              slot.cargos.includes(pessoa.cargo) &&
              !usados.has(pessoa.nome_servidor),
          );

          return (
            <div key={slot.key} className="rounded-md border bg-background p-2">
              <div className="min-h-8 text-[11px] font-medium leading-tight">
                {slot.label}
              </div>

              {assinatura ? (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-muted/30 px-2 py-1.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">
                      {assinatura.servidor_nome}
                    </div>
                    <div className="truncate text-[9px] text-muted-foreground">
                      {assinatura.cargo}
                    </div>
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => revogar.mutate(assinatura)}
                      title="Retirar assinatura"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : podeEditar ? (
                elegiveis.length ? (
                  <Select
                    value=""
                    onValueChange={(id) => {
                      const pessoa = elegiveis.find((item) => item.id === id);
                      if (pessoa) registrar.mutate({ slot, pessoa });
                    }}
                  >
                    <SelectTrigger className="mt-1.5 h-8 text-[10px]">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {elegiveis.map((pessoa) => (
                        <SelectItem key={pessoa.id} value={pessoa.id}>
                          {pessoa.nome_servidor}
                          <span className="text-muted-foreground">
                            {" · "}{pessoa.cargo}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1.5 text-[9px] leading-tight text-muted-foreground">
                    Sem signatário elegível cadastrado.
                  </p>
                )
              ) : (
                <p className="mt-1.5 text-[9px] text-muted-foreground">Pendente</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
