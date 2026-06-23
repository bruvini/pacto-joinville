import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, X, PenLine } from "lucide-react";
import { toast } from "sonner";

export type Slot = { key: string; label: string; cargos: string[]; min?: number };

// "Coordenador" (legado) é aceito como Coordenador ACP por compatibilidade.
const SLOT_FISCAL: Slot = { key: "fiscal", label: "Fiscal", cargos: ["Fiscal"] };
const SLOT_GERENTE: Slot = { key: "gerente", label: "Gerente/Coordenador ACP", cargos: ["Gerente", "Coordenador ACP", "Coordenador"] };
const SLOT_DIRETOR: Slot = { key: "diretor", label: "Diretor de Serviços Complementares", cargos: ["Diretor de Serviços Complementares"] };
const SLOT_FINANCEIRA: Slot = { key: "financeira", label: "Diretoria Financeira/Secretária de Saúde", cargos: ["Diretoria Financeira", "Secretária de Saúde"] };

/** Slots padrão (etapas 4 e 5). */
export const SLOTS_PADRAO: Slot[] = [SLOT_FISCAL, SLOT_GERENTE, SLOT_DIRETOR, SLOT_FINANCEIRA];

/** Etapa 1 inclui o Coordenador de Orçamentos (que também faz a revisão). */
export const SLOTS_ETAPA1: Slot[] = [
  SLOT_FISCAL,
  { key: "coord_orc", label: "Coordenador de Orçamentos", cargos: ["Coordenador de Orçamentos"] },
  SLOT_GERENTE,
  SLOT_DIRETOR,
  SLOT_FINANCEIRA,
];

const assinadasDoSlot = (assinaturas: any[], bloco: string, slotKey: string) =>
  assinaturas.filter((a) => a.bloco === bloco && a.slot === slotKey);

/** Um bloco está completo quando todos os slots atingem o mínimo de assinaturas. */
export function blocoCompleto(assinaturas: any[], bloco: string, slots: Slot[]) {
  return slots.every((s) => assinadasDoSlot(assinaturas, bloco, s.key).length >= (s.min ?? 1));
}

export function BlocoAssinaturas({
  lancamentoId, bloco, slots, pool, assinaturas, canEdit, onChange,
}: {
  lancamentoId: string;
  bloco: string;
  slots: Slot[];
  pool: any[];
  assinaturas: any[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});

  const assinar = useMutation({
    mutationFn: async ({ slot, servidor }: { slot: Slot; servidor: any }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("assinaturas_etapa").insert({
        lancamento_id: lancamentoId, bloco, slot: slot.key,
        servidor_nome: servidor.nome_servidor, cargo: servidor.cargo, assinado_por: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { onChange(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("assinaturas_etapa").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => onChange(),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />Assinaturas</div>
      {slots.map((slot) => {
        const assinadas = assinadasDoSlot(assinaturas, bloco, slot.key);
        const min = slot.min ?? 1;
        const completo = assinadas.length >= min;
        const usados = new Set(assinadas.map((a) => a.servidor_nome));
        const elegiveis = pool.filter((p) => p.ativo !== false && slot.cargos.includes(p.cargo) && !usados.has(p.nome_servidor));
        return (
          <div key={slot.key} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{slot.label} {min > 1 && <span className="text-muted-foreground font-normal">({assinadas.length}/{min})</span>}</span>
              {completo && <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge>}
            </div>
            <ul className="mt-1 space-y-1">
              {assinadas.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="flex-1">{a.servidor_nome} <span className="text-xs text-muted-foreground">· {a.cargo}</span></span>
                  {canEdit && <button onClick={() => remover.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>}
                </li>
              ))}
            </ul>
            {canEdit && assinadas.length < min && (
              elegiveis.length > 0 ? (
                <div className="flex gap-1.5 mt-1.5">
                  <Select value={sel[slot.key] ?? ""} onValueChange={(v) => setSel({ ...sel, [slot.key]: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o signatário" /></SelectTrigger>
                    <SelectContent>
                      {elegiveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_servidor} · {p.cargo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" disabled={!sel[slot.key] || assinar.isPending} onClick={() => {
                    const servidor = pool.find((p) => p.id === sel[slot.key]);
                    if (servidor) assinar.mutate({ slot, servidor });
                    setSel({ ...sel, [slot.key]: "" });
                  }}>Assinar</Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">Cadastre signatários com cargo compatível em Configurações → Matriz de Assinaturas.</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
