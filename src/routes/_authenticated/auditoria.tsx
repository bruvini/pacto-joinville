import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkValido as isSafeUrl } from "@/lib/sei";
import { derivarAnulacoes, derivarAnulacoesPiso } from "@/lib/anulacoes";
import {
  correspondeContratoAnulacao, filtrarAnulacoes, opcoesContratoAnulacoes,
} from "@/lib/anulacoes-filtros";
import { HelpTip } from "@/components/HelpTip";
import { LimparFiltrosButton } from "@/components/LimparFiltrosButton";
import { brl } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { gerarRelatorioPrestacaoContas } from "@/lib/relatorio";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Link2Off, ShieldCheck, Filter, FileText, FileDown, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { situacao?: string; ids?: string } => ({
    situacao: search.situacao as string | undefined,
    ids: search.ids as string | undefined,
  }),
  head: () => ({ meta: [{ title: "Auditoria de Anulações — SMS Joinville" }] }),
  component: Auditoria,
});

const anoAtual = new Date().getFullYear();

function Auditoria() {
  const { profile } = useAuth();
  const search = Route.useSearch();
  const [filtros, setFiltros] = useState({
    prestador: "all",
    contrato: "all",
    mes: "",
    situacao: search.situacao ?? "all",
  });
  const [idsFiltro, setIdsFiltro] = useState<string[]>(
    () => String(search.ids ?? "").split(",").filter(Boolean),
  );

  useEffect(() => {
    setFiltros((atual) => ({
      ...atual,
      situacao: search.situacao ?? atual.situacao,
    }));
    setIdsFiltro(String(search.ids ?? "").split(",").filter(Boolean));
  }, [search.situacao, search.ids]);

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("id, objeto, prestador_id, numero_processo_sei_mae").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: lancs = [] } = useQuery({
    queryKey: ["auditoria-lancs"],
    queryFn: async () =>
      (await supabase
        .from("lancamentos_pagamento")
        .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae, objeto)")
        .order("competencia", { ascending: false })).data ?? [],
  });

  // O Piso usa obrigação financeira por instituição, não o lançamento de convênio.
  const { data: competenciasPiso = [] } = useQuery({
    queryKey: ["auditoria-anulacoes-piso"],
    queryFn: async () => {
      const { data, error } = await supabase.from("piso_competencias")
        .select("id,competencia,processo_sei,piso_participantes(prestador_id,prestadores(nome_instituicao),piso_obrigacoes(id,valor_empenhado,valor_a_liquidar,valor_anulado))");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: docsPiso = [] } = useQuery({
    queryKey: ["auditoria-anulacoes-piso-docs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("piso_documentos")
        .select("obrigacao_id,tipo,numero_sei,link_sei,data_documento")
        .in("tipo", ["solicitacao_anulacao", "aviso_anulacao"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const anulacoes = useMemo(
    () => [
      ...derivarAnulacoes(lancs as any[]),
      ...derivarAnulacoesPiso(competenciasPiso, docsPiso),
    ],
    [lancs, competenciasPiso, docsPiso],
  );

  // Opções dinâmicas evitam contratos alheios à instituição escolhida.
  // "Piso da Enfermagem" é selecionável mesmo sem convenio_id.
  const contratosOpcoes = useMemo(
    () => opcoesContratoAnulacoes(anulacoes, convenios as any[], filtros.prestador),
    [anulacoes, convenios, filtros.prestador],
  );
  const instituicoesOpcoes = useMemo(() => {
    const ids = new Set(
      anulacoes
        .filter((registro) => correspondeContratoAnulacao(registro, filtros.contrato))
        .map((registro) => registro.prestador_id),
    );
    return (prestadores as any[]).filter((p) => ids.has(p.id));
  }, [anulacoes, prestadores, filtros.contrato]);

  const [ordemConv, setOrdemConv] = useState<"asc" | "desc" | null>(null);
  const cicloOrdemConv = () => setOrdemConv((o) => (o === null ? "asc" : o === "asc" ? "desc" : null));

  // O mesmo conjunto filtrado alimenta tabela, cartões e relatório PDF.
  const filtrados = useMemo(
    () => filtrarAnulacoes(anulacoes, filtros, idsFiltro),
    [anulacoes, filtros, idsFiltro],
  );
  const totalAnoCorrente = useMemo(
    () => filtrados
      .filter((l) => String(l.competencia ?? "").includes(`/${anoAtual}`))
      .reduce((s, l) => s + Number(l._anulado ?? 0), 0),
    [filtrados],
  );
  const linkPendentes = useMemo(
    () => filtrados.filter((l) => !isSafeUrl(l.link_anulacao_sei)).length,
    [filtrados],
  );
  const qtdAno = useMemo(
    () => filtrados.filter((l) => String(l.competencia ?? "").includes(`/${anoAtual}`)).length,
    [filtrados],
  );

  const convNome = (l: any) => l._origem === "piso" ? "Piso da Enfermagem" : (l.convenios?.objeto || l.convenios?.numero_processo_sei_mae || "—");
  const filtradosOrdenados = useMemo(() => {
    if (!ordemConv) return filtrados;
    return [...filtrados].sort((a, b) =>
      ordemConv === "asc"
        ? convNome(a).localeCompare(convNome(b), "pt-BR")
        : convNome(b).localeCompare(convNome(a), "pt-BR"),
    );
  }, [filtrados, ordemConv]);

  const emitirRelatorio = async () => {
    const instituicao = filtros.prestador === "all"
      ? "Todas as instituições"
      : ((prestadores as any[]).find((p) => p.id === filtros.prestador)?.nome_instituicao ?? "—");
    const contrato = contratosOpcoes.find((c) => c.value === filtros.contrato)?.label
      ?? "Contrato não identificado";
    const recorte = `${instituicao} · ${contrato}`;
    const linhas = filtrados.map((l) => ({
      prestador: l.prestadores?.nome_instituicao ?? "—",
      convenio: l._origem === "piso" ? "Piso da Enfermagem" : (l.convenios?.objeto ?? "—"),
      competencia: l.competencia ?? "—",
      sei: l.convenios?.numero_processo_sei_mae ?? "—",
      solicitado: Number(l._solic ?? l.valor_solicitado ?? 0),
      atestado: Number(l._atest ?? l.valor_atestado ?? 0),
      anulado: Number(l._anulado ?? l.valor_anulado ?? 0),
      temLink: isSafeUrl(l.link_anulacao_sei),
      linkSolicitacaoAnulacao: l.link_solicitacao_anulacao,
    }));
    const ok = gerarRelatorioPrestacaoContas(linhas, {
      prestador: recorte,
      mes: filtros.mes || "Todas",
      logoUrl: logoAsset.url,
      emissor: profile?.nome,
    });
    if (!ok) { toast.error("Habilite pop-ups no navegador para gerar o relatório."); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("historico_logs").insert({
      usuario_id: u.user?.id,
      usuario_nome: profile?.nome ?? u.user?.email,
      acao: "Relatório de auditoria de anulações emitido",
      detalhes: { recorte, competencia: filtros.mes || "Todas", anulacoes: linhas.length },
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Auditoria de Anulações</h1>
            <p className="text-sm text-muted-foreground">Recursos devolvidos ao orçamento da Saúde · Exercício {anoAtual}</p>
          </div>
        </div>
        <Button onClick={emitirRelatorio} className="shadow-sm">
          <FileDown className="h-4 w-4 mr-2" />Gerar Relatório de Prestação de Contas (PDF)
        </Button>
      </div>

      {/* Cards informativos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          tone="primary"
          icon={RotateCcw}
          titulo="Recursos Anulados (Ano Corrente)"
          valor={brl(totalAnoCorrente)}
          legenda={`${qtdAno} registro(s) no recorte em ${anoAtual}`}
          help={`Soma das anulações registradas cuja competência é de ${anoAtual}. No Piso, valores somente previstos não integram o total até haver confirmação da SEFAZ.`}
        />
        <StatCard
          tone={linkPendentes > 0 ? "warning" : "success"}
          icon={Link2Off}
          titulo="Anulações com Link Pendente"
          valor={String(linkPendentes)}
          legenda={linkPendentes > 0 ? "Falta anexar o link do SEI" : "Tudo documentado"}
          help="Registros do recorte sem link SEI do aviso de anulação, incluindo saldos previstos do Piso ainda sem comprovação. Não equivalem a valores efetivamente anulados."
        />
        <StatCard
          tone="aco"
          icon={FileText}
          titulo="Registros de Anulação"
          valor={String(filtrados.length)}
          legenda="Previstos e efetivados · recorte aplicado"
          help="Quantidade de registros filtrados, incluindo previsões do Piso ainda pendentes de aviso da SEFAZ."
        />
      </div>

      {/* Tabela de auditoria rápida */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Auditoria rápida · {filtrados.length} registro(s)</CardTitle>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-56">
                <Label className="text-xs flex items-center gap-1">
                  <Filter className="h-3 w-3" />Instituição
                </Label>
                <Select value={filtros.prestador} onValueChange={(v) => {
                  setIdsFiltro([]);
                  const compativel = filtros.contrato === "all" || anulacoes.some((registro) =>
                    (v === "all" || registro.prestador_id === v) &&
                    correspondeContratoAnulacao(registro, filtros.contrato));
                  setFiltros((atual) => ({
                    ...atual, prestador: v,
                    contrato: compativel ? atual.contrato : "all",
                  }));
                }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas as instituições" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as instituições</SelectItem>
                    {instituicoesOpcoes.map((p) =>
                      <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-64">
                <Label className="text-xs">Contrato / Programa</Label>
                <Select value={filtros.contrato} onValueChange={(v) => {
                  setIdsFiltro([]);
                  const compativel = filtros.prestador === "all" || anulacoes.some((registro) =>
                    registro.prestador_id === filtros.prestador &&
                    correspondeContratoAnulacao(registro, v));
                  setFiltros((atual) => ({
                    ...atual, contrato: v,
                    prestador: compativel ? atual.prestador : "all",
                  }));
                }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos os contratos e programas" /></SelectTrigger>
                  <SelectContent>
                    {contratosOpcoes.map((opcao) =>
                      <SelectItem key={opcao.value} value={opcao.value}>{opcao.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <Label className="text-xs">Situação</Label>
                <Select
                  value={filtros.situacao}
                  onValueChange={(v) => {
                    setIdsFiltro([]);
                    setFiltros({ ...filtros, situacao: v });
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as situações</SelectItem>
                    <SelectItem value="sem_link">Sem link</SelectItem>
                    <SelectItem value="apenas_solicitacao">Apenas Solicitação</SelectItem>
                    <SelectItem value="aviso_movimento">Aviso de Movimento</SelectItem>
                    <SelectItem value="anulacao_concluida">Anulação Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Label className="text-xs">Mês (competência)</Label>
                <Input className="h-9" placeholder="MM/AAAA" value={filtros.mes} onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })} />
              </div>
              <LimparFiltrosButton
                ativo={idsFiltro.length > 0 || filtros.prestador !== "all" || filtros.contrato !== "all" || filtros.mes !== "" || filtros.situacao !== "all" || ordemConv !== null}
                onClear={() => {
                  setIdsFiltro([]);
                  setFiltros({ prestador: "all", contrato: "all", mes: "", situacao: "all" });
                  setOrdemConv(null);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b bg-card">
                <tr>
                  <th className="py-3 px-4">Instituição</th>
                  <th className="px-2">
                    <button type="button" onClick={cicloOrdemConv} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground" title="Ordenar por contrato ou programa (alfabética)">
                      Contrato / Programa{ordemConv === "asc" ? " ▲" : ordemConv === "desc" ? " ▼" : ""}
                    </button>
                  </th>
                  <th className="px-2">Competência</th>
                  <th className="px-2 text-right">Solicitado</th>
                  <th className="px-2 text-right">Atestado</th>
                  <th className="px-2 text-right">Anulado</th>
                  <th className="px-4 text-center">Link Anulação</th>
                </tr>
              </thead>
              <tbody>
                {filtradosOrdenados.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="py-3 px-4 font-medium">
                      {l._origem === "piso"
                        ? <Link to="/piso/$id" params={{id:l.competencia_id}} className="text-primary hover:underline">{l.prestadores?.nome_instituicao ?? "—"}</Link>
                        : <Link to="/lancamentos/$id" params={{ id: l.id }} className="text-primary hover:underline">{l.prestadores?.nome_instituicao ?? "—"}</Link>}
                    </td>
                    <td className="px-2 text-muted-foreground">{convNome(l)}</td>
                    <td className="px-2 text-muted-foreground">{l.competencia ?? "—"}</td>
                    <td className="px-2 text-right tabular-nums">{brl(Number(l._solic ?? l.valor_solicitado))}</td>
                    <td className="px-2 text-right tabular-nums">{brl(Number(l._atest ?? l.valor_atestado))}</td>
                    <td className="px-2 text-right tabular-nums font-semibold text-primary">
                      {l._origem==="piso" && !l._anulado
                        ? <span title="Previsão ainda sem Aviso de Movimento da SEFAZ">Prev. {brl(Number(l._previsto))}</span>
                        : brl(Number(l._anulado ?? l.valor_anulado))}
                    </td>
                    <td className="px-4 text-center">
                      {isSafeUrl(l.link_anulacao_sei)
                        ? <div className="flex justify-center"><SeiButton href={l.link_anulacao_sei} label="Abrir" /></div>
                        : <Badge variant="outline" className="border-warning/50 text-warning-foreground gap-1"><Clock className="h-3 w-3" />Pendente</Badge>}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhuma anulação encontrada para o filtro atual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const TONES: Record<string, { strip: string; chip: string }> = {
  primary: { strip: "from-primary to-acp", chip: "bg-primary/10 text-primary" },
  aco: { strip: "from-aco to-primary", chip: "bg-aco/10 text-aco" },
  warning: { strip: "from-warning to-amber-400", chip: "bg-warning/15 text-warning-foreground" },
  success: { strip: "from-success to-emerald-400", chip: "bg-success/10 text-success" },
};

function StatCard({ tone, icon: Icon, titulo, valor, legenda, help }: { tone: string; icon: any; titulo: string; valor: string; legenda: string; help?: string }) {
  const t = TONES[tone] ?? TONES.primary;
  return (
    <Card className="overflow-hidden relative group">
      <div className={`h-1.5 w-full bg-gradient-to-r ${t.strip}`} />
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground max-w-[70%] flex items-center gap-1">{titulo}{help && <HelpTip text={help} />}</span>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.chip} transition-transform group-hover:scale-110`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{valor}</div>
        <div className="mt-1 text-xs text-muted-foreground">{legenda}</div>
      </CardContent>
    </Card>
  );
}
