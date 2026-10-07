import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PVH_ETAPAS,
  etapaNavegavelPvh,
  etapaPrincipalPvh,
} from "@/lib/pvh/etapas";

export function EsteiraCompetenciaPvh({
  concluidas,
  reconferir,
  status,
  etapaSelecionada,
  onSelecionar,
}: {
  concluidas: Record<string, boolean>;
  reconferir: number[];
  status: string;
  etapaSelecionada: number;
  onSelecionar: (etapa: number) => void;
}) {
  const principal = etapaPrincipalPvh(concluidas, status, reconferir);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Esteira da competência</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto pb-5">
        <ol className="flex min-w-[1040px] items-start px-2">
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
                      "absolute left-1/2 top-4 h-1 w-full",
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
                    "relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold transition-all duration-150",
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
                  {feita ? <Check className="h-4 w-4" /> : etapa.n}
                </button>
                <span
                  className={cn(
                    "relative z-10 mt-2 max-w-[120px] text-[11px] font-medium leading-tight",
                    !acessivel && "text-muted-foreground",
                  )}
                >
                  {etapa.curto}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Verde = concluída · azul = etapa atual/reconferência · azul claro = etapa liberada em paralelo · cinza = ainda não liberada.
        </p>
      </CardContent>
    </Card>
  );
}
