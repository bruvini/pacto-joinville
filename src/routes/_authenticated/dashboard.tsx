import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl, etapaLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, FileCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

function competenciaAtual() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function Dashboard() {
  const comp = competenciaAtual();
  const { data: lancs = [] } = useQuery({
    queryKey: ["dash-lancs", comp],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos_pagamento")
        .select("*, prestadores(nome_instituicao)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const dosMes = lancs.filter((l: any) => l.competencia === comp);
  const totalSol = dosMes.reduce((s: number, l: any) => s + Number(l.valor_solicitado ?? 0), 0);
  const totalEmp = dosMes.reduce((s: number, l: any) => s + Number(l.valor_empenho_liquido ?? 0), 0);
  const totalAnul = dosMes.reduce((s: number, l: any) => s + Number(l.valor_anulado ?? 0), 0);
  const atrasados = lancs.filter((l: any) => l.data_limite && new Date(l.data_limite) < new Date() && !l.concluido);
  const { data: notifs = [] } = useQuery({
    queryKey: ["notifs"],
    queryFn: async () => (await supabase.from("notificacoes_log").select("*").order("data_envio", { ascending: false }).limit(8)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Competência atual: <span className="font-semibold">{comp}</span></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="Total Solicitado" value={brl(totalSol)} icon={TrendingUp} color="acp" />
        <KpiCard title="Total Empenhado Líquido" value={brl(totalEmp)} icon={FileCheck} color="aco" />
        <KpiCard title="Valor Anulado" value={brl(totalAnul)} icon={XCircle} color="warning" />
        <KpiCard title="Processos em Atraso" value={String(atrasados.length)} icon={AlertTriangle} color="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">SLA · Processos em atraso ou risco</CardTitle></CardHeader>
          <CardContent>
            {atrasados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum processo em atraso. 👍</p>
            ) : (
              <ul className="space-y-2">
                {atrasados.slice(0, 6).map((l: any) => (
                  <li key={l.id} className="flex justify-between text-sm border-l-4 border-destructive bg-destructive/5 px-3 py-2 rounded">
                    <Link to="/lancamentos/$id" params={{ id: l.id }} className="font-medium hover:underline">
                      {l.prestadores?.nome_instituicao ?? "—"} · {l.descricao ?? "Lançamento"}
                    </Link>
                    <Badge variant="destructive">{etapaLabel[l.etapa_atual]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Notificações recentes (simuladas)</CardTitle></CardHeader>
          <CardContent>
            {notifs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {notifs.map((n: any) => (
                  <li key={n.id} className="border-b pb-2">
                    <div className="font-medium">{n.assunto}</div>
                    <div className="text-xs text-muted-foreground">{new Date(n.data_envio).toLocaleString("pt-BR")} · {n.destinatario}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos lançamentos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr><th className="py-2">Prestador</th><th>Competência</th><th>Etapa</th><th>Solicitado</th><th>Empenho</th><th>Responsável</th></tr>
              </thead>
              <tbody>
                {lancs.slice(0, 10).map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-muted/40">
                    <td className="py-2">
                      <Link to="/lancamentos/$id" params={{ id: l.id }} className="hover:underline font-medium">
                        {l.prestadores?.nome_instituicao ?? "—"}
                      </Link>
                    </td>
                    <td>{l.competencia ?? "—"}</td>
                    <td><Badge variant="outline">{etapaLabel[l.etapa_atual]}</Badge></td>
                    <td>{brl(Number(l.valor_solicitado))}</td>
                    <td>{brl(Number(l.valor_empenho_liquido))}</td>
                    <td>
                      <Badge className={l.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}>
                        {l.responsavel_atual?.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: any; color: string }) {
  const bg = { acp: "bg-acp", aco: "bg-aco", warning: "bg-warning", destructive: "bg-destructive" }[color] ?? "bg-primary";
  const fg = { warning: "text-warning-foreground" }[color] ?? "text-white";
  return (
    <Card className="overflow-hidden">
      <div className={`${bg} ${fg} px-4 py-3 flex items-center justify-between`}>
        <span className="text-xs font-medium uppercase tracking-wide opacity-90">{title}</span>
        <Icon className="h-4 w-4 opacity-90" />
      </div>
      <CardContent className="pt-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
