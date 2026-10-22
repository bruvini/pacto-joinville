import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Layers3 } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { brlCompact } from "@/lib/format";

export type EsteiraColuna = {
  slug: string;
  label: string;
  curto: string;
  n: number;
  valor: number;
  atrasados: number;
  vencendo: number;
  href?: "/lancamentos" | "/piso" | "/cacon" | "/pvh";
};

function detalharEtapa(coluna: EsteiraColuna, concluida: boolean) {
  if (concluida) return { codigo: "FINALIZADOS", titulo: "Concluídos" };
  const match = coluna.label.match(/^Etapa\s+(\d+[A-Z]?)\s*[·—-]\s*(.+)$/i);
  if (match) return { codigo: `ETAPA ${match[1]}`, titulo: match[2] };
  return { codigo: "ETAPA DO FLUXO", titulo: coluna.label };
}

/** Grade de posições operacionais, não um stepper linear.
 * Piso e PVH possuem ramos paralelos: a visualização não impõe sequência.
 */
export function EsteiraProcesso({
  colunas,
  titulo = "Convênios / lançamentos",
  descricao = "Clique em uma etapa para consultar os registros",
  id,
}: {
  colunas: EsteiraColuna[];
  titulo?: string;
  descricao?: string;
  id: string;
}) {
  const concluidas = colunas.filter(c => /conclu[ií]d/i.test(c.label));
  const etapas = colunas.filter(c => !/conclu[ií]d/i.test(c.label));
  const totalEmEtapas = etapas.reduce((total, c) => total + c.n, 0);
  const totalConcluidos = concluidas.reduce((total, c) => total + c.n, 0);
  const totalPosicoes = totalEmEtapas + totalConcluidos;

  return (
    <AccordionItem value={id}
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-label={titulo}>
      <AccordionTrigger
        className="gap-3 bg-muted/20 px-4 py-3 hover:bg-muted/40 hover:no-underline data-[state=open]:border-b">
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-left text-sm font-semibold">
              <Layers3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {titulo}
            </span>
            <span className="mt-0.5 block pl-6 text-left text-xs font-normal text-muted-foreground">
              {descricao}
            </span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs tabular-nums">
            <span className="rounded-full border bg-background px-2.5 py-1">
              <strong className="font-semibold">{totalEmEtapas}</strong>
              <span className="ml-1 font-normal text-muted-foreground">em etapas</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/5 px-2.5 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
              <strong className="font-semibold">{totalConcluidos}</strong>
              <span className="font-normal text-muted-foreground">concluídos</span>
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-0">
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {colunas.map((coluna) => {
          const concluida = /conclu[ií]d/i.test(coluna.label);
          const { codigo, titulo: nomeEtapa } = detalharEtapa(coluna, concluida);
          const ativo = coluna.n > 0;
          const atencao = !concluida && (coluna.atrasados > 0 || coluna.vencendo > 0);
          const status = coluna.atrasados > 0
            ? `${coluna.atrasados} em atraso/revisão`
            : coluna.vencendo > 0
              ? `${coluna.vencendo} requer atenção`
              : "";
          const largura = totalPosicoes > 0
            ? Math.max(0, Math.min(100, (coluna.n / totalPosicoes) * 100))
            : 0;

          return (
            <Link key={coluna.slug}
              to={coluna.href ?? "/lancamentos"}
              search={coluna.href === "/piso" || coluna.href === "/cacon" || coluna.href === "/pvh"
                ? undefined : { status: coluna.slug as any }}
              title={`${coluna.label}: ${coluna.n} registro(s)${status ? " · " + status : ""}`}
              aria-label={`Abrir ${coluna.label}, ${coluna.n} registro(s)`}
              className={[
                "group flex min-h-[132px] min-w-0 flex-col rounded-lg border px-3 py-2.5",
                "transition-colors hover:border-primary/50 hover:bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                concluida ? "border-success/30 bg-success/5" :
                ativo ? "border-primary/25 bg-primary/[0.03]" : "border-border/70 bg-background",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0 space-y-0.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${concluida ? "text-success" : "text-muted-foreground"}`}>
                    {codigo}
                  </p>
                  <p className="text-xs font-medium leading-snug text-foreground">
                    {nomeEtapa}
                  </p>
                </div>
                {concluida
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" aria-hidden />}
              </div>
              <div className="mt-auto pt-3">
                <div className="flex items-end justify-between gap-1.5">
                  <span className="text-[28px] font-bold leading-none tabular-nums text-foreground">
                    {coluna.n}
                  </span>
                  {atencao && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-warning-foreground"
                      title={status}>
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                      {coluna.atrasados || coluna.vencendo}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex min-h-[16px] items-center justify-between gap-1 text-[11px]">
                  <span className="text-muted-foreground">
                    {coluna.n === 1 ? "registro" : "registros"}
                  </span>
                  {coluna.valor > 0 && (
                    <span className="font-medium tabular-nums text-muted-foreground">
                      {brlCompact(coluna.valor)}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden>
                  <div
                    className={`h-full rounded-full ${concluida ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${largura}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
        {titulo === "Convênios / lançamentos" && (
          <p className="px-4 pb-3 text-[11px] leading-relaxed text-muted-foreground">
            Os lançamentos de um mesmo processo podem ocupar etapas diferentes quando suas
            parcelas seguem em fases distintas. A contagem é por posição nas etapas.
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
