import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PVH_ETAPAS,
  etapaNavegavelPvh,
  etapaPrincipalPvh,
} from "@/lib/pvh/etapas";

type EsteiraCompetenciaPvhProps = {
  concluidas: Record<string, boolean>;
  reconferir: number[];
  status: string;
  etapaSelecionada: number;
  onSelecionar: (etapa: number) => void;
  embedded?: boolean;
  compacta?: boolean;
  mostrarLegenda?: boolean;
};

export function EsteiraCompetenciaPvh({
  concluidas,
  reconferir,
  status,
  etapaSelecionada,
  onSelecionar,
  embedded = false,
  compacta = false,
  mostrarLegenda = true,
}: EsteiraCompetenciaPvhProps) {
  const principal = etapaPrincipalPvh(concluidas, status, reconferir);

  const trilha = (
    <div className={cn("overflow-x-auto", compacta ? "pb-1" : "pb-2")}>
      <ol
        className={cn(
          "flex items-start px-2",
          compacta ? "min-w-[900px]" : "min-w-[1040px]",
        )}
      >
        {PVH_ETAPAS.map((etapa, index) => {
          const emReconferencia = reconferir.includes(etapa.n);
          const feita = concluidas[String(etapa.n)] === true && !emReconferencia;
          const corrente = etapa.n === principal && !feita;
          const acessivel = etapaNavegavelPvh(etapa.n, concluidas, reconferir, status);
          const paralelaLiberada = acessivel && !feita && !emReconferencia && !corrente;

          return (
            <li key={etapa.n} className="relative flex flex-1 flex-col items-center text-center">
              {index < PVH_ETAPAS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 w-full",
                    compacta ? "top-3.5 h-0.5" : "top-4 h-1",
                    feita ? "bg-success" : "bg-muted",
                  )}
                />
              )}
              <button
                type="button"
                disabled={!acessivel}
                aria-current={etapaSelecionada === etapa.n ? "step" : undefined}
                title={
                  acessivel
                    ? etapa.objetivo
                    : "Esta etapa será liberada quando seus pré-requisitos forem concluídos."
                }
                onClick={() => acessivel && onSelecionar(etapa.n)}
                className={cn(
                  "relative z-10 grid place-items-center rounded-full border-2 font-bold transition-all duration-150",
                  compacta ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs",
                  acessivel &&
                    "cursor-pointer hover:-translate-y-0.5 hover:scale-110 hover:shadow-md hover:ring-4 hover:ring-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  feita && "border-success bg-success text-success-foreground",
                  corrente && "border-primary bg-primary text-primary-foreground",
                  paralelaLiberada && "border-primary/50 bg-primary/5 text-primary",
                  emReconferencia && !corrente && "border-primary bg-primary text-primary-foreground",
                  !acessivel && "cursor-not-allowed border-muted bg-muted text-muted-foreground",
                  etapaSelecionada === etapa.n && acessivel && "ring-4 ring-primary/15",
                )}
              >
                {feita ? <Check className={compacta ? "h-3.5 w-3.5" : "h-4 w-4"} /> : etapa.n}
              </button>
              <span
                className={cn(
                  "relative z-10 font-medium leading-tight",
                  compacta
                    ? "mt-1.5 max-w-[105px] text-[10px]"
                    : "mt-2 max-w-[120px] text-[11px]",
                  !acessivel && "text-muted-foreground",
                )}
              >
                {etapa.curto}
              </span>
            </li>
          );
        })}
      </ol>
      {mostrarLegenda && (
        <p className={cn("text-center text-muted-foreground", compacta ? "mt-2 text-[10px]" : "mt-4 text-[11px]")}>
          Verde = concluída · azul = etapa atual/reconferência · azul claro = etapa liberada em paralelo · cinza = ainda não liberada.
        </p>
      )}
    </div>
  );

  if (embedded) return trilha;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Esteira da competência</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">{trilha}</CardContent>
    </Card>
  );
}
