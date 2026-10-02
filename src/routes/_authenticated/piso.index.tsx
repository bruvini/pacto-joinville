import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { PISO_ETAPAS, STATUS_COMPETENCIA, etapaAtualPiso, competenciaValida } from "@/lib/piso/etapas";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/piso/")({
  head: () => ({
    meta: [
      { title: "Piso da Enfermagem — Competências" },
      { name: "description", content: "Competências mensais do Piso da Enfermagem." },
    ],
  }),
  component: PisoLista,
});

function ordemComp(c: string) {
  const [m, a] = c.split("/");
  return Number(a) * 100 + Number(m);
}

function PisoLista() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { roles } = useAuth();
  const podeCriar = hasRole(roles, "acp");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ competencia: "", processo_sei: "", link_processo_sei: "" });

  const { data = [], isLoading } = useQuery({
    queryKey: ["piso_competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piso_competencias")
        .select("*, piso_participantes(id, situacao)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = useMemo(
    () =>
      [...data]
        .filter((c: any) => filtroStatus === "todos" || c.status === filtroStatus)
        .filter((c: any) => !busca || c.competencia.includes(busca) || (c.processo_sei ?? "").includes(busca))
        .sort((a: any, b: any) => ordemComp(b.competencia) - ordemComp(a.competencia)),
    [data, filtroStatus, busca],
  );

  const criar = useMutation({
    mutationFn: async () => {
      if (!competenciaValida(form.competencia)) throw new Error("Competência inválida (MM/AAAA).");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("piso_competencias")
        .insert({
          competencia: form.competencia,
          processo_sei: form.processo_sei || null,
          link_processo_sei: form.link_processo_sei || null,
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error.code === "23505" ? new Error("Essa competência já existe.") : error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["piso_competencias"] });
      setOpen(false);
      toast.success("Competência criada");
      nav({ to: "/piso/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Piso da Enfermagem</h1>
          <p className="text-sm text-muted-foreground">Competências mensais — da preparação ao pagamento.</p>
        </div>
        {podeCriar && (
          <Button onClick={() => { setForm({ competencia: "", processo_sei: "", link_processo_sei: "" }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Nova competência
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="text-base mr-auto">{lista.length} competência(s)</CardTitle>
          <Input placeholder="Buscar competência ou SEI" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56" />
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS_COMPETENCIA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma competência cadastrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr><th className="py-2">Competência</th><th>Etapa atual</th><th>Instituições</th><th>Valor homologado</th><th>Processo SEI</th><th>Status</th></tr>
              </thead>
              <tbody>
                {lista.map((c: any) => {
                  const etapa = etapaAtualPiso(c.etapas_concluidas);
                  const parts = c.piso_participantes ?? [];
                  const pend = parts.filter((p: any) => p.situacao === "aguardando_envio" || p.situacao === "enviado").length;
                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 font-medium">
                        <Link to="/piso/$id" params={{ id: c.id }} className="text-primary hover:underline">{c.competencia}</Link>
                      </td>
                      <td>
                        {c.status === "encerrada" ? "—" : `${etapa}. ${PISO_ETAPAS[etapa - 1].titulo}`}
                        {(c.etapas_reconferir?.length ?? 0) > 0 && <Badge variant="destructive" className="ml-2">Reconferir</Badge>}
                      </td>
                      <td>{parts.length}{pend > 0 && <span className="text-xs text-muted-foreground"> ({pend} pendente{pend > 1 ? "s" : ""})</span>}</td>
                      <td>{c.valor_homologado != null ? brl(c.valor_homologado) : "—"}</td>
                      <td>{c.processo_sei ?? "—"}</td>
                      <td><Badge variant={c.status === "encerrada" ? "secondary" : "outline"}>{STATUS_COMPETENCIA[c.status] ?? c.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova competência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Competência</Label><CompetenciaInput value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} /></div>
            <div><Label>Processo SEI</Label><Input value={form.processo_sei} onChange={(e) => setForm({ ...form, processo_sei: e.target.value })} /></div>
            <div><Label>Link do processo SEI</Label><Input value={form.link_processo_sei} onChange={(e) => setForm({ ...form, link_processo_sei: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => criar.mutate()} disabled={!competenciaValida(form.competencia) || criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
