import { linkValido } from "@/lib/sei";

export function totalSubempenhadoPvh(
  subempenhos: Array<{ valor?: number | null }>,
) {
  return subempenhos.reduce(
    (soma, subempenho) => soma + Number(subempenho.valor ?? 0),
    0,
  );
}

export function saldoSubempenharPvh(
  valorAlocado: number,
  subempenhos: Array<{ valor?: number | null }>,
) {
  return Math.max(0, Number(valorAlocado ?? 0) - totalSubempenhadoPvh(subempenhos));
}

export function coberturaSubempenhoFechadaPvh(
  valorAlocado: number,
  subempenhos: Array<{ valor?: number | null }>,
) {
  return (
    subempenhos.length === 1 &&
    Math.abs(Number(subempenhos[0]?.valor ?? 0) - Number(valorAlocado ?? 0)) <
      0.01
  );
}

export function fluxoUnicoSubempenhoPvh<T>(
  subempenhos: T[] | null | undefined,
): T | null {
  return (subempenhos ?? []).length === 1 ? (subempenhos ?? [])[0] : null;
}


export type StatusSubetapasSubempenhoPvh = {
  solicitacao: boolean;
  liquidacao: boolean;
  subempenho: boolean;
  completas: number;
  total: 3;
};

export function statusSubetapasSubempenhoPvh(
  subempenho: any,
  assinaturas: any[] = [],
): StatusSubetapasSubempenhoPvh {
  const ativas = assinaturas.filter(
    (item) =>
      item.subempenho_id === subempenho?.id &&
      !item.revogado_em,
  );

  const comissaoSolicitacao = ativas.some(
    (item) =>
      item.documento_tipo === "solicitacao" &&
      item.slot === "comissao",
  );

  const comissaoLiquidacao = ativas.some(
    (item) =>
      item.documento_tipo === "movimento_liquidacao" &&
      item.slot === "comissao",
  );

  const solicitacao = Boolean(
    subempenho?.solicitacao_sei_numero?.trim?.() &&
      linkValido(subempenho?.solicitacao_sei_link) &&
      comissaoSolicitacao,
  );

  const liquidacao = Boolean(
    subempenho?.movimento_liquidacao_sei_numero?.trim?.() &&
      linkValido(subempenho?.movimento_liquidacao_sei_link) &&
      comissaoLiquidacao &&
      subempenho?.movimento_liquidacao_encaminhado_sefaz === true,
  );

  const subempenhoOk = Boolean(
    subempenho?.movimento_subempenho_sei_numero?.trim?.() &&
      linkValido(subempenho?.movimento_subempenho_sei_link) &&
      subempenho?.movimento_subempenho_data,
  );

  const completas = [solicitacao, liquidacao, subempenhoOk].filter(Boolean).length;

  return {
    solicitacao,
    liquidacao,
    subempenho: subempenhoOk,
    completas,
    total: 3,
  };
}

export function cadeiaSubempenhoCompletaPvh(
  subempenho: any,
  assinaturas: any[] = [],
) {
  const status = statusSubetapasSubempenhoPvh(subempenho, assinaturas);
  return (
    Number(subempenho?.valor ?? 0) > 0 &&
    status.solicitacao &&
    status.liquidacao &&
    status.subempenho
  );
}


export const CAMPOS_AUTOSAVE_SUBEMPENHO_PVH = [
  "solicitacao_sei_numero",
  "solicitacao_sei_link",
  "movimento_liquidacao_sei_numero",
  "movimento_liquidacao_sei_link",
  "movimento_subempenho_sei_numero",
  "movimento_subempenho_sei_link",
  "movimento_subempenho_data",
] as const;

export type CampoAutosaveSubempenhoPvh =
  (typeof CAMPOS_AUTOSAVE_SUBEMPENHO_PVH)[number];

export type FormAutosaveSubempenhoPvh = Record<
  CampoAutosaveSubempenhoPvh,
  string
>;

export function patchAutosaveSubempenhoPvh(
  atual: FormAutosaveSubempenhoPvh,
  persistido: FormAutosaveSubempenhoPvh,
) {
  const patch: Partial<Record<CampoAutosaveSubempenhoPvh, string | null>> = {};

  for (const campo of CAMPOS_AUTOSAVE_SUBEMPENHO_PVH) {
    const atualNormalizado = atual[campo].trim() || null;
    const persistidoNormalizado = persistido[campo].trim() || null;

    if (atualNormalizado !== persistidoNormalizado) {
      patch[campo] = atualNormalizado;
    }
  }

  return patch;
}
