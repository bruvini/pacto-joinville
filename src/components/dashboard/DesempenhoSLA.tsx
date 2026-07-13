import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { Timer, Users } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

/** Tipos de ação do log de auditoria (segmentos das barras empilhadas). */
export const ACAO_TIPOS: { key: string; label: string; cor: string }[] = [
  { key: "criacao", label: "Criação", cor: "var(--success)" },
  { key: "edicao", label: "Edição", cor: "var(--acp)" },
  { key: "aprovacao", label: "Aprovação de etapa", cor: "var(--aco)" },
  { key: "transferencia", label: "Transferência", cor: "#7C3AED" },
  { key: "adiamento", label: "Adiamento de prazo", cor: "var(--warning)" },
  { key: "anulacao", label: "Anulação/cancelamento", cor: "var(--destructive)" },
  { key: "outras", label: "Outras ações", cor: "var(--muted-foreground)" },
];

/** Classifica o texto da ação de um log num dos tipos acima. */
export function classificarAcao(acao: string): string {
  const a = (acao ?? "").toLowerCase();
  if (/(cria|inserid|novo lan)/.test(a)) return "criacao";
  if (/(anul|cancel|encerr|revert|exclu|remov)/.test(a)) return "anulacao";
  if (/(aprov|revis|assinatur|herdad|conclu|liberaç|empenh)/.test(a)) return "aprovacao";
  if (/(transfer|respons|setor|atribu)/.test(a)) return "transferencia";
  if (/(prazo|adiad|prorrog|reativ)/.test(a)) return "adiamento";
  if (/(atualiz|edit|alterad|campos|preench)/.test(a)) return "edicao";
  return "outras";
}

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
  slaEtapas = [],
  slaCargos,
}: {
  leadTime: { media: number | null; n: number; real?: boolean };
  slaEtapas?: { etapa: string; media: number | null; n: number }[];
  slaCargos: { cargo: string; media: number; n: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          <Timer className="h-4 w-4 text-primary" /> Desempenho e SLA do Processo
          <HelpTip text="Lead Time (Lei de Little): tempo médio do ciclo de vida da despesa, da criação do lançamento à conclusão. SLA por etapa (Teoria das Filas): tempo real de retenção entre marcos temporais carimbados no banco. SLA por signatário: tempo até cada assinatura." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead Time — destaque */}
        <div className="rounded-xl border bg-primary/5 border-primary/30 p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo Médio Geral de Atendimento (Lead Time)</div>
            <div className="text-xs text-muted-foreground">
              Ciclo de vida da despesa · {leadTime.n} processo(s) concluído(s)
              <span className={`ml-1.5 ${leadTime.real ? "text-success" : "text-warning-foreground"}`}>
                · {leadTime.real ? "medição real (marcos)" : "estimativa (proxy)"}
              </span>
            </div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-primary">{fmtDias(leadTime.media)}</div>
        </div>

        {/* Duas colunas na mesma linha: SLA por etapa × SLA por signatário */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Coluna 1 — SLA real por etapa */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" /> SLA real de retenção por etapa
              <HelpTip text="Tempo médio que o processo permanece em cada etapa, medido pelo intervalo entre os marcos temporais registrados no banco (a etapa vira atual → é concluída)." />
            </div>
            {slaEtapas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem marcos temporais para calcular o SLA por etapa neste recorte.</p>
            ) : (
              <div className="rounded-lg border divide-y bg-card">
                {slaEtapas.map((s) => (
                  <div key={s.etapa} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground truncate">{s.etapa}</span>
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="text-base font-bold tabular-nums text-primary">{fmtDias(s.media)}</span>
                      <span className="text-[10px] text-muted-foreground w-16 text-right">{s.n} proc.</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-muted/40">
                  <span className="text-xs font-semibold text-foreground">Tempo médio das etapas</span>
                  <span className="text-base font-bold tabular-nums text-primary shrink-0">{fmtDias(mediaSimples(slaEtapas.map((s) => s.media)))}</span>
                </div>
              </div>
            )}
          </div>

          {/* Coluna 2 — SLA por signatário */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> SLA médio até a assinatura, por signatário
            </div>
            {slaCargos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem assinaturas registradas para calcular o SLA neste recorte.</p>
            ) : (
              <div className="rounded-lg border divide-y bg-card">
                {slaCargos.map((s) => (
                  <div key={s.cargo} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground truncate">{s.cargo}</span>
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="text-base font-bold tabular-nums text-primary">{fmtDias(s.media)}</span>
                      <span className="text-[10px] text-muted-foreground w-20 text-right">{s.n} assin.</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-muted/40">
                  <span className="text-xs font-semibold text-foreground">Tempo médio das assinaturas</span>
                  <span className="text-base font-bold tabular-nums text-primary shrink-0">{fmtDias(mediaSimples(slaCargos.map((s) => s.media)))}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Média simples das médias não-nulas (para os rodapés dos SLAs). */
function mediaSimples(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
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
          Processos por Setor Responsável
          <HelpTip text="Volume de processos ativos (em andamento) sob a custódia de cada área, conforme a etapa atual: Setor ACP (acompanhamento/relatórios) e Setor UFI (análise, revisão e liberação de orçamento/recursos)." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum processo ativo neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} dataKey="valor" nameKey="setor" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}
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

/**
 * Atividade por Usuário — barras verticais empilhadas por Tipo de Ação (logs de auditoria).
 * Cada barra é um usuário; os segmentos coloridos são os tipos de ação.
 */
export function AtividadeUsuarioChart({
  data,
}: {
  data: { usuario: string; total: number; [k: string]: number | string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          Atividade por Usuário (Ações Empilhadas)
          <HelpTip text="Total de ações registradas na trilha de auditoria por usuário, segmentadas por tipo de ação (criação, edição, aprovação de etapa, transferência, adiamento, anulação e outras). Reage aos filtros do painel." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhuma atividade registrada neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="usuario" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <ReTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ACAO_TIPOS.map((t) => (
                <Bar key={t.key} dataKey={t.key} name={t.label} stackId="a" fill={t.cor} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
