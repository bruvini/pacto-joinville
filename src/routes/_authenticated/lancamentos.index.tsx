import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Plus, Download, Filter } from "lucide-react";
import { brl, etapaLabel } from "@/lib/format";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/lancamentos/")({
  head: () => ({ meta: [{ title: "Lançamentos — Convênios SMS Joinville" }] }),
  component: LancamentosList,
});

function LancamentosList() {
  const qc = useQueryClient();
  const [filtros, setFiltros] = useState({ prestador: "", competencia: "", status: "all", sei: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ prestador_id: "", descricao: "", competencia: "", valor_solicitado: "0" });

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });

  const { data: lancs = [] } = useQuery({
    queryKey: ["lancs"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento")
      .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => lancs.filter((l: any) => {
    if (filtros.prestador && l.prestador_id !== filtros.prestador) return false;
    if (filtros.competencia && !(l.competencia ?? "").includes(filtros.competencia)) return false;
    if (filtros.status !== "all" && l.etapa_atual !== filtros.status) return false;
    if (filtros.sei && !`${l.link_solicitacao_sei ?? ""} ${l.link_empenho_sei ?? ""} ${l.numero_empenho ?? ""}`.toLowerCase().includes(filtros.sei.toLowerCase())) return false;
    return true;
  }), [lancs, filtros]);

  const novo = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data: cfgs } = await supabase.from("assinaturas_config").select("*").eq("ativo", true).order("ordem");
      const { data: lanc, error } = await supabase.from("lancamentos_pagamento").insert({
        prestador_id: form.prestador_id || null,
        descricao: form.descricao,
        competencia: form.competencia,
        valor_solicitado: Number(form.valor_solicitado) || 0,
        created_by: user.user?.id,
      }).select().single();
      if (error) throw error;
      if (cfgs && cfgs.length > 0 && lanc) {
        await supabase.from("assinaturas_lancamento").insert(cfgs.map((c: any) => ({
          lancamento_id: lanc.id, etapa: c.etapa, nome_servidor: c.nome_servidor,
          cargo: c.cargo, codigo_sei: c.codigo_sei, ordem: c.ordem,
        })));
      }
      await supabase.from("historico_logs").insert({
        lancamento_id: lanc!.id, usuario_id: user.user?.id, usuario_nome: user.user?.email,
        acao: "Lançamento criado",
      });
      return lanc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancs"] });
      setOpen(false);
      setForm({ prestador_id: "", descricao: "", competencia: "", valor_solicitado: "0" });
      toast.success("Lançamento criado");
    },
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
      "Valor Empenho Líquido": Number(l.valor_empenho_liquido ?? 0),
      "Etapa Atual": etapaLabel[l.etapa_atual] ?? l.etapa_atual,
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo lançamento</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo lançamento de pagamento</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Prestador</Label>
                  <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div><Label>Competência (MM/AAAA)</Label><Input value={form.competencia} placeholder="06/2026" onChange={(e) => setForm({ ...form, competencia: e.target.value })} /></div>
                <div><Label>Valor solicitado (R$)</Label><Input type="number" step="0.01" value={form.valor_solicitado} onChange={(e) => setForm({ ...form, valor_solicitado: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => novo.mutate()} disabled={novo.isPending}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
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
                  {Object.entries(etapaLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                  <th>Etapa</th><th>Responsável</th>
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
                    <td className="tabular-nums">{brl(Number(l.valor_anulado))}</td>
                    <td><Badge variant="outline" className="text-xs">{etapaLabel[l.etapa_atual]}</Badge></td>
                    <td>
                      <Badge className={l.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}>
                        {l.responsavel_atual?.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
