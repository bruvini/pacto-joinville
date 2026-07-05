/** Setores oficiais do sistema (usados no cadastro, gestão de usuários e alertas). */
export const SETORES = [
  "ACP — Área de Convênios e Parcerias",
  "UFI — Unidade de Gestão Financeira",
  "APC — Área de Prestação de Contas",
];

export const SIGLA_SETOR = (setor: string | null | undefined): string =>
  (setor ?? "").split("—")[0].trim().split("-")[0].trim() || "—";

export const isSetorAPC = (setor: string | null | undefined) => (setor ?? "").toUpperCase().startsWith("APC");
export const isSetorUFI = (setor: string | null | undefined) => (setor ?? "").toUpperCase().startsWith("UFI");
export const isSetorACP = (setor: string | null | undefined) => (setor ?? "").toUpperCase().startsWith("ACP");
