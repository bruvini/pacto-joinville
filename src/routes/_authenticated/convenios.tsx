import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SaldoBar } from "@/components/SaldoBar";
import { HelpTip } from "@/components/HelpTip";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Plus, FileStack, Layers, Trash2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/convenios")({
  head: () => ({ meta: [{ title: "Convênios" }] }),
  component: ConveniosPage,
});

function ConveniosPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp");
  const isAdmin = roles.includes("admin");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ prestador_id: "", numero_processo_sei_mae: "", objeto: "", total_parcelas: "", dia_inicio_execucao: "", dia_fim_execucao: "" });
  const [taPara, setTaPara] = useState<any | null>(null); // convênio cujos TAs estão sendo gerenciados

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: tas = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });
  const { data: empenhos = [] } = useQuery({
    queryKey: ["empenhos-saldo"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("convenio_id, termo_aditivo_id, valor_solicitado")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("convenios").insert({
        prestador_id: form.prestador_id,
        numero_processo_sei_mae: form.numero_processo_sei_mae || null,
        objeto: form.objeto || null,
        total_parcelas: form.total_parcelas ? Number(form.total_parcelas) : null,
        dia_inicio_execucao: form.dia_inicio_execucao ? Number(form.dia_inicio_execucao) : null,
        dia_fim_execucao: form.dia_fim_execucao ? Number(form.dia_fim_execucao) : null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["convenios"] }); setOpen(false); setForm({ prestador_id: "", numero_processo_sei_mae: "", objeto: "", total_parcelas: "", dia_inicio_execucao: "", dia_fim_execucao: "" }); toast.success("Convênio criado"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><FileText className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Convênios</h1>
            <p className="text-sm text-muted-foreground">{convenios.length} convênio(s) · teto e termos aditivos com auditoria de saldo</p>
          </div>
        </div>
        {canCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo convênio</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo convênio</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Prestador</Label>
                  <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="flex items-center gap-1">Nº Processo SEI Mãe <HelpTip text="Número do processo SEI principal do convênio/parceria (ex.: 22.0.085127-2)." /></Label><Input value={form.numero_processo_sei_mae} onChange={(e) => setForm({ ...form, numero_processo_sei_mae: e.target.value })} /></div>
                <div><Label className="flex items-center gap-1">Objeto <HelpTip text="Descrição do objeto do convênio (ex.: POA, Termo de Colaboração, cirurgias eletivas)." /></Label><Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} /></div>
                <div><Label className="flex items-center gap-1">Nº de parcelas (meses de vigência) <HelpTip text="Quantas parcelas/meses o convênio tem. Define a lista de parcelas no lançamento e o % concluído do convênio." /></Label><Input inputMode="numeric" placeholder="ex.: 12" value={form.total_parcelas} onChange={(e) => setForm({ ...form, total_parcelas: e.target.value.replace(/\D/g, "") })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="flex items-center gap-1">Dia início execução <HelpTip text="Dia do mês em que a execução do processo começa." /></Label><Input inputMode="numeric" placeholder="1-31" value={form.dia_inicio_execucao} onChange={(e) => setForm({ ...form, dia_inicio_execucao: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                  <div><Label className="flex items-center gap-1">Dia fim execução <HelpTip text="Dia do mês limite de execução do processo." /></Label><Input inputMode="numeric" placeholder="1-31" value={form.dia_fim_execucao} onChange={(e) => setForm({ ...form, dia_fim_execucao: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.prestador_id}>Cadastrar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {convenios.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum convênio cadastrado ainda.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(convenios as any[]).map((c) => {
          const parcelas = Number(c.total_parcelas ?? 0);
          const nTas = (tas as any[]).filter((t) => t.convenio_id === c.id).length;
          return (
            <Card key={c.id} className="overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-primary to-acp" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-primary">{c.prestadores?.nome_instituicao ?? "—"}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">SEI mãe: {c.numero_processo_sei_mae ?? "—"}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{c.status_convenio}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.objeto && <p className="text-sm text-muted-foreground line-clamp-2">{c.objeto}</p>}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{parcelas ? `${parcelas} parcelas` : "parcelas não informadas"}</Badge>
                  {(c.dia_inicio_execucao || c.dia_fim_execucao) && <Badge variant="secondary">execução dia {c.dia_inicio_execucao ?? "?"}–{c.dia_fim_execucao ?? "?"}</Badge>}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />{nTas} termo(s) aditivo(s)</span>
                  <Button variant="outline" size="sm" onClick={() => setTaPara(c)}><FileStack className="h-4 w-4 mr-1.5" />Termos aditivos</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {taPara && (
        <TermosAditivosDialog
          convenio={taPara}
          tas={(tas as any[]).filter((t) => t.convenio_id === taPara.id)}
          empenhos={empenhos as any[]}
          canEdit={canCriar}
          isAdmin={isAdmin}
          onClose={() => setTaPara(null)}
        />
      )}
    </div>
  );
}

function TermosAditivosDialog({ convenio, tas, empenhos, canEdit, isAdmin, onClose }: any) {
  const qc = useQueryClient();
  const parcelas = Number(convenio.total_parcelas ?? 0);
  const [ta, setTa] = useState({ identificador: "", valor_total: 0, objeto: "", numero_sei: "", link_extrato_sei: "", data_assinatura: "" });

  const usadoPorTa = (taId: string) => empenhos.filter((e: any) => e.termo_aditivo_id === taId).reduce((s: number, e: any) => s + Number(e.valor_solicitado ?? 0), 0);
  const tetoTotalTa = (mensal: number) => mensal * (parcelas || 1);

  const addTa = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("termos_aditivos").insert({
        convenio_id: convenio.id,
        identificador: ta.identificador,
        valor_total: ta.valor_total || null,
        objeto: ta.objeto || null,
        numero_sei: ta.numero_sei || null,
        link_extrato_sei: ta.link_extrato_sei || null,
        data_assinatura: ta.data_assinatura || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["termos_aditivos"] }); setTa({ identificador: "", valor_total: 0, objeto: "", numero_sei: "", link_extrato_sei: "", data_assinatura: "" }); toast.success("Termo aditivo adicionado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delTa = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("termos_aditivos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["termos_aditivos"] }); toast.success("Termo aditivo removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Termos aditivos · {convenio.prestadores?.nome_instituicao}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {tas.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum termo aditivo cadastrado.</p>}
          {tas.map((t: any) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{t.identificador}</div>
                  <div className="text-xs text-muted-foreground">SEI {t.numero_sei ?? "—"}{t.data_assinatura ? ` · assinado em ${new Date(t.data_assinatura).toLocaleDateString("pt-BR")}` : ""} · teto mensal {Number(t.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  {t.objeto && <div className="text-xs text-muted-foreground mt-0.5">{t.objeto}</div>}
                </div>
                {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delTa.mutate(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
              <div className="mt-2"><SaldoBar usado={usadoPorTa(t.id)} teto={tetoTotalTa(Number(t.valor_total ?? 0))} /></div>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Adicionar termo aditivo</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs flex items-center gap-1">Identificador <HelpTip text="Nome do termo aditivo, ex.: '4º Termo Aditivo'." /></Label><Input placeholder="4º Termo Aditivo" value={ta.identificador} onChange={(e) => setTa({ ...ta, identificador: e.target.value })} /></div>
              <div><Label className="text-xs flex items-center gap-1">Teto MENSAL do aditivo <HelpTip text="Valor máximo por mês/parcela. O total do aditivo = teto mensal × nº de parcelas do convênio." /></Label><CurrencyInput value={ta.valor_total} onChange={(n) => setTa({ ...ta, valor_total: n })} /></div>
              <div className="col-span-2"><Label className="text-xs flex items-center gap-1">Objeto do termo aditivo <HelpTip text="Descrição do que o termo aditivo altera/inclui." /></Label><Input value={ta.objeto} onChange={(e) => setTa({ ...ta, objeto: e.target.value })} /></div>
              <div><Label className="text-xs flex items-center gap-1">Nº SEI <HelpTip text="Número do documento/processo do termo aditivo no SEI." /></Label><Input value={ta.numero_sei} onChange={(e) => setTa({ ...ta, numero_sei: e.target.value })} /></div>
              <div><Label className="text-xs">Data de assinatura <HelpTip text="A vigência começa a partir da data de assinatura." /></Label><Input type="date" value={ta.data_assinatura} onChange={(e) => setTa({ ...ta, data_assinatura: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs flex items-center gap-1">Link Extrato do Termo Aditivo (SEI) <HelpTip text="Link do extrato de publicação do termo aditivo no SEI." /></Label><Input placeholder="https://sei..." value={ta.link_extrato_sei} onChange={(e) => setTa({ ...ta, link_extrato_sei: e.target.value })} /></div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => addTa.mutate()} disabled={!ta.identificador || addTa.isPending}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
