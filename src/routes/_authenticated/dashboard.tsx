import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, Tooltip as ReTooltip, Legend,
  XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";
import {
  AlertTriangle, TrendingUp, FileCheck, XCircle, Link2Off, Clock, Gauge,
  CheckCircle2, Filter, ClipboardCheck, Search, ArrowRight, Target, Wallet, BadgeCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel de Acompanhamento — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

import { linkValido as isSafeUrl } from "@/lib/sei";
import { etapaCorrenteLabel, emAtraso, vencendoEmBreve, statusCompetencia, completudeConvenio, statusParcelas } from "@/lib/etapa";
import { pagamentoLiberado, situacaoPrestacao } from "@/lib/prestacao";
import { isSetorAPC, isSetorUFI } from "@/lib/setores";
import { useAuth } from "@/hooks/useAuth";

const HELP_KPI = {
  empenhado: "Soma dos valores empenhados (valor solicitado na nota de empenho) no recorte.",
  atestado: "Soma dos valores atestados (executados) no recorte. A taxa de execução compara atestado / empenhado.",
  anulado: "Soma dos valores devolvidos ao orçamento (Solicitado − Atestado) no recorte.",
  complementar: "Soma do que falta complementar (Atestado − Solicitado, quando o atestado foi maior).",
  evolucao: "Evolução mês a mês dos valores solicitado/empenhado e atestado, pela competência do lançamento.",
};
const compKey = (c: string | null) => {
  const m = (c ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
};
const compLabel = (c: string | null) => (c ?? "").split(",")[0].trim() || "—";

function Dashboard() {
  const { profile } = useAuth();
  const [prestador, setPrestador] = useState("all");
  const [termo, setTermo] = useState("all");
  const [convFiltro, setConvFiltro] = useState("all");

  const { data: lancs = [] } = useQuery({
    queryKey: ["dash-lancs"],
    queryFn: async () =>
      (await supabase.from("lancamentos_pagamento").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios-min"],
    queryFn: async () => (await supabase.from("convenios").select("id, prestador_id, objeto, teto_mensal, total_parcelas, data_inicio_vigencia, dia_inicio_execucao, dia_fim_execucao, prazo_prestacao_contas_dias, exige_prestacao_contas, prestadores(nome_instituicao)").order("created_at")).data ?? [],
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });
  const { data: prestacoes = [] } = useQuery({
    queryKey: ["prestacoes-all"],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*")).data ?? [],
  });

  const convById = useMemo(() => Object.fromEntries((convenios as any[]).map((c) => [c.id, c])), [convenios]);
  const pcByLanc = useMemo(() => Object.fromEntries((prestacoes as any[]).map((p) => [p.lancamento_id, p])), [prestacoes]);
  const termosFiltrados = useMemo(
    () => (prestador === "all" ? (termos as any[]) : (termos as any[]).filter((t) => convById[t.convenio_id]?.prestador_id === prestador)),
    [termos, prestador, convById],
  );

  // Conjunto filtrado (recorte selecionado)
  const f = useMemo(
    () =>
      (lancs as any[]).filter((l) => {
        if (prestador !== "all" && l.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && l.convenio_id !== convFiltro) return false;
        if (termo === "none" && l.termo_aditivo_id) return false;
        if (termo !== "all" && termo !== "none" && l.termo_aditivo_id !== termo) return false;
        return true;
      }),
    [lancs, prestador, termo, convFiltro],
  );
  const conveniosOpcoes = (convenios as any[]).filter((c) => prestador === "all" || c.prestador_id === prestador);
  const convSelecionado = convFiltro !== "all" ? (convById[convFiltro] as any) : null;
  const completude = convSelecionado ? completudeConvenio(convSelecionado, lancs as any[]) : null;
  const parcelas = convSelecionado ? statusParcelas(convSelecionado, lancs as any[]) : [];

  // Helpers for parent/child checks
  const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
  const isChild = (l: any) => !!l.parent_id;

  const fSemPais = useMemo(() => f.filter((l) => !isParent(l)), [f]);
  const fSemFilhos = useMemo(() => f.filter((l) => !isChild(l)), [f]);

  const all = lancs as any[];
  const allSemPais = useMemo(() => all.filter((l) => !isParent(l)), [all]);

  // ----- KPIs financeiros (recorte) -----
  const soma = (arr: any[], k: string) => arr.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const totalEmp = soma(fSemFilhos, "valor_solicitado"); // empenhado = valor solicitado (nota de empenho)
  const totalAtest = soma(fSemPais, "valor_atestado");
  const totalAnul = (fSemPais as any[]).reduce((s, l) => s + (Number(l.valor_atestado) > 0 ? Math.max(0, Number(l.valor_solicitado ?? 0) - Number(l.valor_atestado ?? 0)) : 0), 0);
  const totalComp = (fSemPais as any[]).reduce((s, l) => s + Math.max(0, Number(l.valor_atestado ?? 0) - Number(l.valor_solicitado ?? 0)), 0);
  const taxaExec = totalEmp > 0 ? Math.round((totalAtest / totalEmp) * 100) : 0;

  // ----- Alertas (sempre sobre a base COMPLETA, para nada passar despercebido) -----
  const tetoMensalDe = (taId: string | null) => Number((termos as any[]).find((t) => t.id === taId)?.valor_total ?? 0);
  const atrasados = all.filter((l) => emAtraso(l, convById[l.convenio_id]));
  const linkPendentes = allSemPais.filter((l) => Number(l.valor_anulado) > 0 && Number(l.valor_atestado) > 0 && !isSafeUrl(l.link_anulacao_sei));
  const vencendo = allSemPais.filter((l) => vencendoEmBreve(l, convById[l.convenio_id]));
  const saldo = useMemo(() => {
    let estourado = 0, critico = 0;
    allSemPais.forEach((l) => {
      const teto = tetoMensalDe(l.termo_aditivo_id);
      if (!teto) return;
      const v = Number(l.valor_solicitado ?? 0);
      if (v > teto) estourado++;
      else if (teto > 0 && v / teto >= 0.85) critico++;
    });
    return { estourado, critico };
  }, [termos, allSemPais]);

  // ----- Prestação de contas (base completa; só convênios que exigem) -----
  const prests = useMemo(() => {
    return allSemPais.filter((l) => pagamentoLiberado(l) && convById[l.convenio_id]?.exige_prestacao_contas !== false).map((l) => {
      const pc = pcByLanc[l.id] ?? null;
      return { l, pc, sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
    });
  }, [allSemPais, convById, pcByLanc]);

  const pAtrasadas = prests.filter((r) => r.sit.nivel === "grave" && r.status !== "reprovada");
  const pVencendo = prests.filter((r) => r.sit.nivel === "alerta");
  const pAnalise = prests.filter((r) => r.status === "recebida");
  const pAguardando = prests.filter((r) => r.status === "aguardando");
  const pAprovadas = prests.filter((r) => r.status === "aprovada");
  const pReprovadas = prests.filter((r) => r.status === "reprovada");
  const pctAprovadas = prests.length ? Math.round((pAprovadas.length / prests.length) * 100) : null;
  const totalGlosas = prests.reduce((s, r) => s + Number(r.pc?.valor_glosado ?? 0), 0);
  const prestUrgentes = [...pAtrasadas, ...pVencendo].sort((a, b) => (a.sit.dias ?? 9999) - (b.sit.dias ?? 9999)).slice(0, 6);

  // ----- Ação necessária (chips clicáveis) -----
  const acoes = [
    { n: atrasados.length, grave: true, label: "processo(s) de empenho em atraso", to: "/lancamentos", icon: Clock },
    { n: pAtrasadas.length, grave: true, label: "prestação(ões) de contas atrasada(s)", to: "/prestacao-contas", icon: ClipboardCheck },
    { n: saldo.estourado, grave: true, label: "parcela(s) acima do teto mensal", to: "/lancamentos", icon: Gauge },
    { n: pReprovadas.length, grave: false, label: "prestação(ões) com pendências (glosa/reprovada)", to: "/prestacao-contas", icon: XCircle },
    { n: vencendo.length, grave: false, label: "processo(s) vencendo em ≤3 dias", to: "/lancamentos", icon: Clock },
    { n: pVencendo.length, grave: false, label: "prestação(ões) vencendo em ≤7 dias", to: "/prestacao-contas", icon: Clock },
    { n: linkPendentes.length, grave: false, label: "anulação(ões) sem link SEI", to: "/auditoria", icon: Link2Off },
    { n: saldo.critico, grave: false, label: "contrato(s) com saldo crítico (≥85%)", to: "/convenios", icon: AlertTriangle },
  ].filter((a) => a.n > 0);

  // Situação da competência atual por convênio (respeita o filtro de prestador)
  const alertasComp = (convenios as any[])
    .filter((c) => prestador === "all" || c.prestador_id === prestador)
    .map((c) => statusCompetencia({ ...c, _nome: c.prestadores?.nome_instituicao }, all))
    .filter(Boolean) as any[];

  // ----- Gráfico: evolução por competência (recorte) -----
  const lineData = useMemo(() => {
    const map = new Map<number, { key: number; comp: string; solicitado: number; atestado: number }>();
    fSemFilhos.forEach((l) => {
      const k = compKey(l.competencia);
      if (!k) return;
      
      // Se for pai, somamos os valores atestados de seus filhos na base filtrada
      let atestado = Number(l.valor_atestado ?? 0);
      const children = (lancs as any[]).filter((c) => c.parent_id === l.id);
      if (children.length > 0) {
        atestado = children.reduce((s, c) => s + Number(c.valor_atestado ?? 0), 0);
      }

      const cur = map.get(k) ?? { key: k, comp: compLabel(l.competencia), solicitado: 0, atestado: 0 };
      cur.solicitado += Number(l.valor_solicitado ?? 0);
      cur.atestado += atestado;
      map.set(k, cur);
    });
    return [...map.values()].sort((a: any, b: any) => a.key - b.key);
  }, [fSemFilhos, lancs]);

  // ----- Personalização por setor -----
  const focoAPC = isSetorAPC(profile?.setor);
  const focoUFI = isSetorUFI(profile?.setor);
  const saudacaoSetor = focoAPC ? "Visão prioritária: Prestação de Contas (APC)"
    : focoUFI ? "Visão prioritária: Financeiro (UFI)"
    : "Acompanhamento de convênios e parcerias";

  const secFinanceiro = (
    <div key="fin">
      <SectionTitle icon={Wallet} title="Financeiro do recorte" hint={`${f.length} lançamento(s) no filtro`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Empenhado" value={brl(totalEmp)} icon={FileCheck} tone="primary" help={HELP_KPI.empenhado} />
        <KpiCard title="Atestado" value={brl(totalAtest)} icon={CheckCircle2} tone="success" foot={`Execução: ${taxaExec}% do empenhado`} help={HELP_KPI.atestado} />
        <KpiCard title="Anulado (devolvido)" value={brl(totalAnul)} icon={XCircle} tone="warning" help={HELP_KPI.anulado} />
        <KpiCard title="A complementar" value={brl(totalComp)} icon={TrendingUp} tone="aco" help={HELP_KPI.complementar} />
      </div>
    </div>
  );

  const secPrestacao = (
    <div key="prest">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <SectionTitle icon={ClipboardCheck} title="Prestação de contas" hint="Base completa (independe do filtro)" noMargin />
        <Link to="/prestacao-contas" className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">Abrir página<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniKpi n={pAguardando.length} label="Aguardando prestador" icon={Clock} tone="info" to="/prestacao-contas" />
        <MiniKpi n={pVencendo.length} label="Vencendo em ≤7 dias" icon={Clock} tone={pVencendo.length ? "alerta" : "neutro"} to="/prestacao-contas" />
        <MiniKpi n={pAtrasadas.length} label="Atrasadas" icon={AlertTriangle} tone={pAtrasadas.length ? "grave" : "neutro"} to="/prestacao-contas" />
        <MiniKpi n={pAnalise.length} label="Em análise" icon={Search} tone="info" to="/prestacao-contas" />
        <MiniKpi n={pctAprovadas === null ? "—" : `${pctAprovadas}%`} label="Aprovadas" icon={BadgeCheck} tone="ok" to="/prestacao-contas" />
        <MiniKpi n={brl(totalGlosas)} label="Glosas acumuladas" icon={XCircle} tone={totalGlosas > 0 ? "alerta" : "neutro"} to="/prestacao-contas" small />
      </div>
    </div>
  );

  const secoesKpi = focoAPC ? [secPrestacao, secFinanceiro] : [secFinanceiro, secPrestacao];

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros globais */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Painel de Acompanhamento</h1>
          <p className="text-sm text-muted-foreground">{saudacaoSetor}{profile?.nome ? ` · olá, ${profile.nome.split(" ")[0]}` : ""}</p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-52">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
            <Select value={prestador} onValueChange={(v) => { setPrestador(v); setTermo("all"); setConvFiltro("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consolidado geral</SelectItem>
                {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Label className="text-xs">Convênio / Objeto</Label>
            <Select value={convFiltro} onValueChange={setConvFiltro}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os convênios</SelectItem>
                {conveniosOpcoes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label className="text-xs">Termo aditivo</Label>
            <Select value={termo} onValueChange={setTermo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="none">Sem aditivo (convênio mãe)</SelectItem>
                {termosFiltrados.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.identificador}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ===== AÇÃO NECESSÁRIA ===== */}
      {acoes.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
          <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
          <div>
            <div className="font-semibold text-success">Tudo sob controle</div>
            <div className="text-sm text-muted-foreground">Nenhum alerta financeiro, de prazo ou de prestação de contas no momento.</div>
          </div>
        </div>
      ) : (
        <div>
          <SectionTitle icon={AlertTriangle} title="Ação necessária" hint="Clique para ir direto ao item" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {acoes.map((a, i) => <AcaoChip key={i} {...a} />)}
          </div>
        </div>
      )}

      {/* ===== KPIs (ordem conforme o setor do usuário) ===== */}
      {secoesKpi}

      {/* ===== SITUAÇÃO DA COMPETÊNCIA ===== */}
      {alertasComp.length > 0 && (
        <div>
          <SectionTitle icon={Clock} title={`Situação da competência ${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`} hint="Por convênio, conforme o prazo de cada um" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{alertasComp.map((a, i) => <AlertaCompetencia key={i} {...a} />)}</div>
        </div>
      )}

      {/* ===== ACOMPANHAMENTO DO CONTRATO (convênio selecionado) ===== */}
      {convSelecionado && completude && (
        <div>
          <SectionTitle icon={Target} title="Acompanhamento do contrato" hint={convSelecionado.objeto ?? "Convênio selecionado"} />
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Completude compacta: valor + barra + resumo numa única linha */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-primary tabular-nums">{completude.taxa === null ? "—" : `${completude.taxa}%`}</span>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">completude <HelpTip text="Parcelas concluídas ÷ parcelas que já deveriam estar concluídas até hoje (não conta o 1º mês de vigência nem meses futuros). Uma parcela só conta como concluída após o clique em 'Concluir processo'." /></span>
                </div>
                <div className="flex-1 min-w-40 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${(completude.taxa ?? 0) >= 100 ? "bg-success" : (completude.taxa ?? 0) >= 60 ? "bg-primary" : "bg-warning"}`} style={{ width: `${Math.min(100, completude.taxa ?? 0)}%` }} />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{completude.concluidas} de {completude.esperadas} esperada(s) concluída(s) · {completude.total} na vigência</span>
              </div>

              {/* Grade compacta de parcelas: número + cor; detalhe no hover */}
              {parcelas.length === 0 ? (
                <div className="text-sm text-muted-foreground">Defina o nº de parcelas no cadastro do convênio para acompanhar.</div>
              ) : (
                <>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))" }}>
                    {parcelas.map((p) => <ParcelaTile key={p.num} {...p} esperada={p.num <= completude.esperadas} />)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <LegendaParcela cls="bg-success" t="Concluída" />
                    <LegendaParcela cls="bg-acp" t="Em andamento" />
                    <LegendaParcela cls="bg-destructive" t="Pendente (já deveria ter sido lançada)" />
                    <LegendaParcela cls="bg-muted-foreground/40" t="Futura / sem lançamento" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== EVOLUÇÃO + FILAS DE TRABALHO ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1">Evolução por competência <HelpTip text={HELP_KPI.evolucao} /></CardTitle></CardHeader>
          <CardContent>
            {lineData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={lineData} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gEmp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gAt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--success)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="comp" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlCompact} tick={{ fontSize: 11 }} width={70} />
                  <ReTooltip formatter={(v: any) => brl(Number(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="solicitado" name="Solicitado/Empenhado" stroke="var(--primary)" fill="url(#gEmp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="atestado" name="Atestado" stroke="var(--success)" fill="url(#gAt)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-destructive" />Prestações urgentes</CardTitle></CardHeader>
          <CardContent>
            {prestUrgentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma prestação de contas atrasada ou próxima do prazo.</p>
            ) : (
              <ul className="space-y-2">
                {prestUrgentes.map(({ l, sit }) => (
                  <li key={l.id} className={`flex justify-between items-center gap-2 text-sm border-l-4 px-3 py-2 rounded ${sit.nivel === "grave" ? "border-destructive bg-destructive/5" : "border-warning bg-warning/10"}`}>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.prestadores?.nome_instituicao ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">Comp. {compLabel(l.competencia)}{sit.prazo ? ` · prazo ${sit.prazo.toLocaleDateString("pt-BR")}` : ""}</div>
                    </div>
                    <Badge variant={sit.nivel === "grave" ? "destructive" : "outline"} className="shrink-0 whitespace-nowrap">{sit.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/prestacao-contas" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todas<ArrowRight className="h-3.5 w-3.5" /></Link>
          </CardContent>
        </Card>
      </div>

      {/* ===== PROCESSOS EM ATRASO + ÚLTIMOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-destructive" />Processos em atraso</CardTitle></CardHeader>
          <CardContent>
            {atrasados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum processo em atraso.</p>
            ) : (
              <ul className="space-y-2">
                {atrasados.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex justify-between items-center text-sm border-l-4 border-destructive bg-destructive/5 px-3 py-2 rounded">
                    <Link to="/lancamentos/$id" params={{ id: l.id }} className="font-medium hover:underline truncate">
                      {l.prestadores?.nome_instituicao ?? "—"} · {l.descricao ?? "Lançamento"}
                    </Link>
                    <Badge variant="destructive" className="shrink-0">{etapaCorrenteLabel(l)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Últimos lançamentos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr><th className="py-2 px-4">Prestador</th><th>Comp.</th><th>Etapa</th><th className="text-right pr-4">Empenho</th></tr>
                </thead>
                <tbody>
                  {(lancs as any[]).filter((l) => !l.parent_id).slice(0, 7).map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="py-2 px-4"><Link to="/lancamentos/$id" params={{ id: l.id }} className="hover:underline font-medium text-primary">{l.prestadores?.nome_instituicao ?? "—"}</Link></td>
                      <td className="text-muted-foreground">{compLabel(l.competencia)}</td>
                      <td><Badge variant="outline" className="text-xs">{etapaCorrenteLabel(l)}</Badge></td>
                      <td className="text-right pr-4 tabular-nums">{brl(Number(l.valor_solicitado))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint, noMargin }: { icon: any; title: string; hint?: string; noMargin?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${noMargin ? "" : "mb-3"}`}>
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function AcaoChip({ n, grave, label, to, icon: Icon }: { n: number; grave: boolean; label: string; to: string; icon: any }) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${grave ? "border-destructive/40 bg-destructive/10 hover:bg-destructive/15" : "border-warning/40 bg-warning/10 hover:bg-warning/15"}`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${grave ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm leading-tight">
        <span className={`text-lg font-bold tabular-nums mr-1 ${grave ? "text-destructive" : "text-warning-foreground"}`}>{n}</span>
        {label}
      </div>
      <ArrowRight className="h-4 w-4 ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

const NIVEL_ALERTA: Record<string, { cls: string; icon: any }> = {
  ok: { cls: "border-success/40 bg-success/10 text-success", icon: CheckCircle2 },
  info: { cls: "border-acp/40 bg-acp/10 text-acp", icon: Clock },
  alerta: { cls: "border-warning/40 bg-warning/10 text-warning-foreground", icon: AlertTriangle },
  grave: { cls: "border-destructive/40 bg-destructive/10 text-destructive", icon: AlertTriangle },
};
function AlertaCompetencia({ nivel, titulo, msg }: { nivel: string; titulo: string; msg: string }) {
  const n = NIVEL_ALERTA[nivel] ?? NIVEL_ALERTA.alerta;
  const Icon = n.icon;
  return (
    <div className={`rounded-xl border px-4 py-2.5 flex items-start gap-3 ${n.cls}`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{titulo}</div>
        <div className="text-sm text-foreground/80">{msg}</div>
      </div>
    </div>
  );
}
/** Bloquinho compacto de parcela: número + cor do status; detalhe no tooltip nativo. */
function ParcelaTile({ num, status, etapa, esperada }: { num: number; status: string; etapa: string; esperada: boolean }) {
  const cfg = status === "concluido" ? { cls: "border-success/50 bg-success/15 text-success", icon: CheckCircle2, label: "Concluída" }
    : status === "andamento" ? { cls: "border-acp/50 bg-acp/15 text-acp", icon: Clock, label: etapa || "Em andamento" }
    : esperada ? { cls: "border-destructive/50 bg-destructive/10 text-destructive", icon: AlertTriangle, label: "Pendente — já deveria ter sido lançada" }
    : { cls: "border-border bg-muted/40 text-muted-foreground", icon: Clock, label: "Sem lançamento (futura)" };
  const Icon = cfg.icon;
  return (
    <div className={`rounded-md border px-1.5 py-1 flex items-center justify-center gap-1 ${cfg.cls}`} title={`Parcela ${num} · ${cfg.label}`}>
      <span className="text-xs font-bold tabular-nums">{num}</span>
      <Icon className="h-3 w-3 shrink-0" />
    </div>
  );
}
function LegendaParcela({ cls, t }: { cls: string; t: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${cls}`} />{t}</span>;
}

const KPI_TONE: Record<string, string> = {
  acp: "from-acp to-acp/70",
  primary: "from-primary to-acp",
  success: "from-success to-emerald-400",
  warning: "from-warning to-amber-400",
};
function KpiCard({ title, value, icon: Icon, tone, foot, help }: { title: string; value: string; icon: any; tone: string; foot?: string; help?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className={`h-1.5 w-full bg-gradient-to-r ${KPI_TONE[tone] ?? KPI_TONE.primary}`} />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">{title}{help && <HelpTip text={help} />}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
        {foot && <div className="mt-1 text-[11px] text-muted-foreground">{foot}</div>}
      </CardContent>
    </Card>
  );
}

const MINI_TONE: Record<string, string> = {
  grave: "border-destructive/40 bg-destructive/10 text-destructive",
  alerta: "border-warning/40 bg-warning/10 text-warning-foreground",
  info: "border-acp/40 bg-acp/10 text-acp",
  ok: "border-success/40 bg-success/10 text-success",
  neutro: "border-border bg-muted/30 text-muted-foreground",
};
function MiniKpi({ n, label, icon: Icon, tone, to, small }: { n: number | string; label: string; icon: any; tone: string; to: string; small?: boolean }) {
  return (
    <Link to={to} className={`rounded-xl border p-3 transition-transform hover:-translate-y-0.5 ${MINI_TONE[tone]}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" />
        <span className={`font-bold tabular-nums ${small ? "text-base" : "text-2xl"}`}>{n}</span>
      </div>
      <div className="mt-1 text-xs font-semibold leading-tight">{label}</div>
    </Link>
  );
}

function Empty() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Sem dados para exibir neste recorte.</div>;
}
