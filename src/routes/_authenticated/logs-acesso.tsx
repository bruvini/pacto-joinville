import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/HelpTip";
import { dateTime } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { History, Filter, FileDown, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/logs-acesso")({
  head: () => ({ meta: [{ title: "Logs de Acesso" }] }),
  // Trilha de auditoria: leitura exclusiva de administradores (RLS + rota).
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(r ?? []).some((x) => x.role === "admin")) throw redirect({ to: "/dashboard" });
  },
  component: LogsAcessoPage,
});

const ACAO_LABEL: Record<string, string> = { login: "Login", logout: "Logout", navegacao: "Navegação", relatorio: "Relatório" };
const ROTA_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard", "/lancamentos": "Lançamentos", "/prestacao-contas": "Prestação de Contas",
  "/auditoria": "Auditoria", "/convenios": "Convênios", "/prestadores": "Prestadores",
  "/usuarios": "Gestão de Usuários", "/logs-acesso": "Logs de Acesso", "/configuracoes": "Configurações", "/sobre": "Sobre",
};
const rotaLabel = (rota: string | null) => {
  if (!rota) return "";
  if (rota.startsWith("/lancamentos/")) return "Processo de Empenho";
  return ROTA_LABEL[rota] ?? rota;
};

function LogsAcessoPage() {
  const [fUser, setFUser] = useState("all");
  const [fAcao, setFAcao] = useState("all");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  const { data: perfis = [] } = useQuery({
    queryKey: ["perfis-logs"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome").order("nome")).data ?? [],
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["logs-acesso", fUser, fAcao, fDe, fAte],
    queryFn: async () => {
      let q = supabase.from("logs_acesso").select("*").order("created_at", { ascending: false }).limit(500);
      if (fUser !== "all") q = q.eq("user_id", fUser);
      if (fAcao !== "all") q = q.eq("acao", fAcao);
      if (fDe) q = q.gte("created_at", `${fDe}T00:00:00`);
      if (fAte) q = q.lte("created_at", `${fAte}T23:59:59`);
      return (await q).data ?? [];
    },
  });

  const exportarCsv = () => {
    if ((logs as any[]).length === 0) return toast.error("Nada para exportar neste recorte.");
    const cab = ["Data/Hora", "Usuário", "E-mail", "Ação", "Rota", "Detalhe", "Navegador"];
    const linhas = (logs as any[]).map((l) => [
      dateTime(l.created_at), l.usuario_nome ?? "", l.usuario_email ?? "",
      ACAO_LABEL[l.acao] ?? l.acao, l.rota ?? "", l.detalhe ?? "", l.user_agent ?? "",
    ]);
    const csv = [cab, ...linhas]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logs-acesso-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><History className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Logs de Acesso</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />Trilha imutável de acessos e ações (LGPD Art. 46 / ISO 27001) · exibindo os 500 mais recentes do recorte
            </p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-48">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Usuário</Label>
            <Select value={fUser} onValueChange={setFUser}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(perfis as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs">Ação</Label>
            <Select value={fAcao} onValueChange={setFAcao}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(ACAO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">De</Label><Input type="date" className="h-9 w-36" value={fDe} onChange={(e) => setFDe(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" className="h-9 w-36" value={fAte} onChange={(e) => setFAte(e.target.value)} /></div>
          <Button variant="outline" className="h-9" onClick={exportarCsv}><FileDown className="h-4 w-4 mr-1.5" />Exportar CSV</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-4">Data/Hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Onde / O quê</th>
                  <th className="pr-4">Navegador <HelpTip text="Identificação do dispositivo/navegador (user agent) registrada no acesso." /></th>
                </tr>
              </thead>
              <tbody>
                {(logs as any[]).map((l: any) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-2 px-4 whitespace-nowrap tabular-nums text-muted-foreground">{dateTime(l.created_at)}</td>
                    <td>
                      <div className="font-medium">{l.usuario_nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.usuario_email ?? ""}</div>
                    </td>
                    <td><Badge variant={l.acao === "login" ? "default" : l.acao === "logout" ? "outline" : "secondary"}>{ACAO_LABEL[l.acao] ?? l.acao}</Badge></td>
                    <td className="max-w-[320px]">
                      <div className="truncate">{rotaLabel(l.rota) || l.detalhe || "—"}</div>
                      {l.rota && l.detalhe && <div className="text-xs text-muted-foreground truncate">{l.detalhe}</div>}
                    </td>
                    <td className="pr-4 max-w-[220px]"><span className="text-xs text-muted-foreground truncate block" title={l.user_agent ?? ""}>{(l.user_agent ?? "—").split(") ")[0].slice(0, 60)}</span></td>
                  </tr>
                ))}
                {!isLoading && (logs as any[]).length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum registro neste recorte. A trilha começa a gravar a partir da aplicação da migração.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
