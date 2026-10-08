import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact } from "@/lib/format";
import type { EvolucaoPonto } from "@/lib/dashboard/evolucao";
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

function SemCompetencias() {
  return (
    <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
      Sem competências lançadas neste recorte.
    </div>
  );
}

export function EvolucaoExecucaoChart({ data }: { data: EvolucaoPonto[] }) {
  const dadosConvenios = data.filter((ponto) => ponto.temConvenio);
  const dadosPiso = data.filter((ponto) => ponto.temPiso);
  const dadosCacon = data.filter((ponto) => ponto.temCacon);
  const dadosPvh = data.filter((ponto) => ponto.temPvh);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          Execução mês a mês — Convênios + Piso + CACON + PVH
          <HelpTip text="Matriz 2×2. Cada módulo usa escala vertical e domínio temporal próprios; meses sem competência daquele módulo não são exibidos." />
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Linha 1: Convênios e Piso da Enfermagem. Linha 2: Dieta CACON e PVH.
        </p>
      </CardHeader>

      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem dados para exibir neste recorte.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Convênios</p>
                <p className="text-[11px] text-muted-foreground">
                  Atestado + Anulado (Efetivo)
                </p>
              </div>
              {dadosConvenios.length === 0 ? (
                <SemCompetencias />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosConvenios} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis {...eixoMesProps} />
                    <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }} width={62} domain={[0, "auto"]} />
                    <ReTooltip content={<TooltipValor />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="convenios" name="Atestado" stackId="conv" fill="var(--success)" />
                    <Bar dataKey="glosa" name="Anulado (Efetivo)" stackId="conv" fill="var(--warning)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Piso da Enfermagem</p>
                <p className="text-[11px] text-muted-foreground">
                  Transferido + saldo homologado a transferir
                </p>
              </div>
              {dadosPiso.length === 0 ? (
                <SemCompetencias />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosPiso} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis {...eixoMesProps} />
                    <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }} width={62} domain={[0, "auto"]} />
                    <ReTooltip content={<TooltipValor />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="pisoTransferido" name="Transferido" stackId="piso" fill="var(--primary)" />
                    <Bar
                      dataKey="pisoAtransferir"
                      name="A transferir"
                      stackId="piso"
                      fill="var(--primary)"
                      opacity={0.3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">Dieta CACON</p>
                <p className="text-[11px] text-muted-foreground">
                  Produção nutricional auditada
                </p>
              </div>
              {dadosCacon.length === 0 ? (
                <SemCompetencias />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosCacon} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis {...eixoMesProps} />
                    <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }} width={62} domain={[0, "auto"]} />
                    <ReTooltip content={<TooltipValor />} />
                    <Bar dataKey="cacon" name="Produção auditada" fill="var(--aco)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold">PVH</p>
                <p className="text-[11px] text-muted-foreground">
                  Pago + saldo ainda a repassar
                </p>
              </div>
              {dadosPvh.length === 0 ? (
                <SemCompetencias />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosPvh} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis {...eixoMesProps} />
                    <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }} width={62} domain={[0, "auto"]} />
                    <ReTooltip content={<TooltipValor />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="pvhPago" name="Pago" stackId="pvh" fill="var(--primary)" />
                    <Bar
                      dataKey="pvhSaldo"
                      name="Saldo a repassar"
                      stackId="pvh"
                      fill="var(--warning)"
                      opacity={0.6}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
