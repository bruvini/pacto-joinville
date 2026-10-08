import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  resumoAssinaturasSolicitacaoEmpenhoPvh,
  SLOTS_SOLICITACAO_EMPENHO_PVH,
  type SlotSolicitacaoEmpenhoPvh,
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
  const [manual, setManual] = useState<Record<string, string>>({});

  const ativas = assinaturas.filter(
    (assinatura) =>
      assinatura.empenho_id === empenhoId &&
      !assinatura.revogado_em,
  );
  const completo = assinaturasSolicitacaoEmpenhoCompletasPvh(ativas);
  const resumo = resumoAssinaturasSolicitacaoEmpenhoPvh(ativas);

  const registrar = useMutation({
    mutationFn: async ({
      slot,
      nome,
      cargo,
      codigoSei,
    }: {
      slot: SlotSolicitacaoEmpenhoPvh;
      nome: string;
      cargo: string;
      codigoSei?: string | null;
    }) => {
      const nomeLimpo = nome.trim();
      if (!nomeLimpo) throw new Error("Informe o nome do signatário.");

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
          servidor_nome: nomeLimpo,
          cargo,
          codigo_sei: codigoSei ?? null,
          assinado_por: auth.user?.id ?? null,
          assinado_por_nome: profile?.nome ?? auth.user?.email ?? null,
        });

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      setManual((atual) => ({ ...atual, [vars.slot.key]: "" }));
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
    onSuccess: (_data, assinatura) => {
      onChange();
      const slot = SLOTS_SOLICITACAO_EMPENHO_PVH.find(
        (item) => item.key === assinatura.slot,
      );
      toast.success(
        slot?.obrigatoria
          ? "Assinatura obrigatória retirada. Se o envio à SEFAZ já havia sido confirmado, ele será reaberto."
          : "Assinatura opcional retirada. O encaminhamento à SEFAZ permanece válido.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  const usados = new Set(
    ativas.map((assinatura) => assinatura.servidor_nome),
  );

  const registrarManual = (
    slot: SlotSolicitacaoEmpenhoPvh,
    valor: string,
  ) => {
    const nome = valor.trim();
    if (!nome || registrar.isPending) return;

    if (usados.has(nome)) {
      toast.error("Este nome já foi registrado nesta Solicitação de NE.");
      return;
    }

    registrar.mutate({
      slot,
      nome,
      cargo:
        slot.cargoManual ??
        "Membro da Comissão de Gestão e Controle de Despesa",
      codigoSei: null,
    });
  };

  return (
    <div
      className={
        `rounded-lg border p-3 ${completo
          ? "border-success/40 bg-success/5"
          : "bg-muted/10"}`
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assinaturas da Solicitação de NE
        </span>
        {completo ? (
          <Badge className="bg-success text-success-foreground">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {resumo.obrigatoriasRegistradas}/{resumo.obrigatoriasTotal} obrigatórias
          </Badge>
        ) : (
          <Badge variant="outline">
            {resumo.obrigatoriasRegistradas}/{resumo.obrigatoriasTotal} obrigatórias
          </Badge>
        )}
        <Badge variant="secondary">
          {resumo.opcionaisRegistradas}/{resumo.opcionaisTotal} opcionais
        </Badge>
      </div>

      <div className="space-y-2">
        {SLOTS_SOLICITACAO_EMPENHO_PVH.map((slot) => {
          const assinatura = ativas.find(
            (item) => item.slot === slot.key,
          );
          const elegiveis = pool.filter(
            (pessoa) =>
              pessoa.ativo !== false &&
              slot.cargos.includes(pessoa.cargo) &&
              !usados.has(pessoa.nome_servidor),
          );

          return (
            <div
              key={slot.key}
              className="grid gap-2 rounded-md border bg-background p-2.5 md:grid-cols-[minmax(220px,.8fr)_minmax(280px,1.2fr)] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-xs font-medium">{slot.label}</div>
                  <Badge
                    variant={slot.obrigatoria ? "default" : "outline"}
                    className="h-5 px-1.5 text-[9px]"
                  >
                    {slot.obrigatoria ? "Obrigatória" : "Opcional"}
                  </Badge>
                </div>
                {slot.manual && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Digite o nome exatamente como consta na assinatura do documento.
                  </p>
                )}
              </div>

              {assinatura ? (
                <div className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">
                      {assinatura.servidor_nome}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
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
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : !podeEditar ? (
                <p className="text-xs text-muted-foreground">
                  {slot.obrigatoria ? "Pendente" : "Opcional · não registrada"}
                </p>
              ) : slot.manual ? (
                <Input
                  className="h-8 text-xs"
                  value={manual[slot.key] ?? ""}
                  placeholder="Nome do membro da Comissão"
                  onChange={(e) =>
                    setManual({
                      ...manual,
                      [slot.key]: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      registrarManual(
                        slot,
                        manual[slot.key] ?? "",
                      );
                    }
                  }}
                  onBlur={() =>
                    registrarManual(
                      slot,
                      manual[slot.key] ?? "",
                    )
                  }
                />
              ) : elegiveis.length ? (
                <Select
                  value=""
                  onValueChange={(id) => {
                    const pessoa = elegiveis.find(
                      (item) => item.id === id,
                    );
                    if (!pessoa) return;

                    registrar.mutate({
                      slot,
                      nome: pessoa.nome_servidor,
                      cargo: pessoa.cargo,
                      codigoSei: pessoa.codigo_sei ?? null,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar signatário" />
                  </SelectTrigger>
                  <SelectContent>
                    {elegiveis.map((pessoa) => (
                      <SelectItem key={pessoa.id} value={pessoa.id}>
                        {pessoa.nome_servidor}
                        <span className="text-muted-foreground">
                          {" · "}
                          {pessoa.cargo}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Sem signatário elegível cadastrado em Configurações → Signatários.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
