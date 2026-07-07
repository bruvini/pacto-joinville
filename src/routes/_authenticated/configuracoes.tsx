import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";
import { registrarAcesso } from "@/lib/acesso";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  // Defesa em profundidade: bloqueia não-admins já no roteamento.
  // A verdade continua sendo a RLS (admin-only) no banco.
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const isAdmin = (r ?? []).some((x) => x.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: ConfigPage,
});

function ConfigPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Configurações</h1>
      <p className="text-sm text-muted-foreground -mt-2">A gestão de usuários e papéis fica na página <b>Usuários</b> (menu lateral, exclusiva de administradores).</p>
      <Tabs defaultValue="assinaturas">
        <TabsList>
          <TabsTrigger value="assinaturas">Matriz de Assinaturas SEI</TabsTrigger>
          <TabsTrigger value="notif">Notificações</TabsTrigger>
          <TabsTrigger value="avancado">Avançado</TabsTrigger>
        </TabsList>
        <TabsContent value="assinaturas"><AssinaturasMatriz /></TabsContent>
        <TabsContent value="notif"><NotifLog /></TabsContent>
        <TabsContent value="avancado"><div className="space-y-4"><SlasPrestacao /><Avancado /></div></TabsContent>
      </Tabs>
    </div>
  );
}

const CARGOS = ["Fiscal", "Coordenador de Orçamentos", "Coordenador ACP", "Gerente", "Diretor de Serviços Complementares", "Diretoria Financeira", "Secretária de Saúde"];

