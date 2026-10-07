import { CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getEtapaAgrupamento, statusAcoEfetivo } from "@/lib/etapa";

type EstadoLinha = "ocioso" | "salvando" | "salvo" | "erro";

type RascunhoLinha = {
  dotacao: string;
  fonte: string;
  estado: EstadoLinha;
};

export function RegistrarDotacaoFonteDialog({
  lancamentos,
  convenios,
  podeEditar,
  onChanged,
}: {
  lancamentos: any[];
  convenios: any[];
  podeEditar: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoLinha>>({});
  const salvandoRef = useRef(new Set<string>());

  const conveniosPorId = useMemo(
    () => new Map((convenios ?? []).map((c: any) => [c.id, c])),
    [convenios],
  );

  const pendentes = useMemo(
    () =>
      (lancamentos ?? [])
        .filter(
          (l: any) =>
            !l.parent_id &&
            !l.concluido &&
            getEtapaAgrupamento(l) === "Análise de Orçamento",
        )
        .sort((a: any, b: any) => {
          const pa = a.prestadores?.nome_instituicao ?? "";
          const pb = b.prestadores?.nome_instituicao ?? "";
          return (
            pa.localeCompare(pb, "pt-BR") ||
            String(a.competencia ?? "").localeCompare(String(b.competencia ?? ""), "pt-BR")
          );
        }),
    [lancamentos],
  );

  useEffect(() => {
    if (!open) return;
    setRascunhos((atuais) => {
      const proximo: Record<string, RascunhoLinha> = {};
      for (const lancamento of pendentes) {
        proximo[lancamento.id] = {
          dotacao:
            atuais[lancamento.id]?.dotacao ??
            String(lancamento.dotacao_orcamentaria ?? ""),
          fonte:
            atuais[lancamento.id]?.fonte ??
            String(lancamento.fonte_pagamento ?? ""),
          estado: atuais[lancamento.id]?.estado ?? "ocioso",
        };
      }
      return proximo;
    });
  }, [open, pendentes]);

  const alterar = (id: string, campo: "dotacao" | "fonte", valor: string) => {
    const somenteDigitos = valor.replace(/\D/g, "");
    setRascunhos((atuais) => ({
      ...atuais,
      [id]: {
        dotacao: atuais[id]?.dotacao ?? "",
        fonte: atuais[id]?.fonte ?? "",
        estado: "ocioso",
        [campo]: somenteDigitos,
      },
    }));
  };

  const salvarLinha = async (lancamento: any) => {
    if (!podeEditar || salvandoRef.current.has(lancamento.id)) return;

    const rascunho = rascunhos[lancamento.id];
    if (!rascunho) return;

    const dotacao = rascunho.dotacao.trim();
    const fonte = rascunho.fonte.trim();
    const semMudanca =
      dotacao === String(lancamento.dotacao_orcamentaria ?? "") &&
      fonte === String(lancamento.fonte_pagamento ?? "");
    if (semMudanca) return;

    salvandoRef.current.add(lancamento.id);
    setRascunhos((atuais) => ({
      ...atuais,
      [lancamento.id]: { ...atuais[lancamento.id], estado: "salvando" },
    }));

    const estadoProjetado = {
      ...lancamento,
      dotacao_orcamentaria: dotacao || null,
      fonte_pagamento: fonte || null,
    };
    const status = statusAcoEfetivo(estadoProjetado);
    const etapaConcluida = Boolean(dotacao && fonte);

    const { error } = await supabase
      .from("lancamentos_pagamento")
      .update({
        dotacao_orcamentaria: dotacao || null,
        fonte_pagamento: fonte || null,
        status_aco: status as any,
        responsavel_atual: etapaConcluida ? "acp" : "aco",
      })
      .eq("id", lancamento.id);

    salvandoRef.current.delete(lancamento.id);

    if (error) {
      setRascunhos((atuais) => ({
        ...atuais,
        [lancamento.id]: { ...atuais[lancamento.id], estado: "erro" },
      }));
      toast.error(
        `Não foi possível salvar dotação/fonte de ${lancamento.prestadores?.nome_instituicao ?? "lançamento"}: ${error.message}`,
      );
      return;
    }

    setRascunhos((atuais) => ({
      ...atuais,
      [lancamento.id]: { ...atuais[lancamento.id], estado: "salvo" },
    }));
    onChanged();

    if (etapaConcluida) {
      toast.success("Dotação e fonte registradas. O lançamento avançou para Solicitação.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!podeEditar}>
          <Landmark className="mr-2 h-4 w-4" />
          Registrar Dotação e Fonte
          {pendentes.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 text-[10px]">
              {pendentes.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Dotação e Fonte</DialogTitle>
          <DialogDescription>
            Lançamentos atualmente em Análise de Orçamento. Cada linha é salva no próprio
            lançamento ao sair do campo, exatamente como no preenchimento individual.
          </DialogDescription>
        </DialogHeader>

        {pendentes.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum lançamento aguarda Dotação Orçamentária e Fonte de Pagamento.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Prestador</th>
                  <th className="px-3 py-2.5">Convênio</th>
                  <th className="px-3 py-2.5 text-center">Competência</th>
                  <th className="px-3 py-2.5 text-center">Parcela</th>
                  <th className="px-3 py-2.5">Dotação Orçamentária</th>
                  <th className="px-3 py-2.5">Fonte de Pagamento</th>
                  <th className="w-24 px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((lancamento: any) => {
                  const rascunho = rascunhos[lancamento.id] ?? {
                    dotacao: String(lancamento.dotacao_orcamentaria ?? ""),
                    fonte: String(lancamento.fonte_pagamento ?? ""),
                    estado: "ocioso" as EstadoLinha,
                  };
                  const convenio = conveniosPorId.get(lancamento.convenio_id) as any;

                  return (
                    <tr key={lancamento.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium">
                        {lancamento.prestadores?.nome_instituicao ?? "—"}
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <span
                          className="block truncate"
                          title={convenio?.objeto ?? lancamento.descricao ?? ""}
                        >
                          {convenio?.objeto ?? lancamento.descricao ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {lancamento.competencia ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {lancamento.parcela ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="numeric"
                          className="h-8 min-w-[150px]"
                          value={rascunho.dotacao}
                          onChange={(e) =>
                            alterar(lancamento.id, "dotacao", e.target.value)
                          }
                          onBlur={() => void salvarLinha(lancamento)}
                          disabled={!podeEditar || rascunho.estado === "salvando"}
                          placeholder="Dotação"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="numeric"
                          className="h-8 min-w-[150px]"
                          value={rascunho.fonte}
                          onChange={(e) =>
                            alterar(lancamento.id, "fonte", e.target.value)
                          }
                          onBlur={() => void salvarLinha(lancamento)}
                          disabled={!podeEditar || rascunho.estado === "salvando"}
                          placeholder="Fonte"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rascunho.estado === "salvando" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Salvando
                          </span>
                        ) : rascunho.estado === "salvo" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Salvo
                          </span>
                        ) : rascunho.estado === "erro" ? (
                          <span className="text-[11px] text-destructive">Erro</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Quando os dois campos ficam preenchidos, o lançamento passa automaticamente de
          Análise de Orçamento para Solicitação e a responsabilidade retorna à ACP.
        </p>
      </DialogContent>
    </Dialog>
  );
}
