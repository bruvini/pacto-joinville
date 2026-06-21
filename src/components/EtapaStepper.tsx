import { etapaLabel } from "@/lib/format";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const ORDEM = ["solicitacao_empenho", "nota_empenho", "solicitacao_anulacao", "anulacao_executada"];

/**
 * Trilha visual de progresso do processo — orienta o usuário sobre onde está
 * e o que falta, com sensação de avanço (sem ser infantil).
 */
export function EtapaStepper({ etapaAtual, concluido }: { etapaAtual: string; concluido: boolean }) {
  const atualIdx = ORDEM.indexOf(etapaAtual);
  const total = ORDEM.length;
  const feitos = concluido ? total : atualIdx; // etapas concluídas
  const pct = Math.round((feitos / (total - 1)) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Progresso do processo</span>
        <span className="text-xs font-semibold text-primary">{concluido ? "100%" : `${pct}%`}</span>
      </div>
      <div className="flex items-center">
        {ORDEM.map((etapa, i) => {
          const done = concluido || i < atualIdx;
          const current = !concluido && i === atualIdx;
          return (
            <div key={etapa} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors shrink-0",
                    done && "bg-success text-success-foreground",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !done && !current && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn("mt-1 text-[10px] leading-tight text-center max-w-[90px]", current ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {etapaLabel[etapa]}
                </span>
              </div>
              {i < total - 1 && (
                <div className={cn("h-0.5 flex-1 mx-1 -mt-4 rounded", i < feitos ? "bg-success" : "bg-muted")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