function AssinaturasMatriz() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", ordem: 0 });
  const { data = [] } = useQuery({
    queryKey: ["assinaturas_config"],
    queryFn: async () => (await supabase.from("assinaturas_config").select("*").order("etapa").order("ordem")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assinaturas_config").insert(form as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas_config"] }); setForm({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", ordem: 0 }); toast.success("Assinatura cadastrada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (a: any) => { await supabase.from("assinaturas_config").update({ ativo: !a.ativo }).eq("id", a.id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assinaturas_config"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("assinaturas_config").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assinaturas_config"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signatários (pool de assinaturas)</CardTitle>
        <CardDescription>
          Cadastre cada servidor uma vez (nome + cargo). Eles ficam disponíveis para assinar
          em qualquer etapa, conforme o cargo exigido em cada bloco de assinatura.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 bg-muted/30 rounded">
          <div className="md:col-span-3"><Label className="text-xs flex items-center gap-1">Servidor <HelpTip text="Nome completo do servidor signatário." /></Label><Input value={form.nome_servidor} onChange={(e) => setForm({ ...form, nome_servidor: e.target.value })} /></div>
          <div className="md:col-span-2"><Label className="text-xs flex items-center gap-1">Cargo <HelpTip text="Função do signatário. Os blocos de assinatura aceitam cargos compatíveis (ex.: o slot 'Gerente/Coordenador ACP' aceita Gerente ou Coordenador ACP)." /></Label>
            <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
              <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={!form.nome_servidor || !form.cargo}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        {data.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum signatário cadastrado.</p> : (
          <ul className="space-y-1">
            {(data as any[]).map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 p-2 border rounded">
                <Switch checked={a.ativo} onCheckedChange={() => toggle.mutate(a)} />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{a.nome_servidor} <span className="text-muted-foreground font-normal">· {a.cargo}</span></div>
                </div>
                {!a.ativo && <Badge variant="secondary">inativo</Badge>}
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** SLAs de retorno da prestação de contas (Entidade / CGM). */
function SlasPrestacao() {
  const qc = useQueryClient();
  const CHAVES = ["prazo_retorno_entidade_dias", "prazo_retorno_cgm_dias"];
  const { data: cfg = [] } = useQuery({
    queryKey: ["cfg-slas-pc"],
    queryFn: async () => (await supabase.from("sistema_config").select("chave, valor, descricao").in("chave", CHAVES)).data ?? [],
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const valor = (chave: string) => draft[chave] ?? (cfg as any[]).find((c) => c.chave === chave)?.valor ?? "";

  const salvar = useMutation({
    mutationFn: async (chave: string) => {
      const v = String(Math.max(1, Number(valor(chave)) || 30));
      const { error } = await supabase.from("sistema_config").update({ valor: v }).eq("chave", chave);
      if (error) throw error;
      await registrarAcesso("config", { detalhe: `SLA de prestação de contas '${chave}' definido para ${v} dias` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cfg-slas-pc"] }); toast.success("Prazo atualizado"); },
    onError: (e: any) => toast.error(`${e.message} — rode a migração 20260707120000 no SQL editor.`),
  });

  const Campo = ({ chave, titulo, ajuda }: { chave: string; titulo: string; ajuda: string }) => (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Label className="text-xs flex items-center gap-1">{titulo} <HelpTip text={ajuda} /></Label>
        <Input type="number" min={1} value={valor(chave)} onChange={(e) => setDraft((d) => ({ ...d, [chave]: e.target.value }))} />
      </div>
      <Button size="sm" className="h-9" disabled={salvar.isPending} onClick={() => salvar.mutate(chave)}>Salvar</Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prazos de retorno da Prestação de Contas</CardTitle>
        <CardDescription>Dias corridos usados nos alertas automáticos de prazo vencido. O prazo de <b>recebimento</b> continua vindo de cada convênio.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo chave="prazo_retorno_entidade_dias" titulo="Retorno da Entidade (dias)" ajuda="Prazo para a Entidade responder as diligências (ofício/relatório de análise) antes de o sistema alertar o responsável." />
        <Campo chave="prazo_retorno_cgm_dias" titulo="Manifestação da CGM (dias)" ajuda="Prazo para a CGM se manifestar após o encaminhamento antes de o sistema alertar o responsável." />
      </CardContent>
    </Card>
  );
}

/** Chaves de sistema (sistema_config) — por ora, o modo retroativo. */
function Avancado() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["cfg-retroativo"],
    queryFn: async () => (await supabase.from("sistema_config").select("valor").eq("chave", "modo_retroativo").maybeSingle()).data,
  });
  const ativo = cfg?.valor === "1";

  const alternar = useMutation({
    mutationFn: async (ligar: boolean) => {
      const { error } = await supabase.from("sistema_config").update({ valor: ligar ? "1" : "0" }).eq("chave", "modo_retroativo");
      if (error) throw error;
      // Trilha de auditoria: ligar/desligar o modo retroativo fica registrado.
      await registrarAcesso("config", { detalhe: `Modo retroativo ${ligar ? "ATIVADO" : "desativado"}` });
    },
    onSuccess: (_d, ligar) => { qc.invalidateQueries({ queryKey: ["cfg-retroativo"] }); toast.success(ligar ? "Modo retroativo ativado" : "Modo retroativo desativado"); },
    onError: (e: any) => toast.error(`${e.message} — rode a migração 20260705120000 no SQL editor.`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-warning-foreground" />Modo retroativo (migração de dados históricos)</CardTitle>
        <CardDescription>
          Libera o preenchimento dos lançamentos <b>sem as travas de sequência de etapas</b>: dá para registrar processos
          antigos mesmo sem todas as assinaturas ou documentos, e concluí-los com etapas incompletas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${ativo ? "border-warning/50 bg-warning/10" : ""}`}>
          <div className="text-sm">
            <div className="font-semibold">{ativo ? "ATIVADO — travas de etapas desligadas para todos" : "Desativado — fluxo normal com travas"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Vale para todos os usuários enquanto estiver ligado. Cada ativação/desativação fica registrada nos Logs de Acesso.</div>
          </div>
          <Switch checked={ativo} onCheckedChange={(v) => alternar.mutate(v)} disabled={alternar.isPending} />
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>As etapas continuam mostrando o que está faltando (badges e % de progresso) — apenas as travas somem.</li>
          <li>O aviso de "reverter etapas seguintes" fica suspenso enquanto o modo estiver ativo.</li>
          <li><b>Desligue ao terminar a migração</b> para restaurar a disciplina do fluxo.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function NotifLog() {
  const { data = [] } = useQuery({
    queryKey: ["notificacoes_log_full"],
    queryFn: async () => (await supabase.from("notificacoes_log").select("*").order("data_envio", { ascending: false }).limit(50)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Log de notificações simuladas</CardTitle>
        <CardDescription>Avisos disparados automaticamente quando processos mudam de etapa ou setor responsável.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p> : (
          <ul className="space-y-2">
            {data.map((n: any) => (
              <li key={n.id} className="border rounded p-3">
                <div className="flex justify-between text-xs text-muted-foreground"><span>{n.tipo}</span><span>{dateTime(n.data_envio)}</span></div>
                <div className="font-medium text-sm">{n.assunto}</div>
                <div className="text-xs text-muted-foreground">Para: {n.destinatario}</div>
                {n.mensagem && <div className="text-sm mt-1">{n.mensagem}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
