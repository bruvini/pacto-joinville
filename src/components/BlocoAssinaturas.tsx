import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, X, PenLine, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { registrarAcesso } from "@/lib/acesso";

export type Slot = {
  key: string;
  label: string;
  cargos: string[];
  min?: number;
  manual?: boolean;
  cargoManual?: string;
  qualquer?: boolean;
  opcional?: boolean;
};

const SLOT_FISCAL: Slot = { key: "fiscal", label: "Fiscal", cargos: ["Fiscal"] };
const SLOT_COORD_ORC: Slot = { key: "coord_orc", label: "Coordenador de Orçamentos", cargos: ["Coordenador de Orçamentos"] };
const SLOT_GERENTE: Slot = { key: "gerente", label: "Gerente / Coordenador ACP", cargos: ["Gerente", "Coordenador ACP", "Coordenador"], qualquer: true };
const SLOT_DIRETOR: Slot = { key: "diretor", label: "Diretor de Serviços Complementares", cargos: ["Diretor de Serviços Complementares"] };
const SLOT_FINANCEIRA: Slot = { key: "financeira", label: "Diretoria Financeira / Secretária de Saúde", cargos: ["Diretoria Financeira", "Secretária de Saúde"], qualquer: true };
// Assinatura de texto livre (onBlur), igual ao "Membro da SEFAZ": registra o nome manualmente.
const SLOT_COMISSAO: Slot = {
  key: "comissao",
  label: "Membro da Comissão de Gestão e Controle de Despesa",
  cargos: [],
  manual: true,
  cargoManual: "Membro da Comissão de Gestão e Controle de Despesa",
};

export const SLOTS_PADRAO: Slot[] = [SLOT_FISCAL, SLOT_GERENTE, SLOT_DIRETOR, SLOT_FINANCEIRA];
export const SLOTS_LIBERA_ORC: Slot[] = [{ key: "sefaz", label: "Membro da SEFAZ", cargos: [], manual: true }, SLOT_FINANCEIRA];
// Ordem obrigatória da Etapa 4: 1º Coordenador de Orçamentos, 2º Fiscal, depois os demais.
export const SLOTS_ETAPA1: Slot[] = [
  SLOT_COORD_ORC,
  SLOT_FISCAL,
  SLOT_GERENTE,
  SLOT_DIRETOR,
  SLOT_FINANCEIRA,
];

// ===== Fluxo 2 (Liquidação Direta) =====
// Etapa 4 — Solicitação: exclusivamente Coordenador de Orçamentos, Fiscal,
// Membro da Comissão (texto livre) e Diretoria Financeira E/OU Secretária de Saúde.
export const SLOTS_ETAPA4_F2: Slot[] = [SLOT_COORD_ORC, SLOT_FISCAL, SLOT_COMISSAO, SLOT_FINANCEIRA];
// Etapa 6 — Liquidação de Despesa (subpassos):
export const SLOTS_F2_MINUTA: Slot[] = [SLOT_GERENTE, SLOT_DIRETOR];       // Gerente ACP + Diretor de Serviços Complementares
export const SLOTS_F2_MEMORANDO: Slot[] = [SLOT_FISCAL, SLOT_GERENTE];     // Fiscal + Gerente/Coordenador ACP
export const SLOTS_F2_LIQUIDACAO: Slot[] = [SLOT_FISCAL, SLOT_COMISSAO];   // Fiscal + Membro da Comissão
export const SLOTS_F2_AVISO: Slot[] = [SLOT_FISCAL, SLOT_COMISSAO];        // Fiscal + Membro da Comissão

const doSlot = (assinaturas: any[], bloco: string, slotKey: string) => assinaturas.filter((a) => a.bloco === bloco && a.slot === slotKey);

const cargoAssinado = (assinadas: any[], cargo: string) => {
  return assinadas.some((a) => {
    if (cargo === "Coordenador ACP") {
      return a.cargo === "Coordenador ACP" || a.cargo === "Coordenador";
    }
    return a.cargo === cargo;
  });
};

export function blocoCompleto(assinaturas: any[], bloco: string, slots: Slot[]) {
  return slots.every((s) => {
    if (s.opcional) return true;
    return doSlot(assinaturas, bloco, s.key).length >= (s.min ?? 1);
  });
}

