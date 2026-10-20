/** Validação/normalização de links (SEI e afins). */

/**
 * Links copiados do SEI ou de páginas HTML podem trazer "&amp;"
 * nos separadores da query. Isso desconfigura parâmetros do SEI.
 * Preserva host, caminho e valores: não inventa endereços do SEI.
 */
export function normalizarLinkSei(u: string | null | undefined): string {
  return String(u ?? "")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;|&#x0*26;/gi, "&");
}

/** Apenas URL HTTP(S) com domínio válido, sem credenciais nem esquema executável. */
export const linkValido = (u: string | null | undefined): boolean => {
  const s = normalizarLinkSei(u);
  if (!s || /\s/.test(s) || /^(javascript|data|vbscript):/i.test(s)) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname.includes(".") || url.hostname === "localhost") &&
      !url.username && !url.password &&
      !s.includes("://https://") && !s.includes("://http://");
  } catch {
    return false;
  }
};

/** Preserva a URL colada, inclusive todos os parâmetros da query string. */
export const hrefSei = (u: string): string => {
  const s = normalizarLinkSei(u);
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
