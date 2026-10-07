import { Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import {
  CACON_ETAPAS,
  CACON_STATUS,
  etapaAtualCacon,
} from "@/lib/cacon/etapas";

type Props = {
  lista: any[];
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (competencia: any) => void;
  onExcluir: (competencia: any) => void;
};

function Linhas({
  itens,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: Props & { itens: any[] }) {
  return (
    <>
      {itens.map((competencia) => (
        <tr
          key={competencia.id}
          className="border-b last:border-0 transition-colors hover:bg-muted/40"
        >
          <td className="py-3 pl-7 pr-3 font-semibold">
            <Link
              to="/cacon/$id"
              params={{ id: competencia.id }}
              className="text-primary hover:underline"
            >
              {competencia.competencia}
            </Link>
          </td>
          <td className="px-3">
            {competencia.prestadores?.nome_instituicao ?? "—"}
          </td>
          <td className="px-3 text-right tabular-nums">
            {competencia.valor_fornecido == null
              ? "—"
              : brl(competencia.valor_fornecido)}
          </td>
          <td className="px-3">
            <Badge
              variant={
                competencia.status === "concluida" ? "secondary" : "outline"
              }
            >
              {CACON_STATUS[competencia.status] ?? competencia.status}
            </Badge>
          </td>
          {(podeEditar || podeExcluir) && (
            <td className="whitespace-nowrap px-2 text-right">
              {podeEditar && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Editar competência"
                  onClick={() => onEditar(competencia)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {podeExcluir && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  title="Excluir competência"
                  onClick={() => onExcluir(competencia)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export function ListaCompetenciasCacon(props: Props) {
  const [concluidasOpen, setConcluidasOpen] = useState(false);

  const grupos = useMemo(() => {
    const abertas = props.lista.filter((item) => item.status !== "concluida");
    const concluidas = props.lista.filter((item) => item.status === "concluida");
    return {
      etapas: CACON_ETAPAS.map((etapa) => ({
        etapa,
        itens: abertas.filter((item) => etapaAtualCacon(item) === etapa.n),
      })).filter((grupo) => grupo.itens.length > 0),
      concluidas,
    };
  }, [props.lista]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2 pl-7 pr-3">Competência</th>
            <th className="px-3">Instituição</th>
            <th className="px-3 text-right">Valor produzido</th>
            <th className="px-3">Status</th>
            {(props.podeEditar || props.podeExcluir) && (
              <th className="px-2" aria-label="Ações" />
            )}
          </tr>
        </thead>
        <tbody>
          {grupos.etapas.map(({ etapa, itens }) => (
            <Fragment key={`grupo-fragment-${etapa.n}`}>
              <tr key={`grupo-${etapa.n}`} className="border-b bg-muted/35">
                <td
                  colSpan={props.podeEditar || props.podeExcluir ? 5 : 4}
                  className="px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Etapa {etapa.n}
                    </span>
                    <span className="font-semibold">{etapa.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      · {itens.length} competência(s)
                    </span>
                  </div>
                </td>
              </tr>
              <Linhas {...props} itens={itens} />
            </Fragment>
          ))}

          {grupos.concluidas.length > 0 && (
            <>
              <tr className="border-y bg-muted/35">
                <td
                  colSpan={props.podeEditar || props.podeExcluir ? 5 : 4}
                  className="p-0"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                    onClick={() => setConcluidasOpen((valor) => !valor)}
                    aria-expanded={concluidasOpen}
                  >
                    {concluidasOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-semibold">Concluídas</span>
                    <span className="text-xs text-muted-foreground">
                      · {grupos.concluidas.length} competência(s)
                    </span>
                  </button>
                </td>
              </tr>
              {concluidasOpen && <Linhas {...props} itens={grupos.concluidas} />}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
