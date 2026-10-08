import { Search, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SeiButton } from "@/components/inputs/SeiLink";
import { brl } from "@/lib/format";
import {
  empenhoCorrespondeBuscaPvh,
  empenhoOrfaoSemUsoPvh,
  saldoDisponivelEmpenhoPvh,
  totalAlocadoEmpenhoPvh,
} from "@/lib/pvh/empenhos";
import { linkValido } from "@/lib/sei";

export function ReutilizarEmpenhoDialogPvh({
  open,
  onOpenChange,
  instituicao,
  competencia,
  empenhos,
  restante,
  carregando,
  onReutilizar,
  onExcluirOrfao,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instituicao: string;
  competencia: string;
  empenhos: any[];
  restante: number;
  carregando?: boolean;
  onReutilizar: (empenho: any) => void;
  onExcluirOrfao?: (empenho: any) => void;
}) {
  const [busca, setBusca] = useState("");

  const resultados = useMemo(() => {
    return empenhos
      .filter((empenho) => saldoDisponivelEmpenhoPvh(empenho) > 0.009)
      .filter((empenho) => empenhoCorrespondeBuscaPvh(empenho, busca))
      .sort((a, b) => {
        const dataA = new Date(
          a.data_emissao ?? a.solicitacao_data ?? a.created_at,
        ).getTime();
        const dataB = new Date(
          b.data_emissao ?? b.solicitacao_data ?? b.created_at,
        ).getTime();
        return dataB - dataA;
      });
  }, [busca, empenhos]);

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        onOpenChange(aberto);
        if (!aberto) setBusca("");
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reutilizar Nota de Empenho</DialogTitle>
          <DialogDescription>
            {instituicao} · competência {competencia}. Pesquise por número da
            NE, Nº SEI da Solicitação ou Nº SEI da Nota de Empenho. O sistema
            reaproveita o registro original e cria somente a alocação desta
            competência, preservando o saldo para os demais meses.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Necessidade ainda sem cobertura
          </div>
          <div className="mt-0.5 text-lg font-semibold">{brl(restante)}</div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Ex.: 4083/2026, 29886233 ou 29955979"
          />
        </div>

        {carregando ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Localizando Notas de Empenho…
          </div>
        ) : resultados.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma Nota de Empenho com saldo disponível foi encontrada para
            esta instituição.
          </div>
        ) : (
          <div className="space-y-2">
            {resultados.map((empenho) => {
              const saldo = saldoDisponivelEmpenhoPvh(empenho);
              const alocado = totalAlocadoEmpenhoPvh(empenho);
              const valorUsavel = Math.min(saldo, restante);
              const orfao = empenhoOrfaoSemUsoPvh(empenho);
              const origem = Array.isArray(empenho.pvh_competencias)
                ? empenho.pvh_competencias[0]
                : empenho.pvh_competencias;

              return (
                <div
                  key={empenho.id}
                  className="rounded-lg border bg-background p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          NE {empenho.numero_ne ?? "sem número"}
                        </span>
                        <Badge variant="outline">
                          saldo {brl(saldo)}
                        </Badge>
                        {origem?.competencia && (
                          <Badge variant="secondary">
                            cadastrada em {origem.competencia}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>
                          Solicitação SEI:{" "}
                          <b className="text-foreground">
                            {empenho.solicitacao_sei_numero ?? "—"}
                          </b>
                        </div>
                        <div>
                          Nota de Empenho SEI:{" "}
                          <b className="text-foreground">
                            {empenho.nota_empenho_sei_numero ?? "—"}
                          </b>
                        </div>
                        <div>
                          CR / dotação:{" "}
                          <b className="text-foreground">
                            {empenho.cr_dotacao ?? "—"}
                          </b>
                        </div>
                        <div>
                          Fonte:{" "}
                          <b className="text-foreground">
                            {empenho.fonte_recurso ?? "—"}
                          </b>
                        </div>
                        <div>
                          Data da solicitação:{" "}
                          <b className="text-foreground">
                            {empenho.solicitacao_data
                              ? new Date(`${empenho.solicitacao_data}T12:00:00`).toLocaleDateString("pt-BR")
                              : "—"}
                          </b>
                        </div>
                        <div>
                          Valor total:{" "}
                          <b className="text-foreground">
                            {brl(Number(empenho.valor_total ?? 0))}
                          </b>
                        </div>
                        <div>
                          Já utilizado:{" "}
                          <b className="text-foreground">{brl(alocado)}</b>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {linkValido(empenho.solicitacao_sei_link) && (
                          <SeiButton
                            href={empenho.solicitacao_sei_link}
                            label="Solicitação"
                          />
                        )}
                        {linkValido(empenho.nota_empenho_sei_link) && (
                          <SeiButton
                            href={empenho.nota_empenho_sei_link}
                            label="Nota de Empenho"
                          />
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="mb-1 text-[10px] text-muted-foreground">
                        Será vinculado agora
                      </div>
                      <div className="mb-2 font-semibold">
                        {brl(valorUsavel)}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Button
                          size="sm"
                          disabled={restante <= 0.009 || valorUsavel <= 0.009}
                          onClick={() => onReutilizar(empenho)}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Reutilizar nesta competência
                        </Button>
                        {orfao && onExcluirOrfao && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Excluir registro órfão
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Excluir esta NE sem vínculo?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  O registro não possui competência de origem nem
                                  alocação ativa. A exclusão é bloqueada pelo banco
                                  se existir qualquer uso financeiro.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => onExcluirOrfao(empenho)}
                                >
                                  Excluir registro
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
