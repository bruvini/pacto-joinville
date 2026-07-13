import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SETORES } from "@/lib/setores";
import { dateTime } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { registrarAcesso } from "@/lib/acesso";
import { Users, Clock, ShieldCheck, Mail, Building, CalendarClock, History, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Gestão de Usuários" }] }),
  // Defesa em profundidade: página exclusiva de administradores.
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(r ?? []).some((x) => x.role === "admin")) throw redirect({ to: "/dashboard" });
  },
  component: UsuariosPage,
});

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", acp: "ACP — edita etapas da ACP", aco: "UFI — edita etapas da UFI (Gestão Financeira)" };

function UsuariosPage() {
  const qc = useQueryClient();
  const [selUser, setSelUser] = useState<any | null>(null);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios_papeis"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, nome, email, setor, created_at").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role);
        byUser.set(r.user_id, arr);
      });
      const lista = (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
      return lista.sort((a, b) => (a.roles.length === 0 ? -1 : 0) - (b.roles.length === 0 ? -1 : 0));
    },
  });
  const pendentes = usuarios.filter((u: any) => u.roles.length === 0).length;

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["usuarios_papeis"] }); toast.success("Papel atualizado"); void registrarAcesso("usuario_gerenciado", { detalhe: `Papel definido: ${vars.role}` }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setSetor = useMutation({
    mutationFn: async ({ userId, setor }: { userId: string; setor: string }) => {
      const { error } = await supabase.from("profiles").update({ setor }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["usuarios_papeis"] }); toast.success("Setor atualizado"); void registrarAcesso("usuario_gerenciado", { detalhe: `Setor definido: ${vars.setor}` }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Users className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">Aprovação de acesso, papéis e setores · clique no nome para ver os dados de acesso (LGPD)</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild><Link to="/logs-acesso"><History className="h-4 w-4 mr-1.5" />Logs de acesso<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Usuários & Papéis</CardTitle>
          <CardDescription>
            Novos cadastros entram <b>pendentes</b>: definir um papel libera o acesso.
            A segregação de função é aplicada no banco de dados (ISO 27001 A.5.3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendentes > 0 && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm flex items-center gap-1.5">
              <Clock className="h-4 w-4" /><span><b>{pendentes}</b> usuário(s) aguardando aprovação de acesso.</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr><th className="py-2">Usuário</th><th>E-mail</th><th>Setor</th><th>Papel atual</th><th>Definir papel</th></tr>
              </thead>
              <tbody>
                {usuarios.map((u: any) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2">
                      <button className="font-medium text-primary hover:underline text-left" onClick={() => setSelUser(u)}>{u.nome}</button>
                    </td>
                    <td className="text-muted-foreground">{u.email}</td>
                    <td>
                      <Select value={u.setor ?? ""} onValueChange={(setor) => setSetor.mutate({ userId: u.id, setor })}>
                        <SelectTrigger className="w-[230px]"><SelectValue placeholder="Definir setor" /></SelectTrigger>
                        <SelectContent>
                          {SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td>{u.roles.length ? u.roles.map((r: string) => <Badge key={r} className="mr-1">{(ROLE_LABEL[r] ?? r).split(" — ")[0]}</Badge>) : <Badge variant="outline" className="border-warning/50 text-warning-foreground gap-1"><Clock className="h-3 w-3" />Pendente</Badge>}</td>
                    <td>
                      <Select value={u.roles[0] ?? ""} onValueChange={(role) => setRole.mutate({ userId: u.id, role })}>
                        <SelectTrigger className="w-[230px]"><SelectValue placeholder="Selecionar papel" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum usuário.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selUser && <UsuarioDialog usuario={selUser} onClose={() => setSelUser(null)} />}
    </div>
  );
}

/** Modal com os dados do usuário + histórico de acessos (LGPD). */
function UsuarioDialog({ usuario, onClose }: { usuario: any; onClose: () => void }) {
  const { data: acessos = [], isLoading } = useQuery({
    queryKey: ["acessos-usuario", usuario.id],
    queryFn: async () => (await supabase.from("logs_acesso").select("*").eq("user_id", usuario.id).order("created_at", { ascending: false }).limit(60)).data ?? [],
  });
  const logins = (acessos as any[]).filter((a) => a.acao === "login");
  // Último acesso real: prioriza o evento de login; na ausência dele, usa o registro
  // de acesso mais recente (a coleção logs_acesso é ordenada por created_at desc).
  const ultimoLogin = logins[0]?.created_at ?? (acessos as any[])[0]?.created_at ?? null;
  const trintaDias = Date.now() - 30 * 86400000;
  const acoes30d = (acessos as any[]).filter((a) => new Date(a.created_at).getTime() >= trintaDias).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{usuario.nome}
            {usuario.roles?.length
              ? usuario.roles.map((r: string) => <Badge key={r}>{r === "admin" ? "Administrador" : r === "aco" ? "UFI" : r.toUpperCase()}</Badge>)
              : <Badge variant="outline" className="border-warning/50 text-warning-foreground">Pendente</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoItem icon={Mail} label="E-mail" valor={usuario.email} />
          <InfoItem icon={Building} label="Setor" valor={usuario.setor ?? "Não definido"} />
          <InfoItem icon={CalendarClock} label="Cadastrado em" valor={usuario.created_at ? dateTime(usuario.created_at) : "—"} />
          <InfoItem icon={Clock} label="Último login" valor={ultimoLogin ? dateTime(ultimoLogin) : "Nunca registrado"} />
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Últimos acessos</div>
            <Badge variant="secondary">{acoes30d} ação(ões) em 30 dias</Badge>
          </div>
          {isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
            : (acessos as any[]).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum acesso registrado ainda (a trilha começa a contar a partir da ativação do log).</p> : (
            <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {(acessos as any[]).map((a: any) => (
                <li key={a.id} className="flex items-center gap-2 text-xs border-b last:border-0 py-1.5">
                  <Badge variant={a.acao === "login" ? "default" : a.acao === "logout" ? "outline" : "secondary"} className="w-24 justify-center">{SIGLA_ACAO[a.acao] ?? a.acao}</Badge>
                  <span className="text-muted-foreground whitespace-nowrap">{dateTime(a.created_at)}</span>
                  <span className="truncate text-foreground/80">{a.rota ?? a.detalhe ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Dados de acesso mantidos para fins de auditoria e segurança (LGPD Art. 46). A trilha completa e filtrável está em <Link to="/logs-acesso" className="text-primary hover:underline">Logs de Acesso</Link>.</p>
      </DialogContent>
    </Dialog>
  );
}

const SIGLA_ACAO: Record<string, string> = { login: "Login", logout: "Logout", navegacao: "Navegação", relatorio: "Relatório" };

function InfoItem({ icon: Icon, label, valor }: { icon: any; label: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3 flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{valor}</div>
      </div>
    </div>
  );
}
