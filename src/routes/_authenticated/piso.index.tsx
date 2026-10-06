import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { PISO_ETAPAS, STATUS_COMPETENCIA, etapaAtualPiso, competenciaValida } from "@/lib/piso/etapas";
import { brl } from "@/lib/format";
import heroPiso from "@/assets/piso-enfermagem-hero.png";

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
  const podeExcluir = hasRole(roles, "admin");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [edicao, setEdicao] = useState<any | null>(null);
  const [form, setForm] = useState({ competencia: "", prestadores: [] as string[] });
  const [filtroInstituicao, setFiltroInstituicao] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const { data: prestadores = [] } = useQuery({ queryKey: ["prestadores-piso-cadastro"], queryFn: async () => (await supabase.from("prestadores").select("id,nome_instituicao,status").eq("status", "ativo").order("nome_instituicao")).data ?? [] });

  const { data = [], isLoading } = useQuery({
    queryKey: ["piso_competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piso_competencias")
        .select("*, piso_participantes(id, prestador_id, situacao)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = useMemo(
    () =>
      [...data]
        .filter((c: any) => filtroStatus === "todos" || c.status === filtroStatus)
        .filter((c: any) => filtroInstituicao === "todos" || (c.piso_participantes ?? []).some((p: any) => p.prestador_id === filtroInstituicao))
        .filter((c: any) => filtroAno === "todos" || c.competencia.endsWith(`/${filtroAno}`))
        .filter((c: any) => !busca || c.competencia.includes(busca) || (c.processo_sei ?? "").includes(busca))
        .sort((a: any, b: any) => ordemComp(b.competencia) - ordemComp(a.competencia)),
    [data, filtroStatus, filtroInstituicao, filtroAno, busca],
  );

  const criar = useMutation({
    mutationFn: async () => {
      if (!competenciaValida(form.competencia)) throw new Error("Competência inválida (MM/AAAA).");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("piso_competencias")
        .insert({
          competencia: form.competencia,
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error.code === "23505" ? new Error("Essa competência já existe.") : error;
      if (form.prestadores.length) {
        const { error: participantesError } = await supabase.from("piso_participantes").insert(form.prestadores.map((prestador_id) => ({ competencia_id: data.id, prestador_id })));
        if (participantesError) throw participantesError;
      }
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
  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!edicao || !competenciaValida(edicao.competencia)) throw new Error("Competência inválida (MM/AAAA).");
      const { error } = await supabase.from("piso_competencias").update({
        competencia: edicao.competencia,
        processo_sei: edicao.processo_sei || null,
        link_processo_sei: edicao.link_processo_sei || null,
      }).eq("id", edicao.id);
      if (error) throw error.code === "23505" ? new Error("Essa competência já existe.") : error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["piso_competencias"] }); setEdicao(null); toast.success("Competência atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("piso_competencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["piso_competencias"] }); toast.success("Competência excluída"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="relative min-h-64 overflow-hidden rounded-2xl border bg-primary text-primary-foreground shadow-sm">
        <img src={heroPiso} alt="Profissionais da enfermagem de Joinville" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-primary/10" />
        <div className="relative flex min-h-64 max-w-2xl flex-col justify-center p-7 md:p-10"><Badge className="mb-3 w-fit bg-white/15 text-white hover:bg-white/20">Gestão integrada</Badge><h1 className="text-3xl font-bold tracking-tight md:text-4xl">Piso da Enfermagem</h1><p className="mt-3 max-w-xl text-sm text-white/85 md:text-base">Acompanhe cada competência, da preparação no InvestSUS à execução orçamentária, pagamento e prestação de contas.</p></div>
      </section>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h2 className="text-xl font-bold text-primary">Competências mensais</h2><p className="text-sm text-muted-foreground">Da preparação ao pagamento e à prestação de contas.</p></div>
        {podeCriar && (
          <Button onClick={() => { setForm({ competencia: "", prestadores: [] }); setOpen(true); }}>
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
          <Select value={filtroInstituicao} onValueChange={setFiltroInstituicao}><SelectTrigger className="w-52"><SelectValue placeholder="Instituição" /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as instituições</SelectItem>{(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}</SelectContent></Select>
          <Select value={filtroAno} onValueChange={setFiltroAno}><SelectTrigger className="w-32"><SelectValue placeholder="Ano" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{[...new Set((data as any[]).map((c) => c.competencia.slice(-4)))].sort().reverse().map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma competência cadastrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr><th className="py-2">Competência</th><th>Etapa atual</th><th>Instituições</th><th>Valor homologado</th><th>Processo SEI</th><th>Status</th>{(podeCriar || podeExcluir) && <th aria-label="Ações" />}</tr>
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
                      {(podeCriar || podeExcluir) && <td className="text-right whitespace-nowrap">
                        {podeCriar && <Button size="icon" variant="ghost" title="Editar competência" onClick={() => setEdicao({ id: c.id, competencia: c.competencia, processo_sei: c.processo_sei ?? "", link_processo_sei: c.link_processo_sei ?? "" })}><Pencil className="h-4 w-4" /></Button>}
                        {podeExcluir && <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="Excluir competência" onClick={() => confirm(`Excluir a competência ${c.competencia}? Esta ação remove seus dados vinculados.`) && excluir.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </td>}
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
            <div><Label>Instituições participantes</Label><div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">{(prestadores as any[]).map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><Checkbox checked={form.prestadores.includes(p.id)} onCheckedChange={(v) => setForm({ ...form, prestadores: v ? [...form.prestadores, p.id] : form.prestadores.filter((id) => id !== p.id) })} />{p.nome_instituicao}</label>)}{prestadores.length === 0 && <p className="p-2 text-sm text-muted-foreground">Cadastre prestadores ativos antes de criar a competência.</p>}</div></div>
          </div>
          <DialogFooter>
            <Button onClick={() => criar.mutate()} disabled={!competenciaValida(form.competencia) || !form.prestadores.length || criar.isPending}>Criar competência</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edicao} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar competência</DialogTitle></DialogHeader>
          {edicao && <div className="space-y-3">
            <div><Label>Competência</Label><CompetenciaInput value={edicao.competencia} onChange={(v) => setEdicao({ ...edicao, competencia: v })} /></div>
            <div><Label>Processo SEI</Label><Input value={edicao.processo_sei} onChange={(e) => setEdicao({ ...edicao, processo_sei: e.target.value })} /></div>
            <div><Label>Link do processo SEI</Label><Input value={edicao.link_processo_sei} onChange={(e) => setEdicao({ ...edicao, link_processo_sei: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => salvarEdicao.mutate()} disabled={salvarEdicao.isPending || !competenciaValida(edicao?.competencia ?? "")}>Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
