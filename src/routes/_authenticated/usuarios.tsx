import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETORES } from "@/lib/setores";
import { dateTime } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { registrarAcesso } from "@/lib/acesso";
import {
  Users,
  Clock,
  ShieldCheck,
  Mail,
  Building,
  CalendarClock,
  History,
  ArrowRight,
  UserCheck,
  UserCog,
  Shield,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Gestão de Usuários" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    if (!(r ?? []).some((x) => x.role === "admin"))
      throw redirect({ to: "/dashboard" });
  },
  component: UsuariosPage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  acp: "ACP — edita etapas da ACP",
  aco: "UFI — edita etapas da UFI (Gestão Financeira)",
};

const ROLE_CURTO: Record<string, string> = {
  admin: "Administrador",
  acp: "ACP",
  aco: "UFI",
};

function UsuariosPage() {
  const qc = useQueryClient();
  const [selUser, setSelUser] = useState<any | null>(null);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios_papeis"],
    queryFn: async () => {
      const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, nome, email, setor, created_at")
            .order("nome"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (profileError) throw profileError;
      if (roleError) throw roleError;

      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role);
        byUser.set(r.user_id, arr);
      });

      const lista = (profiles ?? []).map((p) => ({
        ...p,
        roles: byUser.get(p.id) ?? [],
      }));

      return lista.sort((a, b) => {
        const pendA = a.roles.length === 0 ? 0 : 1;
        const pendB = b.roles.length === 0 ? 0 : 1;
        return pendA - pendB || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
      });
    },
  });

  const pendentes = usuarios.filter((u: any) => u.roles.length === 0).length;
  const administradores = usuarios.filter((u: any) => u.roles.includes("admin")).length;
  const liberados = usuarios.length - pendentes;

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw delErr;

      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const alvo = usuarios.find((u: any) => u.id === vars.userId);
      qc.invalidateQueries({ queryKey: ["usuarios_papeis"] });
      toast.success("Papel atualizado");
      void registrarAcesso("usuario_gerenciado", {
        detalhe: `Usuário: ${alvo?.nome ?? vars.userId} · papel definido: ${ROLE_CURTO[vars.role] ?? vars.role}`,
        rota: "/usuarios",
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setSetor = useMutation({
    mutationFn: async ({ userId, setor }: { userId: string; setor: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ setor })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const alvo = usuarios.find((u: any) => u.id === vars.userId);
      qc.invalidateQueries({ queryKey: ["usuarios_papeis"] });
      toast.success("Setor atualizado");
      void registrarAcesso("usuario_gerenciado", {
        detalhe: `Usuário: ${alvo?.nome ?? vars.userId} · setor definido: ${vars.setor}`,
        rota: "/usuarios",
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-primary">
              Gestão de Usuários
            </h1>
            <p className="text-sm text-muted-foreground">
              Aprove acessos, defina o setor e atribua o papel de cada usuário.
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link to="/logs-acesso">
            <History className="mr-1.5 h-4 w-4" />
            Auditar acessos
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ResumoCard
          icon={Users}
          label="Usuários cadastrados"
          valor={usuarios.length}
          detalhe="Perfis existentes no sistema"
        />
        <ResumoCard
          icon={UserCheck}
          label="Acessos liberados"
          valor={liberados}
          detalhe="Usuários com papel definido"
        />
        <ResumoCard
          icon={pendentes > 0 ? Clock : Shield}
          label="Aguardando aprovação"
          valor={pendentes}
          detalhe={
            pendentes > 0
              ? "Precisam receber um papel para acessar"
              : `${administradores} administrador(es) ativo(s)`
          }
          alerta={pendentes > 0}
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Controle de acesso e segregação de função
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Novos cadastros ficam pendentes. O acesso é liberado somente depois que um
                administrador define o papel. O setor identifica a unidade de atuação e o
                papel determina quais partes do fluxo podem ser alteradas.
              </p>
            </div>
            <Badge variant="secondary">ISO 27001 · segregação de função</Badge>
          </div>

          {pendentes > 0 && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                <b>{pendentes}</b> usuário(s) ainda não possuem acesso liberado.
              </span>
            </div>
          )}

          <div className="space-y-3">
            {usuarios.map((u: any) => {
              const pendente = u.roles.length === 0;
              return (
                <div
                  key={u.id}
                  className={`rounded-xl border p-4 transition ${
                    pendente
                      ? "border-amber-300/70 bg-amber-50/40"
                      : "bg-card hover:border-primary/25"
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(260px,1.25fr)_minmax(260px,1fr)_minmax(260px,1fr)] xl:items-end">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button
                          className="truncate text-left text-base font-semibold text-primary hover:underline"
                          onClick={() => setSelUser(u)}
                        >
                          {u.nome}
                        </button>
                        {u.roles.length ? (
                          u.roles.map((r: string) => (
                            <Badge key={r}>{ROLE_CURTO[r] ?? r}</Badge>
                          ))
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-400 text-amber-800"
                          >
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                      <button
                        onClick={() => setSelUser(u)}
                        className="mt-2 text-xs font-medium text-primary hover:underline"
                      >
                        Ver dados e histórico de acesso
                      </button>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Setor / unidade
                      </label>
                      <Select
                        value={u.setor ?? ""}
                        onValueChange={(setor) =>
                          setSetor.mutate({ userId: u.id, setor })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Definir setor" />
                        </SelectTrigger>
                        <SelectContent>
                          {SETORES.map((setor) => (
                            <SelectItem key={setor} value={setor}>
                              {setor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Papel de acesso
                      </label>
                      <Select
                        value={u.roles[0] ?? ""}
                        onValueChange={(role) =>
                          setRole.mutate({ userId: u.id, role })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecionar papel para liberar acesso" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABEL).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {u.roles[0]
                          ? ROLE_LABEL[u.roles[0]] ?? u.roles[0]
                          : "Sem papel: o usuário permanece bloqueado."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {usuarios.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum usuário cadastrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selUser && (
        <UsuarioDialog usuario={selUser} onClose={() => setSelUser(null)} />
      )}
    </div>
  );
}

function ResumoCard({
  icon: Icon,
  label,
  valor,
  detalhe,
  alerta = false,
}: {
  icon: any;
  label: string;
  valor: number;
  detalhe: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alerta ? "border-amber-300/70 bg-amber-50/50" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{valor}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            alerta ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

/** Modal com os dados do usuário + histórico de acessos (LGPD). */
function UsuarioDialog({
  usuario,
  onClose,
}: {
  usuario: any;
  onClose: () => void;
}) {
  const { data: acessos = [], isLoading } = useQuery({
    queryKey: ["acessos-usuario", usuario.id],
    queryFn: async () =>
      (
        await supabase
          .from("logs_acesso")
          .select("*")
          .eq("user_id", usuario.id)
          .order("created_at", { ascending: false })
          .limit(60)
      ).data ?? [],
  });

  const logins = (acessos as any[]).filter((a) => a.acao === "login");
  const ultimoLogin =
    logins[0]?.created_at ?? (acessos as any[])[0]?.created_at ?? null;
  const trintaDias = Date.now() - 30 * 86400000;
  const acoes30d = (acessos as any[]).filter(
    (a) => new Date(a.created_at).getTime() >= trintaDias,
  ).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {usuario.nome}
            {usuario.roles?.length ? (
              usuario.roles.map((r: string) => (
                <Badge key={r}>{ROLE_CURTO[r] ?? r}</Badge>
              ))
            ) : (
              <Badge
                variant="outline"
                className="border-amber-400 text-amber-800"
              >
                Pendente
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <InfoItem icon={Mail} label="E-mail" valor={usuario.email} />
          <InfoItem
            icon={Building}
            label="Setor"
            valor={usuario.setor ?? "Não definido"}
          />
          <InfoItem
            icon={CalendarClock}
            label="Cadastrado em"
            valor={usuario.created_at ? dateTime(usuario.created_at) : "—"}
          />
          <InfoItem
            icon={Clock}
            label="Último acesso registrado"
            valor={ultimoLogin ? dateTime(ultimoLogin) : "Nunca registrado"}
          />
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Atividade recente
            </div>
            <Badge variant="secondary">{acoes30d} evento(s) em 30 dias</Badge>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : (acessos as any[]).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum acesso registrado ainda.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {(acessos as any[]).map((a: any) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b py-2 text-xs last:border-0"
                >
                  <Badge
                    variant={
                      a.acao === "login"
                        ? "default"
                        : a.acao === "logout"
                          ? "outline"
                          : "secondary"
                    }
                    className="row-span-2 min-w-24 justify-center self-start"
                  >
                    {SIGLA_ACAO[a.acao] ?? a.acao}
                  </Badge>
                  <span className="font-medium text-foreground/85">
                    {a.detalhe || a.rota || "Evento registrado"}
                  </span>
                  <span className="text-muted-foreground">
                    {dateTime(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Dados mantidos para auditoria e segurança (LGPD Art. 46). A trilha
          completa está em{" "}
          <Link to="/logs-acesso" className="text-primary hover:underline">
            Logs de Acesso
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

const SIGLA_ACAO: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  navegacao: "Navegação",
  relatorio: "Relatório",
  usuario_gerenciado: "Usuário",
  assinatura_registrada: "Assinatura",
  assinatura_removida: "Assinatura",
  lancamento_editado: "Empenho",
};

function InfoItem({
  icon: Icon,
  label,
  valor,
}: {
  icon: any;
  label: string;
  valor: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="truncate font-medium">{valor}</div>
      </div>
    </div>
  );
}
