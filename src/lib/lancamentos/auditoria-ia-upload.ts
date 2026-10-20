import { supabase } from "@/integrations/supabase/client";

/** Evidência original: PDF imutável, hash SHA-256 e vínculo à competência. */
export async function enviarPdfAuditoria(arquivo: File, lancamentoId: string) {
  if (!/\.pdf$/i.test(arquivo.name) ||
      (arquivo.type && arquivo.type !== "application/pdf") ||
      arquivo.size === 0 || arquivo.size > 12582912) {
    throw new Error("Selecione um PDF de até 12 MB.");
  }
  const bytes = await arquivo.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("Arquivo sem assinatura de PDF.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(hash))
    .map((v) => v.toString(16).padStart(2, "0")).join("");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Usuário não autenticado.");
  const id = crypto.randomUUID();
  const storage_path = `${lancamentoId}/${id}.pdf`;
  const { error: storageError } = await supabase.storage.from("auditoria-pagamentos")
    .upload(storage_path, arquivo, { contentType: "application/pdf", upsert: false });
  if (storageError) throw storageError;
  const { error } = await supabase.from("auditoria_pagamento_documentos").insert({
    id, lancamento_id: lancamentoId, storage_path,
    nome_arquivo: arquivo.name.slice(0, 240),
    tamanho_bytes: arquivo.size, sha256, enviado_por: data.user.id,
  });
  if (error) throw error;
  return id;
}
