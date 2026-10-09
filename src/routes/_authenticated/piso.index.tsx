import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth, hasRole } from "@/hooks/useAuth";
import {
  PISO_ETAPAS,
  STATUS_COMPETENCIA,
  etapaAtualPiso,
} from "@/lib/piso/etapas";
import { brl } from "@/lib/format";
import heroPiso from "@/assets/piso-enfermagem-hero.png";
import { conflitoParcelaPiso, exercicioDaCompetencia, identidadeParcelaPiso,
  parcelaPisoValida, rotuloParcelaPiso, type TipoParcelaPiso } from "@/lib/piso/parcelas";

export const Route = createFileRoute("/_authenticated/piso/")({
  head: () => ({
    meta: [
      { title: "Piso da Enfermagem — Competências" },
      { name: "description", content: "Parcelas mensais e 13ª da assistência financeira complementar." },
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
  const [form, setForm] = useState({
    competencia: "", tipo_parcela: "mensal" as TipoParcelaPiso,
    exercicio_referencia: new Date().getFullYear(), prestadores: [] as string[],
  });
  const [filtroInstituicao, setFiltroInstituicao] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const prestadoresQuery = useQuery({
    queryKey: ["prestadores-piso-cadastro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestadores")
        .select("id,nome_instituicao,status")
        .order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
  });
  const prestadores = prestadoresQuery.data ?? [];
  const prestadoresAtivos = (prestadores as any[]).filter((p) => p.status === "ativo");

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

  const grupoCompetencia = (c: any) =>
    c.status === "encerrada" ? 9 : etapaAtualPiso(c.etapas_concluidas);

  const lista = useMemo(
    () =>
      [...data]
        .filter((c: any) => filtroStatus === "todos" || c.status === filtroStatus)
        .filter(
          (c: any) =>
            filtroInstituicao === "todos" ||
            (c.piso_participantes ?? []).some((p: any) => p.prestador_id === filtroInstituicao),
        )
        .filter((c: any) => filtroAno === "todos" ||
          String(c.exercicio_referencia ?? c.competencia.slice(-4)) === filtroAno)
        .filter((c: any) => filtroTipo === "todos" ||
          (c.tipo_parcela ?? "mensal") === filtroTipo)
        .filter((c: any) => !busca ||
          rotuloParcelaPiso(c).toLowerCase().includes(busca.toLowerCase()))
        .sort((a: any, b: any) => {
          const etapaA = grupoCompetencia(a);
          const etapaB = grupoCompetencia(b);
          if (etapaA !== etapaB) return etapaA - etapaB;
          return ordemComp(a.competencia) - ordemComp(b.competencia);
        }),
    [data, filtroStatus, filtroInstituicao, filtroAno, filtroTipo, busca],
  );

  const criar = useMutation({
    mutationFn: async () => {
      const motivo = parcelaPisoValida(form);
      if (motivo) throw new Error(motivo);
      if (conflitoParcelaPiso(data as any[], form))
        throw new Error("Já existe parcela desse tipo para o período ou exercício.");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("piso_competencias")
        .insert({
          competencia: form.competencia,
          tipo_parcela: form.tipo_parcela,
          exercicio_referencia: form.exercicio_referencia,
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error.code === "23505" ? new Error("Já existe uma parcela desse tipo para a competência ou exercício.") : error;
      if (form.prestadores.length) {
        const { error: participantesError } = await supabase
          .from("piso_participantes")
          .insert(
            form.prestadores.map((prestador_id) => ({ competencia_id: data.id, prestador_id })),
          );
        if (participantesError) throw participantesError;
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["piso_competencias"] });
      setOpen(false);
      toast.success("Processo da parcela criado.");
      nav({ to: "/piso/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!edicao) throw new Error("Processo não selecionado.");
      const identidade = identidadeParcelaPiso({
        competencia: edicao.competencia,
        tipo_parcela: edicao.tipo_parcela,
        exercicio_referencia: edicao.tipo_parcela === "mensal"
          ? exercicioDaCompetencia(edicao.competencia) ?? 0
          : edicao.exercicio_referencia,
      });
      const motivo = parcelaPisoValida(identidade);
      if (motivo) throw new Error(motivo);
      if (conflitoParcelaPiso(data as any[], identidade, edicao.id))
        throw new Error("Já existe parcela desse tipo para esse período ou exercício.");
      if (!edicao.prestadores?.length)
        throw new Error("Selecione ao menos uma instituição participante.");

      const { error } = await supabase
        .from("piso_competencias")
        .update({
          competencia: edicao.competencia,
          exercicio_referencia: identidade.exercicio_referencia,
        })
        .eq("id", edicao.id);
      if (error) throw error.code === "23505" ? new Error("Já existe uma parcela desse tipo para a competência ou exercício.") : error;

      const atuais = (edicao.participantesAtuais ?? []) as Array<{
        id: string;
        prestador_id: string;
      }>;
      const selecionados = new Set<string>(edicao.prestadores);
      const remover = atuais.filter((p) => !selecionados.has(p.prestador_id));
      const idsAtuais = new Set(atuais.map((p) => p.prestador_id));
      const adicionar = edicao.prestadores.filter((id: string) => !idsAtuais.has(id));

      if (remover.length) {
        const { error: removerError } = await supabase
          .from("piso_participantes")
          .delete()
          .in("id", remover.map((p) => p.id));
        if (removerError) throw removerError;
      }
      if (adicionar.length) {
        const { error: adicionarError } = await supabase
          .from("piso_participantes")
          .insert(adicionar.map((prestador_id: string) => ({
            competencia_id: edicao.id,
            prestador_id,
          })));
        if (adicionarError) throw adicionarError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["piso_competencias"] });
      setEdicao(null);
      toast.success("Competência atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("piso_competencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["piso_competencias"] });
      toast.success("Competência excluída");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="relative isolate [container-type:inline-size] overflow-hidden rounded-2xl border bg-gradient-to-r from-primary via-sky-800 to-sky-600 text-primary-foreground shadow-sm">
        <div className="relative z-10 flex min-h-48 flex-col justify-center p-6 md:min-h-56 md:w-[50%] md:p-8">
          <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <Badge className="relative mb-3 w-fit bg-white/15 text-white hover:bg-white/20">
            Gestão integrada
          </Badge>
          <h1 className="relative text-3xl font-bold tracking-tight md:text-4xl">
            Piso da Enfermagem
          </h1>
          <p className="relative mt-3 max-w-xl text-sm text-white/85 md:text-base">
            Acompanhe cada competência, da preparação no InvestSUS à execução orçamentária e ao
            pagamento.
          </p>
        </div>
        <img
          src={heroPiso}
          alt="Profissionais da enfermagem de Joinville"
          className="pointer-events-none relative ml-auto h-auto w-full object-contain object-right [--piso-hero-mask:linear-gradient(to_bottom,transparent_0%,#000_30%)] md:[--piso-hero-mask:linear-gradient(to_right,transparent_0%,rgba(0,0,0,.35)_10%,#000_28%)] md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[66%]"
          style={{
            WebkitMaskImage: "var(--piso-hero-mask)",
            maskImage: "var(--piso-hero-mask)",
          }}
        />
      </section>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-primary">Parcelas da assistência financeira complementar</h2>
          <p className="text-sm text-muted-foreground">Da preparação ao pagamento.</p>
        </div>
        {podeCriar && (
          <Button
            onClick={() => {
              setForm({ competencia: "", tipo_parcela: "mensal", exercicio_referencia: new Date().getFullYear(), prestadores: [] });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova competência
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="text-base mr-auto">{lista.length} competência(s)</CardTitle>
          <Input
            placeholder="Buscar competência"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-56"
          />
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS_COMPETENCIA).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroInstituicao}
            onValueChange={setFiltroInstituicao}
            disabled={prestadoresQuery.isError}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Instituição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as instituições</SelectItem>
              {(prestadores as any[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome_instituicao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as parcelas</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="decimo_terceiro">13ª parcela</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {[...new Set((data as any[]).map((c) => String(c.exercicio_referencia ?? c.competencia.slice(-4))))]
                .sort()
                .reverse()
                .map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma competência cadastrada.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Competência</th>
                  <th>Etapa atual</th>
                  <th>Instituições</th>
                  <th>Valor homologado</th>
                  <th>Valor transferido</th>
                  <th>Status</th>
                  {(podeCriar || podeExcluir) && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {lista.map((c: any, index: number) => {
                  const etapa = etapaAtualPiso(c.etapas_concluidas);
                  const grupo = grupoCompetencia(c);
                  const grupoAnterior = index > 0 ? grupoCompetencia(lista[index - 1]) : null;
                  const parts = c.piso_participantes ?? [];
                  const pend = parts.filter(
                    (p: any) => p.situacao === "aguardando_envio" || p.situacao === "enviado",
                  ).length;
                  return (
                    <Fragment key={c.id}>
                      {grupo !== grupoAnterior && (
                        <tr className="border-y bg-muted/50">
                          <td
                            colSpan={podeCriar || podeExcluir ? 7 : 6}
                            className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-primary"
                          >
                            {grupo === 9
                              ? "Encerradas"
                              : `Etapa ${grupo} — ${PISO_ETAPAS[grupo - 1].titulo}`}
                          </td>
                        </tr>
                      )}
                    <tr className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 font-medium">
                        <Link
                          to="/piso/$id"
                          params={{ id: c.id }}
                          className="text-primary hover:underline"
                        >
                          {rotuloParcelaPiso(c)}
                        </Link>
                      </td>
                      <td>
                        {c.status === "encerrada"
                          ? "—"
                          : `${etapa}. ${PISO_ETAPAS[etapa - 1].titulo}`}
                        {(c.etapas_reconferir?.length ?? 0) > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Reconferir
                          </Badge>
                        )}
                      </td>
                      <td>
                        {parts.length}
                        {pend > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            ({pend} pendente{pend > 1 ? "s" : ""})
                          </span>
                        )}
                      </td>
                      <td>{c.valor_homologado != null ? brl(c.valor_homologado) : "—"}</td>
                      <td>{c.valor_transferido != null ? brl(c.valor_transferido) : "—"}</td>
                      <td>
                        <Badge variant={c.status === "encerrada" ? "secondary" : "outline"}>
                          {STATUS_COMPETENCIA[c.status] ?? c.status}
                        </Badge>
                      </td>
                      {(podeCriar || podeExcluir) && (
                        <td className="text-right whitespace-nowrap">
                          {podeCriar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Editar competência"
                              onClick={() =>
                                setEdicao({
                                  id: c.id,
                                  competencia: c.competencia,
                                  tipo_parcela: c.tipo_parcela ?? "mensal",
                                  exercicio_referencia: c.exercicio_referencia ?? Number(c.competencia.slice(-4)),
                                  memoria_processada: c.tipo_parcela === "decimo_terceiro" &&
                                    c.investsus_resumo?.origem_calculo === "afc13_cnes",
                                  prestadores: (c.piso_participantes ?? []).map(
                                    (p: any) => p.prestador_id,
                                  ),
                                  participantesAtuais: c.piso_participantes ?? [],
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Excluir competência"
                              onClick={() =>
                                confirm(
                                  `Excluir ${rotuloParcelaPiso(c)}? Esta ação remove seus dados vinculados.`,
                                ) && excluir.mutate(c.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova competência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Competência</Label>
              <CompetenciaInput
                value={form.competencia}
                onChange={(v) => setForm({ ...form, competencia: v,
                  exercicio_referencia: form.tipo_parcela === "mensal"
                    ? exercicioDaCompetencia(v) ?? form.exercicio_referencia
                    : form.exercicio_referencia })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de parcela</Label>
              <Select value={form.tipo_parcela} onValueChange={(v) => setForm({
                ...form, tipo_parcela: v as TipoParcelaPiso,
                exercicio_referencia: exercicioDaCompetencia(form.competencia) ?? form.exercicio_referencia,
              })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="decimo_terceiro">13ª parcela anual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O mês representa o repasse; a 13ª é única por exercício. Valores não são copiados.
              </p>
            </div>
            {form.tipo_parcela === "decimo_terceiro" && (
              <div className="space-y-1">
                <Label>Exercício de referência da 13ª parcela</Label>
                <Input type="number" min="2000" max="2099" value={form.exercicio_referencia}
                  onChange={(e) => setForm({ ...form, exercicio_referencia: Number(e.target.value) })} />
              </div>
            )}
            {conflitoParcelaPiso(data as any[], form) && (
              <p role="alert" className="text-xs text-destructive">
                Já existe um processo desta parcela para o período ou exercício.
              </p>
            )}
            <div>
              <Label>Instituições participantes</Label>
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {(prestadoresAtivos as any[]).map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={form.prestadores.includes(p.id)}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          prestadores: v
                            ? [...new Set([...form.prestadores, p.id])]
                            : form.prestadores.filter((id) => id !== p.id),
                        })
                      }
                    />
                    {p.nome_instituicao}
                  </label>
                ))}
                {prestadoresQuery.isError ? (
                  <div role="alert" className="p-2 text-sm text-destructive">
                    Não foi possível carregar os prestadores ativos.{" "}
                    {(prestadoresQuery.error as Error).message}
                  </div>
                ) : (
                  prestadoresAtivos.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">
                      Cadastre prestadores ativos antes de criar a competência.
                    </p>
                  )
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => criar.mutate()}
              disabled={
                Boolean(parcelaPisoValida(form)) ||
                conflitoParcelaPiso(data as any[], form) ||
                !form.prestadores.length ||
                criar.isPending ||
                prestadoresQuery.isError
              }
            >
              Criar competência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edicao} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar competência</DialogTitle>
          </DialogHeader>
          {edicao && (
            <div className="space-y-3">
              <div>
                <Label>Competência</Label>
                {edicao.memoria_processada ? (
                  <Input readOnly value={edicao.competencia} />
                ) : (
                  <CompetenciaInput
                    value={edicao.competencia}
                    onChange={(v) => setEdicao({ ...edicao, competencia: v })}
                  />
                )}
              </div>
              {edicao.memoria_processada && (
                <p role="note" className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">
                  A memória da 13ª já foi processada. Instituições e competência de repasse
                  estão bloqueadas para não alterar a distribuição auditada.
                </p>
              )}
              <div className="space-y-1">
                <Label>Tipo da parcela</Label>
                <Input readOnly value={edicao.tipo_parcela === "decimo_terceiro"
                  ? `13ª parcela · exercício ${edicao.exercicio_referencia}` : "Mensal"} />
                <p className="text-xs text-muted-foreground">
                  Tipo e exercício da 13ª não são alterados para preservar a trilha financeira.
                </p>
              </div>
              <div>
                <Label>Instituições participantes</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Marque as instituições que devem integrar esta competência.
                </p>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {(prestadores as any[]).map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={edicao.prestadores.includes(p.id)}
                        disabled={Boolean(edicao.memoria_processada)}
                        onCheckedChange={(v) =>
                          setEdicao({
                            ...edicao,
                            prestadores: v
                              ? [...new Set([...edicao.prestadores, p.id])]
                              : edicao.prestadores.filter((id: string) => id !== p.id),
                          })
                        }
                      />
                      <span className="flex-1">{p.nome_instituicao}</span>
                      {p.status !== "ativo" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-amber-700">
                  Remover uma instituição da competência também remove os dados vinculados a ela
                  nesta competência.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => salvarEdicao.mutate()}
              disabled={
                salvarEdicao.isPending ||
                Boolean(edicao?.memoria_processada) ||
                !edicao || Boolean(parcelaPisoValida(identidadeParcelaPiso({
                  competencia: edicao.competencia,
                  tipo_parcela: edicao.tipo_parcela,
                  exercicio_referencia: edicao.tipo_parcela === "mensal"
                    ? exercicioDaCompetencia(edicao.competencia) ?? 0
                    : edicao.exercicio_referencia,
                }))) ||
                !(edicao?.prestadores?.length > 0)
              }
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
