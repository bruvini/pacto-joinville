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
import { Plus, Trash2 } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";
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
        </TabsList>
        <TabsContent value="assinaturas"><AssinaturasMatriz /></TabsContent>
        <TabsContent value="notif"><NotifLog /></TabsContent>
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
