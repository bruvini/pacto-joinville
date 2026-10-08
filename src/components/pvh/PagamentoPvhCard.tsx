import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { linkValido } from "@/lib/sei";

type Form = {
  programacao_sei_numero: string;
  programacao_sei_link: string;
  comprovante_sei_numero: string;
  comprovante_sei_link: string;
  data_programacao: string;
  data_pagamento: string;
  valor_pago: number | null;
};

export function PagamentoPvhCard({
  pagamento,
  podeEditar,
  onChange,
}: {
  pagamento: any;
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<Form>({
    programacao_sei_numero: "",
    programacao_sei_link: "",
    comprovante_sei_numero: "",
    comprovante_sei_link: "",
    data_programacao: "",
    data_pagamento: "",
    valor_pago: null,
  });

  useEffect(() => {
    setForm({
      programacao_sei_numero: pagamento.programacao_sei_numero ?? "",
      programacao_sei_link: pagamento.programacao_sei_link ?? "",
      comprovante_sei_numero: pagamento.comprovante_sei_numero ?? "",
      comprovante_sei_link: pagamento.comprovante_sei_link ?? "",
      data_programacao: pagamento.data_programacao ?? "",
      data_pagamento: pagamento.data_pagamento ?? "",
      valor_pago:
        pagamento.valor_pago == null ? null : Number(pagamento.valor_pago),
    });
  }, [pagamento.id, pagamento.updated_at]);

  const completo = Boolean(
    form.programacao_sei_numero.trim() &&
      linkValido(form.programacao_sei_link) &&
      form.comprovante_sei_numero.trim() &&
      linkValido(form.comprovante_sei_link) &&
      form.data_programacao &&
      form.data_pagamento &&
      Number(form.valor_pago ?? 0) > 0,
  );

  const salvar = useMutation({
    mutationFn: async ({
      campo,
      valor,
    }: {
      campo: keyof Form;
      valor: string | number | null;
    }) => {
      const { error } = await supabase
        .from("pvh_pagamentos")
        .update({ [campo]: valor })
        .eq("id", pagamento.id);
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (error: any) => toast.error(error.message),
  });

  const salvarTexto = (campo: keyof Form, valor: string) => {
    const novo = valor.trim() || null;
    const atual = pagamento[campo] ?? null;
    if ((novo ?? null) === (atual ?? null)) return;
    salvar.mutate({ campo, valor: novo });
  };

  const salvarValor = () => {
    const novo = form.valor_pago && form.valor_pago > 0 ? form.valor_pago : null;
    const atual =
      pagamento.valor_pago == null ? null : Number(pagamento.valor_pago);
    if (novo === atual) return;
    salvar.mutate({ campo: "valor_pago", valor: novo });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Repasse / parcela</div>
        <Badge variant={completo ? "default" : "outline"}>
          {completo ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Completo
            </span>
          ) : (
            "Pendente"
          )}
        </Badge>
      </div>

      <section className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-semibold">1. Programação de pagamento</div>
        <div className="grid gap-2 md:grid-cols-[190px_minmax(260px,1fr)]">
          <div>
            <Label className="text-xs">Número SEI</Label>
            <Input
              className="mt-1 h-9"
              value={form.programacao_sei_numero}
              disabled={!podeEditar}
              onChange={(e) =>
                setForm({ ...form, programacao_sei_numero: e.target.value })
              }
              onBlur={() =>
                salvarTexto(
                  "programacao_sei_numero",
                  form.programacao_sei_numero,
                )
              }
            />
          </div>
          <div>
            <Label className="text-xs">Link SEI</Label>
            <div
              className="mt-1"
              onBlur={() =>
                salvarTexto("programacao_sei_link", form.programacao_sei_link)
              }
            >
              <SeiLink
                value={form.programacao_sei_link}
                editable={podeEditar}
                onChange={(value) =>
                  setForm({ ...form, programacao_sei_link: value })
                }
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
            <Input
              className="mt-1 h-9"
              value={form.comprovante_sei_numero}
              disabled={!podeEditar}
              onChange={(e) =>
                setForm({ ...form, comprovante_sei_numero: e.target.value })
              }
              onBlur={() =>
                salvarTexto(
                  "comprovante_sei_numero",
                  form.comprovante_sei_numero,
                )
              }
            />
          </div>
          <div>
            <Label className="text-xs">Link SEI</Label>
            <div
              className="mt-1"
              onBlur={() =>
                salvarTexto("comprovante_sei_link", form.comprovante_sei_link)
              }
            >
              <SeiLink
                value={form.comprovante_sei_link}
                editable={podeEditar}
                onChange={(value) =>
                  setForm({ ...form, comprovante_sei_link: value })
                }
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
              onChange={(e) =>
                setForm({ ...form, data_programacao: e.target.value })
              }
              onBlur={() =>
                salvarTexto("data_programacao", form.data_programacao)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Data do pagamento</Label>
            <Input
              className="mt-1 h-9"
              type="date"
              value={form.data_pagamento}
              disabled={!podeEditar}
              onChange={(e) =>
                setForm({ ...form, data_pagamento: e.target.value })
              }
              onBlur={() => salvarTexto("data_pagamento", form.data_pagamento)}
            />
          </div>
          <div>
            <Label className="text-xs">Valor pago</Label>
            <div className="mt-1" onBlur={salvarValor}>
              <CurrencyInput
                className="h-9"
                value={form.valor_pago}
                disabled={!podeEditar}
                onChange={(valor) =>
                  setForm({
                    ...form,
                    valor_pago: valor > 0 ? valor : null,
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
