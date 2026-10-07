import { CheckCircle2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasDocumentoCompletasPvh,
  type SlotAssinaturaPvh,
} from "@/lib/pvh/etapa2";

export function AssinaturasDocumentoPvh({
  documentoId,
  assinaturas,
  slots,
  pool,
  podeEditar,
  onChange,
}: {
  documentoId: string;
  assinaturas: any[];
  slots: SlotAssinaturaPvh[];
  pool: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const ativas = assinaturas.filter(
    (assinatura) => assinatura.documento_id === documentoId && !assinatura.revogado_em,
  );
  const completo = assinaturasDocumentoCompletasPvh(documentoId, assinaturas, slots);

  const registrar = useMutation({
    mutationFn: async ({
      slot,
      pessoa,
    }: {
      slot: SlotAssinaturaPvh;
      pessoa: any;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase.from("pvh_documento_assinaturas").insert({
        documento_id: documentoId,
        slot: slot.key,
        papel_funcao: slot.label,
        cargo: pessoa.cargo,
        codigo_sei: pessoa.codigo_sei ?? null,
        assinante_nome: pessoa.nome_servidor,
        registrado_por: auth.user?.id ?? null,
        registrado_por_nome: profile?.nome ?? auth.user?.email ?? null,
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
        `Motivo para remover a assinatura de ${assinatura.assinante_nome} deste documento:`,
      );
      if (!motivo?.trim()) return;

      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();

      const { error } = await supabase
        .from("pvh_documento_assinaturas")
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
      toast.success("Assinatura retirada; o registro histórico foi preservado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const usados = new Set(ativas.map((assinatura) => assinatura.assinante_nome));

  return (
    <div className={`rounded-lg border p-3 ${completo ? "border-success/40 bg-success/5" : "bg-muted/15"}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assinaturas
        </span>
        {completo ? (
          <Badge className="bg-success text-success-foreground">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completo
          </Badge>
        ) : (
          <Badge variant="outline">Pendente</Badge>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {slots.map((slot) => {
          const registradas = ativas.filter((assinatura) => assinatura.slot === slot.key);
          const preenchido = registradas.length > 0;
          const elegiveis = pool.filter(
            (pessoa) =>
              pessoa.ativo !== false &&
              slot.cargos.includes(pessoa.cargo) &&
              !usados.has(pessoa.nome_servidor),
          );

          return (
            <div key={slot.key} className="rounded-md border bg-background p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{slot.label}</span>
                {slot.opcional ? (
                  <Badge variant="outline" className="text-[9px]">
                    Opcional
                  </Badge>
                ) : preenchido ? (
                  <Badge className="bg-success text-success-foreground text-[9px]">OK</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]">Obrigatório</Badge>
                )}
              </div>

              {registradas.map((assinatura) => (
                <div
                  key={assinatura.id}
                  className="mt-2 flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{assinatura.assinante_nome}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {assinatura.cargo || assinatura.papel_funcao}
                    </div>
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => revogar.mutate(assinatura)}
                      title="Retirar esta assinatura"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {podeEditar && !preenchido && (
                <div className="mt-2">
                  {elegiveis.length ? (
                    <Select
                      value=""
                      onValueChange={(id) => {
                        const pessoa = elegiveis.find((item) => item.id === id);
                        if (pessoa) registrar.mutate({ slot, pessoa });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar signatário" />
                      </SelectTrigger>
                      <SelectContent>
                        {elegiveis.map((pessoa) => (
                          <SelectItem key={pessoa.id} value={pessoa.id}>
                            {pessoa.nome_servidor}
                            <span className="text-muted-foreground"> · {pessoa.cargo}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Nenhum signatário elegível em Configurações → Signatários.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
