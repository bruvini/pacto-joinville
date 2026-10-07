import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact } from "@/lib/format";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

export type EvolucaoPonto = {
  comp: string;
  convenios: number;
  piso: number;
  cacon: number;
  glosa: number;
  solicitado: number;
  taxa: number;
};

export function EvolucaoExecucaoChart({ data }: { data: EvolucaoPonto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          Execução mês a mês — Convênios + Piso + CACON
          <HelpTip text="Convênios mostram valores atestados e anulação efetiva. Piso mostra o valor transferido ao município. CACON mostra a produção nutricional auditada. As séries ficam separadas para não confundir grandezas diferentes, mas compartilham a mesma competência." />
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          A linha representa a execução consolidada do recorte: valores realizados ÷ bases financeiras
          monitoradas. A anulação continua exclusiva dos lançamentos de convênios.
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem dados para exibir neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
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
                  if (name === "Taxa consolidada")
                    return [`${Math.round(Number(v))}%`, name];
                  return [brl(Number(v)), name];
                }}
              />
              <Legend />
              <Bar
                yAxisId="v"
                dataKey="convenios"
                name="Convênios · Atestado"
                stackId="a"
                fill="var(--success)"
              />
              <Bar
                yAxisId="v"
                dataKey="piso"
                name="Piso · Transferido"
                stackId="a"
                fill="var(--primary)"
              />
              <Bar
                yAxisId="v"
                dataKey="cacon"
                name="CACON · Produção auditada"
                stackId="a"
                fill="var(--aco)"
              />
              <Bar
                yAxisId="v"
                dataKey="glosa"
                name="Convênios · Anulado (Efetivo)"
                stackId="a"
                fill="var(--warning)"
              />
              <Line
                yAxisId="p"
                type="monotone"
                dataKey="taxa"
                name="Taxa consolidada"
                stroke="var(--foreground)"
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
