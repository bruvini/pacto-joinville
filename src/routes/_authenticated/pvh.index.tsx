import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus, Settings2, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import {
  PVH_ETAPAS,
  STATUS_PVH,
  competenciaValidaPvh,
  etapaAtualPvh,
  ordemCompetenciaPvh,
} from "@/lib/pvh/etapas";
import { brl } from "@/lib/format";
import { filtrarPelaAcao, validarBuscaAcao } from "@/lib/dashboard/acoes-navegacao";
import heroPvh from "@/assets/pvh-hero.webp";
import { AjudaPrimeirosPassosPvh } from "@/components/pvh/AjudaPvh";

export const Route = createFileRoute("/_authenticated/pvh/")({
  validateSearch: validarBuscaAcao,
  head: () => ({
    meta: [
      { title: "PVH — Programa de Valorização dos Hospitais" },
      {
        name: "description",
        content: "Gestão mensal do Programa de Valorização dos Hospitais.",
      },
    ],
  }),
  component: PvhListaPage,
});

function dataReferenciaCompetencia(competencia: string) {
  const [mes, ano] = competencia.split("/").map(Number);
  if (!mes || !ano) return null;
  return new Date(ano, mes - 1, 1);
}

function PvhListaPage() {
  const acaoSearch = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const podeCriar = hasRole(roles, "acp") || hasRole(roles, "admin");
  const podeExcluir = hasRole(roles, "admin");
  const [open, setOpen] = useState(false);
  const [competenciaExcluir, setCompetenciaExcluir] = useState<{
    id: string;
    competencia: string;
  } | null>(null);
  const [form, setForm] = useState({
    competencia: "",
    prestadores: [] as string[],
  });

  const prestadores = useQuery({
    queryKey: ["pvh-prestadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestadores")
        .select("id,nome_instituicao,status")
        .eq("status", "ativo")
        .order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
  });

  const configuracoes = useQuery({
    queryKey: ["pvh_prestador_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_prestador_config")
        .select("*")
        .eq("ativo", true)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const normativas = useQuery({
    queryKey: ["pvh_normativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_normativas")
        .select("*")
        .eq("ativa", true)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const competencias = useQuery({
    queryKey: ["pvh_competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select("*,pvh_participantes(id,prestador_id,valor_estadual,valor_municipal,valor_pago,notificar_email,exige_prestacao_contas)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const configsValidas = useMemo(() => {
    const ref = dataReferenciaCompetencia(form.competencia) ?? new Date();
    const iso = ref.toISOString().slice(0, 10);
    const porPrestador = new Map<string, any>();

    for (const cfg of configuracoes.data ?? []) {
      if (cfg.vigencia_inicio > iso) continue;
      if (cfg.vigencia_fim && cfg.vigencia_fim < iso) continue;
      if (!porPrestador.has(cfg.prestador_id)) porPrestador.set(cfg.prestador_id, cfg);
    }
    return porPrestador;
  }, [configuracoes.data, form.competencia]);

  const prestadoresElegiveis = useMemo(
    () =>
      (prestadores.data ?? []).filter((prestador) => configsValidas.has(prestador.id)),
    [prestadores.data, configsValidas],
  );

  const lista = useMemo(
    () =>
      filtrarPelaAcao([...(competencias.data ?? [])].sort((a, b) => {
        const encerradaA = a.status === "encerrada" ? 1 : 0;
        const encerradaB = b.status === "encerrada" ? 1 : 0;
        if (encerradaA !== encerradaB) return encerradaA - encerradaB;
        const etapaA = etapaAtualPvh(a.etapas_concluidas as Record<string, boolean>, a.status);
        const etapaB = etapaAtualPvh(b.etapas_concluidas as Record<string, boolean>, b.status);
        if (etapaA !== etapaB) return etapaA - etapaB;
        return ordemCompetenciaPvh(b.competencia) - ordemCompetenciaPvh(a.competencia);
      }), acaoSearch),
    [competencias.data, acaoSearch.ids],
  );

  const criar = useMutation({
    mutationFn: async () => {
      if (!competenciaValidaPvh(form.competencia))
        throw new Error("Informe uma competência válida no formato MM/AAAA.");
      if (!form.prestadores.length)
        throw new Error("Selecione ao menos uma instituição configurada para o PVH.");

      const ref = dataReferenciaCompetencia(form.competencia);
      if (!ref) throw new Error("Competência inválida.");
      const refIso = ref.toISOString().slice(0, 10);
      const normativa =
        (normativas.data ?? []).find(
          (item) =>
            item.vigencia_inicio <= refIso &&
            (!item.vigencia_fim || item.vigencia_fim >= refIso),
        ) ?? null;

      const { data: auth } = await supabase.auth.getUser();
      const { data: competencia, error } = await supabase
        .from("pvh_competencias")
        .insert({
          competencia: form.competencia,
          normativa_id: normativa?.id ?? null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("Essa competência já existe no PVH.");
        throw error;
      }

      const { error: participantesError } = await supabase
        .from("pvh_participantes")
        .insert(
          form.prestadores.map((prestador_id) => ({
            competencia_id: competencia.id,
            prestador_id,
          })),
        );
      if (participantesError) throw participantesError;

      return competencia.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
      setOpen(false);
      toast.success("Competência PVH criada.");
      navigate({ to: "/pvh/$id", params: { id } });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("pvh_excluir_competencia", {
        p_comp: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
      setCompetenciaExcluir(null);
      toast.success("Competência PVH excluída.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const abrirNova = () => {
    setForm({ competencia: "", prestadores: [] });
    setOpen(true);
  };

  const carregamentoFalhou =
    competencias.isError || configuracoes.isError || prestadores.isError || normativas.isError;

  return (
    <div className="space-y-5">
      <section className="relative isolate overflow-hidden rounded-2xl border bg-primary text-primary-foreground shadow-sm">
        <img
          src={heroPvh}
          alt="Programa de Valorização dos Hospitais em Santa Catarina"
          className="pointer-events-none relative ml-auto h-auto w-full object-contain object-right md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[58%]"
          loading="eager"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 36%, hsl(var(--primary) / 0.98) 43%, hsl(var(--primary) / 0.88) 49%, hsl(var(--primary) / 0.62) 56%, hsl(var(--primary) / 0.28) 63%, transparent 72%)",
          }}
        />
        <div className="relative z-10 flex min-h-48 flex-col justify-center p-6 md:min-h-56 md:w-[58%] md:p-8">
          <Badge className="mb-3 w-fit bg-white/15 text-white hover:bg-white/20">
            Programa estadual · execução municipal
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Programa de Valorização dos Hospitais
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/90 md:text-base">
            Do ato estadual ao pagamento: competência, portaria municipal, cobertura orçamentária,
            subempenho, repasse, comunicação e encerramento com rastreabilidade.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h2 className="flex items-center gap-2 text-xl font-bold text-primary">
              <DollarSign className="h-5 w-5" />
              Competências mensais
            </h2>
            <AjudaPrimeirosPassosPvh />
          </div>
          <p className="text-sm text-muted-foreground">
            O processo-mãe do PVH é a competência mensal.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/pvh/configuracoes">
              <Settings2 className="mr-2 h-4 w-4" />
              Configurações PVH
            </Link>
          </Button>
          {podeCriar && (
            <Button onClick={abrirNova} disabled={carregamentoFalhou}>
              <Plus className="mr-2 h-4 w-4" />
              Nova competência
            </Button>
          )}
        </div>
      </div>

      {acaoSearch.alerta && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
          <span>{acaoSearch.alerta === "pvh-competencia-abrir"
            ? `Competência ${acaoSearch.competencia ?? "mensal"} ainda não cadastrada no PVH.`
            : `Ação selecionada: ${lista.length} competência(s) relacionada(s).`}</span>
          <div className="flex flex-wrap gap-2">
            {acaoSearch.alerta === "pvh-competencia-abrir" && podeCriar && (
              <Button size="sm" onClick={() => {
                setForm({ competencia: acaoSearch.competencia ?? "", prestadores: [] });
                setOpen(true);
              }}>Abrir competência pendente</Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/pvh" search={{}}>Ver todas as competências</Link>
            </Button>
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lista.length} competência(s)</CardTitle>
          <CardDescription>
            As competências são agrupadas pela etapa operacional atual. Empenhos e outras frentes
            paralelas poderão ficar liberados sem perder essa referência principal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carregamentoFalhou ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-950">
              O módulo PVH ainda não conseguiu carregar sua estrutura de dados. Aplique a migration
              da fundação do PVH antes de utilizar a tela.
            </div>
          ) : competencias.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <div className="font-medium">
              {acaoSearch.ids
                ? "Nenhuma competência do alerta foi encontrada na listagem."
                : "Nenhuma competência PVH cadastrada."}
            </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Primeiro configure as instituições; depois crie a competência que será trabalhada.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Competência</th>
                    <th>Etapa principal</th>
                    <th>Instituições</th>
                    <th>Valor estadual</th>
                    <th>Valor municipal</th>
                    <th>Pago</th>
                    <th>Status</th>
                    {podeExcluir && <th aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((competencia, index) => {
                    const etapa = etapaAtualPvh(
                      competencia.etapas_concluidas as Record<string, boolean>,
                      competencia.status,
                    );
                    const anterior =
                      index > 0
                        ? etapaAtualPvh(
                            lista[index - 1].etapas_concluidas as Record<string, boolean>,
                            lista[index - 1].status,
                          )
                        : null;
                    const participantes = competencia.pvh_participantes ?? [];
                    const totalEstadual = participantes.reduce(
                      (s, p) => s + Number(p.valor_estadual ?? 0),
                      0,
                    );
                    const totalMunicipal = participantes.reduce(
                      (s, p) => s + Number(p.valor_municipal ?? 0),
                      0,
                    );
                    const totalPago = participantes.reduce(
                      (s, p) => s + Number(p.valor_pago ?? 0),
                      0,
                    );

                    return (
                      <Fragment key={competencia.id}>
                        {etapa !== anterior && (
                          <tr className="border-y bg-muted/40">
                            <td
                              colSpan={podeExcluir ? 8 : 7}
                              className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-primary"
                            >
                              {competencia.status === "encerrada"
                                ? "Concluídas"
                                : "Etapa " + etapa + " — " + PVH_ETAPAS[etapa - 1].titulo}
                            </td>
                          </tr>
                        )}
                        <tr className="border-b hover:bg-muted/30">
                          <td className="py-3 font-semibold">
                            <Link
                              to="/pvh/$id"
                              params={{ id: competencia.id }}
                              className="text-primary hover:underline"
                            >
                              {competencia.competencia}
                            </Link>
                          </td>
                          <td>
                            {competencia.status === "encerrada"
                              ? "Encerrada"
                              : PVH_ETAPAS[etapa - 1].curto}
                          </td>
                          <td>{participantes.length}</td>
                          <td>{totalEstadual ? brl(totalEstadual) : "—"}</td>
                          <td>{totalMunicipal ? brl(totalMunicipal) : "—"}</td>
                          <td>{totalPago ? brl(totalPago) : "—"}</td>
                          <td>
                            <Badge variant={competencia.status === "encerrada" ? "secondary" : "outline"}>
                              {STATUS_PVH[competencia.status] ?? competencia.status}
                            </Badge>
                          </td>
                          {podeExcluir && (
                            <td className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                title="Excluir competência"
                                onClick={() =>
                                  setCompetenciaExcluir({
                                    id: competencia.id,
                                    competencia: competencia.competencia,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(competenciaExcluir)}
        onOpenChange={(aberto) => {
          if (!aberto && !excluir.isPending) setCompetenciaExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir competência do PVH?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir a competência{" "}
              <strong className="text-foreground">
                {competenciaExcluir?.competencia}
              </strong>{" "}
              e seus registros vinculados. O histórico de auditoria será preservado sem manter uma
              referência inválida para a competência excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!competenciaExcluir || excluir.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (competenciaExcluir) excluir.mutate(competenciaExcluir.id);
              }}
            >
              {excluir.isPending ? "Excluindo…" : "Excluir competência"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova competência PVH</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              A competência pode ser criada em modo <b>Preparação</b>. Os valores oficiais somente
              devem ser confirmados após a publicação da Portaria estadual.
            </div>
            <div>
              <label className="text-sm font-medium">Competência</label>
              <CompetenciaInput
                value={form.competencia}
                onChange={(competencia) => setForm({ ...form, competencia })}
              />
            </div>
            <div>
              <div className="text-sm font-medium">Instituições participantes</div>
              <div className="mt-1 text-xs text-muted-foreground">
                A lista mostra apenas prestadores com configuração PVH válida no mês informado.
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {prestadoresElegiveis.map((prestador) => (
                  <label
                    key={prestador.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted"
                  >
                    <Checkbox
                      checked={form.prestadores.includes(prestador.id)}
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          prestadores:
                            checked === true
                              ? [...new Set([...form.prestadores, prestador.id])]
                              : form.prestadores.filter((id) => id !== prestador.id),
                        })
                      }
                    />
                    <span className="text-sm">{prestador.nome_instituicao}</span>
                  </label>
                ))}
                {competenciaValidaPvh(form.competencia) &&
                  prestadoresElegiveis.length === 0 && (
                    <div className="p-3 text-sm text-amber-700">
                      Nenhuma instituição possui configuração PVH vigente nessa competência.
                    </div>
                  )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => criar.mutate()}
              disabled={
                !competenciaValidaPvh(form.competencia) ||
                !form.prestadores.length ||
                criar.isPending
              }
            >
              Criar e abrir competência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
