import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { Timer, Users } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, Legend } from "recharts";

/** Formata dias como "X.X dias" ou "Xh" quando abaixo de 1 dia. */
function fmtDias(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return `${Math.round(d * 24)}h`;
  return `${d.toFixed(1)} dias`;
}

/**
 * Zona · Scorecards de SLA (Lei de Little + Teoria das Filas).
 * Lead Time geral + grade de SLA médio de retenção por cargo/signatário.
 */
export function SlaScorecards({
  leadTime,
  slaCargos,
}: {
  leadTime: { media: number | null; n: number };
  slaCargos: { cargo: string; media: number; n: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          <Timer className="h-4 w-4 text-primary" /> Desempenho e SLA do Processo
          <HelpTip text="Lead Time (Lei de Little): tempo médio do ciclo de vida da despesa, da criação do lançamento à conclusão. SLA por signatário (Teoria das Filas): tempo médio que o processo aguarda sob a responsabilidade de cada cargo até a assinatura." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead Time — destaque */}
        <div className="rounded-xl border bg-primary/5 border-primary/30 p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo Médio Geral de Atendimento (Lead Time)</div>
            <div className="text-xs text-muted-foreground">Ciclo de vida da despesa · {leadTime.n} processo(s) concluído(s)</div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-primary">{fmtDias(leadTime.media)}</div>
        </div>

        {/* Grade de scorecards por cargo */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> SLA médio de retenção por signatário
          </div>
          {slaCargos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem assinaturas registradas para calcular o SLA neste recorte.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {slaCargos.map((s) => (
                <div key={s.cargo} className="rounded-lg border p-3 bg-card">
                  <div className="text-[11px] font-medium text-muted-foreground leading-tight min-h-[28px]">{s.cargo}</div>
                  <div className="text-2xl font-bold tabular-nums text-primary mt-1">{fmtDias(s.media)}</div>
                  <div className="text-[10px] text-muted-foreground">{s.n} assinatura(s)</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Gráfico de rosca — Distribuição de Processos por Setor Responsável (ACP × UFI),
 * pela etapa atual dos lançamentos ativos.
 */
export function DistribuicaoSetorChart({
  data,
}: {
  data: { setor: string; nome: string; valor: number }[];
}) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  const cores: Record<string, string> = { ACP: "var(--acp)", UFI: "var(--aco)" };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          Distribuição de Processos por Setor Responsável
          <HelpTip text="Volume de processos ativos (em andamento) sob a custódia de cada área, conforme a etapa atual: Setor ACP (acompanhamento/relatórios) e Setor UFI (análise, revisão e liberação de orçamento/recursos)." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum processo ativo neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data} dataKey="valor" nameKey="setor" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}
                label={({ setor, valor }: any) => `${setor}: ${valor}`}>
                {data.map((d) => <Cell key={d.setor} fill={cores[d.setor] ?? "var(--muted)"} />)}
              </Pie>
              <ReTooltip formatter={(v: any, _n: any, p: any) => [`${v} processo(s)`, p?.payload?.nome ?? p?.payload?.setor]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
