import { linkValido } from "@/lib/sei";

export const CACON_ETAPAS = [
  {
    n: 1,
    titulo: "Receber produção HMSJ",
    desc: "Registrar o recebimento do Memorando e do Anexo CACON enviados pelo HMSJ.",
  },
  {
    n: 2,
    titulo: "Auditar relatório CACON",
    desc: "Preservar o PDF original e extrair, no servidor, os indicadores da competência.",
  },
  {
    n: 3,
    titulo: "Memorando SMS",
    desc: "Preparar o Memorando da SMS, coletar assinatura fiscal e encaminhar à SES.UFI.",
  },
] as const;

export const CACON_STATUS: Record<string, string> = {
  aberta: "Em andamento",
  concluida: "Concluída",
};

export const competenciaValidaCacon = (valor: string) =>
  /^(0[1-9]|1[0-2])\/\d{4}$/.test(valor);

export function ordemCompetenciaCacon(valor: string) {
  const [mes, ano] = String(valor ?? "").split("/");
  return Number(ano) * 100 + Number(mes);
}

export function etapa1Completa(c: any) {
  return Boolean(
    c?.data_recebimento &&
      c?.hmsj_memorando_numero?.trim?.() &&
      linkValido(c?.hmsj_memorando_link ?? "") &&
      c?.hmsj_anexo_numero?.trim?.() &&
      linkValido(c?.hmsj_anexo_link ?? ""),
  );
}

export function etapa2Completa(c: any) {
  return Boolean(
    c?.processado_em &&
      c?.valor_fornecido != null &&
      c?.total_unidades != null &&
      Number(c?.auditoria?.criticas ?? 0) === 0,
  );
}

export function etapaAtualCacon(c: any) {
  if (!etapa1Completa(c)) return 1;
  if (!etapa2Completa(c)) return 2;
  return 3;
}
