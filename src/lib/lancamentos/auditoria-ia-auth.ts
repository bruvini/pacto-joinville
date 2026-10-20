export async function exigirPapelAuditor(admin: any, usuarioId: string) {
  if (!usuarioId) throw new Error("Sessão não identificada.");
  const { data, error } = await admin.from("user_roles")
    .select("role").eq("user_id", usuarioId);
  if (error) throw error;
  if (!(data ?? []).some((r: any) => ["admin", "acp"].includes(r.role))) {
    throw new Error("Somente ACP e Admin podem enviar, analisar ou revisar.");
  }
}

export async function verificarPdfOriginal(
  bytes: Uint8Array,
  tamanho: number,
  hashEsperado: string,
) {
  if (bytes.length < 6 || bytes.length > 12582912 || bytes.length !== tamanho) {
    throw new Error("Arquivo não corresponde ao documento cadastrado.");
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("O documento armazenado não é um PDF válido.");
  }
  const digesto = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const sha = Array.from(new Uint8Array(digesto))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (sha !== hashEsperado.toLowerCase()) {
    throw new Error("A integridade SHA-256 do documento não confere.");
  }
}
