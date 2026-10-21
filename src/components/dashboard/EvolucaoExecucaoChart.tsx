import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { ResumoMensalPopover } from "@/components/dashboard/ResumoMensalPopover";
import { GraficoInstituicoes } from "@/components/dashboard/GraficoInstituicoes";
import { brl, brlCompact } from "@/lib/format";
import {
  type EvolucaoPonto,
  resumirSerieMensal,
  variacaoPercentualCompetencia,
} from "@/lib/dashboard/evolucao";
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

const TooltipCacon = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const ponto = payload[0]?.payload;
  const variacao =
    typeof ponto?.caconVariacaoPct === "number"
      ? ponto.caconVariacaoPct
      : null;
  const temAnterior = ponto?.caconTemAnterior === true;

  return (
    <div className="rounded-md border bg-background p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span>Produção auditada</span>
          <b className="tabular-nums">{brl(Number(ponto?.cacon ?? 0))}</b>
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-1.5">
          <span>Variação vs. competência anterior</span>
          <b className="tabular-nums">
            {!temAnterior
              ? "Sem competência anterior"
              : variacao == null
                ? "Sem base comparável"
                : `${variacao > 0 ? "+" : ""}${variacao.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}%`}
          </b>
        </div>
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
  const dadosCaconBase = data.filter((ponto) => ponto.temCacon);
  const dadosCacon = dadosCaconBase.map((ponto, index) => {
    const anterior = index > 0 ? dadosCaconBase[index - 1] : null;
    return {
      ...ponto,
      caconTemAnterior: anterior != null,
      caconVariacaoPct: variacaoPercentualCompetencia(
        ponto.cacon,
        anterior?.cacon,
      ),
    };
  });
  const dadosPvh = data.filter((ponto) => ponto.temPvh);
  const resumoConvenios = resumirSerieMensal(dadosConvenios, "convenios");
  const resumoPiso = resumirSerieMensal(dadosPiso, "pisoTransferido");
  const resumoCacon = resumirSerieMensal(dadosCacon, "cacon");
  const resumoPvh = resumirSerieMensal(dadosPvh, "pvhPago");

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
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Convênios</p>
                  <p className="text-[11px] text-muted-foreground">Atestado + Anulado (Efetivo)</p>
                </div>
                <ResumoMensalPopover titulo="Convênios" indicador="Valor atestado"
                  resumo={resumoConvenios} />
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
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Piso da Enfermagem</p>
                  <p className="text-[11px] text-muted-foreground">
                    Barras por instituição · mensal e 13ª reunidos por competência
                  </p>
                </div>
                <ResumoMensalPopover titulo="Piso da Enfermagem" indicador="Valor transferido (inclui 13ª)"
                  resumo={resumoPiso} />
              </div>
              {dadosPiso.length === 0 ? (
                <SemCompetencias />
              ) : (
                <GraficoInstituicoes pontos={dadosPiso} modulo="piso" />
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Dieta CACON</p>
                  <p className="text-[11px] text-muted-foreground">Produção nutricional auditada</p>
                </div>
                <ResumoMensalPopover titulo="Dieta CACON" indicador="Produção auditada"
                  resumo={resumoCacon} />
              </div>
              {dadosCacon.length === 0 ? (
                <SemCompetencias />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosCacon} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis {...eixoMesProps} />
                    <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }} width={62} domain={[0, "auto"]} />
                    <ReTooltip content={<TooltipCacon />} />
                    <Bar dataKey="cacon" name="Produção auditada" fill="var(--aco)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">PVH</p>
                  <p className="text-[11px] text-muted-foreground">Pago e saldo a repassar por instituição</p>
                </div>
                <ResumoMensalPopover titulo="PVH" indicador="Valor pago"
                  resumo={resumoPvh} />
              </div>
              {dadosPvh.length === 0 ? (
                <SemCompetencias />
              ) : (
                <GraficoInstituicoes pontos={dadosPvh} modulo="pvh" />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
