import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { brl, dateTime, etapaLabel, statusAcoLabel } from "@/lib/format";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaField } from "@/components/inputs/CompetenciaField";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { EtapaStepper } from "@/components/EtapaStepper";
import { SaldoBar } from "@/components/SaldoBar";
import { HELP } from "@/lib/field-help";
import { ArrowLeft, CheckCircle2, Circle, Send, Lock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lancamentos/$id")({
  head: () => ({ meta: [{ title: "Detalhe do Lançamento" }] }),
  component: LancamentoDetalhe,
});

const ETAPA_RESPONSAVEL: Record<string, "acp" | "aco"> = {
  solicitacao_empenho: "aco",
  nota_empenho: "acp",
  solicitacao_anulacao: "acp",
  anulacao_executada: "aco",
};

const NEXT_ETAPA: Record<string, string | null> = {
  solicitacao_empenho: "nota_empenho",
  nota_empenho: "solicitacao_anulacao",
  solicitacao_anulacao: "anulacao_executada",
  anulacao_executada: null,
};

function LancamentoDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: lanc, isLoading } = useQuery({
    queryKey: ["lanc", id],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*), convenios(*)").eq("id", id).single()).data,
  });
  const { data: assinaturas = [] } = useQuery({
    queryKey: ["assinaturas", id],
    queryFn: async () => (await supabase.from("assinaturas_lancamento").select("*").eq("lancamento_id", id).order("etapa").order("ordem")).data ?? [],
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["logs", id],
    queryFn: async () => (await supabase.from("historico_logs").select("*").eq("lancamento_id", id).order("data_hora", { ascending: false })).data ?? [],
  });
  const { data: notas = [] } = useQuery({
    queryKey: ["notas", id],
    queryFn: async () => (await supabase.from("notas_comentarios").select("*").eq("lancamento_id", id).order("data_hora", { ascending: false })).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("id, numero_processo_sei_mae, valor_total, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });
  const { data: empenhos = [] } = useQuery({
    queryKey: ["empenhos-saldo"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("id, convenio_id, termo_aditivo_id, valor_empenho_liquido")).data ?? [],
  });

  const { roles } = useAuth();
  const canAcp = hasRole(roles, "acp"); // admin incluso
  const canAco = hasRole(roles, "aco");

  const [acp, setAcp] = useState<any>({});
  const [aco, setAco] = useState<any>({});
  const [nova, setNova] = useState("");

  useEffect(() => {
    if (lanc) {
      setAcp({
        descricao: lanc.descricao ?? "", termo_aditivo: lanc.termo_aditivo ?? "", parcela: lanc.parcela ?? "",
        competencia: lanc.competencia ?? "", mes_pagamento_previsto: lanc.mes_pagamento_previsto ?? "",
        valor_solicitado: lanc.valor_solicitado ?? 0, link_solicitacao_sei: lanc.link_solicitacao_sei ?? "",
        valor_atestado: lanc.valor_atestado ?? 0,
        link_solicitacao_anulacao: lanc.link_solicitacao_anulacao ?? "",
        convenio_id: lanc.convenio_id ?? "", termo_aditivo_id: lanc.termo_aditivo_id ?? "",
      });
      setAco({
        dotacao_orcamentaria: lanc.dotacao_orcamentaria ?? "", fonte_pagamento: lanc.fonte_pagamento ?? "",
        status_aco: lanc.status_aco ?? "aguardando_indicacao", numero_empenho: lanc.numero_empenho ?? "",
        link_empenho_sei: lanc.link_empenho_sei ?? "", valor_empenho_liquido: lanc.valor_empenho_liquido ?? 0,
        link_anulacao_sei: lanc.link_anulacao_sei ?? "",
      });
    }
  }, [lanc]);

  // A trilha de auditoria é gravada por trigger no banco (append-only),
  // não mais pelo frontend — ver migration fase0_seguranca_rbac_auditoria.

  const saveAcp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lancamentos_pagamento").update({
        ...acp,
        valor_solicitado: Number(acp.valor_solicitado),
        valor_atestado: acp.valor_atestado ? Number(acp.valor_atestado) : null,
        convenio_id: acp.convenio_id || null,
        termo_aditivo_id: acp.termo_aditivo_id || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Dados ACP salvos"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAco = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lancamentos_pagamento").update({ ...aco, valor_empenho_liquido: aco.valor_empenho_liquido ? Number(aco.valor_empenho_liquido) : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Dados ACO salvos"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSign = useMutation({
    mutationFn: async (a: any) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("assinaturas_lancamento").update({
        assinado: !a.assinado,
        assinado_em: !a.assinado ? new Date().toISOString() : null,
        assinado_por: !a.assinado ? u.user?.id : null,
      }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); },
  });

  const avancarEtapa = useMutation({
    mutationFn: async () => {
      if (!lanc) return;
      const etapaAtuais = assinaturas.filter((a: any) => a.etapa === lanc.etapa_atual);
      const todasAssinadas = etapaAtuais.length > 0 && etapaAtuais.every((a: any) => a.assinado);
      if (!todasAssinadas) throw new Error("Todas as assinaturas da etapa atual devem estar marcadas.");
      const proxima = NEXT_ETAPA[lanc.etapa_atual];
      if (!proxima) {
        await supabase.from("lancamentos_pagamento").update({ concluido: true }).eq("id", id);
        await supabase.from("notificacoes_log").insert({ lancamento_id: id, tipo: "conclusao", assunto: "Processo concluído", destinatario: "ACP/ACO", mensagem: `Processo ${lanc.descricao ?? id} concluído.` });
        return;
      }
      const novoResp = ETAPA_RESPONSAVEL[proxima];
      await supabase.from("lancamentos_pagamento").update({ etapa_atual: proxima as any, responsavel_atual: novoResp }).eq("id", id);
      await supabase.from("notificacoes_log").insert({
        lancamento_id: id, tipo: "mudanca_etapa",
        assunto: `Processo avançou para ${etapaLabel[proxima]}`,
        destinatario: novoResp.toUpperCase(),
        mensagem: `O processo está agora sob responsabilidade da ${novoResp.toUpperCase()}.`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lanc", id] });
      qc.invalidateQueries({ queryKey: ["logs", id] });
      toast.success("Etapa avançada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addNota = useMutation({
    mutationFn: async () => {
      if (!nova.trim()) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user!.id).maybeSingle();
      await supabase.from("notas_comentarios").insert({
        lancamento_id: id, usuario_id: u.user?.id, usuario_nome: p?.nome ?? u.user?.email, mensagem: nova,
      });
    },
    onSuccess: () => { setNova(""); qc.invalidateQueries({ queryKey: ["notas", id] }); },
  });

  if (isLoading || !lanc) return <div className="text-muted-foreground">Carregando…</div>;

  const etapaAssinaturas = assinaturas.filter((a: any) => a.etapa === lanc.etapa_atual);
  const podeAvancar = etapaAssinaturas.length > 0 && etapaAssinaturas.every((a: any) => a.assinado);

  // Cálculos e validações em tempo real
  const valSolic = Number(acp.valor_solicitado) || 0;
  const valAtest = Number(acp.valor_atestado) || 0;
  const valEmp = Number(aco.valor_empenho_liquido) || 0;
  const anuladoPreview = valSolic - valAtest;
  const empenhoExcede = valSolic > 0 && valEmp > valSolic;

  // Vínculo e saldo (termo aditivo tem prioridade sobre o convênio mãe)
  const tasDoConvenio = (termos as any[]).filter((t) => t.convenio_id === acp.convenio_id);
  const taSel = (termos as any[]).find((t) => t.id === acp.termo_aditivo_id);
  const convSel = (convenios as any[]).find((c) => c.id === acp.convenio_id);
  let saldoTeto = 0, saldoUsado = 0;
  if (taSel) {
    saldoTeto = Number(taSel.valor_total ?? 0);
    saldoUsado = (empenhos as any[]).filter((e) => e.termo_aditivo_id === acp.termo_aditivo_id).reduce((s, e) => s + Number(e.valor_empenho_liquido ?? 0), 0);
  } else if (convSel) {
    saldoTeto = Number(convSel.valor_total ?? 0);
    saldoUsado = (empenhos as any[]).filter((e) => e.convenio_id === acp.convenio_id && !e.termo_aditivo_id).reduce((s, e) => s + Number(e.valor_empenho_liquido ?? 0), 0);
  }
  const respBadge = lanc.responsavel_atual === "acp"
    ? <Badge className="bg-acp text-acp-foreground">🔵 AGUARDANDO AÇÃO DA ACP</Badge>
    : <Badge className="bg-aco text-aco-foreground">🟡 AGUARDANDO AÇÃO DA ACO</Badge>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/lancamentos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
      </div>

      <Card className={`border-l-4 ${lanc.responsavel_atual === "acp" ? "border-l-acp" : "border-l-aco"}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-primary">{lanc.prestadores?.nome_instituicao ?? "Sem prestador"}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {lanc.descricao ?? "—"} · Competência {lanc.competencia ?? "—"}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {lanc.concluido ? <Badge className="bg-success text-success-foreground">🟢 CONCLUÍDO</Badge> : respBadge}
            <Badge variant="outline">{etapaLabel[lanc.etapa_atual]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Kpi label="Solicitado" value={brl(Number(lanc.valor_solicitado))} />
          <Kpi label="Atestado" value={brl(Number(lanc.valor_atestado))} />
          <Kpi label="Anulado" value={brl(Number(lanc.valor_anulado))} />
          <Kpi label="Empenho Líquido" value={brl(Number(lanc.valor_empenho_liquido))} />
        </CardContent>
        <CardContent className="pt-0">
          <EtapaStepper etapaAtual={lanc.etapa_atual} concluido={lanc.concluido} />
        </CardContent>
      </Card>

      <Tabs defaultValue="acp">
        <TabsList>
          <TabsTrigger value="acp">Dados ACP</TabsTrigger>
          <TabsTrigger value="aco">Dados ACO</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas SEI</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="notas">Notas & Comentários</TabsTrigger>
        </TabsList>

        <TabsContent value="acp">
          <Card className="border-l-4 border-l-acp">
            <CardHeader><CardTitle className="text-acp text-base">Painel ACP — Convênios e Parcerias</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Descrição" help={HELP.descricao}><Input value={acp.descricao} onChange={(e) => setAcp({ ...acp, descricao: e.target.value })} /></Field>
              <Field label="Parcela" help={HELP.parcela}><Input inputMode="numeric" value={acp.parcela} onChange={(e) => setAcp({ ...acp, parcela: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Competência(s) MM/AAAA" help={HELP.competencia}><CompetenciaField value={acp.competencia} onChange={(v) => setAcp({ ...acp, competencia: v })} /></Field>
              <Field label="Mês Pagamento Previsto (MM/AAAA)" help={HELP.mes_pagamento_previsto}><CompetenciaInput value={acp.mes_pagamento_previsto} onChange={(v) => setAcp({ ...acp, mes_pagamento_previsto: v })} /></Field>
              <Field label="Valor Solicitado" help={HELP.valor_solicitado}><CurrencyInput value={valSolic} onChange={(n) => setAcp({ ...acp, valor_solicitado: n })} /></Field>
              <Field label="Link Solicitação SEI" help={HELP.link_solicitacao_sei}><SeiLink value={acp.link_solicitacao_sei} onChange={(v) => setAcp({ ...acp, link_solicitacao_sei: v })} /></Field>
              <Field label="Valor Atestado" help={HELP.valor_atestado}><CurrencyInput value={valAtest} onChange={(n) => setAcp({ ...acp, valor_atestado: n })} /></Field>
              <Field label="Valor Anulado (calculado)" help={HELP.valor_anulado}>
                <div className="flex items-center gap-2 h-9">
                  <span className="text-sm font-semibold tabular-nums">{brl(anuladoPreview)}</span>
                  {anuladoPreview > 0 && <Badge className="bg-warning/20 text-warning-foreground border border-warning/40">Recurso a devolver</Badge>}
                </div>
              </Field>
              <Field label="Link Solicitação de Anulação" help={HELP.link_solicitacao_anulacao}><SeiLink value={acp.link_solicitacao_anulacao} onChange={(v) => setAcp({ ...acp, link_solicitacao_anulacao: v })} /></Field>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vínculo &amp; Auditoria de Saldo</div>
                <Field label="Convênio" help="Vincule ao convênio mãe para auditar o saldo do empenho.">
                  <Select value={acp.convenio_id || "none"} onValueChange={(v) => setAcp({ ...acp, convenio_id: v === "none" ? "" : v, termo_aditivo_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo</SelectItem>
                      {(convenios as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.prestadores?.nome_instituicao ?? "—"} · {c.numero_processo_sei_mae ?? "—"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Termo Aditivo" help="Cada termo aditivo tem teto próprio. A soma dos empenhos não pode ultrapassá-lo.">
                  <Select value={acp.termo_aditivo_id || "none"} onValueChange={(v) => setAcp({ ...acp, termo_aditivo_id: v === "none" ? "" : v })} disabled={!acp.convenio_id}>
                    <SelectTrigger><SelectValue placeholder={acp.convenio_id ? "Convênio mãe (sem aditivo)" : "Selecione um convênio"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Convênio mãe (sem aditivo)</SelectItem>
                      {tasDoConvenio.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.identificador}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {saldoTeto > 0 && <div className="md:col-span-2"><SaldoBar usado={saldoUsado} teto={saldoTeto} /></div>}
              </div>

              <div className="md:col-span-2 flex justify-end items-center gap-3">
                {!canAcp && <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Somente a ACP pode editar estes campos</span>}
                <Button className="bg-acp hover:bg-acp/90" onClick={() => saveAcp.mutate()} disabled={saveAcp.isPending || !canAcp}>Salvar dados ACP</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aco">
          <Card className="border-l-4 border-l-aco">
            <CardHeader><CardTitle className="text-aco text-base">Painel ACO — Área de Contratos</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Dotação Orçamentária" help={HELP.dotacao_orcamentaria}><Input inputMode="numeric" value={aco.dotacao_orcamentaria} onChange={(e) => setAco({ ...aco, dotacao_orcamentaria: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Fonte de Pagamento" help={HELP.fonte_pagamento}><Input inputMode="numeric" value={aco.fonte_pagamento} onChange={(e) => setAco({ ...aco, fonte_pagamento: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Status ACO" help={HELP.status_aco}>
                <Select value={aco.status_aco} onValueChange={(v) => setAco({ ...aco, status_aco: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusAcoLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nº da Nota de Empenho" help={HELP.numero_empenho}><Input value={aco.numero_empenho} onChange={(e) => setAco({ ...aco, numero_empenho: e.target.value })} /></Field>
              <Field label="Link Nota de Empenho SEI" help={HELP.link_empenho_sei}><SeiLink value={aco.link_empenho_sei} onChange={(v) => setAco({ ...aco, link_empenho_sei: v })} /></Field>
              <Field label="Valor Empenho Líquido" help={HELP.valor_empenho_liquido}>
                <CurrencyInput value={valEmp} onChange={(n) => setAco({ ...aco, valor_empenho_liquido: n })} invalid={empenhoExcede} />
                {empenhoExcede && (
                  <p className="mt-1 text-xs font-medium text-destructive flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    ⚠️ Erro de digitação: O valor do empenho líquido não pode exceder o valor solicitado pela ACP ({brl(valSolic)}).
                  </p>
                )}
              </Field>
              <Field label="Link Nota de Anulação SEI" help={HELP.link_anulacao_sei}><SeiLink value={aco.link_anulacao_sei} onChange={(v) => setAco({ ...aco, link_anulacao_sei: v })} /></Field>
              <div className="md:col-span-2 flex justify-end items-center gap-3">
                {!canAco && <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Somente a ACO pode editar estes campos</span>}
                <Button className="bg-aco hover:bg-aco/90" onClick={() => saveAco.mutate()} disabled={saveAco.isPending || !canAco || empenhoExcede}>Salvar dados ACO</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Checklist de Assinaturas SEI</CardTitle>
              {!lanc.concluido && (
                <Button onClick={() => avancarEtapa.mutate()} disabled={!podeAvancar} className="bg-success hover:bg-success/90">
                  <Send className="h-4 w-4 mr-2" />Avançar etapa
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(etapaLabel).map(([etapa, label]) => {
                const items = assinaturas.filter((a: any) => a.etapa === etapa);
                if (items.length === 0) return null;
                const isAtual = lanc.etapa_atual === etapa;
                return (
                  <div key={etapa} className={isAtual ? "border-l-4 border-primary pl-3" : ""}>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      {label} {isAtual && <Badge>Etapa atual</Badge>}
                    </h3>
                    <ul className="space-y-2">
                      {items.map((a: any) => (
                        <li key={a.id} className="flex items-start gap-3 p-2 rounded border bg-card">
                          <button onClick={() => toggleSign.mutate(a)} disabled={lanc.concluido} className="mt-0.5">
                            {a.assinado ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                          </button>
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{a.nome_servidor} <span className="text-muted-foreground font-normal">· {a.cargo}</span></div>
                            <div className="text-xs text-muted-foreground">SEI: {a.codigo_sei}</div>
                            {a.assinado && a.assinado_em && (
                              <div className="text-xs text-success">Assinado em {dateTime(a.assinado_em)}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {assinaturas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma matriz de assinatura configurada quando este lançamento foi criado. Configure em <Link to="/configuracoes" className="text-primary underline">Configurações</Link> e crie um novo lançamento.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Linha do Tempo (Audit Trail)</CardTitle></CardHeader>
            <CardContent>
              {logs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
                <ol className="border-l-2 border-primary/30 ml-3 space-y-4">
                  {logs.map((l: any) => (
                    <li key={l.id} className="ml-4 relative">
                      <span className="absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full bg-primary" />
                      <div className="text-xs text-muted-foreground">{dateTime(l.data_hora)} · {l.usuario_nome ?? "Sistema"}</div>
                      <div className="text-sm font-medium">{l.acao}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notas">
          <Card>
            <CardHeader><CardTitle className="text-base">Notas & Comentários (ACP ↔ ACO)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea placeholder="Escreva um comentário…" value={nova} onChange={(e) => setNova(e.target.value)} />
                <Button onClick={() => addNota.mutate()} disabled={!nova.trim()}>Enviar</Button>
              </div>
              <ul className="space-y-2">
                {notas.map((n: any) => (
                  <li key={n.id} className="border rounded p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground">{n.usuario_nome ?? "—"} · {dateTime(n.data_hora)}</div>
                    <div className="text-sm whitespace-pre-wrap mt-1">{n.mensagem}</div>
                  </li>
                ))}
                {notas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1">{label}{help && <HelpTip text={help} />}</Label>
      {children}
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div></div>;
}
