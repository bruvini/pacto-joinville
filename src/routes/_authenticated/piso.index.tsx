import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  etapasVisiveisPiso,
  numeroVisualEtapaPiso,
} from "@/lib/piso/etapas";
import { brl } from "@/lib/format";
import { filtrarPelaAcao, validarBuscaAcao } from "@/lib/dashboard/acoes-navegacao";
import {
  filtrarProcessosPiso, grupoProcessoPiso, resumoListagemPiso, historicoPendentePiso,
  type ProcessoResumoPiso,
} from "@/lib/piso/listagem";
import heroPiso from "@/assets/piso-enfermagem-hero.png";
import { conflitoParcelaPiso, exercicioDaCompetencia, identidadeParcelaPiso,
  parcelaPisoValida, rotuloParcelaPiso, type TipoParcelaPiso } from "@/lib/piso/parcelas";

export const Route = createFileRoute("/_authenticated/piso/")({
  validateSearch: validarBuscaAcao,
  head: () => ({
    meta: [
      { title: "Piso da Enfermagem — Competências" },
      { name: "description", content: "Parcelas mensais e 13ª da assistência financeira complementar." },
    ],
  }),
  component: PisoLista,
});

function PisoLista() {
  const acaoSearch = Route.useSearch();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { roles } = useAuth();
  const podeCriar = hasRole(roles, "acp");
  const podeExcluir = hasRole(roles, "admin");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");
  const [filtroAtencao, setFiltroAtencao] = useState("todos");
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [edicao, setEdicao] = useState<any | null>(null);
  const [form, setForm] = useState({
    competencia: "", tipo_parcela: "mensal" as TipoParcelaPiso,
    prestadores: [] as string[],
  });
  // O exercício é SEMPRE derivado de MM/AAAA: não manter estado duplicado.
  const novaParcela = identidadeParcelaPiso(form);
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

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["piso_competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piso_competencias")
        .select("*, piso_participantes(id, prestador_id, situacao, sem_elegiveis, valor_devido, data_retorno, piso_obrigacoes(id, data_pagamento, valor_pago))");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = useMemo(() => {
    const nomes = Object.fromEntries(
      (prestadoresQuery.data ?? []).map(p => [p.id, p.nome_instituicao]),
    );
    return filtrarPelaAcao(filtrarProcessosPiso(data as unknown as ProcessoResumoPiso[], {
      texto: busca,
      tipo: filtroTipo,
      exercicio: filtroAno,
      etapa: filtroEtapa,
      prestador: filtroInstituicao,
      atencao: filtroAtencao,
    }, nomes), acaoSearch);
  }, [data, busca, filtroTipo, filtroAno, filtroEtapa, filtroInstituicao,
      filtroAtencao, prestadoresQuery.data, acaoSearch.ids]);

  const filtrosAtivos = Boolean(
    busca.trim() || filtroEtapa !== "todos" || filtroAtencao !== "todos" ||
    filtroTipo !== "todos" || filtroAno !== "todos" || filtroInstituicao !== "todos",
  );

  const limparFiltros = () => {
    setBusca("");
    setFiltroEtapa("todos");
    setFiltroAtencao("todos");
    setFiltroTipo("todos");
    setFiltroAno("todos");
    setFiltroInstituicao("todos");
  };

  const criar = useMutation({
    mutationFn: async () => {
      const motivo = parcelaPisoValida(novaParcela);
      if (motivo) throw new Error(motivo);
      if (conflitoParcelaPiso(data as any[], novaParcela))
        throw new Error("Já existe parcela desse tipo para o período ou exercício.");
      const { data: u } = await supabase.auth.getUser();
      // Evita sombrear a lista "data" da query. Essa colisão gerava
      // ReferenceError antes mesmo de chegar ao INSERT no Supabase.
      const { data: competenciaCriada, error } = await supabase
        .from("piso_competencias")
        .insert({
          competencia: novaParcela.competencia,
          tipo_parcela: novaParcela.tipo_parcela,
          exercicio_referencia: novaParcela.exercicio_referencia,
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error.code === "23505" ? new Error("Já existe uma parcela desse tipo para a competência ou exercício.") : error;
      if (form.prestadores.length) {
        const { error: participantesError } = await supabase
          .from("piso_participantes")
          .insert(
            form.prestadores.map((prestador_id) => ({ competencia_id: competenciaCriada.id, prestador_id })),
          );
        if (participantesError) throw participantesError;
      }
      return competenciaCriada.id as string;
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
              setForm({ competencia: "", tipo_parcela: "mensal", prestadores: [] });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova competência
          </Button>
        )}
      </div>

      {acaoSearch.alerta && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
          <span>
            Ação selecionada no dashboard: {acaoSearch.ids
              ? `${lista.length} competência(s) relacionada(s) à pendência.`
              : "consulte a lista para regularização."}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/piso" search={{}}>Ver todas as competências</Link>
          </Button>
        </div>
      )}
      <Card>
        <CardHeader className="space-y-0 gap-3">
          <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <CardTitle className="text-base">
              {lista.length} processo{lista.length === 1 ? "" : "s"}
              {filtrosAtivos && (
                <span className="ml-1 font-normal text-muted-foreground">
                  de {data.length}
                </span>
              )}
            </CardTitle>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <Input
                placeholder="Buscar mês, 13ª ou instituição"
                aria-label="Buscar por competência, parcela ou instituição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              />
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={limparFiltros}
                disabled={!filtrosAtivos}
                aria-hidden={!filtrosAtivos}
                tabIndex={filtrosAtivos ? 0 : -1}
                className={`w-[132px] shrink-0 ${filtrosAtivos ? "" : "invisible"}`}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por etapa do processo">
                <SelectValue placeholder="Etapa do processo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as etapas</SelectItem>
                <SelectItem value="historico">Histórico documental pendente</SelectItem>
                {PISO_ETAPAS.map(etapa => (
                  <SelectItem key={etapa.n} value={String(etapa.n)}>
                    {etapa.n}. {etapa.titulo}
                  </SelectItem>
                ))}
                <SelectItem value="10">Encerrados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroAtencao} onValueChange={setFiltroAtencao}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por necessidade de atenção">
                <SelectValue placeholder="Atenção necessária" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Toda a atenção</SelectItem>
                <SelectItem value="pendencias">Com atenção necessária</SelectItem>
                <SelectItem value="reconferencia">Requer reconferência</SelectItem>
                <SelectItem value="credito">Crédito FMS a conferir</SelectItem>
                <SelectItem value="pagamentos">Pagamentos a conferir</SelectItem>
                <SelectItem value="sem_alerta">Sem destaque na listagem</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroInstituicao} onValueChange={setFiltroInstituicao}
              disabled={prestadoresQuery.isError}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por instituição participante">
                <SelectValue placeholder="Instituição" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as instituições</SelectItem>
                {(prestadores as any[]).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por tipo de parcela">
                <SelectValue placeholder="Parcela" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as parcelas</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="decimo_terceiro">13ª parcela</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger className="w-full sm:w-28" aria-label="Filtrar por exercício de referência">
                <SelectValue placeholder="Exercício" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Exercícios</SelectItem>
                {[...new Set((data as any[]).map(c =>
                  String(c.exercicio_referencia ?? c.competencia.slice(-4)),
                ))].sort().reverse().map(ano => (
                  <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Valores homologados, transferidos pela União, creditados no FMS e pagos às
            instituições representam etapas financeiras distintas. Atenções são sinais
            da listagem, não substituem a conferência dentro do processo.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando processos…</p>
          ) : isError ? (
            <div role="alert" className="space-y-2 py-6 text-center">
              <p className="text-sm text-destructive">
                Não foi possível carregar os processos e pagamentos do Piso.
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : lista.length === 0 ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {filtrosAtivos ? "Nenhum processo atende aos filtros selecionados." : "Nenhum processo cadastrado."}
              </p>
              {filtrosAtivos && <Button type="button" size="sm" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[890px] text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-3 pr-4">Parcela</th>
                    <th scope="col" className="pr-4">Instituições</th>
                    <th scope="col" className="pr-4">Recursos federais e FMS</th>
                    <th scope="col" className="pr-4">Pagamentos</th>
                    <th scope="col" className="pr-4">Atenção necessária</th>
                    {(podeCriar || podeExcluir) && <th scope="col" className="text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c, index) => {
                    const resumo = resumoListagemPiso(c);
                    const grupo = grupoProcessoPiso(c);
                    const historico = historicoPendentePiso(c);
                    const anterior = index > 0 ? grupoProcessoPiso(lista[index - 1]) : null;
                    const anteriorHistorico = index > 0 ? historicoPendentePiso(lista[index - 1]) : false;
                    const anteriorTipo = index > 0 ? lista[index - 1].tipo_parcela : null;
                    return (
                      <Fragment key={c.id}>
                        {(grupo !== anterior || c.tipo_parcela !== anteriorTipo || historico !== anteriorHistorico) && (
                          <tr className="border-y bg-muted/50">
                            <th scope="rowgroup" colSpan={podeCriar || podeExcluir ? 6 : 5}
                              className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                              {historico
                                ? "Histórico documental importado · etapas ainda não validadas"
                                : grupo === 10 ? "Processos encerrados"
                                : `Etapa ${numeroVisualEtapaPiso(grupo, c.tipo_parcela)} — ${etapasVisiveisPiso(c.tipo_parcela).find(e => e.n === grupo)?.titulo ?? PISO_ETAPAS[grupo - 1].titulo}${c.tipo_parcela === "decimo_terceiro" ? " · 13ª" : ""}`}
                            </th>
                          </tr>
                        )}
                        <tr className="border-b align-top last:border-0 hover:bg-muted/40">
                          <td className="py-3 pr-4 font-medium">
                            <Link to="/piso/$id" params={{ id: c.id }}
                              className="text-primary hover:underline">
                              {c.competencia}
                            </Link>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {c.tipo_parcela === "decimo_terceiro"
                                ? `13ª parcela · exercício ${c.exercicio_referencia}`
                                : historico ? "Mensal · histórico do SEI" : "Parcela mensal"}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="font-medium">{resumo.instituicoes}</span>
                            <span className="ml-1 text-xs text-muted-foreground">participantes</span>
                            {resumo.elegiveis !== resumo.instituicoes && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {resumo.instituicoes - resumo.elegiveis} sem elegíveis
                              </div>
                            )}
                            {historico ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Cargas/retornos ainda não conferidos
                              </div>
                            ) : grupo === 1 && resumo.aguardamRetorno > 0 && (
                              <div className="mt-1 text-xs text-amber-700">
                                {resumo.aguardamRetorno} aguardando retorno
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="space-y-0.5 text-xs">
                              <div><span className="text-muted-foreground">Homologado: </span>
                                <span className="font-medium">{c.valor_homologado == null ? "—" : brl(c.valor_homologado)}</span></div>
                              <div><span className="text-muted-foreground">Transferido: </span>
                                <span className="font-medium">{c.valor_transferido == null ? "—" : brl(c.valor_transferido)}</span></div>
                              <div><span className="text-muted-foreground">Crédito FMS: </span>
                                <span className="font-medium">{c.credito_fms_valor == null ? "—" : brl(c.credito_fms_valor)}</span></div>
                              {historico && c.total_publicado_municipal != null && (
                                <div className="mt-1 text-primary">
                                  <span className="text-muted-foreground">Portaria municipal: </span>
                                  <span className="font-medium">{brl(c.total_publicado_municipal)}</span>
                                </div>
                              )}
                              {historico && resumo.diferencaPortaria != null &&
                                Math.abs(resumo.diferencaPortaria) > 0.02 && (
                                <div className="text-amber-800">
                                  Divergência com CNES: {brl(Math.abs(resumo.diferencaPortaria))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            {grupo < 5 && resumo.pagamentosRegistrados === 0 ? (
                              <span className="text-xs text-muted-foreground">Ainda não registrado</span>
                            ) : (
                              <>
                                <div className="font-medium">{brl(resumo.valorPago)}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {resumo.pagamentosRegistrados} de {resumo.elegiveis} instituições
                                </div>
                                {resumo.valorPrevisto != null && (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    Previsto: {brl(resumo.valorPrevisto)}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {resumo.exigeAtencao ? (
                              <span className="inline-flex max-w-[225px] items-start gap-1.5 text-xs text-amber-800">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {resumo.atencao}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {grupo === 10 ? "—" : "Sem destaque na listagem"}
                              </span>
                            )}
                          </td>
                          {(podeCriar || podeExcluir) && (
                            <td className="whitespace-nowrap py-2 text-right">
                              {podeCriar && (
                                <Button size="icon" variant="ghost" title="Editar competência"
                                  aria-label={`Editar ${c.competencia}`}
                                  onClick={() => setEdicao({
                                    id: c.id,
                                    competencia: c.competencia,
                                    tipo_parcela: c.tipo_parcela ?? "mensal",
                                    exercicio_referencia: c.exercicio_referencia ?? Number(c.competencia.slice(-4)),
                                    memoria_processada: c.tipo_parcela === "decimo_terceiro" &&
                                      (c as any).investsus_resumo?.origem_calculo === "afc13_cnes",
                                    prestadores: (c.piso_participantes ?? []).map(p => p.prestador_id),
                                    participantesAtuais: c.piso_participantes ?? [],
                                  })}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {podeExcluir && (
                                <Button size="icon" variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  title="Excluir competência"
                                  aria-label={`Excluir ${c.competencia}`}
                                  onClick={() => confirm(
                                    `Excluir ${rotuloParcelaPiso({ ...c, tipo_parcela: c.tipo_parcela ?? undefined, exercicio_referencia: c.exercicio_referencia ?? undefined })}? Esta ação remove seus dados vinculados.`,
                                  ) && excluir.mutate(c.id)}>
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
            </div>
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
                onChange={(v) => setForm((atual) => ({ ...atual, competencia: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de parcela</Label>
              <Select value={form.tipo_parcela} onValueChange={(v) =>
                setForm((atual) => ({ ...atual, tipo_parcela: v as TipoParcelaPiso }))
              }>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="decimo_terceiro">13ª parcela anual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.tipo_parcela === "decimo_terceiro"
                  ? `13ª parcela do exercício ${exercicioDaCompetencia(form.competencia) ?? "a informar"}, definido automaticamente pela competência. Uma 13ª por ano.`
                  : "Parcela mensal, uma por competência. Os valores não são copiados."}
              </p>
            </div>
            {conflitoParcelaPiso(data as any[], novaParcela) && (
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
                Boolean(parcelaPisoValida(novaParcela)) ||
                conflitoParcelaPiso(data as any[], novaParcela) ||
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