export function BlocoAssinaturas({
  lancamentoId, documentoId, bloco, slots, pool, assinaturas, canEdit, onChange,
}: {
  /** Persistência: lancamentoId → assinaturas_etapa; documentoId → piso_documento_assinaturas. */
  lancamentoId?: string; documentoId?: string; bloco: string; slots: Slot[]; pool: any[]; assinaturas: any[]; canEdit: boolean; onChange: () => void;
}) {
  const qc = useQueryClient();
  const [manual, setManual] = useState<Record<string, string>>({});

  // Histórico dos slots manuais (SEFAZ e Comissão). O nome fica reaproveitável por slot,
  // inclusive quando foi digitado originalmente no módulo do Piso.
  const { data: historicoManual = [] } = useQuery({
    queryKey: ["assinaturas-historico-manual"],
    queryFn: async () => {
      const [{ data: histLanc }, { data: histPiso }, { data: ov }] = await Promise.all([
        supabase.from("assinaturas_etapa").select("servidor_nome,cargo,slot"),
        supabase.from("piso_documento_assinaturas").select("servidor_nome,cargo,slot"),
        supabase.from("assinaturas_manual_override").select("*"),
      ]);
      const ovMap = new Map<string, any>((ov ?? []).map((o: any) => [o.nome_original, o]));
      const vistos = new Set<string>();
      const itens: Array<{ nome: string; slot: string }> = [];
      [...(histLanc ?? []), ...(histPiso ?? [])].forEach((r: any) => {
        if (!r.servidor_nome || !r.slot) return;
        if (!["sefaz", "comissao"].includes(String(r.slot))) return;
        const original = String(r.servidor_nome).trim();
        const override = ovMap.get(original);
        if (override?.oculto) return;
        const nome = (override?.nome_novo && String(override.nome_novo).trim()) || original;
        const chave = `${r.slot}|${nome}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        itens.push({ nome, slot: String(r.slot) });
      });
      return itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const completoTudo = blocoCompleto(assinaturas, bloco, slots);

  const assinar = useMutation({
    mutationFn: async ({ slot, nome, cargo }: { slot: Slot; nome: string; cargo: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = documentoId
        ? await supabase.from("piso_documento_assinaturas").insert({
            documento_id: documentoId, slot: slot.key, servidor_nome: nome, cargo, assinado_por: u.user?.id,
          })
        : await supabase.from("assinaturas_etapa").insert({
            lancamento_id: lancamentoId!, bloco, slot: slot.key, servidor_nome: nome, cargo, assinado_por: u.user?.id,
          });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      onChange();
      qc.invalidateQueries({ queryKey: ["assinaturas-historico-manual"] });
      void registrarAcesso("assinatura_registrada", { detalhe: `${vars.nome} · ${vars.cargo} (bloco ${bloco})`, rota: documentoId ? `/piso` : `/lancamentos/${lancamentoId}` });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(documentoId ? "piso_documento_assinaturas" : "assinaturas_etapa").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { onChange(); void registrarAcesso("assinatura_removida", { detalhe: `bloco ${bloco}`, rota: documentoId ? `/piso` : `/lancamentos/${lancamentoId}` }); },
    onError: (e: any) => toast.error(e.message),
  });

  const usados = new Set(assinaturas.filter((a) => a.bloco === bloco).map((a) => a.servidor_nome));

  const linhaAssinada = (a: any) => (
    <li key={a.id} className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      <span className="flex-1">
        {a.servidor_nome}
        <span className="text-xs text-muted-foreground"> · {a.cargo}</span>
      </span>
      {canEdit && <button onClick={() => remover.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>}
    </li>
  );

  const picker = (slot: Slot, cargo: string, label?: string, hideAlertIfEmpty = false, mostrarCargo = false) => {
    const eleg = pool.filter((p) => p.ativo !== false && p.cargo === cargo && !usados.has(p.nome_servidor));
    if (!canEdit) return null;
    if (eleg.length === 0) {
      if (hideAlertIfEmpty) return null;
      return <p className="text-[11px] text-muted-foreground">Cadastre {label ?? cargo} em Configurações → Signatários.</p>;
    }
    return (
      <Select value="" onValueChange={(nome) => assinar.mutate({ slot, nome, cargo })}>
        <SelectTrigger className="h-8 text-xs">{label ? <span className="text-muted-foreground">{label}: selecionar</span> : <SelectValue placeholder="Selecionar signatário" />}</SelectTrigger>
        <SelectContent>
          {eleg.map((p) => (
            <SelectItem key={p.id} value={p.nome_servidor}>
              {p.nome_servidor}
              {mostrarCargo && <span className="text-muted-foreground"> · {p.cargo}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const pickerLivre = (slot: Slot, cargos: string[]) => {
    const eleg = pool.filter((p) => p.ativo !== false && cargos.includes(p.cargo) && !usados.has(p.nome_servidor));
    if (!canEdit) return null;
    if (eleg.length === 0) return <p className="text-[11px] text-muted-foreground">Cadastre Fiscais, Gerentes ou Coordenadores ACP em Configurações → Signatários.</p>;
    return (
      <Select value="" onValueChange={(nomeECargo) => {
        const [nome, cargo] = nomeECargo.split("|||");
        assinar.mutate({ slot, nome, cargo });
      }}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar signatário" /></SelectTrigger>
        <SelectContent>
          {eleg.map((p) => (
            <SelectItem key={p.id} value={`${p.nome_servidor}|||${p.cargo}`}>
              {p.nome_servidor}
              <span className="text-muted-foreground"> · {p.cargo}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const registrarManual = (slot: Slot, valor: string) => {
    const v = valor.trim();
    if (!v) return;
    if (usados.has(v)) {
      toast.error("Este nome já foi registrado neste bloco.");
      return;
    }
    assinar.mutate({
      slot,
      nome: v,
      cargo:
        slot.cargoManual ??
        (slot.key === "comissao"
          ? "Membro da Comissão de Gestão e Controle de Despesa"
          : "SEFAZ"),
    });
    setManual((prev) => ({ ...prev, [slot.key]: "" }));
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
        const completo = slot.opcional ? assinadas.length > 0 : assinadas.length >= min;
        const badge = slot.opcional
          ? (assinadas.length > 0
              ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge>
              : <Badge variant="outline" className="text-muted-foreground">Opcional</Badge>)
          : (completo
              ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge>
              : <span className="text-[11px] text-warning-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" />pendente</span>);
        const listaHistId = slot.manual ? `hist-${bloco}-${slot.key}-${documentoId ?? lancamentoId}` : undefined;
        return (
          <div key={slot.key} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-1">
                {slot.label}
                {!slot.opcional && min > 1 && <span className="text-muted-foreground font-normal">({assinadas.length}/{min})</span>}
              </span>
              {badge}
            </div>
            <ul className="mt-1 space-y-1">{assinadas.map(linhaAssinada)}</ul>
            {/* Entradas para assinar — ocultas quando o requisito do slot foi atingido. */}
            {slot.manual ? (
              canEdit && assinadas.length < min && (
                <>
                  <Input
                    className="h-8 text-xs mt-1.5"
                    placeholder="Digite ou selecione um nome já registrado"
                    list={listaHistId}
                    value={manual[slot.key] ?? ""}
                    onChange={(e) => setManual({ ...manual, [slot.key]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        registrarManual(slot, manual[slot.key] ?? "");
                      }
                    }}
                    onBlur={() => registrarManual(slot, manual[slot.key] ?? "")}
                  />
                  {listaHistId && (
                    <datalist id={listaHistId}>
                      {historicoManual
                        .filter((item) => item.slot === slot.key)
                        .map((item) => (
                          <option key={`${item.slot}-${item.nome}`} value={item.nome} />
                        ))}
                    </datalist>
                  )}
                </>
              )
            ) : slot.qualquer ? (
              // Slot "OU": um campo por cargo; basta um preenchido.
              completo ? null : (
                <div className="mt-1.5 space-y-1.5">
                  {slot.cargos
                    .filter((c) => c !== "Coordenador")
                    .map((cargo) => (
                      <div key={cargo}>
                        {picker(slot, cargo, cargo)}
                      </div>
                    ))}
                  <p className="text-[11px] text-muted-foreground">Basta a assinatura de um deles.</p>
                </div>
              )
            ) : slot.opcional ? (
              // Slot opcional livre: um único select com Nome · Cargo.
              canEdit && assinadas.length < Math.max(1, min) ? (
                <div className="mt-1.5">{pickerLivre(slot, slot.cargos)}</div>
              ) : null
            ) : (
              canEdit && assinadas.length < min && <div className="mt-1.5">{picker(slot, slot.cargos[0])}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
