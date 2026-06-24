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
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { brl, dateTime, statusAcoLabel } from "@/lib/format";
import { statusAcoEfetivo } from "@/lib/etapa";
import { agruparLogs, mudancasVisiveis, rotuloCampo, formatarValor } from "@/lib/audit";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { SaldoBar } from "@/components/SaldoBar";
import { BlocoAssinaturas, SLOTS_PADRAO, SLOTS_ETAPA1, blocoCompleto, type Slot } from "@/components/BlocoAssinaturas";
import { HELP } from "@/lib/field-help";
import { linkValido as isSafeUrl } from "@/lib/sei";
import { gerarPdfLancamento } from "@/lib/pdf-lancamento";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { ArrowLeft, Check, Lock, Send, CheckCircle2, Circle, FileDown, LockOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lancamentos/$id")({
  head: () => ({ meta: [{ title: "Processo de Empenho" }] }),
  component: LancamentoDetalhe,
});

const REL_TEC: Slot[] = [{ key: "fiscal", label: "Fiscais", cargos: ["Fiscal"], min: 3 }];
const REL_ANA: Slot[] = [{ key: "fiscal", label: "Fiscal", cargos: ["Fiscal"], min: 1 }];

function progresso(l: any, ass: any[]) {
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  const anulado = atest > 0 ? Math.max(0, solic - atest) : 0;
  const s1 = solic > 0 && isSafeUrl(l.link_solicitacao_sei) && l.revisao_aprovada === true
    && blocoCompleto(ass, "etapa1", SLOTS_ETAPA1) && !!l.sefaz_etapa1_em;
  const st = statusAcoEfetivo(l);
  const s2 = (st === "orcamento_disponivel" || st === "empenhado") && !!l.dotacao_orcamentaria && !!l.fonte_pagamento;
  const s3 = !!l.numero_empenho && isSafeUrl(l.link_empenho_sei);
  const relOk = blocoCompleto(ass, "rel_tecnico", REL_TEC) && blocoCompleto(ass, "rel_analise", REL_ANA)
    && isSafeUrl(l.link_relatorio_tecnico_sei) && isSafeUrl(l.link_relatorio_analise_sei) && isSafeUrl(l.link_certidoes_sei);
  const s4 = relOk && atest > 0 && isSafeUrl(l.link_solicitacao_liberacao_sei)
    && blocoCompleto(ass, "etapa4", SLOTS_PADRAO) && !!l.sefaz_etapa4_em;
  const precisaAnular = s4 && anulado > 0;
  const s5 = precisaAnular
    ? (isSafeUrl(l.link_solicitacao_anulacao) && isSafeUrl(l.link_anulacao_sei) && blocoCompleto(ass, "etapa5", SLOTS_PADRAO) && !!l.sefaz_etapa5_em)
    : null;
  const flags = [s1, s2, s3, s4, ...(precisaAnular ? [s5] : [])];
  const done = flags.filter(Boolean).length;
  const total = flags.length;
  return { s1, s2, s3, s4, s5, relOk, precisaAnular, anulado, done, total, pct: Math.round((done / total) * 100), completo: done === total };
}

function responsavelDe(p: ReturnType<typeof progresso>): "acp" | "aco" {
  if (!p.s1) return "acp";
  if (!p.s3) return "aco";
  return "acp";
}

function LancamentoDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { roles, profile } = useAuth();
  const canAcp = hasRole(roles, "acp");
  const canAco = hasRole(roles, "aco");
  const isAdmin = roles.includes("admin");

  const { data: lanc, isLoading } = useQuery({
    queryKey: ["lanc", id],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*), convenios(*)").eq("id", id).single()).data as any,
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
  const { data: pool = [] } = useQuery({
    queryKey: ["assinaturas_config"],
    queryFn: async () => (await supabase.from("assinaturas_config").select("*")).data ?? [],
  });
  const { data: ass = [] } = useQuery({
    queryKey: ["assinaturas_etapa", id],
    queryFn: async () => (await supabase.from("assinaturas_etapa").select("*").eq("lancamento_id", id)).data ?? [],
  });

  const [f, setF] = useState<any>({});
  const fRef = useRef<any>({});
  const loadedId = useRef<string | null>(null);
  const saveTimer = useRef<any>(null);
  const [nova, setNova] = useState("");
  // Carrega o buffer só na 1ª vez do lançamento (refetch não sobrescreve edições).
  useEffect(() => { if (lanc && loadedId.current !== lanc.id) { loadedId.current = lanc.id; fRef.current = { ...lanc }; setF({ ...lanc }); } }, [lanc]);

  const invalidarAss = () => { qc.invalidateQueries({ queryKey: ["assinaturas_etapa", id] }); };

  const salvar = useMutation({
    mutationFn: async () => {
      const merged = { ...lanc, ...fRef.current };
      const status = statusAcoEfetivo(merged);
      const prog = progresso({ ...merged, status_aco: status }, ass as any[]);
      const payload: any = {
        parcela: merged.parcela || null,
        mes_pagamento_previsto: merged.mes_pagamento_previsto || null,
        valor_solicitado: Number(merged.valor_solicitado) || 0,
        justificativa_teto: merged.justificativa_teto || null,
        link_solicitacao_sei: merged.link_solicitacao_sei || null,
        em_bloco_revisao: !!merged.em_bloco_revisao,
        revisao_aprovada: merged.revisao_aprovada ?? null,
        revisao_obs: merged.revisao_obs || null,
        sefaz_etapa1_em: merged.sefaz_etapa1_em || null,
        dotacao_orcamentaria: merged.dotacao_orcamentaria || null,
        fonte_pagamento: merged.fonte_pagamento || null,
        status_aco: status,
        numero_empenho: merged.numero_empenho || null,
        link_empenho_sei: merged.link_empenho_sei || null,
        valor_atestado: merged.valor_atestado ? Number(merged.valor_atestado) : null,
        link_relatorio_tecnico_sei: merged.link_relatorio_tecnico_sei || null,
        link_relatorio_analise_sei: merged.link_relatorio_analise_sei || null,
        link_certidoes_sei: merged.link_certidoes_sei || null,
        link_solicitacao_liberacao_sei: merged.link_solicitacao_liberacao_sei || null,
        link_subempenho_sei: merged.link_subempenho_sei || null,
        link_programacao_pagamento_sei: merged.link_programacao_pagamento_sei || null,
        link_comprovante_pagamento_sei: merged.link_comprovante_pagamento_sei || null,
        sefaz_etapa4_em: merged.sefaz_etapa4_em || null,
        link_solicitacao_anulacao: merged.link_solicitacao_anulacao || null,
        link_anulacao_sei: merged.link_anulacao_sei || null,
        sefaz_etapa5_em: merged.sefaz_etapa5_em || null,
        responsavel_atual: responsavelDe(prog),
        concluido: prog.completo && !merged.reaberto,
      };
      const { error } = await supabase.from("lancamentos_pagamento").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); },
    onError: (e: any) => toast.error(String(e.message).replace(/\d+\.\d{2}/g, (m) => brl(Number(m)))),
  });
  const agendarSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => salvar.mutate(), 800); };

  const addNota = useMutation({
    mutationFn: async () => {
      if (!nova.trim()) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user!.id).maybeSingle();
      await supabase.from("notas_comentarios").insert({ lancamento_id: id, usuario_id: u.user?.id, usuario_nome: p?.nome ?? u.user?.email, mensagem: nova });
    },
    onSuccess: () => { setNova(""); qc.invalidateQueries({ queryKey: ["notas", id] }); },
  });
  const reabrir = useMutation({
    mutationFn: async (reaberto: boolean) => {
      const { error } = await supabase.from("lancamentos_pagamento").update({ reaberto, concluido: !reaberto } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); },
    onError: (e: any) => toast.error(String(e.message).replace(/\d+\.\d{2}/g, (m) => brl(Number(m)))),
  });

  if (isLoading || !lanc) return <div className="text-muted-foreground">Carregando…</div>;

  const statusEfetivo = statusAcoEfetivo({ ...lanc, ...f });
  const prog = progresso({ ...lanc, ...f, status_aco: statusEfetivo }, ass as any[]);
  const finalizado = !!lanc.concluido;
  const editavel = !finalizado;
  const editAcp = canAcp && editavel;
  const editAco = canAco && editavel;
  // Edita o buffer e agenda autosave (bloqueado quando finalizado).
  const set = (patch: any) => { if (!editavel) return; const next = { ...fRef.current, ...patch }; fRef.current = next; setF(next); agendarSave(); };

  const convSel = (convenios as any[]).find((c) => c.id === f.convenio_id);
  const taSel = (termos as any[]).find((t) => t.id === f.termo_aditivo_id);
  const totalParcelas = Number(convSel?.total_parcelas ?? 0);
  const tetoMensal = Number(taSel?.valor_total ?? convSel?.teto_mensal ?? 0);
  // Ajuste dinâmico (Solicitado vs Atestado): A anular ou A complementar.
  const vSolic = Number(f.valor_solicitado ?? 0);
  const vAtest = Number(f.valor_atestado ?? 0);
  const ajusteLabel = vAtest > 0 && vAtest > vSolic ? "A complementar" : "A anular";
  const ajusteValor = vAtest > 0 ? Math.abs(vAtest - vSolic) : 0;
  const excedeTeto = tetoMensal > 0 && vSolic > tetoMensal;

  const respBadge = lanc.concluido
    ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />CONCLUÍDO</Badge>
    : lanc.responsavel_atual === "aco"
      ? <Badge className="bg-aco text-aco-foreground gap-1"><Circle className="h-2.5 w-2.5 fill-current" />AÇÃO DA ACO</Badge>
      : <Badge className="bg-acp text-acp-foreground gap-1"><Circle className="h-2.5 w-2.5 fill-current" />AÇÃO DA ACP</Badge>;

  const blocoProps = (bloco: string) => ({ lancamentoId: id, bloco, pool: pool as any[], assinaturas: ass as any[], onChange: invalidarAss });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/lancamentos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
        <div className="flex items-center gap-2">
          {!finalizado && <span className="text-xs text-muted-foreground">{salvar.isPending ? "Salvando…" : "Tudo salvo automaticamente"}</span>}
          <Button variant="outline" size="sm" onClick={() => { if (!gerarPdfLancamento({ lanc, ass: ass as any[], logs: logs as any[], convenio: convSel, termo: taSel, logoUrl: logoAsset.url, emissor: profile?.nome })) toast.error("Habilite pop-ups para gerar o PDF."); }}><FileDown className="h-4 w-4 mr-1.5" />Exportar PDF</Button>
          {finalizado && isAdmin && <Button variant="outline" size="sm" onClick={() => reabrir.mutate(true)}><LockOpen className="h-4 w-4 mr-1.5" />Reabrir</Button>}
          {!finalizado && lanc.reaberto && isAdmin && prog.completo && <Button size="sm" onClick={() => reabrir.mutate(false)}><Check className="h-4 w-4 mr-1.5" />Concluir novamente</Button>}
        </div>
      </div>

      {finalizado && (
        <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-success shrink-0" />
          <div className="text-sm"><b className="text-success">Processo finalizado.</b> Somente leitura.{isAdmin ? " Um administrador pode reabrir para editar." : ""}</div>
        </div>
      )}
      {!finalizado && lanc.reaberto && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm flex items-center gap-3">
          <LockOpen className="h-5 w-5 text-warning-foreground shrink-0" />Reaberto para edição. Conclua novamente quando terminar.
        </div>
      )}

      <Card className={`border-l-4 ${lanc.responsavel_atual === "aco" ? "border-l-aco" : "border-l-acp"}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-primary">{lanc.prestadores?.nome_instituicao ?? "Sem prestador"}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{f.descricao || "—"} · Competência {f.competencia || "—"}</p>
          </div>
          {respBadge}
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Kpi label="Solicitado" value={brl(Number(f.valor_solicitado))} />
          <Kpi label="Atestado" value={brl(Number(f.valor_atestado))} />
          <Kpi label={ajusteLabel} value={brl(ajusteValor)} />
          <Kpi label="Parcela" value={f.parcela ? `${f.parcela}${totalParcelas ? ` / ${totalParcelas}` : ""}` : "—"} />
        </CardContent>
        <CardContent className="pt-0"><ProgressoEtapas prog={prog} /></CardContent>
      </Card>

      <Tabs defaultValue="processo">
        <TabsList>
          <TabsTrigger value="processo">Processo de Empenho</TabsTrigger>
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
                    <SelectContent>{Array.from({ length: totalParcelas }, (_, i) => String(i + 1)).map((p) => <SelectItem key={p} value={p}>Parcela {p} de {totalParcelas}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input inputMode="numeric" value={f.parcela ?? ""} onChange={(e) => set({ parcela: e.target.value.replace(/\D/g, "") })} />}
              </Field>
              <Field label="Mês de Pagamento (MM/AAAA)" help={HELP.mes_pagamento_previsto}><CompetenciaInput value={f.mes_pagamento_previsto ?? ""} onChange={(v) => set({ mes_pagamento_previsto: v })} /></Field>
              <Field label="Link Solicitação SEI" help={HELP.link_solicitacao_sei}><SeiLink value={f.link_solicitacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_sei: v })} /></Field>
              <Field label="Valor Solicitado" help={HELP.valor_solicitado}><CurrencyInput value={Number(f.valor_solicitado) || 0} onChange={(n) => set({ valor_solicitado: n })} /></Field>
            </div>
            {tetoMensal > 0 && <div className="mt-1"><SaldoBar usado={Number(f.valor_solicitado) || 0} teto={tetoMensal} /><p className="text-[11px] text-muted-foreground mt-0.5">Teto mensal do convênio/aditivo.</p></div>}
            {excedeTeto && (
              <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <Label className="text-xs font-semibold text-warning-foreground flex items-center gap-1">Justificativa do valor acima do teto <HelpTip text="O valor solicitado excede o teto mensal. Justifique o motivo (será registrado no processo)." /></Label>
                <Textarea className="mt-1" placeholder="Explique por que o valor solicitado está acima do teto mensal…" value={f.justificativa_teto ?? ""} onChange={(e) => set({ justificativa_teto: e.target.value })} />
              </div>
            )}

            {/* Cadeia: bloco -> revisão -> assinaturas -> SEFAZ */}
            <Passo titulo="1. Colocar em bloco para revisão">
              <CheckLinha checked={!!f.em_bloco_revisao} disabled={!editAcp} onChange={(v) => set({ em_bloco_revisao: v })} label="Solicitação colocada em bloco para revisão do Coordenador de Orçamentos" />
            </Passo>

            {f.em_bloco_revisao && (
              <Passo titulo="2. Revisão do Coordenador de Orçamentos">
                <div className="flex items-center gap-3"><Switch checked={f.revisao_aprovada === true} disabled={!editAcp} onCheckedChange={(v) => set({ revisao_aprovada: v })} /><span className="text-sm">{f.revisao_aprovada ? "Revisão aprovada" : "Aguardando aprovação"}</span></div>
                <Textarea className="mt-2" placeholder="Observações / sugestões de alteração…" value={f.revisao_obs ?? ""} onChange={(e) => set({ revisao_obs: e.target.value })} />
              </Passo>
            )}

            {f.revisao_aprovada && (
              <Passo titulo="3. Assinaturas"><BlocoAssinaturas {...blocoProps("etapa1")} slots={SLOTS_ETAPA1} canEdit={editAcp} /></Passo>
            )}

            {f.revisao_aprovada && blocoCompleto(ass as any[], "etapa1", SLOTS_ETAPA1) && (
              <Passo titulo="4. Envio à SEFAZ.UCG.AEO">
                <SefazConfirm em={f.sefaz_etapa1_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa1_em: v })} />
              </Passo>
            )}
          </Etapa>

          {/* ETAPA 2 */}
          <Etapa n={2} titulo="Análise de Orçamento" done={prog.s2} ativa={prog.s1} bloqueada={!prog.s1}>
            {!canAco && <Aviso>Somente a ACO edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Status do Orçamento" help={HELP.status_aco}>
                {statusEfetivo === "orcamento_disponivel" || statusEfetivo === "empenhado" ? (
                  <div className="h-9 flex items-center"><Badge className="bg-success text-success-foreground">{statusAcoLabel[statusEfetivo]}</Badge></div>
                ) : (
                  <Select value={f.status_aco || "aguardando_indicacao"} onValueChange={(v) => set({ status_aco: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando_indicacao">Aguardando Indicação</SelectItem>
                      <SelectItem value="aguardando_descontingenciamento">Aguardando Descontingenciamento</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <div />
              <Field label="Dotação Orçamentária" help={HELP.dotacao_orcamentaria}><Input inputMode="numeric" value={f.dotacao_orcamentaria ?? ""} onChange={(e) => set({ dotacao_orcamentaria: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Fonte de Pagamento" help={HELP.fonte_pagamento}><Input inputMode="numeric" value={f.fonte_pagamento ?? ""} onChange={(e) => set({ fonte_pagamento: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ao preencher dotação e fonte, o status muda para <b>Orçamento Disponível</b>.</p>
          </Etapa>

          {/* ETAPA 3 */}
          <Etapa n={3} titulo="Liberação de Orçamento" done={prog.s3} ativa={prog.s2} bloqueada={!prog.s2}>
            {!canAco && <Aviso>Somente a ACO edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nº da Nota de Empenho" help={HELP.numero_empenho}><Input value={f.numero_empenho ?? ""} onChange={(e) => set({ numero_empenho: e.target.value })} /></Field>
              <Field label="Link Nota de Empenho SEI" help={HELP.link_empenho_sei}><SeiLink value={f.link_empenho_sei ?? ""} onChange={(v) => set({ link_empenho_sei: v })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Com o nº e o link da nota de empenho, o status vai para <b>Empenhado</b>.</p>
          </Etapa>

          {/* ETAPA 4 */}
          <Etapa n={4} titulo="Liberação de Recurso" done={prog.s4} ativa={prog.s3} bloqueada={!prog.s3}>
            {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
            <Passo titulo="1. Relatório Técnico de Monitoramento (3 fiscais)">
              <Field label="Link SEI do Relatório Técnico" help="Link do Relatório Técnico de Monitoramento no SEI. Exige a assinatura de 3 fiscais abaixo."><SeiLink value={f.link_relatorio_tecnico_sei ?? ""} onChange={(v) => set({ link_relatorio_tecnico_sei: v })} /></Field>
              <div className="mt-2"><BlocoAssinaturas {...blocoProps("rel_tecnico")} slots={REL_TEC} canEdit={editAcp} /></div>
            </Passo>
            <Passo titulo="2. Relatório de Análise (mín. 1 fiscal)">
              <Field label="Link SEI do Relatório de Análise" help="Link do Relatório de Análise no SEI. Exige a assinatura de ao menos 1 fiscal abaixo."><SeiLink value={f.link_relatorio_analise_sei ?? ""} onChange={(v) => set({ link_relatorio_analise_sei: v })} /></Field>
              <div className="mt-2"><BlocoAssinaturas {...blocoProps("rel_analise")} slots={REL_ANA} canEdit={editAcp} /></div>
            </Passo>
            <Passo titulo="3. Certidões Negativas">
              <Field label="Link SEI das Certidões" help="Link das certidões negativas anexadas ao processo no SEI."><SeiLink value={f.link_certidoes_sei ?? ""} onChange={(v) => set({ link_certidoes_sei: v })} /></Field>
            </Passo>
            <Passo titulo="4. Valor Atestado">
              <Field label="Valor Atestado" help={HELP.valor_atestado}><CurrencyInput value={Number(f.valor_atestado) || 0} onChange={(n) => set({ valor_atestado: n })} /></Field>
            </Passo>

            {prog.relOk && Number(f.valor_atestado) > 0 ? (
              <>
                <Passo titulo="5. Solicitação de Liberação de Recurso">
                  <Field label="Link Solicitação de Liberação (SEI)" help="Link do documento de Solicitação de Liberação de Recurso no SEI. Libera o bloco de assinaturas."><SeiLink value={f.link_solicitacao_liberacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_liberacao_sei: v })} /></Field>
                </Passo>
                {isSafeUrl(f.link_solicitacao_liberacao_sei) && (
                  <Passo titulo="6. Assinaturas"><BlocoAssinaturas {...blocoProps("etapa4")} slots={SLOTS_PADRAO} canEdit={editAcp} /></Passo>
                )}
                {blocoCompleto(ass as any[], "etapa4", SLOTS_PADRAO) && isSafeUrl(f.link_solicitacao_liberacao_sei) && (
                  <Passo titulo="7. Envio à SEFAZ.UAF.ADE">
                    <SefazConfirm em={f.sefaz_etapa4_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa4_em: v })} />
                  </Passo>
                )}
                <Passo titulo="8. Acompanhamento (links SEI)">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Aviso de Movimento · Subempenho" help="Link do Aviso de Movimento de Subempenho no SEI — comprova que o documento existe no processo."><SeiLink value={f.link_subempenho_sei ?? ""} onChange={(v) => set({ link_subempenho_sei: v })} /></Field>
                    <Field label="Programação de Pagamento" help="Link da Programação de Pagamento no SEI."><SeiLink value={f.link_programacao_pagamento_sei ?? ""} onChange={(v) => set({ link_programacao_pagamento_sei: v })} /></Field>
                    <Field label="Comprovante de Pagamento" help="Link do Comprovante de Pagamento no SEI."><SeiLink value={f.link_comprovante_pagamento_sei ?? ""} onChange={(v) => set({ link_comprovante_pagamento_sei: v })} /></Field>
                  </div>
                </Passo>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Para liberar a solicitação de recurso, complete: relatórios (links + assinaturas), certidões (link) e o valor atestado.</p>
            )}
          </Etapa>

          {/* ETAPA 5 — Anulação (condicional) */}
          {prog.precisaAnular ? (
            <Etapa n={5} titulo="Anulação de Empenho" done={!!prog.s5} ativa bloqueada={false}>
              {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-3">Há <b>{brl(prog.anulado)}</b> a anular (Solicitado − Atestado).</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Link Solicitação de Anulação" help={HELP.link_solicitacao_anulacao}><SeiLink value={f.link_solicitacao_anulacao ?? ""} onChange={(v) => set({ link_solicitacao_anulacao: v })} /></Field>
                <Field label="Link Anulação SEI (Aviso de Movimento)" help={HELP.link_anulacao_sei}><SeiLink value={f.link_anulacao_sei ?? ""} onChange={(v) => set({ link_anulacao_sei: v })} /></Field>
              </div>
                <Passo titulo="Assinaturas"><BlocoAssinaturas {...blocoProps("etapa5")} slots={SLOTS_PADRAO} canEdit={editAcp} /></Passo>
              {blocoCompleto(ass as any[], "etapa5", SLOTS_PADRAO) && (
                <Passo titulo="Envio à SEFAZ.UCG.AEO"><SefazConfirm em={f.sefaz_etapa5_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa5_em: v })} /></Passo>
              )}
            </Etapa>
          ) : (
            prog.s4 && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success font-medium flex items-center gap-2"><Check className="h-4 w-4" />Sem saldo a anular — processo encerrado.</div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Linha do Tempo (Audit Trail)</CardTitle></CardHeader>
            <CardContent>
              {(logs as any[]).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
                <ol className="border-l-2 border-primary/30 ml-3 space-y-4">
                  {agruparLogs(logs as any[]).map((l: any) => {
                    const mudancas = l.acao === "Campos atualizados" ? mudancasVisiveis(l.detalhes) : [];
                    return (
                      <li key={l.id} className="ml-4 relative">
                        <span className="absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full bg-primary" />
                        <div className="text-xs text-muted-foreground">{dateTime(l.data_hora)} · {l.usuario_nome ?? "Sistema"}</div>
                        <div className="text-sm font-medium">{l.acao === "Campos atualizados" && mudancas.length ? "Atualização" : l.acao}</div>
                        {mudancas.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {mudancas.map(([campo, val]: any) => (
                              <li key={campo}><span className="font-medium text-foreground">{rotuloCampo(campo)}:</span> {formatarValor(campo, val?.de)} <span className="text-muted-foreground">→</span> {formatarValor(campo, val?.para)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
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
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : atual ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}>{done ? <Check className="h-4 w-4" /> : i + 1}</div>
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
      {!bloqueada && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{titulo}</div>
      {children}
    </div>
  );
}

function CheckLinha({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className={`flex items-start gap-2 text-left text-sm ${disabled ? "opacity-60" : ""}`}>
      {checked ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
      <span>{label}</span>
    </button>
  );
}

function SefazConfirm({ em, onToggle, disabled }: { em: string | null; onToggle: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={!!em} disabled={disabled} onCheckedChange={(v) => onToggle(v ? new Date().toISOString() : null)} />
      <div className="text-sm">
        {em ? <span className="text-success font-medium flex items-center gap-1"><Send className="h-3.5 w-3.5" />Enviado em {dateTime(em)}</span> : <span className="text-muted-foreground">Confirmar envio do processo à SEFAZ</span>}
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />{children}</div>;
}
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <div><Label className="text-xs flex items-center gap-1">{label}{help && <HelpTip text={help} />}</Label>{children}</div>;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div></div>;
}
