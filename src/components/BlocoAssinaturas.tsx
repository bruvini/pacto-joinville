import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, X, PenLine, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export type Slot = { key: string; label: string; cargos: string[]; min?: number; manual?: boolean; qualquer?: boolean };

const SLOT_FISCAL: Slot = { key: "fiscal", label: "Fiscal", cargos: ["Fiscal"] };
const SLOT_GERENTE: Slot = { key: "gerente", label: "Gerente / Coordenador ACP", cargos: ["Gerente", "Coordenador ACP", "Coordenador"], qualquer: true };
const SLOT_DIRETOR: Slot = { key: "diretor", label: "Diretor de Serviços Complementares", cargos: ["Diretor de Serviços Complementares"] };
const SLOT_FINANCEIRA: Slot = { key: "financeira", label: "Diretoria Financeira / Secretária de Saúde", cargos: ["Diretoria Financeira", "Secretária de Saúde"], qualquer: true };

export const SLOTS_PADRAO: Slot[] = [SLOT_FISCAL, SLOT_GERENTE, SLOT_DIRETOR, SLOT_FINANCEIRA];
export const SLOTS_LIBERA_ORC: Slot[] = [{ key: "sefaz", label: "Membro da SEFAZ", cargos: [], manual: true }, SLOT_FINANCEIRA];
export const SLOTS_ETAPA1: Slot[] = [
  SLOT_FISCAL,
  { key: "coord_orc", label: "Coordenador de Orçamentos", cargos: ["Coordenador de Orçamentos"] },
  SLOT_GERENTE,
  SLOT_DIRETOR,
  SLOT_FINANCEIRA,
];

const doSlot = (assinaturas: any[], bloco: string, slotKey: string) => assinaturas.filter((a) => a.bloco === bloco && a.slot === slotKey);

export function blocoCompleto(assinaturas: any[], bloco: string, slots: Slot[]) {
  return slots.every((s) => doSlot(assinaturas, bloco, s.key).length >= (s.min ?? 1));
}

export function BlocoAssinaturas({
  lancamentoId, bloco, slots, pool, assinaturas, canEdit, onChange,
}: {
  lancamentoId: string; bloco: string; slots: Slot[]; pool: any[]; assinaturas: any[]; canEdit: boolean; onChange: () => void;
}) {
  const [manual, setManual] = useState<Record<string, string>>({});
  const completoTudo = blocoCompleto(assinaturas, bloco, slots);

  const assinar = useMutation({
    mutationFn: async ({ slot, nome, cargo }: { slot: Slot; nome: string; cargo: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("assinaturas_etapa").insert({
        lancamento_id: lancamentoId, bloco, slot: slot.key, servidor_nome: nome, cargo, assinado_por: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (e: any) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("assinaturas_etapa").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => onChange(),
    onError: (e: any) => toast.error(e.message),
  });

  const usados = new Set(assinaturas.filter((a) => a.bloco === bloco).map((a) => a.servidor_nome));

  const linhaAssinada = (a: any) => (
    <li key={a.id} className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      <span className="flex-1">{a.servidor_nome} <span className="text-xs text-muted-foreground">· {a.cargo}</span></span>
      {canEdit && <button onClick={() => remover.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>}
    </li>
  );

  const picker = (slot: Slot, cargo: string, label?: string) => {
    const eleg = pool.filter((p) => p.ativo !== false && p.cargo === cargo && !usados.has(p.nome_servidor));
    if (!canEdit) return null;
    if (eleg.length === 0) return <p className="text-[11px] text-muted-foreground">Cadastre {label ?? cargo} em Configurações → Signatários.</p>;
    return (
      <Select value="" onValueChange={(nome) => assinar.mutate({ slot, nome, cargo })}>
        <SelectTrigger className="h-8 text-xs">{label ? <span className="text-muted-foreground">{label}: selecionar</span> : <SelectValue placeholder="Selecionar signatário" />}</SelectTrigger>
        <SelectContent>{eleg.map((p) => <SelectItem key={p.id} value={p.nome_servidor}>{p.nome_servidor}</SelectItem>)}</SelectContent>
      </Select>
    );
  };

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${completoTudo ? "border-success/40 bg-success/5" : "bg-muted/20"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <PenLine className="h-3.5 w-3.5" />Assinaturas
        {completoTudo ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Completo</Badge> : <Badge variant="outline" className="text-muted-foreground">Obrigatório</Badge>}
      </div>
      {slots.map((slot) => {
        const assinadas = doSlot(assinaturas, bloco, slot.key);
        const min = slot.min ?? 1;
        const completo = assinadas.length >= min;
        return (
          <div key={slot.key} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-1">{slot.label} {min > 1 && <span className="text-muted-foreground font-normal">({assinadas.length}/{min})</span>}</span>
              {completo ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge> : <span className="text-[11px] text-warning-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" />pendente</span>}
            </div>
            <ul className="mt-1 space-y-1">{assinadas.map(linhaAssinada)}</ul>
            {/* Entradas para assinar */}
            {slot.manual ? (
              canEdit && assinadas.length < min && (
                <Input className="h-8 text-xs mt-1.5" placeholder="Nome do membro da SEFAZ (Enter para registrar)"
                  value={manual[slot.key] ?? ""} onChange={(e) => setManual({ ...manual, [slot.key]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && manual[slot.key]?.trim()) { assinar.mutate({ slot, nome: manual[slot.key].trim(), cargo: "SEFAZ" }); setManual({ ...manual, [slot.key]: "" }); } }} />
              )
            ) : slot.qualquer ? (
              // Slot "OU": um campo por cargo; basta um preenchido.
              <div className="mt-1.5 space-y-1.5">
                {slot.cargos.filter((c) => c !== "Coordenador").map((cargo) => <div key={cargo}>{picker(slot, cargo, cargo)}</div>)}
                {!completo && <p className="text-[11px] text-muted-foreground">Basta a assinatura de um deles.</p>}
              </div>
            ) : (
              canEdit && assinadas.length < min && <div className="mt-1.5">{picker(slot, slot.cargos[0])}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
