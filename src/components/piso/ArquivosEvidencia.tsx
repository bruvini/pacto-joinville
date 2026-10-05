import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { dateTime } from "@/lib/format";

export async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload de evidência (arquivo original nunca alterado) com hash, tamanho, tipo e autor. */
export async function enviarArquivo(file: File, competenciaId: string, categoria: string, participanteId?: string | null) {
  const hash = await sha256(file);
  const path = `${competenciaId}/${categoria}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await supabase.storage.from("piso-arquivos").upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw up.error;
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user?.id ?? "").maybeSingle();
  const { data, error } = await supabase.from("piso_arquivos").insert({
    competencia_id: competenciaId, participante_id: participanteId ?? null, categoria, nome_original: file.name,
    tamanho: file.size, mime: file.type, sha256: hash, storage_path: path, enviado_por: u.user?.id, enviado_por_nome: p?.nome ?? u.user?.email,
  }).select().single();
  if (error) throw error;
  return data;
}

export function ArquivosEvidencia({
  arquivos, competenciaId, categoria, participanteId, canEdit, onChange, accept, label = "Anexar arquivo",
}: {
  arquivos: any[]; competenciaId: string; categoria: string; participanteId?: string | null; canEdit: boolean; onChange: () => void; accept?: string; label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const lista = arquivos.filter((a) => a.categoria === categoria && (participanteId === undefined || a.participante_id === participanteId));
  const baixar = async (a: any) => {
    const { data, error } = await supabase.storage.from("piso-arquivos").createSignedUrl(a.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };
  return (
    <div className="space-y-1">
      {canEdit && (
        <>
          <input ref={ref} type="file" hidden accept={accept} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            setBusy(true);
            try { await enviarArquivo(f, competenciaId, categoria, participanteId); toast.success("Arquivo anexado."); onChange(); }
            catch (err: any) { toast.error(err.message); }
            finally { setBusy(false); }
          }} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}><Paperclip className="h-3.5 w-3.5 mr-1" />{busy ? "Enviando…" : label}</Button>
        </>
      )}
      {lista.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-xs">
          <button className="text-primary underline inline-flex items-center gap-1" onClick={() => baixar(a)}><Download className="h-3 w-3" />{a.nome_original}</button>
          <span className="text-muted-foreground">{Math.round((a.tamanho ?? 0) / 1024)} KB · {a.enviado_por_nome} · {dateTime(a.enviado_em)} · SHA-256 {a.sha256?.slice(0, 10)}…</span>
        </div>
      ))}
    </div>
  );
}
