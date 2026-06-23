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
import { Switch } from "@/components/ui/switch";
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
import { SaldoBar } from "@/components/SaldoBar";
import { HELP } from "@/lib/field-help";
import { ArrowLeft, CheckCircle2, Circle, Lock, Check, AlertTriangle, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lancamentos/$id")({
  head: () => ({ meta: [{ title: "Processo de Empenho" }] }),
  component: LancamentoDetalhe,
});

const isSafeUrl = (u: any) => !!u && /^https?:\/\//i.test(String(u).trim());

// Estágios derivados dos dados (sem botão "avançar" — progressão automática).
function progresso(l: any) {
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  // Anulado só existe depois de atestar; antes disso é zero.
  const anulado = atest > 0 ? Math.max(0, solic - atest) : 0;
  const s1 = solic > 0 && isSafeUrl(l.link_solicitacao_sei) && l.revisao_aprovada === true;
  const s2 = l.status_aco === "orcamento_disponivel" && !!l.dotacao_orcamentaria && !!l.fonte_pagamento;
  const s3 = !!l.numero_empenho && isSafeUrl(l.link_empenho_sei);
  const s4 = atest > 0 && isSafeUrl(l.link_solicitacao_liberacao_sei) && l.relatorio_tecnico_ok && l.relatorio_analise_ok && l.certidoes_ok;
  const precisaAnular = s4 && anulado > 0;
  const s5 = precisaAnular ? isSafeUrl(l.link_anulacao_sei) : null;
  const flags = [s1, s2, s3, s4, ...(precisaAnular ? [s5] : [])];
  const done = flags.filter(Boolean).length;
  const total = flags.length;
  return { s1, s2, s3, s4, s5, precisaAnular, anulado, done, total, pct: Math.round((done / total) * 100), completo: done === total };
}

// Quem é o responsável agora (para placar/dashboard/notificações).
function responsavelDe(p: ReturnType<typeof progresso>): "acp" | "aco" {
  if (!p.s1) return "acp";
  if (!p.s3) return "aco";
  if (!p.s4) return "acp";
  if (p.precisaAnular && !p.s5) return "acp";
  return "acp";
}

function LancamentoDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canAcp = hasRole(roles, "acp");
  const canAco = hasRole(roles, "aco");

  const { data: lanc, isLoading } = useQuery({
    queryKey: ["lanc", id],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*), convenios(*)").eq("id", id).single()).data as any,
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
    queryFn: async () => (await supabase.from("convenios").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });

  const [f, setF] = useState<any>({});
  const [nova, setNova] = useState("");

  useEffect(() => {
    if (lanc) setF({ ...lanc });
  }, [lanc]);

  const salvar = useMutation({
    mutationFn: async (patch: any) => {
      const merged = { ...lanc, ...f, ...patch };
      // status ACO automático
      let status = merged.status_aco;
      if (merged.numero_empenho && isSafeUrl(merged.link_empenho_sei)) status = "empenhado";
      else if (merged.dotacao_orcamentaria && merged.fonte_pagamento && (status === "aguardando_indicacao" || !status)) status = "orcamento_disponivel";
      const prog = progresso({ ...merged, status_aco: status });
      const payload: any = {
        descricao: merged.descricao || null,
        parcela: merged.parcela || null,
        competencia: merged.competencia || null,
        mes_pagamento_previsto: merged.mes_pagamento_previsto || null,
        valor_solicitado: Number(merged.valor_solicitado) || 0,
        link_solicitacao_sei: merged.link_solicitacao_sei || null,
        convenio_id: merged.convenio_id || null,
        termo_aditivo_id: merged.termo_aditivo_id || null,
        revisao_aprovada: merged.revisao_aprovada ?? null,
        revisao_obs: merged.revisao_obs || null,
        dotacao_orcamentaria: merged.dotacao_orcamentaria || null,
        fonte_pagamento: merged.fonte_pagamento || null,
        status_aco: status,
        numero_empenho: merged.numero_empenho || null,
        link_empenho_sei: merged.link_empenho_sei || null,
        valor_atestado: merged.valor_atestado ? Number(merged.valor_atestado) : null,
        link_solicitacao_liberacao_sei: merged.link_solicitacao_liberacao_sei || null,
        relatorio_tecnico_ok: !!merged.relatorio_tecnico_ok,
        relatorio_analise_ok: !!merged.relatorio_analise_ok,
        certidoes_ok: !!merged.certidoes_ok,
        link_subempenho_sei: merged.link_subempenho_sei || null,
        link_programacao_pagamento_sei: merged.link_programacao_pagamento_sei || null,
        link_comprovante_pagamento_sei: merged.link_comprovante_pagamento_sei || null,
        link_solicitacao_anulacao: merged.link_solicitacao_anulacao || null,
        link_anulacao_sei: merged.link_anulacao_sei || null,
        responsavel_atual: responsavelDe(prog),
        concluido: prog.completo,
      };
      const { error } = await supabase.from("lancamentos_pagamento").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lanc", id] });
      qc.invalidateQueries({ queryKey: ["logs", id] });
      toast.success("Salvo");
    },
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

  const addNota = useMutation({
    mutationFn: async () => {
      if (!nova.trim()) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user!.id).maybeSingle();
      await supabase.from("notas_comentarios").insert({ lancamento_id: id, usuario_id: u.user?.id, usuario_nome: p?.nome ?? u.user?.email, mensagem: nova });
    },
    onSuccess: () => { setNova(""); qc.invalidateQueries({ queryKey: ["notas", id] }); },
  });

  if (isLoading || !lanc) return <div className="text-muted-foreground">Carregando…</div>;

  const prog = progresso({ ...lanc, ...f });
  const set = (patch: any) => setF({ ...f, ...patch });

  // Convênio/termo selecionados → parcelas e teto mensal
  const convSel = (convenios as any[]).find((c) => c.id === f.convenio_id);
  const taSel = (termos as any[]).find((t) => t.id === f.termo_aditivo_id);
  const totalParcelas = Number(convSel?.total_parcelas ?? 0);
  const tetoMensal = Number(taSel?.valor_total ?? convSel?.teto_mensal ?? 0);

  const respBadge = lanc.concluido
    ? <Badge className="bg-success text-success-foreground">🟢 CONCLUÍDO</Badge>
    : lanc.responsavel_atual === "aco"
      ? <Badge className="bg-aco text-aco-foreground">🟡 AÇÃO DA ACO</Badge>
      : <Badge className="bg-acp text-acp-foreground">🔵 AÇÃO DA ACP</Badge>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild><Link to="/lancamentos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>

      <Card className={`border-l-4 ${lanc.responsavel_atual === "aco" ? "border-l-aco" : "border-l-acp"}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-primary">{lanc.prestadores?.nome_instituicao ?? "Sem prestador"}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{f.descricao || lanc.descricao || "—"} · Competência {f.competencia || "—"}</p>
          </div>
          {respBadge}
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Kpi label="Solicitado" value={brl(Number(f.valor_solicitado))} />
          <Kpi label="Atestado" value={brl(Number(f.valor_atestado))} />
          <Kpi label="Anulado" value={brl(prog.anulado > 0 ? prog.anulado : 0)} />
          <Kpi label="Parcela" value={f.parcela ? `${f.parcela}${totalParcelas ? ` / ${totalParcelas}` : ""}` : "—"} />
        </CardContent>
        <CardContent className="pt-0">
          <ProgressoEtapas prog={prog} />
        </CardContent>
      </Card>

      <Tabs defaultValue="processo">
        <TabsList>
          <TabsTrigger value="processo">Processo de Empenho</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas SEI</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="notas">Notas & Comentários</TabsTrigger>
        </TabsList>

        <TabsContent value="processo" className="space-y-4">
          {/* ETAPA 1 */}
          <Etapa n={1} titulo="Solicitação de Empenho" done={prog.s1} ativa>
            {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
            <div className="text-xs text-muted-foreground mb-1">{f.descricao || "—"}{convSel ? ` · ${convSel.prestadores?.nome_instituicao ?? ""}` : ""} · Competência {f.competencia || "—"}{taSel ? ` · ${taSel.identificador}` : ""}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Parcela" help={HELP.parcela}>
                {totalParcelas > 0 ? (
                  <Select value={f.parcela || ""} onValueChange={(v) => set({ parcela: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a parcela" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: totalParcelas }, (_, i) => String(i + 1)).map((p) => <SelectItem key={p} value={p}>Parcela {p} de {totalParcelas}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input inputMode="numeric" value={f.parcela ?? ""} onChange={(e) => set({ parcela: e.target.value.replace(/\D/g, "") })} />
                )}
              </Field>
              <Field label="Mês de Pagamento (MM/AAAA)" help={HELP.mes_pagamento_previsto}><CompetenciaInput value={f.mes_pagamento_previsto ?? ""} onChange={(v) => set({ mes_pagamento_previsto: v })} /></Field>
              <Field label="Link Solicitação SEI" help={HELP.link_solicitacao_sei}><SeiLink value={f.link_solicitacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_sei: v })} /></Field>
              <Field label="Valor Solicitado" help={HELP.valor_solicitado}><CurrencyInput value={Number(f.valor_solicitado) || 0} onChange={(n) => set({ valor_solicitado: n })} /></Field>
            </div>
            {tetoMensal > 0 && <div className="mt-1"><SaldoBar usado={Number(f.valor_solicitado) || 0} teto={tetoMensal} /><p className="text-[11px] text-muted-foreground mt-0.5">Teto mensal do convênio/aditivo.</p></div>}

            <div className="rounded-lg border bg-muted/20 p-3 mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Revisão do Coordenador de Orçamentos</div>
              <div className="flex items-center gap-3">
                <Switch checked={f.revisao_aprovada === true} onCheckedChange={(v) => set({ revisao_aprovada: v })} />
                <span className="text-sm">{f.revisao_aprovada ? "Revisão aprovada" : "Aguardando aprovação da revisão"}</span>
              </div>
              <Textarea className="mt-2" placeholder="Observações / sugestões de alteração…" value={f.revisao_obs ?? ""} onChange={(e) => set({ revisao_obs: e.target.value })} />
            </div>
            <SalvarEtapa onClick={() => salvar.mutate({})} disabled={!canAcp || salvar.isPending} hint="Após aprovar a revisão, colete as assinaturas (aba Assinaturas SEI) e envie para SEFAZ.UCG.AEO." />
          </Etapa>

          {/* ETAPA 2 */}
          <Etapa n={2} titulo="Análise de Orçamento" done={prog.s2} ativa={prog.s1} bloqueada={!prog.s1}>
            {!canAco && <Aviso>Somente a ACO edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Status do Orçamento" help={HELP.status_aco}>
                <Select value={f.status_aco || "aguardando_indicacao"} onValueChange={(v) => set({ status_aco: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aguardando_indicacao">Aguardando Indicação</SelectItem>
                    <SelectItem value="aguardando_descontingenciamento">Aguardando Descontingenciamento</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div />
              <Field label="Dotação Orçamentária" help={HELP.dotacao_orcamentaria}><Input inputMode="numeric" value={f.dotacao_orcamentaria ?? ""} onChange={(e) => set({ dotacao_orcamentaria: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Fonte de Pagamento" help={HELP.fonte_pagamento}><Input inputMode="numeric" value={f.fonte_pagamento ?? ""} onChange={(e) => set({ fonte_pagamento: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ao preencher dotação e fonte, o status muda automaticamente para <b>Orçamento Disponível</b>.</p>
            <SalvarEtapa onClick={() => salvar.mutate({})} disabled={!canAco || !prog.s1 || salvar.isPending} />
          </Etapa>

          {/* ETAPA 3 */}
          <Etapa n={3} titulo="Liberação de Orçamento" done={prog.s3} ativa={prog.s2} bloqueada={!prog.s2}>
            {!canAco && <Aviso>Somente a ACO edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nº da Nota de Empenho" help={HELP.numero_empenho}><Input value={f.numero_empenho ?? ""} onChange={(e) => set({ numero_empenho: e.target.value })} /></Field>
              <Field label="Link Nota de Empenho SEI" help={HELP.link_empenho_sei}><SeiLink value={f.link_empenho_sei ?? ""} onChange={(v) => set({ link_empenho_sei: v })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Com o nº e o link da nota de empenho, o status vai para <b>Empenhado</b>.</p>
            <SalvarEtapa onClick={() => salvar.mutate({})} disabled={!canAco || !prog.s2 || salvar.isPending} />
          </Etapa>

          {/* ETAPA 4 */}
          <Etapa n={4} titulo="Liberação de Recurso" done={prog.s4} ativa={prog.s3} bloqueada={!prog.s3}>
            {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Checklist label="Relatório Técnico de Monitoramento (3 fiscais)" checked={!!f.relatorio_tecnico_ok} onChange={(v) => set({ relatorio_tecnico_ok: v })} />
              <Checklist label="Relatório de Análise (1 fiscal)" checked={!!f.relatorio_analise_ok} onChange={(v) => set({ relatorio_analise_ok: v })} />
              <Checklist label="Certidões Negativas" checked={!!f.certidoes_ok} onChange={(v) => set({ certidoes_ok: v })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Valor Atestado" help={HELP.valor_atestado}><CurrencyInput value={Number(f.valor_atestado) || 0} onChange={(n) => set({ valor_atestado: n })} /></Field>
              <Field label="Link Solicitação de Liberação de Recurso" help="Link SEI da solicitação de liberação de recurso."><SeiLink value={f.link_solicitacao_liberacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_liberacao_sei: v })} /></Field>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Acompanhamento (links SEI)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Aviso de Movimento · Subempenho"><SeiLink value={f.link_subempenho_sei ?? ""} onChange={(v) => set({ link_subempenho_sei: v })} /></Field>
                <Field label="Programação de Pagamento"><SeiLink value={f.link_programacao_pagamento_sei ?? ""} onChange={(v) => set({ link_programacao_pagamento_sei: v })} /></Field>
                <Field label="Comprovante de Pagamento"><SeiLink value={f.link_comprovante_pagamento_sei ?? ""} onChange={(v) => set({ link_comprovante_pagamento_sei: v })} /></Field>
              </div>
            </div>
            <SalvarEtapa onClick={() => salvar.mutate({})} disabled={!canAcp || !prog.s3 || salvar.isPending} hint="Colete as assinaturas e envie para SEFAZ.UAF.ADE." />
          </Etapa>

          {/* ETAPA 5 — Anulação (condicional) */}
          {prog.precisaAnular ? (
            <Etapa n={5} titulo="Anulação de Empenho" done={!!prog.s5} ativa bloqueada={false}>
              {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-3">
                Há <b>{brl(prog.anulado)}</b> a anular (Solicitado − Atestado). Solicite a anulação no SEI.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Link Solicitação de Anulação" help={HELP.link_solicitacao_anulacao}><SeiLink value={f.link_solicitacao_anulacao ?? ""} onChange={(v) => set({ link_solicitacao_anulacao: v })} /></Field>
                <Field label="Link Anulação SEI (Aviso de Movimento)" help={HELP.link_anulacao_sei}><SeiLink value={f.link_anulacao_sei ?? ""} onChange={(v) => set({ link_anulacao_sei: v })} /></Field>
              </div>
              <SalvarEtapa onClick={() => salvar.mutate({})} disabled={!canAcp || salvar.isPending} hint="Colete as assinaturas e envie para SEFAZ.UCG.AEO." />
            </Etapa>
          ) : (
            prog.s4 && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success font-medium flex items-center gap-2"><Check className="h-4 w-4" />Sem saldo a anular — processo encerrado.</div>
          )}
        </TabsContent>

        <TabsContent value="assinaturas">
          <Card>
            <CardHeader><CardTitle className="text-base">Checklist de Assinaturas SEI</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(etapaLabel).map(([etapa, label]) => {
                const items = (assinaturas as any[]).filter((a) => a.etapa === etapa);
                if (items.length === 0) return null;
                return (
                  <div key={etapa}>
                    <h3 className="font-semibold text-sm mb-2">{label}</h3>
                    <ul className="space-y-2">
                      {items.map((a: any) => (
                        <li key={a.id} className="flex items-start gap-3 p-2 rounded border bg-card">
                          <button onClick={() => toggleSign.mutate(a)} disabled={lanc.concluido} className="mt-0.5">
                            {a.assinado ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                          </button>
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{a.nome_servidor} <span className="text-muted-foreground font-normal">· {a.cargo}</span></div>
                            {a.assinado && a.assinado_em && <div className="text-xs text-success">Assinado em {dateTime(a.assinado_em)}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {(assinaturas as any[]).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma matriz de assinatura configurada quando este lançamento foi criado. Configure em <Link to="/configuracoes" className="text-primary underline">Configurações</Link>.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Linha do Tempo (Audit Trail)</CardTitle></CardHeader>
            <CardContent>
              {(logs as any[]).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
                <ol className="border-l-2 border-primary/30 ml-3 space-y-4">
                  {(logs as any[]).map((l: any) => (
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
                {(notas as any[]).map((n: any) => (
                  <li key={n.id} className="border rounded p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground">{n.usuario_nome ?? "—"} · {dateTime(n.data_hora)}</div>
                    <div className="text-sm whitespace-pre-wrap mt-1">{n.mensagem}</div>
                  </li>
                ))}
                {(notas as any[]).length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ETAPAS_NOMES = ["Solicitação", "Análise Orç.", "Liberação Orç.", "Liberação Rec.", "Anulação"];
function ProgressoEtapas({ prog }: { prog: ReturnType<typeof progresso> }) {
  const flags = [prog.s1, prog.s2, prog.s3, prog.s4, ...(prog.precisaAnular ? [prog.s5] : [])];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Progresso do processo</span>
        <span className="text-xs font-semibold text-primary">{prog.pct}%</span>
      </div>
      <div className="flex items-center">
        {flags.map((done, i) => {
          const atual = !done && flags.slice(0, i).every(Boolean);
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : atual ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`mt-1 text-[10px] text-center max-w-[80px] ${atual ? "font-semibold text-primary" : "text-muted-foreground"}`}>{ETAPAS_NOMES[i]}</span>
              </div>
              {i < flags.length - 1 && <div className={`h-0.5 flex-1 mx-1 -mt-4 rounded ${done ? "bg-success" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Etapa({ n, titulo, done, ativa, bloqueada, children }: { n: number; titulo: string; done: boolean; ativa?: boolean; bloqueada?: boolean; children: React.ReactNode }) {
  return (
    <Card className={`border-l-4 ${done ? "border-l-success" : ativa ? "border-l-primary" : "border-l-muted"} ${bloqueada ? "opacity-70" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
          Etapa {n} — {titulo}
        </CardTitle>
        {done ? <Badge className="bg-success text-success-foreground">Concluída</Badge> : bloqueada ? <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Aguardando etapa anterior</Badge> : <Badge variant="outline">Em andamento</Badge>}
      </CardHeader>
      {!bloqueada && <CardContent className="space-y-1">{children}</CardContent>}
    </Card>
  );
}

function SalvarEtapa({ onClick, disabled, hint }: { onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
      {hint ? <span className="text-xs text-muted-foreground flex items-center gap-1"><Send className="h-3 w-3" />{hint}</span> : <span />}
      <Button onClick={onClick} disabled={disabled}>Salvar etapa</Button>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />{children}</div>;
}

function Checklist({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors ${checked ? "border-success/40 bg-success/10" : "hover:bg-accent/40"}`}>
      {checked ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <span>{label}</span>
    </button>
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
