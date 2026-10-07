import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

export type EvolucaoPonto = {
  comp: string;
  convenios: number;
  glosa: number;
  solicitadoConvenios: number;
  pisoHomologado: number;
  pisoTransferido: number;
  cacon: number;
};

const TooltipValor = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      <div className="space-y-1">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span>{item.name}</span>
            <b className="tabular-nums">{brl(Number(item.value ?? 0))}</b>
          </div>
        ))}
      </div>
    </div>
  );
};

const eixoMesProps = {
  dataKey: "comp",
  tick: { fontSize: 9 },
  minTickGap: 12,
  interval: "preserveStartEnd" as const,
  height: 34,
};


export function EvolucaoExecucaoChart({ data }: { data: EvolucaoPonto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          Execução mês a mês — Convênios + Piso + CACON
          <HelpTip text="Cada módulo usa sua própria escala vertical para que valores menores, como o Piso da Enfermagem, continuem visíveis ao lado dos milhões movimentados nos convênios. Os valores exibidos são reais; compare a evolução dentro de cada painel, não a altura entre painéis diferentes." />
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Escala própria por módulo: preserva a leitura das variações sem usar escala logarítmica nem
          transformar os valores financeiros.
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem dados para exibir neste recorte.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Convênios</p>
                <p className="text-[11px] text-muted-foreground">
                  Atestado + Anulado (Efetivo) · escala em milhões quando aplicável
                </p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis {...eixoMesProps} />
                  <YAxis
                    tickFormatter={brlCompact}
                    tick={{ fontSize: 9 }}
                    width={62}
                    domain={[0, "auto"]}
                  />
                  <ReTooltip content={<TooltipValor />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar
                    dataKey="convenios"
                    name="Atestado"
                    stackId="conv"
                    fill="var(--success)"
                  />
                  <Bar
                    dataKey="glosa"
                    name="Anulado (Efetivo)"
                    stackId="conv"
                    fill="var(--warning)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Piso da Enfermagem</p>
                <p className="text-[11px] text-muted-foreground">
                  Homologado × transferido ao Município · escala própria
                </p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis {...eixoMesProps} />
                  <YAxis
                    tickFormatter={brlCompact}
                    tick={{ fontSize: 9 }}
                    width={62}
                    domain={[0, "auto"]}
                  />
                  <ReTooltip content={<TooltipValor />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar
                    dataKey="pisoHomologado"
                    name="Homologado"
                    fill="var(--primary)"
                    opacity={0.35}
                  />
                  <Bar
                    dataKey="pisoTransferido"
                    name="Transferido"
                    fill="var(--primary)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Dieta CACON</p>
                <p className="text-[11px] text-muted-foreground">
                  Produção nutricional auditada · escala própria
                </p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis {...eixoMesProps} />
                  <YAxis
                    tickFormatter={brlCompact}
                    tick={{ fontSize: 9 }}
                    width={62}
                    domain={[0, "auto"]}
                  />
                  <ReTooltip content={<TooltipValor />} />
                  <Bar dataKey="cacon" name="Produção auditada" fill="var(--aco)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
