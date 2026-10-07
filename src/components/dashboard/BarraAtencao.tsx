import { Link } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AcaoNecessaria,
  SeveridadeAcao,
} from "@/lib/dashboard/alertas";

const ESTILO: Record<
  SeveridadeAcao,
  { ponto: string; texto: string; fundo: string; nome: string }
> = {
  critico: {
    ponto: "bg-destructive",
    texto: "text-destructive",
    fundo: "hover:bg-destructive/5",
    nome: "crítico",
  },
  alerta: {
    ponto: "bg-warning",
    texto: "text-amber-700 dark:text-amber-400",
    fundo: "hover:bg-warning/5",
    nome: "alerta",
  },
  preventivo: {
    ponto: "bg-primary/70",
    texto: "text-primary",
    fundo: "hover:bg-primary/5",
    nome: "preventivo",
  },
};

function Sequencia({
  itens,
  prefixo,
  ariaHidden = false,
}: {
  itens: AcaoNecessaria[];
  prefixo: string;
  ariaHidden?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center pr-5 ${
        ariaHidden ? "acao-ticker-duplicate" : ""
      }`}
      aria-hidden={ariaHidden || undefined}
    >
      {itens.map((alerta) => {
        const estilo = ESTILO[alerta.severidade];
        return (
          <Link
            key={`${prefixo}-${alerta.id}`}
            to={alerta.to as any}
            search={alerta.search as any}
            hash={alerta.hash}
            tabIndex={ariaHidden ? -1 : undefined}
            className={`group/ticker inline-flex h-10 shrink-0 items-center gap-2 border-r px-4 text-xs transition-colors ${estilo.fundo}`}
            title={`${alerta.n} ${alerta.label}. Ação: ${alerta.acao}.`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${estilo.ponto}`}
              aria-hidden="true"
            />
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground">
              {alerta.modulo}
            </span>
            <strong className={`tabular-nums ${estilo.texto}`}>
              {alerta.n}
            </strong>
            <span className="font-medium whitespace-nowrap">{alerta.label}</span>
            <span className="whitespace-nowrap text-muted-foreground">
              · {alerta.acao}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Faixa de atenção em formato ticker:
 * - prioridade ordenada pelo motor de riscos;
 * - movimento contínuo inspirado em painéis de mercado;
 * - pausa manual, por hover e por foco;
 * - prefers-reduced-motion transforma a faixa em rolagem horizontal estática.
 */
export function BarraAtencao({ itens }: { itens: AcaoNecessaria[] }) {
  const [pausaManual, setPausaManual] = useState(false);
  const [pausaInteracao, setPausaInteracao] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const resumo = useMemo(
    () =>
      itens.reduce(
        (acc, item) => {
          acc[item.severidade] += 1;
          acc.acoes += item.n;
          return acc;
        },
        { critico: 0, alerta: 0, preventivo: 0, acoes: 0 },
      ),
    [itens],
  );

  const duracao = useMemo(() => {
    const caracteres = itens.reduce(
      (soma, item) => soma + item.label.length + item.acao.length + 18,
      0,
    );
    return Math.max(28, Math.min(100, Math.round(caracteres / 8)));
  }, [itens]);

  if (itens.length === 0) return null;

  const pausado = pausaManual || pausaInteracao || expandido;
  const estiloTrack = {
    "--ticker-duration": `${duracao}s`,
    animationPlayState: pausado ? "paused" : "running",
  } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-md border bg-card shadow-sm">
      <div className="flex min-h-11 items-stretch">
        <div className="relative z-10 flex shrink-0 items-center gap-3 border-r bg-muted/70 px-3 backdrop-blur-sm">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-background/70"
            onClick={() => setExpandido((valor) => !valor)}
            aria-expanded={expandido}
            title={expandido ? "Recolher todas as ações" : "Ver todas as ações"}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
              Ação necessária
            </span>
            {expandido ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <div className="hidden items-center gap-2 text-[10px] text-muted-foreground xl:flex">
            {resumo.critico > 0 && (
              <span>
                <b className="text-destructive">{resumo.critico}</b> crítico(s)
              </span>
            )}
            {resumo.alerta > 0 && (
              <span>
                <b className="text-amber-700 dark:text-amber-400">
                  {resumo.alerta}
                </b>{" "}
                alerta(s)
              </span>
            )}
            {resumo.preventivo > 0 && (
              <span>
                <b className="text-primary">{resumo.preventivo}</b> preventivo(s)
              </span>
            )}
          </div>
        </div>

        <div
          className="acao-ticker-viewport relative min-w-0 flex-1 overflow-hidden"
          onMouseEnter={() => setPausaInteracao(true)}
          onMouseLeave={() => setPausaInteracao(false)}
          onFocusCapture={() => setPausaInteracao(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setPausaInteracao(false);
          }}
          aria-label={`${resumo.acoes} ações consolidadas em ${itens.length} tipos de alerta`}
        >
          <div className="acao-ticker-track flex w-max items-center" style={estiloTrack}>
            <Sequencia itens={itens} prefixo="principal" />
            <Sequencia itens={itens} prefixo="copia" ariaHidden />
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 items-center border-l bg-card px-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPausaManual((valor) => !valor)}
            aria-label={pausaManual ? "Retomar faixa de alertas" : "Pausar faixa de alertas"}
            title={pausaManual ? "Retomar alertas" : "Pausar alertas"}
          >
            {pausaManual ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {expandido && (
        <div className="border-t bg-background p-2">
          <div className="grid max-h-[46vh] gap-1 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            {itens.map((alerta) => {
              const estilo = ESTILO[alerta.severidade];
              return (
                <Link
                  key={`lista-${alerta.id}`}
                  to={alerta.to as any}
                  search={alerta.search as any}
                  hash={alerta.hash}
                  className={`flex min-w-0 items-start gap-2 rounded-md border px-3 py-2.5 text-xs transition-colors ${estilo.fundo}`}
                  title={alerta.acao}
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${estilo.ponto}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground">
                        {alerta.modulo}
                      </span>
                      <strong className={`tabular-nums ${estilo.texto}`}>
                        {alerta.n}
                      </strong>
                      <span className="font-semibold">{alerta.label}</span>
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {alerta.acao}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
