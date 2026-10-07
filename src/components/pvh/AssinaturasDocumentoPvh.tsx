import { CheckCircle2, History, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateTime } from "@/lib/format";

function agoraLocalInput() {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AssinaturasDocumentoPvh({
  documentoId,
  assinaturas,
  podeEditar,
  onChange,
}: {
  documentoId: string;
  assinaturas: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    papel_funcao: "",
    assinante_nome: "",
    assinado_em: agoraLocalInput(),
  });

  const ativas = assinaturas.filter(
    (assinatura) => assinatura.documento_id === documentoId && !assinatura.revogado_em,
  );
  const historicas = assinaturas.filter(
    (assinatura) => assinatura.documento_id === documentoId && assinatura.revogado_em,
  );

  const registrar = async () => {
    if (!form.papel_funcao.trim() || !form.assinante_nome.trim()) {
      toast.error("Informe o papel/função e quem efetivamente assinou.");
      return;
    }

    setSalvando(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();

    const { error } = await supabase.from("pvh_documento_assinaturas").insert({
      documento_id: documentoId,
      papel_funcao: form.papel_funcao.trim(),
      assinante_nome: form.assinante_nome.trim(),
      assinado_em: new Date(form.assinado_em).toISOString(),
      registrado_por: auth.user?.id ?? null,
      registrado_por_nome: profile?.nome ?? auth.user?.email ?? null,
    });

    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setOpen(false);
    setForm({
      papel_funcao: "",
      assinante_nome: "",
      assinado_em: agoraLocalInput(),
    });
    onChange();
    toast.success("Assinatura registrada.");
  };

  const revogar = async (assinatura: any) => {
    const motivo = prompt(
      `Motivo para revogar o registro de assinatura de ${assinatura.assinante_nome}:`,
    );
    if (!motivo?.trim()) return;

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();

    const { error } = await supabase
      .from("pvh_documento_assinaturas")
      .update({
        revogado_em: new Date().toISOString(),
        revogado_por: auth.user?.id ?? null,
        revogado_por_nome: profile?.nome ?? auth.user?.email ?? null,
        motivo_revogacao: motivo.trim(),
      })
      .eq("id", assinatura.id);

    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
    toast.success("Registro de assinatura revogado sem apagar o histórico.");
  };

  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assinaturas por papel/função
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Registre a função institucional e a pessoa que efetivamente assinou. Nomes nunca são
            regra fixa do fluxo.
          </p>
        </div>

        {podeEditar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Registrar assinatura
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar assinatura do documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Papel / função</Label>
                  <Input
                    value={form.papel_funcao}
                    onChange={(e) => setForm({ ...form, papel_funcao: e.target.value })}
                    placeholder="Ex.: Gerência, Diretoria Executiva, Coordenação…"
                  />
                </div>
                <div>
                  <Label>Quem assinou</Label>
                  <Input
                    value={form.assinante_nome}
                    onChange={(e) => setForm({ ...form, assinante_nome: e.target.value })}
                    placeholder="Nome registrado no documento"
                  />
                </div>
                <div>
                  <Label>Data e hora da assinatura</Label>
                  <Input
                    type="datetime-local"
                    value={form.assinado_em}
                    onChange={(e) => setForm({ ...form, assinado_em: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => void registrar()}
                  disabled={
                    salvando ||
                    !form.papel_funcao.trim() ||
                    !form.assinante_nome.trim() ||
                    !form.assinado_em
                  }
                >
                  Registrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {ativas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma assinatura ativa registrada.</p>
        ) : (
          ativas.map((assinatura) => (
            <div
              key={assinatura.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">{assinatura.assinante_nome}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {assinatura.papel_funcao}
                  </Badge>
                </div>
                <div className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                  Assinado em {dateTime(assinatura.assinado_em)}
                  {assinatura.registrado_por_nome
                    ? ` · registrado por ${assinatura.registrado_por_nome}`
                    : ""}
                </div>
              </div>
              {podeEditar && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => void revogar(assinatura)}
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  Revogar registro
                </Button>
              )}
            </div>
          ))
        )}

        {historicas.length > 0 && (
          <details className="rounded-md border border-dashed px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              <History className="mr-1.5 inline h-3.5 w-3.5" />
              {historicas.length} assinatura(s) revogada(s) preservada(s) no histórico
            </summary>
            <div className="mt-2 space-y-1.5">
              {historicas.map((assinatura) => (
                <div key={assinatura.id} className="text-[11px] text-muted-foreground">
                  <b>{assinatura.assinante_nome}</b> · {assinatura.papel_funcao} · revogada em{" "}
                  {dateTime(assinatura.revogado_em)}
                  {assinatura.motivo_revogacao
                    ? ` · motivo: ${assinatura.motivo_revogacao}`
                    : ""}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
