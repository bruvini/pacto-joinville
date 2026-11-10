import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileMinus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SeiButton } from "@/components/inputs/SeiLink";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { anulacaoDaNePvh, validarAnulacaoResidualPvh } from "@/lib/pvh/anulacao";
import { saldoDisponivelEmpenhoPvh, totalAlocadoEmpenhoPvh } from "@/lib/pvh/empenhos";

export function AnulacaoResidualPvh({
  empenho,
  podeAnular,
  onRegistrada,
}: {
  empenho: any;
  podeAnular: boolean;
  onRegistrada: () => void;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valorInformado, setValorInformado] = useState("");
  const [data, setData] = useState("");
  const [numeroSei, setNumeroSei] = useState("");
  const [linkSei, setLinkSei] = useState("");
  const [motivo, setMotivo] = useState("");
  const [declaracao, setDeclaracao] = useState(false);
  const [tentou, setTentou] = useState(false);
  const anulacao = anulacaoDaNePvh(empenho);
  const emitido = Number(empenho.valor_total ?? 0);
  const utilizado = totalAlocadoEmpenhoPvh(empenho);
  const saldo = saldoDisponivelEmpenhoPvh(empenho);
  const validacao = validarAnulacaoResidualPvh({
    valorInformado, saldo, data, numeroSei, linkSei, motivo, declaracao,
  });

  const registrar = useMutation({
    mutationFn: async () => {
      const { data: resultado, error } = await supabase.rpc(
        "pvh_registrar_anulacao_residual", {
          p_empenho: empenho.id,
          p_valor_contabil: validacao.valor,
          p_data_anulacao: data,
          p_numero_sei: numeroSei.trim(),
          p_link_sei: linkSei.trim(),
          p_motivo: motivo.trim(),
          p_confirmar_sem_uso_futuro: true,
        },
      );
      if (error) throw error;
      return resultado;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pvh_empenhos"] }),
        qc.invalidateQueries({ queryKey: ["pvh_logs"] }),
        qc.invalidateQueries({ queryKey: ["pvh_competencias"] }),
      ]);
      onRegistrada();
      setAberto(false);
      toast.success("Anulação contábil registrada. NE e alocações anteriores preservadas.");
    },
    onError: (erro: any) => toast.error(
      erro?.message ?? "Não foi possível registrar a anulação do saldo.",
    ),
  });

  if (anulacao) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Anulação contábil: {brl(Number(anulacao.valor_anulado))} · {anulacao.data_anulacao}
          {" · "}SEI {anulacao.numero_sei}
        </span>
        <SeiButton href={anulacao.link_sei} label="Ato de anulação" />
      </div>
    );
  }
  if (!podeAnular || empenho.status !== "ativo" ||
      !empenho.numero_ne || saldo <= 0.009) return null;

  return (
    <>
      <Button type="button" size="sm" variant="outline"
        onClick={() => { setTentou(false); setAberto(true); }}>
        <FileMinus2 className="mr-2 h-4 w-4" />
        Registrar anulação residual
      </Button>
      <Dialog open={aberto} onOpenChange={(proximo) => {
        if (!registrar.isPending) setAberto(proximo);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Anulação contábil do saldo residual</DialogTitle>
            <DialogDescription>
              NE {empenho.numero_ne}. Esta operação registra o ato já formalizado
              no SEI, sem alterar o valor original da NE ou as alocações anteriores.
              O saldo será encerrado em todas as competências abrangidas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-xs">
            <div>Emitido<br /><strong>{brl(emitido)}</strong></div>
            <div>Já alocado<br /><strong>{brl(utilizado)}</strong></div>
            <div>Saldo a anular<br /><strong>{brl(saldo)}</strong></div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={"pvh-anulacao-valor-" + empenho.id}>
                Valor registrado no ato contábil (R$)
              </Label>
              <Input id={"pvh-anulacao-valor-" + empenho.id}
                value={valorInformado} onChange={e => setValorInformado(e.target.value)}
                inputMode="decimal" placeholder="0,00" />
              <p className="text-xs text-muted-foreground">
                Digite o valor efetivamente anulado no documento SEI. Ele deve
                coincidir exatamente com {brl(saldo)}; diferenças bloqueiam a operação.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={"pvh-anulacao-data-" + empenho.id}>Data do ato</Label>
              <Input id={"pvh-anulacao-data-" + empenho.id} type="date"
                value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={"pvh-anulacao-sei-" + empenho.id}>Número SEI do ato</Label>
              <Input id={"pvh-anulacao-sei-" + empenho.id}
                value={numeroSei} onChange={e => setNumeroSei(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={"pvh-anulacao-link-" + empenho.id}>Link completo HTTPS do SEI</Label>
              <Input id={"pvh-anulacao-link-" + empenho.id}
                value={linkSei} onChange={e => setLinkSei(e.target.value)}
                placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor={"pvh-anulacao-motivo-" + empenho.id}>Justificativa contábil</Label>
              <Textarea id={"pvh-anulacao-motivo-" + empenho.id}
                value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Descreva o motivo do ato de anulação e o encerramento do saldo..." />
            </div>
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox id={"pvh-anulacao-confirmacao-" + empenho.id}
                checked={declaracao} onCheckedChange={v => setDeclaracao(v === true)} />
              <Label htmlFor={"pvh-anulacao-confirmacao-" + empenho.id}
                className="text-xs leading-5">
                Confirmo que a anulação integral do saldo residual está formalizada
                no SEI e que este saldo não será utilizado em competências futuras.
                Sei que o registro é imutável e preserva os usos já realizados.
              </Label>
            </div>
            {tentou && validacao.erros.length > 0 && (
              <div role="alert" className="space-y-1 text-xs text-destructive">
                {validacao.erros.map(erro => <p key={erro}>{erro}</p>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={registrar.isPending}
              onClick={() => setAberto(false)}>Voltar</Button>
            <Button type="button" disabled={registrar.isPending}
              onClick={() => {
                setTentou(true);
                if (validacao.erros.length === 0) registrar.mutate();
              }}>
              {registrar.isPending ? "Registrando..." : "Confirmar anulação contábil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
