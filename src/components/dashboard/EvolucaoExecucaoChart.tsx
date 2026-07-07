import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact } from "@/lib/format";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Legend,
} from "recharts";

export type EvolucaoPonto = {
  comp: string;
  atestado: number;
  glosa: number;
  solicitado: number;
  taxa: number; // 0-100
};

/**
 * Zona E — Barras empilhadas Atestado + Glosa por competência + linha da taxa
 * de execução (%). Torna as glosas VISUALMENTE proporcionais ao empenho.
 */
export function EvolucaoExecucaoChart({ data }: { data: EvolucaoPonto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          Execução mês a mês — Atestado × Anulado (Efetivo)
          <HelpTip text="Barras empilhadas mostram o Atestado (verde) e o Anulado Efetivo (âmbar) por competência. A linha azul representa a taxa de execução (Atestado ÷ Solicitado) — quanto mais próxima de 100%, melhor a aderência." />
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          <b>Taxa de Execução:</b> eficiência percentual calculada pela razão entre o valor efetivamente <b>atestado</b> e o valor originalmente <b>solicitado</b>.
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            Sem dados para exibir neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="comp" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="v" tickFormatter={brlCompact} tick={{ fontSize: 11 }} width={70} />
              <YAxis
                yAxisId="p"
                orientation="right"
                domain={[0, 120]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={40}
              />
              <ReTooltip
                formatter={(v: any, name: any) => {
                  if (name === "Taxa de execução") return [`${Math.round(Number(v))}%`, name];
                  return [brl(Number(v)), name];
                }}
              />
              <Legend />
              <Bar yAxisId="v" dataKey="atestado" name="Atestado" stackId="a" fill="var(--success)" />
              <Bar yAxisId="v" dataKey="glosa" name="Anulado (Efetivo)" stackId="a" fill="var(--warning)" />
              <Line
                yAxisId="p"
                type="monotone"
                dataKey="taxa"
                name="Taxa de execução"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
