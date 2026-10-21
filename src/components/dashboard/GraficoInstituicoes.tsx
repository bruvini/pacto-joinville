import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, brlCompact } from "@/lib/format";
import { montarGraficoInstituicoes, type ModuloGraficoInstituicoes } from "@/lib/dashboard/grafico-instituicoes";
import type { EvolucaoPonto } from "@/lib/dashboard/evolucao";

function DetalhesInstitucionais({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const valores = payload.filter((item: any) =>
    Number(item.value ?? 0) > 0,
  );
  return (
    <div className="max-h-72 max-w-[320px] overflow-y-auto rounded-md border bg-background p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold">Competência {label}</p>
      {valores.length ? valores.map((item: any) => (
        <div key={item.dataKey} className="mb-1.5 flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span>{item.name}</span>
          </span>
          <strong className="shrink-0 tabular-nums">{brl(Number(item.value))}</strong>
        </div>
      )) : <p className="text-muted-foreground">Sem valores registrados neste mês.</p>}
    </div>
  );
}

/** Um mês na horizontal; uma barra empilhada (pago + saldo) por instituição.
 * Totais históricos sem identificação própria ficam na série discriminada
 * 'Sem detalhamento institucional' — não são atribuídos a outro hospital.
 */
export function GraficoInstituicoes({
  pontos, modulo,
}: {
  pontos: EvolucaoPonto[];
  modulo: ModuloGraficoInstituicoes;
}) {
  const { series, dados } = useMemo(
    () => montarGraficoInstituicoes(pontos, modulo),
    [pontos, modulo],
  );
  const termoPago = modulo === "piso" ? "Transferido" : "Pago";
  const termoSaldo = modulo === "piso" ? "A transferir" : "Saldo a repassar";
  const larguraMinima = Math.max(460, dados.length * Math.max(60, series.length * 34 + 25));

  if (!series.length) {
    return <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
      Sem valores institucionais para este recorte.
    </div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        aria-label="Instituições representadas por cor">
        {series.map(serie => (
          <span key={serie.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: serie.cor }} aria-hidden />
            {serie.nome}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Cor sólida: {termoPago.toLowerCase()} · cor suave: {termoSaldo.toLowerCase()}.
        Cada competência reúne barras separadas por instituição.
      </p>
      <div className="w-full overflow-x-auto pb-1" role="region"
        aria-label="Gráfico por competência e instituição" tabIndex={0}>
        <div style={{ minWidth: larguraMinima, height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados}
              barCategoryGap="18%" barGap={2}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="comp" tick={{ fontSize: 9 }}
                minTickGap={12} interval="preserveStartEnd" height={34} />
              <YAxis tickFormatter={brlCompact} tick={{ fontSize: 9 }}
                width={62} domain={[0, "auto"]} />
              <Tooltip content={<DetalhesInstitucionais />} />
              {series.flatMap(serie => [
                <Bar key={`${serie.id}-pago`}
                  dataKey={serie.pagoKey} name={`${serie.nome} · ${termoPago}`}
                  stackId={serie.id} fill={serie.cor} maxBarSize={34}
                  isAnimationActive={false} />,
                <Bar key={`${serie.id}-saldo`}
                  dataKey={serie.saldoKey} name={`${serie.nome} · ${termoSaldo}`}
                  stackId={serie.id} fill={serie.cor} opacity={0.32} maxBarSize={34}
                  isAnimationActive={false} />,
              ])}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
