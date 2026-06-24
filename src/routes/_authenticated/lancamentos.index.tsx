import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Plus, Download, Filter, Pencil, Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { etapaCorrenteLabel, emAtraso, ETAPA_LABELS } from "@/lib/etapa";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaField } from "@/components/inputs/CompetenciaField";
import { HELP } from "@/lib/field-help";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/lancamentos/")({
  head: () => ({ meta: [{ title: "Lançamentos — Convênios SMS Joinville" }] }),
  component: LancamentosList,
});

function LancamentosList() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp"); // ACP ou admin
  const isAdmin = roles.includes("admin");
  const [filtros, setFiltros] = useState({ prestador: "", competencia: "", status: "all", sei: "" });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ prestador_id: "", convenio_id: "", termo_aditivo_id: "", descricao: "", competencia: "" });
  const abrirNovo = () => { setEditId(null); setForm({ prestador_id: "", convenio_id: "", termo_aditivo_id: "", descricao: "", competencia: "" }); setOpen(true); };
  const abrirEdicao = (l: any) => { setEditId(l.id); setForm({ prestador_id: l.prestador_id ?? "", convenio_id: l.convenio_id ?? "", termo_aditivo_id: l.termo_aditivo_id ?? "", descricao: l.descricao ?? "", competencia: l.competencia ?? "" }); setOpen(true); };

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("id, prestador_id, objeto, dia_inicio_execucao, dia_fim_execucao, data_inicio_vigencia").order("created_at", { ascending: false })).data ?? [],
  });
  const convById = Object.fromEntries((convenios as any[]).map((c) => [c.id, c]));
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("id, convenio_id, identificador").order("data_assinatura", { ascending: false, nullsFirst: false })).data ?? [],
  });
  const conveniosDoPrestador = (convenios as any[]).filter((c) => c.prestador_id === form.prestador_id);
  const tasDoConvenio = (termos as any[]).filter((t) => t.convenio_id === form.convenio_id);

  const { data: lancs = [] } = useQuery({
    queryKey: ["lancs"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento")
      .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => lancs.filter((l: any) => {
    if (filtros.prestador && l.prestador_id !== filtros.prestador) return false;
    if (filtros.competencia && !(l.competencia ?? "").includes(filtros.competencia)) return false;
    if (filtros.status !== "all" && etapaCorrenteLabel(l) !== filtros.status) return false;
    if (filtros.sei && !`${l.link_solicitacao_sei ?? ""} ${l.link_empenho_sei ?? ""} ${l.numero_empenho ?? ""}`.toLowerCase().includes(filtros.sei.toLowerCase())) return false;
    return true;
  }), [lancs, filtros]);

  const novo = useMutation({
    mutationFn: async () => {
      // Competência não pode ser anterior ao início da vigência do convênio.
      const conv = (convenios as any[]).find((c) => c.id === form.convenio_id);
      if (conv?.data_inicio_vigencia && form.competencia) {
        const vig = new Date(conv.data_inicio_vigencia);
        const vy = vig.getFullYear(), vm = vig.getMonth() + 1;
        for (const cstr of form.competencia.split(",").map((s) => s.trim()).filter(Boolean)) {
          const m = cstr.match(/(\d{2})\/(\d{4})/);
          if (m) { const cy = Number(m[2]), cm = Number(m[1]); if (cy < vy || (cy === vy && cm < vm)) throw new Error(`Competência ${cstr} é anterior ao início da vigência do convênio (${String(vm).padStart(2, "0")}/${vy}).`); }
        }
      }
      const dados = {
        prestador_id: form.prestador_id || null,
        convenio_id: form.convenio_id || null,
        termo_aditivo_id: form.termo_aditivo_id || null,
        descricao: form.descricao,
        competencia: form.competencia,
      };
      if (editId) {
        const { error } = await supabase.from("lancamentos_pagamento").update(dados as any).eq("id", editId);
        if (error) throw error;
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("lancamentos_pagamento").insert({ ...dados, created_by: user.user?.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancs"] });
      setOpen(false);
      toast.success(editId ? "Lançamento atualizado" : "Lançamento criado");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("lancamentos_pagamento").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lancs"] }); toast.success("Lançamento excluído"); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportar = () => {
    const rows = filtered.map((l: any) => ({
      "Prestador": l.prestadores?.nome_instituicao ?? "",
      "Processo SEI Mãe": l.convenios?.numero_processo_sei_mae ?? "",
      "Descrição": l.descricao ?? "",
      "Termo Aditivo": l.termo_aditivo ?? "",
      "Parcela": l.parcela ?? "",
      "Competência": l.competencia ?? "",
      "Mês Pgto Previsto": l.mes_pagamento_previsto ?? "",
      "Valor Solicitado": Number(l.valor_solicitado ?? 0),
      "Link Solicitação SEI": l.link_solicitacao_sei ?? "",
      "Nº Empenho": l.numero_empenho ?? "",
      "Link Empenho SEI": l.link_empenho_sei ?? "",
      "Valor Atestado": Number(l.valor_atestado ?? 0),
      "Valor Anulado": Number(l.valor_anulado ?? 0),
      "Link Solic. Anulação": l.link_solicitacao_anulacao ?? "",
      "Link Anulação SEI": l.link_anulacao_sei ?? "",
      "Dotação Orçamentária": l.dotacao_orcamentaria ?? "",
      "Fonte Pagamento": l.fonte_pagamento ?? "",
      "Status ACO": l.status_aco ?? "",
      "Etapa Atual": etapaCorrenteLabel(l),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, `lancamentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Lançamentos de Pagamento</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {lancs.length} processos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar XLSX</Button>
          {canCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Novo lançamento</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Editar lançamento" : "Novo lançamento de pagamento"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Registre a intenção de iniciar um processo de empenho. Os valores são preenchidos depois, nas etapas.</p>
                <div>
                  <Label>Prestador</Label>
                  <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v, convenio_id: "", descricao: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Convênio / Objeto <HelpTip text="Escolha o convênio do prestador. A descrição vem do objeto cadastrado." /></Label>
                  <Select value={form.convenio_id} onValueChange={(v) => { const c = (convenios as any[]).find((x) => x.id === v); setForm({ ...form, convenio_id: v, termo_aditivo_id: "", descricao: c?.objeto ?? "" }); }} disabled={!form.prestador_id}>
                    <SelectTrigger><SelectValue placeholder={form.prestador_id ? "Selecione o convênio" : "Escolha o prestador primeiro"} /></SelectTrigger>
                    <SelectContent>
                      {conveniosDoPrestador.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum convênio para este prestador.</div>}
                      {conveniosDoPrestador.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Termo Aditivo (se houver) <HelpTip text="Opcional. Vincule a um termo aditivo do convênio, se aplicável." /></Label>
                  <Select value={form.termo_aditivo_id || "none"} onValueChange={(v) => setForm({ ...form, termo_aditivo_id: v === "none" ? "" : v })} disabled={!form.convenio_id}>
                    <SelectTrigger><SelectValue placeholder="Sem aditivo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem aditivo</SelectItem>
                      {tasDoConvenio.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.identificador}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="flex items-center gap-1">Competência(s) MM/AAAA <HelpTip text={HELP.competencia} /></Label><CompetenciaField value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} /></div>
              </div>
              <DialogFooter><Button onClick={() => novo.mutate()} disabled={novo.isPending || !form.prestador_id || !form.competencia}>{editId ? "Salvar" : "Criar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
              <Select value={filtros.prestador || "all"} onValueChange={(v) => setFiltros({ ...filtros, prestador: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Competência</Label><Input placeholder="06/2026" value={filtros.competencia} onChange={(e) => setFiltros({ ...filtros, competencia: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Etapa</Label>
              <Select value={filtros.status} onValueChange={(v) => setFiltros({ ...filtros, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ETAPA_LABELS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Nº SEI / Empenho</Label><Input value={filtros.sei} onChange={(e) => setFiltros({ ...filtros, sei: e.target.value })} /></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-2">Prestador</th><th>Descrição</th><th>Comp.</th>
                  <th>Solicitado</th><th>Atestado</th><th>Anulado</th>
                  <th>Etapa</th><th>Responsável</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-2">
                      <Link to="/lancamentos/$id" params={{ id: l.id }} className="hover:underline font-medium text-primary">
                        {l.prestadores?.nome_instituicao ?? "—"}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate">{l.descricao ?? "—"}</td>
                    <td>{l.competencia ?? "—"}</td>
                    <td className="tabular-nums">{brl(Number(l.valor_solicitado))}</td>
                    <td className="tabular-nums">{brl(Number(l.valor_atestado))}</td>
                    <td className="tabular-nums">{brl(Number(l.valor_atestado) > 0 ? Number(l.valor_anulado) : 0)}</td>
                    <td>
                      <Badge variant="outline" className="text-xs">{etapaCorrenteLabel(l)}</Badge>
                      {emAtraso(l, convById[l.convenio_id]) && <Badge variant="destructive" className="text-xs ml-1">Em atraso</Badge>}
                    </td>
                    <td>
                      <Badge className={l.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}>
                        {l.responsavel_atual?.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canCriar && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(l)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação remove o lançamento e <b>todo o seu histórico, assinaturas e progresso</b>. Não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => excluir.mutate(l.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
