import { brl } from "@/lib/format";

/** Barra de saldo: empenhado vs teto. Verde < 85%, âmbar 85-99%, vermelho >= 100%. */
export function SaldoBar({ usado, teto }: { usado: number; teto: number }) {
  if (!teto) return <p className="text-xs text-muted-foreground italic">Teto financeiro não informado.</p>;
  const pct = Math.min(100, Math.round((usado / teto) * 100));
  const cor = pct >= 100 ? "bg-destructive" : pct >= 85 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">Empenhado</span>
        <span className="font-medium tabular-nums">{brl(usado)} <span className="text-muted-foreground">de {brl(teto)}</span></span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[11px] text-muted-foreground mt-0.5">{pct}% comprometido · saldo {brl(Math.max(0, teto - usado))}</div>
    </div>
  );
}
