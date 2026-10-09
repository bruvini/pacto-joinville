import { linkValido } from "@/lib/sei";

export type FormPagamentoPvh = {
  programacao_sei_numero: string;
  programacao_sei_link: string;
  comprovante_sei_numero: string;
  comprovante_sei_link: string;
  data_programacao: string;
  data_pagamento: string;
  valor_pago: number | null;
};

export type PatchPagamentoPvh = Partial<Record<keyof FormPagamentoPvh, string | number | null>>;

const camposTexto = [
  "programacao_sei_numero",
  "programacao_sei_link",
  "comprovante_sei_numero",
  "comprovante_sei_link",
  "data_programacao",
  "data_pagamento",
] as const;

export function hidratarPagamentoPvh(pagamento: Partial<FormPagamentoPvh>): FormPagamentoPvh {
  return {
    programacao_sei_numero: pagamento.programacao_sei_numero ?? "",
    programacao_sei_link: pagamento.programacao_sei_link ?? "",
    comprovante_sei_numero: pagamento.comprovante_sei_numero ?? "",
    comprovante_sei_link: pagamento.comprovante_sei_link ?? "",
    data_programacao: pagamento.data_programacao ?? "",
    data_pagamento: pagamento.data_pagamento ?? "",
    valor_pago: pagamento.valor_pago == null ? null : Number(pagamento.valor_pago),
  };
}

/** YYYY-MM-DD compara corretamente em ordem lexicográfica sem fuso horário. */
export function erroCronologiaPagamentoPvh(form: FormPagamentoPvh): string | null {
  if (!form.data_programacao || !form.data_pagamento) return null;
  if (form.data_pagamento < form.data_programacao) {
    return "A data do pagamento não pode ser anterior à programação. Corrija uma das datas; o preenchimento foi preservado.";
  }
  return null;
}

export function patchPagamentoPvh(
  atual: FormPagamentoPvh,
  persistido: FormPagamentoPvh,
): PatchPagamentoPvh {
  const patch: PatchPagamentoPvh = {};
  for (const campo of camposTexto) {
    const novo = atual[campo].trim() || null;
    const antigo = persistido[campo].trim() || null;
    if (novo !== antigo) patch[campo] = novo;
  }
  const valor = atual.valor_pago != null && atual.valor_pago > 0 ? atual.valor_pago : null;
  const anterior = persistido.valor_pago != null && persistido.valor_pago > 0
    ? persistido.valor_pago : null;
  if (valor !== anterior) patch.valor_pago = valor;
  return patch;
}

export function pagamentoCompletoPvh(form: FormPagamentoPvh) {
  return Boolean(
    !erroCronologiaPagamentoPvh(form) &&
    form.programacao_sei_numero.trim() &&
    linkValido(form.programacao_sei_link) &&
    form.comprovante_sei_numero.trim() &&
    linkValido(form.comprovante_sei_link) &&
    form.data_programacao &&
    form.data_pagamento &&
    Number(form.valor_pago ?? 0) > 0,
  );
}
