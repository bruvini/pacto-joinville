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
import { etapaLabel, dateTime } from "@/lib/format";

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
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários & Papéis</TabsTrigger>
          <TabsTrigger value="assinaturas">Matriz de Assinaturas SEI</TabsTrigger>
          <TabsTrigger value="sla">SLA & Prazos</TabsTrigger>
          <TabsTrigger value="notif">Notificações</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios"><UsuariosPapeis /></TabsContent>
        <TabsContent value="assinaturas"><AssinaturasMatriz /></TabsContent>
        <TabsContent value="sla"><SlaConfig /></TabsContent>
        <TabsContent value="notif"><NotifLog /></TabsContent>
      </Tabs>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", acp: "ACP — Convênios e Parcerias", aco: "ACO — Área de Contratos" };

function UsuariosPapeis() {
  const qc = useQueryClient();
  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios_papeis"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, nome, email").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  // Define o papel principal do usuário (admin/acp/aco), substituindo os demais.
  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios_papeis"] }); toast.success("Papel atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usuários & Papéis (controle de acesso)</CardTitle>
        <CardDescription>
          Cada usuário tem um papel: <b>ACP</b> (edita campos da ACP), <b>ACO</b> (edita campos da ACO) ou <b>Administrador</b> (acesso total).
          A segregação de função é aplicada no banco de dados (ISO 27001 A.5.3).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="py-2">Usuário</th><th>E-mail</th><th>Papel atual</th><th>Definir papel</th></tr>
          </thead>
          <tbody>
            {usuarios.map((u: any) => (
              <tr key={u.id} className="border-b">
                <td className="py-2 font-medium">{u.nome}</td>
                <td className="text-muted-foreground">{u.email}</td>
                <td>{u.roles.length ? u.roles.map((r: string) => <Badge key={r} className="mr-1">{ROLE_LABEL[r] ?? r}</Badge>) : <span className="text-muted-foreground">—</span>}</td>
                <td>
                  <Select value={u.roles[0] ?? ""} onValueChange={(role) => setRole.mutate({ userId: u.id, role })}>
                    <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecionar papel" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum usuário.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AssinaturasMatriz() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", codigo_sei: "", ordem: 0 });
  const { data = [] } = useQuery({
    queryKey: ["assinaturas_config"],
    queryFn: async () => (await supabase.from("assinaturas_config").select("*").order("etapa").order("ordem")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assinaturas_config").insert(form as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas_config"] }); setForm({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", codigo_sei: "", ordem: 0 }); toast.success("Assinatura cadastrada"); },
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
        <CardTitle className="text-base">Matriz vigente de assinaturas SEI</CardTitle>
        <CardDescription>
          As assinaturas configuradas aqui são copiadas para cada novo lançamento. Alterações não afetam lançamentos existentes (histórico preservado).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 bg-muted/30 rounded">
          <div className="md:col-span-2">
            <Label className="text-xs">Etapa</Label>
            <Select value={form.etapa} onValueChange={(v) => setForm({ ...form, etapa: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(etapaLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Servidor</Label><Input value={form.nome_servidor} onChange={(e) => setForm({ ...form, nome_servidor: e.target.value })} /></div>
          <div><Label className="text-xs">Cargo</Label><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
          <div><Label className="text-xs">Código SEI</Label><Input value={form.codigo_sei} onChange={(e) => setForm({ ...form, codigo_sei: e.target.value })} /></div>
          <Button onClick={() => create.mutate()} disabled={!form.nome_servidor || !form.cargo || !form.codigo_sei}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        {Object.entries(etapaLabel).map(([etapa, label]) => {
          const items = data.filter((a: any) => a.etapa === etapa);
          return (
            <div key={etapa}>
              <h3 className="font-semibold text-sm mb-2 text-primary">{label}</h3>
              {items.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum signatário.</p> : (
                <ul className="space-y-1">
                  {items.map((a: any) => (
                    <li key={a.id} className="flex items-center gap-3 p-2 border rounded">
                      <Switch checked={a.ativo} onCheckedChange={() => toggle.mutate(a)} />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{a.nome_servidor} <span className="text-muted-foreground font-normal">· {a.cargo}</span></div>
                        <div className="text-xs text-muted-foreground">SEI {a.codigo_sei}</div>
                      </div>
                      {!a.ativo && <Badge variant="secondary">inativo</Badge>}
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SlaConfig() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ parametro_nome: "", dias_uteis_prazo: "", data_limite_mensal: "", descricao: "" });
  const { data = [] } = useQuery({
    queryKey: ["sla_config"],
    queryFn: async () => (await supabase.from("sla_config").select("*").order("parametro_nome")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sla_config").insert({
        parametro_nome: form.parametro_nome,
        dias_uteis_prazo: form.dias_uteis_prazo ? Number(form.dias_uteis_prazo) : null,
        data_limite_mensal: form.data_limite_mensal ? Number(form.data_limite_mensal) : null,
        descricao: form.descricao || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sla_config"] }); setForm({ parametro_nome: "", dias_uteis_prazo: "", data_limite_mensal: "", descricao: "" }); toast.success("SLA cadastrado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("sla_config").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla_config"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SLA & Prazos (Padrão SUS)</CardTitle>
        <CardDescription>Defina prazos em dias úteis e a data limite mensal de encerramento de faturamento MAC/PAB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end p-3 bg-muted/30 rounded">
          <div className="md:col-span-2"><Label className="text-xs">Parâmetro</Label><Input placeholder="Ex: Solicitação de Empenho" value={form.parametro_nome} onChange={(e) => setForm({ ...form, parametro_nome: e.target.value })} /></div>
          <div><Label className="text-xs">Dias úteis</Label><Input type="number" value={form.dias_uteis_prazo} onChange={(e) => setForm({ ...form, dias_uteis_prazo: e.target.value })} /></div>
          <div><Label className="text-xs">Dia limite do mês</Label><Input type="number" min="1" max="31" value={form.data_limite_mensal} onChange={(e) => setForm({ ...form, data_limite_mensal: e.target.value })} /></div>
          <Button onClick={() => create.mutate()} disabled={!form.parametro_nome}>Salvar</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="py-2">Parâmetro</th><th>Dias úteis</th><th>Dia limite mensal</th><th></th></tr>
          </thead>
          <tbody>
            {data.map((s: any) => (
              <tr key={s.id} className="border-b">
                <td className="py-2 font-medium">{s.parametro_nome}</td>
                <td>{s.dias_uteis_prazo ?? "—"}</td>
                <td>{s.data_limite_mensal ? `Dia ${s.data_limite_mensal}` : "—"}</td>
                <td><Button variant="ghost" size="icon" onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum SLA configurado.</td></tr>}
          </tbody>
        </table>
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
