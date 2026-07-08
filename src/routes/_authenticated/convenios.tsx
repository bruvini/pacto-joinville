import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Plus, FileStack, Layers, Trash2, FileText, Pencil, Power, Play, Info } from "lucide-react";
import { statusConvenioEfetivo } from "@/lib/etapa";

export const Route = createFileRoute("/_authenticated/convenios")({
  head: () => ({ meta: [{ title: "Convênios" }] }),
  component: ConveniosPage,
});

function ConveniosPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp");
  const isAdmin = roles.includes("admin");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { prestador_id: "", link_processo_sei: "", objeto: "", data_inicio_vigencia: "", teto_mensal: 0, total_parcelas: "", dia_inicio_execucao: "", dia_fim_execucao: "", exige_prestacao_contas: true, prazo_prestacao_contas_dias: "", prazo_retorno_entidade_dias: "", prazo_retorno_cgm_dias: "", exige_relatorio_analise: true, pagamento_pontual: false };
  const [form, setForm] = useState<any>(emptyForm);
  const abrirNovo = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const abrirEdicao = (c: any) => { setEditId(c.id); setForm({ prestador_id: c.prestador_id ?? "", link_processo_sei: c.link_processo_sei ?? "", objeto: c.objeto ?? "", data_inicio_vigencia: c.data_inicio_vigencia ?? "", teto_mensal: Number(c.teto_mensal ?? 0), total_parcelas: c.total_parcelas ? String(c.total_parcelas) : "", dia_inicio_execucao: c.dia_inicio_execucao ? String(c.dia_inicio_execucao) : "", dia_fim_execucao: c.dia_fim_execucao ? String(c.dia_fim_execucao) : "", exige_prestacao_contas: c.exige_prestacao_contas !== false, prazo_prestacao_contas_dias: c.prazo_prestacao_contas_dias ? String(c.prazo_prestacao_contas_dias) : "", prazo_retorno_entidade_dias: c.prazo_retorno_entidade_dias ? String(c.prazo_retorno_entidade_dias) : "", prazo_retorno_cgm_dias: c.prazo_retorno_cgm_dias ? String(c.prazo_retorno_cgm_dias) : "", exige_relatorio_analise: c.exige_relatorio_analise !== false, pagamento_pontual: !!c.pagamento_pontual }); setOpen(true); };
  const [taPara, setTaPara] = useState<any | null>(null); // convênio cujos TAs estão sendo gerenciados
  const [lifecycleAction, setLifecycleAction] = useState<{ type: 'encerrar' | 'reabrir', convenio: any } | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: tas = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("data_assinatura", { ascending: false, nullsFirst: false })).data ?? [],
  });
  const { data: empenhos = [] } = useQuery({
    queryKey: ["empenhos-saldo"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("convenio_id, termo_aditivo_id, valor_solicitado")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const dados = {
        prestador_id: form.prestador_id,
        link_processo_sei: form.link_processo_sei,
        objeto: form.objeto,
        data_inicio_vigencia: form.pagamento_pontual ? null : (form.data_inicio_vigencia || null),
        // Pagamentos complementares não participam do fluxo de teto/aging: campos anulados.
        teto_mensal: form.pagamento_pontual ? 0 : Number(form.teto_mensal ?? 0),
        total_parcelas: form.pagamento_pontual ? null : (form.total_parcelas ? Number(form.total_parcelas) : null),
        dia_inicio_execucao: form.pagamento_pontual ? null : (form.dia_inicio_execucao ? Number(form.dia_inicio_execucao) : null),
        dia_fim_execucao: form.pagamento_pontual ? null : (form.dia_fim_execucao ? Number(form.dia_fim_execucao) : null),
        exige_prestacao_contas: !!form.exige_prestacao_contas,
        prazo_prestacao_contas_dias: form.exige_prestacao_contas && form.prazo_prestacao_contas_dias ? Number(form.prazo_prestacao_contas_dias) : null,
        // Prazos de análise por convênio; só valem quando exige prestação de contas.
        // O da CGM é opcional (nulo desativa os alertas daquela fase).
        prazo_retorno_entidade_dias: form.exige_prestacao_contas && form.prazo_retorno_entidade_dias ? Number(form.prazo_retorno_entidade_dias) : null,
        prazo_retorno_cgm_dias: form.exige_prestacao_contas && form.prazo_retorno_cgm_dias ? Number(form.prazo_retorno_cgm_dias) : null,
        exige_relatorio_analise: !!form.exige_relatorio_analise,
        pagamento_pontual: !!form.pagamento_pontual,
      };
      if (editId) {
        const { error } = await supabase.from("convenios").update(dados as any).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("convenios").insert(dados as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["convenios"] }); setOpen(false); toast.success(editId ? "Convênio atualizado" : "Convênio criado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleLifecycleMutation = useMutation({
    mutationFn: async () => {
      if (!lifecycleAction || !justificativa.trim()) return;
      const { type, convenio } = lifecycleAction;
      const novoStatus = type === "encerrar" ? "encerrado" : "ativo";
      
      const { error: errorConv } = await supabase
        .from("convenios")
        .update({ status_convenio: novoStatus } as any)
        .eq("id", convenio.id);
      if (errorConv) throw errorConv;
      
      const { data: user } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.user!.id)
        .maybeSingle();
        
      const acao = type === "encerrar" ? "Convênio encerrado manualmente" : "Convênio reaberto";
      
      const { error: errorLog } = await supabase.from("historico_logs").insert({
        usuario_id: user.user?.id,
        usuario_nome: profileData?.nome ?? user.user?.email,
        acao,
        detalhes: { justificativa, convenio_objeto: convenio.objeto },
        convenio_id: convenio.id,
      } as any);
      if (errorLog) throw errorLog;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["convenios"] });
      setLifecycleAction(null);
      setJustificativa("");
      toast.success("Status do convênio atualizado com sucesso");
    },
    onError: (e: any) => {
      toast.error(e.message);
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><FileText className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Convênios</h1>
            <p className="text-sm text-muted-foreground">{convenios.length} convênio(s) · teto e termos aditivos com auditoria de saldo</p>
          </div>
        </div>
        {canCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Novo convênio</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Editar convênio" : "Novo convênio"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Prestador</Label>
                  <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="flex items-center gap-1">Link do Processo SEI <HelpTip text="Link do processo principal (mãe) do convênio no SEI." /></Label><Input placeholder="https://sei.joinville..." value={form.link_processo_sei} onChange={(e) => setForm({ ...form, link_processo_sei: e.target.value })} /></div>
                <div><Label className="flex items-center gap-1">Objeto <HelpTip text="Descrição do objeto do convênio (ex.: POA, Termo de Colaboração, cirurgias eletivas). Vira a descrição do lançamento." /></Label><Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} /></div>
                 <div className="flex items-center justify-between gap-3 p-3 bg-muted/20 rounded-lg border">
                  <Label className="flex items-center gap-1">Pagamentos Complementares? <HelpTip text="Ative para convênios de pagamentos pontuais/sob demanda, sem parcelas fixas ou vigência em meses. As parcelas são geradas automáticas e sequenciais por competência, e o convênio NÃO participa do fluxo padrão de aging/alertas cronológicos de prazos (teto mensal e dias de prazo não se aplicam)." /></Label>
                  <Switch checked={!!form.pagamento_pontual} onCheckedChange={(v) => setForm({ ...form, pagamento_pontual: v })} />
                </div>
                {!form.pagamento_pontual && (
                  <>
                    <div><Label className="flex items-center gap-1">Data de início da vigência <HelpTip text="Data em que o convênio passa a vigorar. As competências dos lançamentos não podem ser anteriores a este mês/ano." /></Label><Input type="date" value={form.data_inicio_vigencia} onChange={(e) => setForm({ ...form, data_inicio_vigencia: e.target.value })} /></div>
                    <div><Label className="flex items-center gap-1">Nº de parcelas (meses de vigência) <HelpTip text="Quantas parcelas/meses o convênio tem. Define a lista de parcelas no lançamento e o % concluído." /></Label><Input inputMode="numeric" placeholder="ex.: 12" value={form.total_parcelas} onChange={(e) => setForm({ ...form, total_parcelas: e.target.value.replace(/\D/g, "") })} /></div>
                    <div><Label className="flex items-center gap-1">Teto mensal (R$) <HelpTip text="Valor máximo por mês/parcela. Cada parcela do lançamento não pode passar disso. Um termo aditivo pode sobrescrever este teto." /></Label><CurrencyInput value={form.teto_mensal} onChange={(n) => setForm({ ...form, teto_mensal: n })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="flex items-center gap-1">Início do prazo (dia) <HelpTip text="Dia do mês em que o prazo do processo começa (ex.: dia 15)." /></Label><Input inputMode="numeric" placeholder="1-31" value={form.dia_inicio_execucao} onChange={(e) => setForm({ ...form, dia_inicio_execucao: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                      <div><Label className="flex items-center gap-1">Limite do prazo (dia) <HelpTip text="Dia do mês limite para concluir o processo." /></Label><Input inputMode="numeric" placeholder="1-31" value={form.dia_fim_execucao} onChange={(e) => setForm({ ...form, dia_fim_execucao: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                    </div>
                  </>
                )}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="flex items-center gap-1">Este convênio exige prestação de contas? <HelpTip text="Se exigir, o prestador terá um prazo (em dias, contado da data do pagamento) para prestar contas de cada competência, com alertas automáticos para a APC." /></Label>
                    <Switch checked={!!form.exige_prestacao_contas} onCheckedChange={(v) => setForm({ ...form, exige_prestacao_contas: v })} />
                  </div>
                  {form.exige_prestacao_contas && (
                    <div className="space-y-3">
                      <div><Label className="flex items-center gap-1">Prazo de prestação de contas (dias) <HelpTip text="Dias corridos, contados a partir da DATA DO PAGAMENTO, para o prestador realizar a prestação de contas. Alimenta os alertas do setor APC (D-7, D-3 e vencimento)." /></Label><Input inputMode="numeric" placeholder="ex.: 30" value={form.prazo_prestacao_contas_dias} onChange={(e) => setForm({ ...form, prazo_prestacao_contas_dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label className="flex items-center gap-1">Retorno da Entidade (dias) <HelpTip text="Dias corridos para a Entidade responder as diligências (ofício/relatório de análise) antes de o sistema alertar o responsável." /></Label><Input inputMode="numeric" placeholder="ex.: 30" value={form.prazo_retorno_entidade_dias} onChange={(e) => setForm({ ...form, prazo_retorno_entidade_dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
                        <div><Label className="flex items-center gap-1">Manifestação da CGM (dias) <HelpTip text="Dias corridos para a Controladoria-Geral do Município emitir o parecer final após o encaminhamento. Opcional — pode ficar em branco." /></Label><Input inputMode="numeric" placeholder="opcional" value={form.prazo_retorno_cgm_dias} onChange={(e) => setForm({ ...form, prazo_retorno_cgm_dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
                      </div>
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
                        <span>Nota: Deixar o prazo da CGM em branco desativará a geração automática de alertas de atraso para esta fase de controle. É altamente recomendável preencher todos os três prazos acima para garantir a eficácia total do painel de Gestão à Vista e auditoria cronológica.</span>
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <Label className="flex items-center gap-1">Exige Relatório de Análise na Etapa 6? <HelpTip text="Se desativado, o passo do Relatório de Análise e sua assinatura serão pulados na Etapa 6." /></Label>
                    <Switch checked={!!form.exige_relatorio_analise} onCheckedChange={(v) => setForm({ ...form, exige_relatorio_analise: v })} />
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.prestador_id || create.isPending}>{editId ? "Salvar" : "Cadastrar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {convenios.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum convênio cadastrado ainda.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {(convenios as any[]).map((c) => {
          const parcelas = Number(c.total_parcelas ?? 0);
          const tasC = (tas as any[]).filter((t) => t.convenio_id === c.id); // já ordenados por data desc
          const nTas = tasC.length;
          // Teto efetivo = teto do aditivo mais recente que informou novo teto; senão o do convênio.
          const taComTeto = tasC.find((t) => Number(t.valor_total) > 0);
          const tetoEfetivo = taComTeto ? Number(taComTeto.valor_total) : Number(c.teto_mensal ?? 0);
          return (
            <Card key={c.id} className="overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-primary to-acp" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-primary">{c.prestadores?.nome_instituicao ?? "—"}</CardTitle>
                    {c.link_processo_sei ? <div className="mt-1"><SeiButton href={c.link_processo_sei} label="Processo no SEI" /></div> : <p className="text-xs text-muted-foreground mt-0.5">Processo SEI não informado</p>}
                  </div>
                  {(() => {
                    const statusEfetivo = statusConvenioEfetivo(c);
                    return (
                      <Badge variant="outline" className={`capitalize ${statusEfetivo === "encerrado" ? "border-destructive text-destructive" : statusEfetivo === "suspenso" ? "border-warning text-warning" : "border-success text-success"}`}>
                        {statusEfetivo}
                      </Badge>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.objeto && <p className="text-sm text-muted-foreground line-clamp-2">{c.objeto}</p>}
                <div className="flex flex-wrap gap-2 text-xs">
                  {tetoEfetivo > 0 && <Badge variant="secondary">teto mensal {brl(tetoEfetivo)}{taComTeto ? ` (${taComTeto.identificador})` : ""}</Badge>}
                  {c.pagamento_pontual ? (
                    <Badge variant="secondary">Pagamentos Complementares</Badge>
                  ) : (
                    <Badge variant="secondary">{parcelas ? `${parcelas} parcelas` : "parcelas não informadas"}</Badge>
                  )}
                  {(c.dia_inicio_execucao || c.dia_fim_execucao) && <Badge variant="secondary">prazo dia {c.dia_inicio_execucao ?? "?"}–{c.dia_fim_execucao ?? "?"}</Badge>}
                  {c.exige_prestacao_contas === false
                    ? <Badge variant="outline">sem prestação de contas</Badge>
                    : Number(c.prazo_prestacao_contas_dias) > 0
                      ? <Badge variant="secondary">prestação de contas em {c.prazo_prestacao_contas_dias} dias</Badge>
                      : <Badge variant="outline" className="border-warning/50 text-warning-foreground">prestação de contas sem prazo definido</Badge>}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />{nTas} termo(s) aditivo(s)</span>
                  <div className="flex gap-2">
                    {canCriar && <Button variant="ghost" size="sm" onClick={() => abrirEdicao(c)}><Pencil className="h-4 w-4 mr-1.5" />Editar</Button>}
                    {canCriar && (
                      c.status_convenio === "encerrado" ? (
                        <Button variant="outline" size="sm" className="text-success border-success/40 hover:bg-success/5 h-8" onClick={() => { setLifecycleAction({ type: "reabrir", convenio: c }); setJustificativa(""); }}>
                          <Play className="h-3.5 w-3.5 mr-1" />Reabrir
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/5 h-8" onClick={() => { setLifecycleAction({ type: "encerrar", convenio: c }); setJustificativa(""); }}>
                          <Power className="h-3.5 w-3.5 mr-1" />Encerrar
                        </Button>
                      )
                    )}
                    <Button variant="outline" size="sm" onClick={() => setTaPara(c)}><FileStack className="h-4 w-4 mr-1.5" />Termos aditivos</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {taPara && (
        <TermosAditivosDialog
          convenio={taPara}
          tas={(tas as any[]).filter((t) => t.convenio_id === taPara.id)}
          empenhos={empenhos as any[]}
          canEdit={canCriar}
          isAdmin={isAdmin}
          onClose={() => setTaPara(null)}
        />
      )}

      <Dialog open={!!lifecycleAction} onOpenChange={(o) => !o && setLifecycleAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lifecycleAction?.type === "encerrar" ? "Encerrar Convênio Manualmente" : "Reabrir Convênio"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {lifecycleAction?.type === "encerrar"
                ? "Esta ação encerrará o convênio imediatamente. Lançamentos futuros não poderão ser criados."
                : "Esta ação reativará o convênio, tornando-o ativo para novos lançamentos."}
            </p>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs font-semibold">Justificativa Obrigatória</Label>
              <Textarea
                placeholder="Digite a justificativa para esta ação..."
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setLifecycleAction(null)}>Cancelar</Button>
            <Button
              variant={lifecycleAction?.type === "encerrar" ? "destructive" : "default"}
              onClick={() => handleLifecycleMutation.mutate()}
              disabled={!justificativa.trim() || handleLifecycleMutation.isPending}
            >
              {lifecycleAction?.type === "encerrar" ? "Encerrar" : "Reabrir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TermosAditivosDialog({ convenio, tas, empenhos, canEdit, isAdmin, onClose }: any) {
  const qc = useQueryClient();
  const emptyTa = { identificador: "", valor_total: 0, objeto: "", link_termo_sei: "", link_extrato_sei: "", data_assinatura: "" };
  const [ta, setTa] = useState<any>(emptyTa);
  const [editTaId, setEditTaId] = useState<string | null>(null);
  const editarTa = (t: any) => { setEditTaId(t.id); setTa({ identificador: t.identificador ?? "", valor_total: Number(t.valor_total ?? 0), objeto: t.objeto ?? "", link_termo_sei: t.link_termo_sei ?? "", link_extrato_sei: t.link_extrato_sei ?? "", data_assinatura: t.data_assinatura ?? "" }); };

  const addTa = useMutation({
    mutationFn: async () => {
      const dados = {
        convenio_id: convenio.id,
        identificador: ta.identificador,
        valor_total: ta.valor_total || null,
        objeto: ta.objeto || null,
        link_termo_sei: ta.link_termo_sei || null,
        link_extrato_sei: ta.link_extrato_sei || null,
        data_assinatura: ta.data_assinatura || null,
      };
      if (editTaId) {
        const { error } = await supabase.from("termos_aditivos").update(dados as any).eq("id", editTaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("termos_aditivos").insert(dados as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["termos_aditivos"] }); setTa(emptyTa); setEditTaId(null); toast.success(editTaId ? "Termo aditivo atualizado" : "Termo aditivo adicionado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delTa = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("termos_aditivos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["termos_aditivos"] }); toast.success("Termo aditivo removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Termos aditivos · {convenio.prestadores?.nome_instituicao}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {tas.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum termo aditivo cadastrado.</p>}
          {tas.map((t: any) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{t.identificador}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.data_assinatura ? `Assinado em ${new Date(t.data_assinatura).toLocaleDateString("pt-BR")}` : "Sem data de assinatura"}
                    {Number(t.valor_total) > 0 ? ` · novo teto mensal ${brl(Number(t.valor_total))}` : " · mantém o teto do convênio"}
                  </div>
                  {t.objeto && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.objeto}</div>}
                  <div className="flex gap-2 mt-1.5">
                    {t.link_termo_sei && <SeiButton href={t.link_termo_sei} label="Termo" />}
                    {t.link_extrato_sei && <SeiButton href={t.link_extrato_sei} label="Extrato" />}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editarTa(t)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delTa.mutate(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{editTaId ? "Editar termo aditivo" : "Adicionar termo aditivo"}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs flex items-center gap-1">Identificador <HelpTip text="Nome do termo aditivo, ex.: '4º Termo Aditivo'." /></Label><Input placeholder="4º Termo Aditivo" value={ta.identificador} onChange={(e) => setTa({ ...ta, identificador: e.target.value })} /></div>
              <div><Label className="text-xs flex items-center gap-1">Novo teto mensal (opcional) <HelpTip text="Só preencha se este aditivo ALTERA o teto mensal. Em branco, mantém o teto do convênio." /></Label><CurrencyInput value={ta.valor_total} onChange={(n) => setTa({ ...ta, valor_total: n })} /></div>
              <div className="col-span-2"><Label className="text-xs flex items-center gap-1">Objeto do termo aditivo <HelpTip text="Descrição do que o termo aditivo altera/inclui." /></Label><Textarea rows={2} value={ta.objeto} onChange={(e) => setTa({ ...ta, objeto: e.target.value })} /></div>
              <div><Label className="text-xs flex items-center gap-1">Link do Termo Aditivo (SEI) <HelpTip text="Link do documento do termo aditivo no SEI." /></Label><Input placeholder="https://sei..." value={ta.link_termo_sei} onChange={(e) => setTa({ ...ta, link_termo_sei: e.target.value })} /></div>
              <div><Label className="text-xs">Data de assinatura <HelpTip text="A vigência começa a partir da data de assinatura." /></Label><Input type="date" value={ta.data_assinatura} onChange={(e) => setTa({ ...ta, data_assinatura: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs flex items-center gap-1">Link Extrato do Termo Aditivo (SEI) <HelpTip text="Link do extrato de publicação do termo aditivo no SEI." /></Label><Input placeholder="https://sei..." value={ta.link_extrato_sei} onChange={(e) => setTa({ ...ta, link_extrato_sei: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              {editTaId && <Button size="sm" variant="outline" onClick={() => { setEditTaId(null); setTa(emptyTa); }}>Cancelar</Button>}
              <Button size="sm" onClick={() => addTa.mutate()} disabled={!ta.identificador || addTa.isPending}><Plus className="h-4 w-4 mr-1" />{editTaId ? "Salvar" : "Adicionar"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
