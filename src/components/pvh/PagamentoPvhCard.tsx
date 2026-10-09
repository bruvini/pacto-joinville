import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  hidratarPagamentoPvh,
  pagamentoCompletoPvh,
  patchPagamentoPvh,
  type FormPagamentoPvh,
} from "@/lib/pvh/pagamentoForm";

export function PagamentoPvhCard({
  pagamento,
  podeEditar,
  onChange,
}: {
  pagamento: any;
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<FormPagamentoPvh>(() => hidratarPagamentoPvh(pagamento));
  const [salvando, setSalvando] = useState(false);
  const [erroSalvamento, setErroSalvamento] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const formRef = useRef(form);
  const persistidoRef = useRef(hidratarPagamentoPvh(pagamento));
  const filaRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendentesRef = useRef(0);
  const aoSalvarRef = useRef(onChange);
  aoSalvarRef.current = onChange;

  // O registro só é reidratado quando uma OUTRA parcela é aberta.
  // updated_at é alterado a cada autosave: reagir a ele apagava as datas locais.
  useEffect(() => {
    const snapshot = hidratarPagamentoPvh(pagamento);
    formRef.current = snapshot;
    persistidoRef.current = snapshot;
    setForm(snapshot);
    setAlterado(false);
    setErroSalvamento(null);
  }, [pagamento.id]);

  const atualizar = <K extends keyof FormPagamentoPvh>(
    campo: K,
    valor: FormPagamentoPvh[K],
  ) => {
    const proximo = { ...formRef.current, [campo]: valor };
    // Atualiza a referência imediatamente, inclusive antes do próximo onBlur.
    formRef.current = proximo;
    setForm(proximo);
    setAlterado(true);
    setErroSalvamento(null);
  };

  const persistir = useCallback(() => {
    if (!podeEditar) return Promise.resolve(false);

    pendentesRef.current += 1;
    setSalvando(true);
    const tarefa = filaRef.current.then(async () => {
      const snapshot = { ...formRef.current };
      const patch = patchPagamentoPvh(snapshot, persistidoRef.current);
      if (!Object.keys(patch).length) {
        setAlterado(false);
        return true;
      }

      // Programação e pagamento são eventos distintos: não impomos ordem entre datas.
      const { error } = await supabase.from("pvh_pagamentos")
        .update(patch)
        .eq("id", pagamento.id);
      if (error) throw error;

      persistidoRef.current = {
        ...persistidoRef.current,
        ...snapshot,
      };
      setAlterado(
        Object.keys(patchPagamentoPvh(formRef.current, persistidoRef.current)).length > 0,
      );
      setErroSalvamento(null);
      aoSalvarRef.current();
      return true;
    });

    filaRef.current = tarefa.catch((error: any) => {
      const texto = error?.message ?? "Erro desconhecido ao salvar o pagamento.";
      const mensagem = texto.includes("pvh_pagamentos_datas_check")
        ? "O banco ainda possui a restrição antiga de datas. Execute a migração PVH de 09/10/2026 e tente novamente."
        : texto;
      setErroSalvamento(mensagem);
      toast.error(mensagem);
      return false;
    }).finally(() => {
      pendentesRef.current = Math.max(0, pendentesRef.current - 1);
      if (pendentesRef.current === 0) setSalvando(false);
    });
    return filaRef.current;
  }, [pagamento.id, podeEditar]);

  const salvarAoSair = () => { void persistir(); };
  const completo = pagamentoCompletoPvh(form);

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">Repasse / parcela</div>
        <div className="flex items-center gap-2">
          {podeEditar && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {salvando ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              ) : erroSalvamento ? (
                <><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Conferir dados</>
              ) : alterado ? "Alterações não salvas" : "Salvo"}
            </span>
          )}
          <Badge variant={completo ? "default" : "outline"}>
            {completo ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completo
              </span>
            ) : "Pendente"}
          </Badge>
        </div>
      </div>

      <section className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-semibold">1. Programação de pagamento</div>
        <div className="grid gap-2 md:grid-cols-[190px_minmax(260px,1fr)]">
          <div>
            <Label className="text-xs">Número SEI</Label>
            <Input className="mt-1 h-9"
              value={form.programacao_sei_numero}
              disabled={!podeEditar}
              onChange={(e) => atualizar("programacao_sei_numero", e.target.value)}
              onBlur={salvarAoSair}
            />
          </div>
          <div>
            <Label className="text-xs">Link SEI</Label>
            <div className="mt-1" onBlur={salvarAoSair}>
              <SeiLink
                value={form.programacao_sei_link}
                editable={podeEditar}
                onChange={(valor) => atualizar("programacao_sei_link", valor)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-semibold">2. Comprovante de Pagamento</div>
        <div className="grid gap-2 md:grid-cols-[190px_minmax(260px,1fr)]">
          <div>
            <Label className="text-xs">Número SEI</Label>
            <Input className="mt-1 h-9"
              value={form.comprovante_sei_numero}
              disabled={!podeEditar}
              onChange={(e) => atualizar("comprovante_sei_numero", e.target.value)}
              onBlur={salvarAoSair}
            />
          </div>
          <div>
            <Label className="text-xs">Link SEI</Label>
            <div className="mt-1" onBlur={salvarAoSair}>
              <SeiLink
                value={form.comprovante_sei_link}
                editable={podeEditar}
                onChange={(valor) => atualizar("comprovante_sei_link", valor)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <Label className="text-xs">Data da programação de pagamento</Label>
            <Input
              className="mt-1 h-9"
              type="date"
              value={form.data_programacao}
              disabled={!podeEditar}
              aria-invalid={Boolean(erroSalvamento)}
              onChange={(e) => atualizar("data_programacao", e.currentTarget.value)}
              onBlur={(e) => {
                atualizar("data_programacao", e.currentTarget.value);
                salvarAoSair();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Data do pagamento</Label>
            <Input
              className="mt-1 h-9"
              type="date"
              value={form.data_pagamento}
              disabled={!podeEditar}
              aria-invalid={Boolean(erroSalvamento)}
              onChange={(e) => atualizar("data_pagamento", e.currentTarget.value)}
              onBlur={(e) => {
                atualizar("data_pagamento", e.currentTarget.value);
                salvarAoSair();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Valor pago</Label>
            <div className="mt-1" onBlur={salvarAoSair}>
              <CurrencyInput
                className="h-9"
                value={form.valor_pago}
                disabled={!podeEditar}
                onChange={(valor) => atualizar("valor_pago", valor > 0 ? valor : null)}
              />
            </div>
          </div>
        </div>
        {erroSalvamento && (
          <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {erroSalvamento}
          </p>
        )}
      </section>
    </div>
  );
}
