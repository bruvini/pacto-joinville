/** Validação/normalização de links (SEI e afins). */

/** Aceita http(s):// OU domínio "pelado" (ex.: sei.joinville.sc.gov.br/...). Bloqueia javascript:. */
export const linkValido = (u: string | null | undefined) => {
  if (!u) return false;
  const s = String(u).trim();
  if (!s || /^(javascript|data|vbscript):/i.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return /^[^\s]+\.[^\s]{2,}/.test(s); // domínio com ponto, sem espaços
};

/** Garante https:// para abrir em nova aba. */
export const hrefSei = (u: string) => {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
