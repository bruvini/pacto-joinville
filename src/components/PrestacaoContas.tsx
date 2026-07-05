import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeiLink, SeiButton } from "@/components/inputs/SeiLink";
import { HelpTip } from "@/components/HelpTip";
import { situacaoPrestacao, STATUS_PRESTACAO_LABEL } from "@/lib/prestacao";
import { dateTime } from "@/lib/format";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Clock, Send, Plus, Undo2 } from "lucide-react";

const NIVEL_BADGE: Record<string, string> = {
  ok: "bg-success text-success-foreground",
  info: "bg-acp text-acp-foreground",
  alerta: "bg-warning text-warning-foreground",
  grave: "bg-destructive text-destructive-foreground",
  neutro: "bg-muted text-muted-foreground",
};

const TIPO_INTERACAO: Record<string, string> = { oficio: "Ofício enviado", resposta: "Resposta do prestador", outro: "Outro" };

/**
 * Sprint de prestação de contas de um lançamento pago.
 * Independente da trava de finalização do processo: a prestação acontece
 * DEPOIS do pagamento, então continua editável mesmo com o processo concluído.
 */
export function PrestacaoContas({ lanc, convenio, canEdit, userName }: { lanc: any; convenio: any; canEdit: boolean; userName?: string | null }) {
  const qc = useQueryClient();
  const [parecer, setParecer] = useState("");
  const [inter, setInter] = useState({ tipo: "oficio", link_sei: "", descricao: "" });
  const [linkPrestacao, setLinkPrestacao] = useState("");
  const linkTimer = useRef<any>(null);
  const linkLoaded = useRef(false);

  const { data: pc } = useQuery({
    queryKey: ["prestacao", lanc.id],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*").eq("lancamento_id", lanc.id).maybeSingle()).data as any,
  });
  useEffect(() => {
    if (pc && !linkLoaded.current) { linkLoaded.current = true; setLinkPrestacao(pc.link_prestacao_sei ?? ""); }
  }, [pc]);
  const { data: interacoes = [] } = useQuery({
    queryKey: ["prestacao_inter", pc?.id],
    enabled: !!pc?.id,
    queryFn: async () => (await supabase.from("prestacoes_contas_interacoes").select("*").eq("prestacao_id", pc.id).order("created_at", { ascending: false })).data ?? [],
  });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["prestacao", lanc.id] }); qc.invalidateQueries({ queryKey: ["prestacao_inter", pc?.id] }); };

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
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e.message),
  });

  const addInteracao = useMutation({
    mutationFn: async () => {
      const pcId = await ensurePc();
      const { error } = await supabase.from("prestacoes_contas_interacoes").insert({
        prestacao_id: pcId,
        tipo: inter.tipo,
        link_sei: inter.link_sei || null,
        descricao: inter.descricao || null,
        autor_nome: userName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setInter({ tipo: "oficio", link_sei: "", descricao: "" }); invalidar(); toast.success("Interação registrada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const decidir = useMutation({
    mutationFn: async (status: "aprovada" | "reprovada" | "recebida") => {
      const patch: any = status === "recebida"
        ? { status, parecer: null, decidido_por: null, decidido_em: null }
        : { status, parecer: parecer || null, decidido_por: userName ?? null, decidido_em: new Date().toISOString() };
      const pcId = await ensurePc();
      const { error } = await supabase.from("prestacoes_contas").update(patch).eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => { setParecer(""); invalidar(); toast.success("Situação da prestação atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const sit = situacaoPrestacao(lanc, convenio, pc);
  const status = pc?.status ?? "aguardando";
  const decidida = status === "aprovada" || status === "reprovada";

  return (
    <Card className={`border-l-4 ${sit.nivel === "ok" ? "border-l-success" : sit.nivel === "grave" ? "border-l-destructive" : sit.nivel === "alerta" ? "border-l-warning" : "border-l-primary"}`}>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Prestação de Contas
          <HelpTip text="Após a liberação do pagamento, o prestador deve prestar contas da competência dentro do prazo cadastrado no convênio. Registre aqui o recebimento, os ofícios/respostas (links SEI) e o resultado da análise." />
        </CardTitle>
        <Badge className={`${NIVEL_BADGE[sit.nivel]} gap-1`}>
          {sit.nivel === "ok" ? <CheckCircle2 className="h-3 w-3" /> : sit.nivel === "grave" ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {sit.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Status: {STATUS_PRESTACAO_LABEL[status]}</Badge>
          {sit.prazo && <Badge variant="secondary">Prazo limite: {sit.prazo.toLocaleDateString("pt-BR")}</Badge>}
          {!sit.prazo && <Badge variant="outline" className="border-warning/50">Cadastre o prazo de prestação de contas no convênio para ativar os alertas</Badge>}
        </div>

        {/* Recebimento */}
        <div className="rounded-lg border bg-muted/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">1. Recebimento da prestação</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">Data de recebimento <HelpTip text="Data em que o prestador entregou a prestação de contas. Ao preencher, o status muda para 'Recebida — em análise'." /></Label>
              <Input type="date" value={pc?.data_recebimento ?? ""} disabled={!canEdit}
                onChange={(e) => atualizar.mutate({ data_recebimento: e.target.value || null, ...(e.target.value && status === "aguardando" ? { status: "recebida" } : {}) })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">Link da prestação de contas (SEI) <HelpTip text="Link SEI da documentação entregue pelo prestador." /></Label>
              {canEdit ? (
                <SeiLink value={linkPrestacao} onChange={(v) => {
                  setLinkPrestacao(v);
                  clearTimeout(linkTimer.current);
                  linkTimer.current = setTimeout(() => atualizar.mutate({ link_prestacao_sei: v || null }), 800);
                }} />
              ) : pc?.link_prestacao_sei ? <div className="h-9 flex items-center"><SeiButton href={pc.link_prestacao_sei} label="Abrir no SEI" /></div> : <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>}
            </div>
          </div>
        </div>

        {/* Sprint: ofícios e respostas */}
        <div className="rounded-lg border bg-muted/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">2. Ofícios e respostas (sprint)</div>
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

        {/* Decisão */}
        <div className="rounded-lg border bg-muted/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">3. Resultado da análise</div>
          {decidida ? (
            <div className={`rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-3 ${status === "aprovada" ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
              <div>
                <div className={`font-semibold flex items-center gap-1.5 ${status === "aprovada" ? "text-success" : "text-destructive"}`}>
                  {status === "aprovada" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {status === "aprovada" ? "Prestação de contas aprovada" : "Prestação de contas reprovada — há pendências"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{pc?.decidido_por ?? "—"}{pc?.decidido_em ? ` · ${dateTime(pc.decidido_em)}` : ""}</div>
                {pc?.parecer && <p className="text-xs mt-1 whitespace-pre-wrap">{pc.parecer}</p>}
              </div>
              {canEdit && <Button size="sm" variant="outline" onClick={() => decidir.mutate("recebida")}><Undo2 className="h-4 w-4 mr-1.5" />Reabrir análise</Button>}
            </div>
          ) : canEdit ? (
            <div className="space-y-2">
              <Textarea placeholder="Parecer da análise (opcional ao aprovar; recomendado ao reprovar)…" value={parecer} onChange={(e) => setParecer(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="text-destructive" disabled={decidir.isPending} onClick={() => decidir.mutate("reprovada")}><XCircle className="h-4 w-4 mr-1.5" />Reprovar (pendências)</Button>
                <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" disabled={decidir.isPending} onClick={() => decidir.mutate("aprovada")}><CheckCircle2 className="h-4 w-4 mr-1.5" />Aprovar</Button>
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">Aguardando decisão da análise.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
