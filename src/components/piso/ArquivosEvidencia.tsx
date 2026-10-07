import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { dateTime } from "@/lib/format";

export async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Upload de evidência (arquivo original nunca alterado) com hash, tamanho, tipo e autor. */
export async function enviarArquivo(
  file: File,
  competenciaId: string,
  categoria: string,
  participanteId?: string | null,
  reutilizarDuplicado = false,
) {
  const hash = await sha256(file);

  if (reutilizarDuplicado) {
    let query = supabase
      .from("piso_arquivos")
      .select("*")
      .eq("competencia_id", competenciaId)
      .eq("categoria", categoria)
      .eq("sha256", hash);
    query =
      participanteId == null
        ? query.is("participante_id", null)
        : query.eq("participante_id", participanteId);
    const { data: existente, error: buscaError } = await query
      .order("enviado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (buscaError) throw buscaError;
    if (existente) return { ...existente, reutilizado: true };
  }
  const path = `${competenciaId}/${categoria}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await supabase.storage
    .from("piso-arquivos")
    .upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw up.error;
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("nome")
    .eq("id", u.user?.id ?? "")
    .maybeSingle();
  const { data, error } = await supabase
    .from("piso_arquivos")
    .insert({
      competencia_id: competenciaId,
      participante_id: participanteId ?? null,
      categoria,
      nome_original: file.name,
      tamanho: file.size,
      mime: file.type,
      sha256: hash,
      storage_path: path,
      enviado_por: u.user?.id,
      enviado_por_nome: p?.nome ?? u.user?.email,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from("piso-arquivos").remove([path]).catch(() => undefined);
    throw error;
  }
  return { ...data, reutilizado: false };
}

export async function removerArquivoEvidencia(a: any) {
  if (!a?.id || !a?.storage_path) throw new Error("Arquivo inválido para remoção.");

  const { error: dbError } = await supabase.from("piso_arquivos").delete().eq("id", a.id);
  if (dbError) throw dbError;

  const { error: storageError } = await supabase.storage
    .from("piso-arquivos")
    .remove([a.storage_path]);
  if (storageError)
    throw new Error(
      `Registro removido, mas a limpeza do Storage falhou: ${storageError.message}`,
    );
}

export async function rollbackArquivoProcessavel(a: any) {
  if (a?.reutilizado) return;
  try {
    await removerArquivoEvidencia(a);
  } catch (error) {
    console.error("Falha ao desfazer upload não processado:", error);
  }
}

export function ArquivosEvidencia({
  arquivos,
  competenciaId,
  categoria,
  participanteId,
  canEdit,
  onChange,
  accept,
  label = "Anexar arquivo",
  canRemove,
  onRetry,
}: {
  arquivos: any[];
  competenciaId: string;
  categoria: string;
  participanteId?: string | null;
  canEdit: boolean;
  onChange: () => void;
  accept?: string;
  label?: string;
  canRemove?: (arquivo: any) => boolean;
  onRetry?: (arquivo: any) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const lista = arquivos.filter(
    (a) =>
      a.categoria === categoria &&
      (participanteId === undefined || a.participante_id === participanteId),
  );
  const baixar = async (a: any) => {
    const { data, error } = await supabase.storage
      .from("piso-arquivos")
      .createSignedUrl(a.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };
  const remover = async (a: any) => {
    if (!confirm(`Remover a tentativa não processada “${a.nome_original}”?`)) return;
    setAcaoId(a.id);
    try {
      await removerArquivoEvidencia(a);
      toast.success("Tentativa não processada removida.");
      onChange();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAcaoId(null);
    }
  };

  const reprocessar = async (a: any) => {
    if (!onRetry) return;
    setAcaoId(a.id);
    try {
      await onRetry(a);
      onChange();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAcaoId(null);
    }
  };

  return (
    <div className="space-y-1">
      {canEdit && (
        <>
          <input
            ref={ref}
            type="file"
            hidden
            accept={accept}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try {
                await enviarArquivo(f, competenciaId, categoria, participanteId);
                toast.success("Arquivo anexado.");
                onChange();
              } catch (err: any) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 mr-1" />
            {busy ? "Enviando…" : label}
          </Button>
        </>
      )}
      {lista.map((a) => {
        const removivel = Boolean(canRemove?.(a));
        const ocupado = acaoId === a.id;
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
            <button
              className="inline-flex items-center gap-1 text-primary underline"
              onClick={() => baixar(a)}
            >
              <Download className="h-3 w-3" />
              {a.nome_original}
            </button>
            <span className="text-muted-foreground">
              {Math.round((a.tamanho ?? 0) / 1024)} KB · {a.enviado_por_nome} ·{" "}
              {dateTime(a.enviado_em)} · SHA-256 {a.sha256?.slice(0, 10)}…
            </span>
            {removivel && onRetry && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={ocupado}
                onClick={() => reprocessar(a)}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Reprocessar
              </Button>
            )}
            {removivel && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                disabled={ocupado}
                onClick={() => remover(a)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remover
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
