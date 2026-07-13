import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeiLink, SeiButton } from "@/components/inputs/SeiLink";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { HelpTip } from "@/components/HelpTip";
import { situacaoPrestacao, etapaPrestacao, statusMacroPrestacao, ESTEIRA_PC, STATUS_CGM_LABEL } from "@/lib/prestacao";
import { brl, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { registrarAcesso } from "@/lib/acesso";
import { ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Clock, Send, Plus, Undo2, Check, UserCheck, Building2, Landmark, Calculator } from "lucide-react";

const NIVEL_BADGE: Record<string, string> = {
  ok: "bg-success text-success-foreground",
  info: "bg-acp text-acp-foreground",
  alerta: "bg-warning text-warning-foreground",
  grave: "bg-destructive text-destructive-foreground",
  neutro: "bg-muted text-muted-foreground",
};

const TIPO_INTERACAO: Record<string, string> = { oficio: "Ofício enviado", resposta: "Resposta do prestador", outro: "Outro" };

/** Trilha visual da esteira de prestação de contas (7 marcos). */
function EsteiraStepper({ idx, encerrada }: { idx: number; encerrada: boolean }) {
  const total = ESTEIRA_PC.length;
  const pct = Math.round((encerrada ? total - 1 : idx) / (total - 1) * 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Esteira da prestação de contas</span>
        <span className="text-xs font-semibold text-primary">{pct}%</span>
      </div>
      <div className="flex items-center">
        {ESTEIRA_PC.map((e, i) => {
          const done = encerrada || i < idx;
          const current = !encerrada && i === idx;
          return (
            <div key={e.slug} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors shrink-0",
                  done && "bg-success text-success-foreground",
                  current && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !done && !current && "bg-muted text-muted-foreground",
                )}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn("mt-1 text-[10px] leading-tight text-center max-w-[80px]", current ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {e.curto}
                </span>
              </div>
              {i < total - 1 && <div className={cn("h-0.5 flex-1 mx-1 -mt-4 rounded", (encerrada || i < idx) ? "bg-success" : "bg-muted")} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Esteira completa de prestação de contas de um lançamento pago.
 * Independente da trava de finalização do processo: a prestação acontece
 * DEPOIS do pagamento, então continua editável mesmo com o processo concluído.
 * Cada gravação é auditada (trigger log_prestacao_audit → historico_logs).
 */
export function PrestacaoContas({ lanc, convenio, canEdit, userName }: { lanc: any; convenio: any; canEdit: boolean; userName?: string | null }) {
  const qc = useQueryClient();
  const [parecer, setParecer] = useState("");
  const [vAprovado, setVAprovado] = useState(0);
  const [vGlosado, setVGlosado] = useState(0);
  const [inter, setInter] = useState({ tipo: "oficio", link_sei: "", descricao: "" });
  // Campos de texto/link com auto-save debounced (semeados 1x quando a PC carrega).
  const [form, setForm] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, any>>({});
  const loaded = useRef(false);

  const { data: pc } = useQuery({
    queryKey: ["prestacao", lanc.id],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*").eq("lancamento_id", lanc.id).maybeSingle()).data as any,
  });
  // Responsáveis: usuários cadastrados no setor APC (Área de Prestação de Contas).
  const { data: responsaveis = [] } = useQuery({
    queryKey: ["responsaveis-apc"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome").ilike("setor", "APC%").order("nome")).data ?? [],
  });

  useEffect(() => {
    if (pc && !loaded.current) {
      loaded.current = true;
      setVAprovado(Number(pc.valor_aprovado ?? 0));
      setVGlosado(Number(pc.valor_glosado ?? 0));
      setForm({
        numero_processo_pc: pc.numero_processo_pc ?? "",
        data_recebimento: pc.data_recebimento ?? "",
        link_prestacao_sei: pc.link_prestacao_sei ?? "",
        observacao: pc.observacao ?? "",
        link_relatorio_analise_sei: pc.link_relatorio_analise_sei ?? "",
        link_parecer_ses_sei: pc.link_parecer_ses_sei ?? "",
        link_manifestacao_cgm_sei: pc.link_manifestacao_cgm_sei ?? "",
        exercicio_baixa: pc.exercicio_baixa != null ? String(pc.exercicio_baixa) : "",
      });
    }
  }, [pc]);

  const { data: interacoes = [] } = useQuery({
    queryKey: ["prestacao_inter", pc?.id],
    enabled: !!pc?.id,
    queryFn: async () => (await supabase.from("prestacoes_contas_interacoes").select("*").eq("prestacao_id", pc.id).order("created_at", { ascending: false })).data ?? [],
  });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["prestacao", lanc.id] }); qc.invalidateQueries({ queryKey: ["prestacao_inter", pc?.id] }); qc.invalidateQueries({ queryKey: ["pc-lancs"] }); qc.invalidateQueries({ queryKey: ["prestacoes-all"] }); };

  // Garante que o registro exista antes de qualquer ação (criado sob demanda).
  const ensurePc = async (): Promise<string> => {
    if (pc?.id) return pc.id;
    const { data, error } = await supabase.from("prestacoes_contas").insert({ lancamento_id: lanc.id }).select("id").single();
    if (error) throw error;
    return data.id;
  };

  const atualizar = useMutation({
    mutationFn: async (patch: any) => {
      const pcId = await ensurePc();
      const { error } = await supabase.from("prestacoes_contas").update(patch).eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); void registrarAcesso("prestacao_atualizada", { rota: "/prestacao-contas" }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Salvamento imediato (datas, selects, switches).
  const save = (patch: any) => atualizar.mutate(patch);
  // Salvamento debounced para campos de texto/link.
  const saveDebounced = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => save({ [field]: value.trim() === "" ? null : value.trim() }), 700);
  };

  const addInteracao = useMutation({
    mutationFn: async () => {
      const pcId = await ensurePc();
      const { error } = await supabase.from("prestacoes_contas_interacoes").insert({
        prestacao_id: pcId, tipo: inter.tipo, link_sei: inter.link_sei || null, descricao: inter.descricao || null, autor_nome: userName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setInter({ tipo: "oficio", link_sei: "", descricao: "" }); invalidar(); toast.success("Interação registrada"); void registrarAcesso("prestacao_atualizada", { detalhe: "Interação/ofício registrado", rota: "/prestacao-contas" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const decidir = useMutation({
    mutationFn: async (status: "aprovada" | "reprovada" | "recebida") => {
      const patch: any = status === "recebida"
        ? { status, parecer: null, decidido_por: null, decidido_em: null }
        : { status, parecer: parecer || null, valor_aprovado: vAprovado || null, valor_glosado: vGlosado || null, decidido_por: userName ?? null, decidido_em: new Date().toISOString() };
      const pcId = await ensurePc();
      const { error } = await supabase.from("prestacoes_contas").update(patch).eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: (_d, status) => { setParecer(""); invalidar(); toast.success("Situação da prestação atualizada"); void registrarAcesso("prestacao_decidida", { detalhe: status, rota: "/prestacao-contas" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const sit = situacaoPrestacao(lanc, convenio, pc);
  const status = pc?.status ?? "aguardando";
  const decidida = status === "aprovada" || status === "reprovada";
  const etapa = etapaPrestacao(pc);
  const responsavelNome = (responsaveis as any[]).find((r) => r.id === pc?.responsavel_id)?.nome;

  return (
    <Card className={`border-l-4 ${sit.nivel === "ok" ? "border-l-success" : sit.nivel === "grave" ? "border-l-destructive" : sit.nivel === "alerta" ? "border-l-warning" : "border-l-primary"}`}>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Prestação de Contas
          <HelpTip text="Esteira completa da prestação de contas após o pagamento: recebimento → análise → diligências à Entidade → parecer técnico (SES) → Controladoria (CGM) → baixa contábil → encerramento. Cada mudança fica registrada na trilha de auditoria do processo." />
        </CardTitle>
        <Badge className={`${NIVEL_BADGE[sit.nivel]} gap-1`}>
          {sit.nivel === "ok" ? <CheckCircle2 className="h-3 w-3" /> : sit.nivel === "grave" ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {sit.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/10 p-3">
          <EsteiraStepper idx={etapa.idx} encerrada={etapa.slug === "encerrada"} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Etapa: {etapa.label}</Badge>
          <Badge variant="secondary">Situação: {statusMacroPrestacao(pc)}</Badge>
          {responsavelNome && <Badge variant="secondary" className="gap-1"><UserCheck className="h-3 w-3" />{responsavelNome}</Badge>}
          {pc?.redistribuir && <Badge variant="outline" className="border-warning/60 text-warning-foreground">Fila de redistribuição</Badge>}
          {sit.prazo && <Badge variant="secondary">Prazo de entrega: {sit.prazo.toLocaleDateString("pt-BR")}</Badge>}
          {!sit.prazo && <Badge variant="outline" className="border-warning/50">Cadastre o prazo de prestação de contas no convênio para ativar os alertas</Badge>}
        </div>

        {/* 1. Recebimento */}
        <Secao n={1} titulo="Recebimento da prestação" icon={ClipboardCheck}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">Nº do processo de PC (SEI) <HelpTip text="Número do processo SEI próprio da prestação de contas — distinto do processo do empenho." /></Label>
              <Input placeholder="ex.: 26.0.005755-7" value={form.numero_processo_pc ?? ""} disabled={!canEdit}
                onChange={(e) => saveDebounced("numero_processo_pc", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">Data de recebimento <HelpTip text="Data em que o prestador entregou a prestação de contas. É ela que libera o avanço para 'Análise' — o nº do processo e o link SEI sozinhos não avançam a etapa. Se você limpar esta data, o fluxo volta para a Etapa 1." /></Label>
              <Input type="date" value={form.data_recebimento ?? ""} disabled={!canEdit}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({ ...prev, data_recebimento: v }));
                  const patch: any = { data_recebimento: v || null };
                  if (v && status === "aguardando") patch.status = "recebida";     // avança
                  else if (!v && status === "recebida") patch.status = "aguardando"; // retrocesso
                  save(patch);
                }} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">Link da prestação (SEI) <HelpTip text="Link SEI da documentação entregue pelo prestador." /></Label>
              {canEdit ? (
                <SeiLink value={form.link_prestacao_sei ?? ""} onChange={(v) => saveDebounced("link_prestacao_sei", v)} />
              ) : pc?.link_prestacao_sei ? <div className="h-9 flex items-center"><SeiButton href={pc.link_prestacao_sei} label="Abrir no SEI" /></div> : <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>}
            </div>
          </div>
        </Secao>

        {/* 2. Análise: responsável + observação */}
        <Secao n={2} titulo="Análise (responsável)" icon={UserCheck}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">Responsável pela análise <HelpTip text="Analista da APC responsável por esta prestação de contas. Recebe as notificações de prazo e conta nos indicadores de carga por responsável." /></Label>
              <Select value={pc?.responsavel_id ?? "none"} disabled={!canEdit} onValueChange={(v) => save({ responsavel_id: v === "none" ? null : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {(responsaveis as any[]).length === 0
                    ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário cadastrado no setor APC</div>
                    : (responsaveis as any[]).map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2 rounded-md border px-3 h-9 w-full">
                <Switch checked={!!pc?.redistribuir} disabled={!canEdit} onCheckedChange={(v) => save({ redistribuir: v })} />
                <span className="text-xs">Fila de redistribuição <HelpTip text="Processos remanescentes, analisados por outra equipe, que aguardam nova análise/redistribuição (o 'Outro' da planilha)." /></span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Label className="text-xs">Observação</Label>
            <Textarea placeholder="Anotações internas da análise…" value={form.observacao ?? ""} disabled={!canEdit} onChange={(e) => saveDebounced("observacao", e.target.value)} />
          </div>
        </Secao>

        {/* 3. Diligências à Entidade + sprint de ofícios/respostas */}
        <Secao n={3} titulo="Diligências (Entidade)" icon={Building2}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">Relatório de Análise / Ofício (SEI) <HelpTip text="Documento SEI do relatório de análise ou ofício de diligências enviado à Entidade." /></Label>
              {canEdit ? <SeiLink value={form.link_relatorio_analise_sei ?? ""} onChange={(v) => saveDebounced("link_relatorio_analise_sei", v)} />
                : pc?.link_relatorio_analise_sei ? <div className="h-9 flex items-center"><SeiButton href={pc.link_relatorio_analise_sei} label="SEI" /></div> : <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>}
            </div>
            <div>
              <Label className="text-xs">Data do envio à Entidade</Label>
              <Input type="date" value={pc?.data_envio_entidade ?? ""} disabled={!canEdit} onChange={(e) => save({ data_envio_entidade: e.target.value || null })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">Data do retorno da Entidade <HelpTip text="Enquanto vazio após o envio, o sistema alerta o responsável quando o prazo de retorno da Entidade vence." /></Label>
              <Input type="date" value={pc?.data_retorno_entidade ?? ""} disabled={!canEdit} onChange={(e) => save({ data_retorno_entidade: e.target.value || null })} />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ofícios e respostas</div>
            {canEdit && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end mb-3">
                <div className="md:col-span-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={inter.tipo} onValueChange={(v) => setInter({ ...inter, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oficio">Ofício</SelectItem>
                      <SelectItem value="resposta">Resposta</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label className="text-xs">Link SEI</Label><Input placeholder="https://sei.joinville..." value={inter.link_sei} onChange={(e) => setInter({ ...inter, link_sei: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="text-xs">Descrição</Label><Input placeholder="ex.: Ofício 12/2026 cobrando pendências" value={inter.descricao} onChange={(e) => setInter({ ...inter, descricao: e.target.value })} /></div>
                <Button size="sm" onClick={() => addInteracao.mutate()} disabled={addInteracao.isPending || (!inter.link_sei && !inter.descricao)}><Plus className="h-4 w-4 mr-1" />Registrar</Button>
              </div>
            )}
            {(interacoes as any[]).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum ofício ou resposta registrado.</p> : (
              <ul className="space-y-1.5">
                {(interacoes as any[]).map((i: any) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 border rounded p-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={i.tipo === "oficio" ? "default" : "secondary"} className="gap-1"><Send className="h-3 w-3" />{TIPO_INTERACAO[i.tipo] ?? i.tipo}</Badge>
                        <span className="text-xs text-muted-foreground">{dateTime(i.created_at)}{i.autor_nome ? ` · ${i.autor_nome}` : ""}</span>
                      </div>
                      {i.descricao && <p className="text-xs mt-1">{i.descricao}</p>}
                    </div>
                    {i.link_sei && <SeiButton href={i.link_sei} label="SEI" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Secao>

        {/* 4. Parecer Técnico Fundamentado - SES */}
        <Secao n={4} titulo="Parecer Técnico Fundamentado (SES)" icon={ClipboardCheck}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Parecer Técnico SES (SEI)</Label>
              {canEdit ? <SeiLink value={form.link_parecer_ses_sei ?? ""} onChange={(v) => saveDebounced("link_parecer_ses_sei", v)} />
                : pc?.link_parecer_ses_sei ? <div className="h-9 flex items-center"><SeiButton href={pc.link_parecer_ses_sei} label="SEI" /></div> : <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>}
            </div>
            <div>
              <Label className="text-xs">Data do parecer</Label>
              <Input type="date" value={pc?.data_parecer_ses ?? ""} disabled={!canEdit} onChange={(e) => save({ data_parecer_ses: e.target.value || null })} />
            </div>
          </div>
        </Secao>

        {/* 5. Controladoria (CGM) */}
        <Secao n={5} titulo="Controladoria (CGM)" icon={Landmark}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data do encaminhamento à CGM</Label>
              <Input type="date" value={pc?.data_enc_cgm ?? ""} disabled={!canEdit} onChange={(e) => save({ data_enc_cgm: e.target.value || null })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">Data do retorno da CGM <HelpTip text="Enquanto vazio após o encaminhamento, o sistema alerta o responsável quando o prazo de manifestação da CGM vence." /></Label>
              <Input type="date" value={pc?.data_retorno_cgm ?? ""} disabled={!canEdit} onChange={(e) => save({ data_retorno_cgm: e.target.value || null })} />
            </div>
            <div>
              <Label className="text-xs">Manifestação CGM (SEI)</Label>
              {canEdit ? <SeiLink value={form.link_manifestacao_cgm_sei ?? ""} onChange={(v) => saveDebounced("link_manifestacao_cgm_sei", v)} />
                : pc?.link_manifestacao_cgm_sei ? <div className="h-9 flex items-center"><SeiButton href={pc.link_manifestacao_cgm_sei} label="SEI" /></div> : <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>}
            </div>
            <div>
              <Label className="text-xs">Status na CGM</Label>
              <Select value={pc?.status_cgm ?? "none"} disabled={!canEdit} onValueChange={(v) => save({ status_cgm: v === "none" ? null : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(STATUS_CGM_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Secao>

        {/* 6. Baixa contábil */}
        <Secao n={6} titulo="Baixa contábil" icon={Calculator}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">Data do lançamento contábil <HelpTip text="Data em que a baixa contábil foi lançada, encerrando o ciclo da prestação de contas no exercício." /></Label>
              <Input type="date" value={pc?.data_baixa_contabil ?? ""} disabled={!canEdit} onChange={(e) => save({ data_baixa_contabil: e.target.value || null })} />
            </div>
            <div>
              <Label className="text-xs">Situação</Label>
              <Select value={pc?.situacao_baixa ?? "none"} disabled={!canEdit} onValueChange={(v) => save({ situacao_baixa: v === "none" ? null : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="com_baixa">Com baixa contábil</SelectItem>
                  <SelectItem value="sem_baixa">Em aberto / sem baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Exercício</Label>
              <Input type="number" placeholder="ex.: 2026" value={form.exercicio_baixa ?? ""} disabled={!canEdit}
                onChange={(e) => { setForm((f) => ({ ...f, exercicio_baixa: e.target.value })); clearTimeout(timers.current.exercicio_baixa); timers.current.exercicio_baixa = setTimeout(() => save({ exercicio_baixa: e.target.value ? Number(e.target.value) : null }), 700); }} />
            </div>
          </div>
        </Secao>

        {/* 7. Encerramento (resultado da análise) */}
        <Secao n={7} titulo="Encerramento (resultado da análise)" icon={CheckCircle2}>
          {decidida ? (
            <div className={`rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-3 ${status === "aprovada" ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
              <div>
                <div className={`font-semibold flex items-center gap-1.5 ${status === "aprovada" ? "text-success" : "text-destructive"}`}>
                  {status === "aprovada" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {status === "aprovada" ? "Prestação de contas aprovada" : "Prestação de contas reprovada — há pendências"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{pc?.decidido_por ?? "—"}{pc?.decidido_em ? ` · ${dateTime(pc.decidido_em)}` : ""}</div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {Number(pc?.valor_aprovado) > 0 && <Badge className="bg-success text-success-foreground">Aprovado {brl(Number(pc.valor_aprovado))}</Badge>}
                  {Number(pc?.valor_glosado) > 0 && <Badge variant="destructive">Glosa {brl(Number(pc.valor_glosado))}</Badge>}
                </div>
                {pc?.parecer && <p className="text-xs mt-1 whitespace-pre-wrap">{pc.parecer}</p>}
              </div>
              {canEdit && <Button size="sm" variant="outline" onClick={() => decidir.mutate("recebida")}><Undo2 className="h-4 w-4 mr-1.5" />Reabrir análise</Button>}
            </div>
          ) : canEdit ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1">Valor aprovado (comprovado) <HelpTip text="Valor efetivamente comprovado pelo prestador na prestação de contas (padrão Transferegov)." /></Label>
                  <CurrencyInput value={vAprovado} onChange={setVAprovado} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">Valor glosado <HelpTip text="Parte do valor NÃO aceita na análise (glosa) — despesas não comprovadas ou irregulares." /></Label>
                  <CurrencyInput value={vGlosado} onChange={setVGlosado} />
                </div>
              </div>
              {Number(lanc.valor_atestado) > 0 && (vAprovado > 0 || vGlosado > 0) && Math.abs(vAprovado + vGlosado - Number(lanc.valor_atestado)) > 0.01 && (
                <p className="text-[11px] text-warning-foreground bg-warning/10 border border-warning/40 rounded px-2 py-1">
                  Atenção: aprovado + glosa ({brl(vAprovado + vGlosado)}) difere do valor atestado ({brl(Number(lanc.valor_atestado))}).
                </p>
              )}
              <Textarea placeholder="Parecer da análise (opcional ao aprovar; recomendado ao reprovar)…" value={parecer} onChange={(e) => setParecer(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="text-destructive" disabled={decidir.isPending} onClick={() => decidir.mutate("reprovada")}><XCircle className="h-4 w-4 mr-1.5" />Reprovar (pendências)</Button>
                <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" disabled={decidir.isPending} onClick={() => decidir.mutate("aprovada")}><CheckCircle2 className="h-4 w-4 mr-1.5" />Aprovar / Encerrar</Button>
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">Aguardando decisão da análise.</p>}
        </Secao>
      </CardContent>
    </Card>
  );
}

function Secao({ n, titulo, icon: Icon, children }: { n: number; titulo: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">{n}</span>
        <Icon className="h-3.5 w-3.5" />{titulo}
      </div>
      {children}
    </div>
  );
}
