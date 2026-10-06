import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { brl } from "@/lib/format";
import {
  CACON_STATUS,
  competenciaValidaCacon,
  etapaAtualCacon,
  ordemCompetenciaCacon,
} from "@/lib/cacon/etapas";
import heroCacon from "@/assets/cacon-hero.webp";

export const Route = createFileRoute("/_authenticated/cacon/")({
  head: () => ({
    meta: [
      { title: "Dieta CACON — Competências" },
      {
        name: "description",
        content: "Acompanhamento mensal da produção de Dieta CACON do HMSJ.",
      },
    ],
  }),
  component: CaconLista,
});

function CaconLista() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { roles, profile } = useAuth();
  const podeEditar = hasRole(roles, "acp");
  const podeExcluir = hasRole(roles, "admin");
  const [open, setOpen] = useState(false);
  const [edicao, setEdicao] = useState<any | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [prestador, setPrestador] = useState("todos");
  const [form, setForm] = useState({ competencia: "", prestador_id: "" });

  const prestadores = useQuery({
    queryKey: ["cacon-prestadores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("prestadores")
        .select("id,nome_instituicao,status")
        .order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
  });

  const competencias = useQuery({
    queryKey: ["cacon-competencias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cacon_competencias")
        .select("*, prestadores(id,nome_instituicao)")
        .order("competencia");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = useMemo(
    () =>
      [...(competencias.data ?? [])]
        .filter((c: any) => status === "todos" || c.status === status)
        .filter((c: any) => prestador === "todos" || c.prestador_id === prestador)
        .filter((c: any) => {
          const q = busca.trim().toLowerCase();
          if (!q) return true;
          return (
            String(c.competencia).includes(q) ||
            String(c.prestadores?.nome_instituicao ?? "").toLowerCase().includes(q)
          );
        })
        .sort(
          (a: any, b: any) =>
            ordemCompetenciaCacon(b.competencia) - ordemCompetenciaCacon(a.competencia),
        ),
    [competencias.data, status, prestador, busca],
  );

  const criar = useMutation({
    mutationFn: async () => {
      if (!competenciaValidaCacon(form.competencia))
        throw new Error("Competência inválida. Use MM/AAAA.");
      if (!form.prestador_id) throw new Error("Selecione o prestador.");

      const { data: existente, error: existeErro } = await (supabase as any)
        .from("cacon_competencias")
        .select("id,status")
        .eq("competencia", form.competencia)
        .eq("prestador_id", form.prestador_id)
        .maybeSingle();
      if (existeErro) throw existeErro;
      if (existente)
        throw new Error(
          `Já existe um lançamento CACON para esta instituição na competência ${form.competencia}.`,
        );

      const { data: usuario } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("cacon_competencias")
        .insert({
          competencia: form.competencia,
          prestador_id: form.prestador_id,
          created_by: usuario.user?.id,
          updated_by: usuario.user?.id,
        })
        .select("id")
        .single();
      if (error)
        throw error.code === "23505"
          ? new Error("Esta instituição já possui lançamento para a competência.")
          : error;

      const nomePrestador =
        (prestadores.data ?? []).find((p: any) => p.id === form.prestador_id)
          ?.nome_instituicao ?? "prestador";
      await (supabase as any).from("cacon_logs").insert({
        competencia_id: data.id,
        acao: "Competência CACON criada",
        detalhes: {
          descricao: `Competência ${form.competencia} vinculada a ${nomePrestador}.`,
        },
        usuario_id: usuario.user?.id,
        usuario_nome: profile?.nome ?? usuario.user?.email ?? "Usuário",
      });

      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["cacon-competencias"] });
      setOpen(false);
      setForm({ competencia: "", prestador_id: "" });
      toast.success("Competência CACON criada");
      navigate({ to: "/cacon/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!edicao || !competenciaValidaCacon(edicao.competencia))
        throw new Error("Competência inválida.");
      if (!edicao.prestador_id) throw new Error("Selecione o prestador.");
      const { data: usuario } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("cacon_competencias")
        .update({
          competencia: edicao.competencia,
          prestador_id: edicao.prestador_id,
          updated_by: usuario.user?.id,
        })
        .eq("id", edicao.id);
      if (error)
        throw error.code === "23505"
          ? new Error("Já existe lançamento para esta instituição e competência.")
          : error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cacon-competencias"] });
      setEdicao(null);
      toast.success("Competência atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("cacon_competencias")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cacon-competencias"] });
      toast.success("Competência excluída");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ativos = (prestadores.data ?? []).filter((p: any) => p.status === "ativo");

  return (
    <div className="space-y-4">
      <section className="relative isolate [container-type:inline-size] overflow-hidden rounded-2xl border bg-gradient-to-r from-primary via-sky-800 to-sky-600 text-primary-foreground shadow-sm">
        <div className="relative z-10 flex min-h-48 flex-col justify-center p-6 md:min-h-56 md:w-[50%] md:p-8">
          <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <Badge className="relative mb-3 w-fit bg-white/15 text-white hover:bg-white/20">
            Nutrição oncológica · CACON
          </Badge>
          <h1 className="relative text-3xl font-bold tracking-tight md:text-4xl">
            Dieta CACON
          </h1>
          <p className="relative mt-3 max-w-xl text-sm text-white/85 md:text-base">
            Acompanhe o recebimento do HMSJ, audite o Boletim Nutricional e prepare o
            Memorando da SMS para encaminhamento à SES.UFI.
          </p>
        </div>
        <img
          src={heroCacon}
          alt="Dieta CACON e nutrição oncológica"
          className="pointer-events-none relative ml-auto h-auto w-full object-contain object-right [--cacon-hero-mask:linear-gradient(to_bottom,transparent_0%,#000_30%)] md:[--cacon-hero-mask:linear-gradient(to_right,transparent_0%,rgba(0,0,0,.35)_10%,#000_28%)] md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[66%]"
          style={{
            WebkitMaskImage: "var(--cacon-hero-mask)",
            maskImage: "var(--cacon-hero-mask)",
          }}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-primary">
            <UtensilsCrossed className="h-5 w-5" />
            Competências mensais
          </h2>
          <p className="text-sm text-muted-foreground">
            Uma competência por instituição, do recebimento ao encaminhamento para a SES.UFI.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova competência
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="mr-auto text-base">{lista.length} lançamento(s)</CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar competência ou instituição"
            className="w-64"
          />
          <Select value={prestador} onValueChange={setPrestador}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as instituições</SelectItem>
              {(prestadores.data ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome_instituicao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aberta">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluídas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {competencias.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma competência CACON cadastrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Competência</th>
                    <th>Instituição</th>
                    <th>Etapa atual</th>
                    <th>Valor produzido</th>
                    <th>Status</th>
                    {(podeEditar || podeExcluir) && <th aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c: any) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-3 font-semibold">
                        <Link
                          to="/cacon/$id"
                          params={{ id: c.id }}
                          className="text-primary hover:underline"
                        >
                          {c.competencia}
                        </Link>
                      </td>
                      <td>{c.prestadores?.nome_instituicao ?? "—"}</td>
                      <td>
                        {c.status === "concluida"
                          ? "Concluído"
                          : `${etapaAtualCacon(c)} de 3`}
                      </td>
                      <td>{c.valor_fornecido == null ? "—" : brl(c.valor_fornecido)}</td>
                      <td>
                        <Badge variant={c.status === "concluida" ? "secondary" : "outline"}>
                          {CACON_STATUS[c.status] ?? c.status}
                        </Badge>
                      </td>
                      {(podeEditar || podeExcluir) && (
                        <td className="whitespace-nowrap text-right">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar competência"
                              onClick={() =>
                                setEdicao({
                                  id: c.id,
                                  competencia: c.competencia,
                                  prestador_id: c.prestador_id,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              title="Excluir competência"
                              onClick={() =>
                                confirm(
                                  `Excluir ${c.competencia} · ${c.prestadores?.nome_instituicao ?? "CACON"}? Os arquivos e dados vinculados serão removidos.`,
                                ) && excluir.mutate(c.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova competência · Dieta CACON</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Competência</Label>
              <CompetenciaInput
                value={form.competencia}
                onChange={(competencia) => setForm({ ...form, competencia })}
              />
            </div>
            <div>
              <Label>Instituição / prestador</Label>
              <Select
                value={form.prestador_id}
                onValueChange={(prestador_id) => setForm({ ...form, prestador_id })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a instituição" />
                </SelectTrigger>
                <SelectContent>
                  {ativos.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome_instituicao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                O sistema não permite dois lançamentos para a mesma instituição e competência.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => criar.mutate()}
              disabled={
                criar.isPending ||
                !competenciaValidaCacon(form.competencia) ||
                !form.prestador_id
              }
            >
              Criar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(edicao)} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar competência</DialogTitle>
          </DialogHeader>
          {edicao && (
            <div className="space-y-4">
              <div>
                <Label>Competência</Label>
                <CompetenciaInput
                  value={edicao.competencia}
                  onChange={(competencia) => setEdicao({ ...edicao, competencia })}
                />
              </div>
              <div>
                <Label>Instituição / prestador</Label>
                <Select
                  value={edicao.prestador_id}
                  onValueChange={(prestador_id) => setEdicao({ ...edicao, prestador_id })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(prestadores.data ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome_instituicao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => salvarEdicao.mutate()}
              disabled={
                salvarEdicao.isPending ||
                !edicao ||
                !competenciaValidaCacon(edicao.competencia) ||
                !edicao.prestador_id
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
