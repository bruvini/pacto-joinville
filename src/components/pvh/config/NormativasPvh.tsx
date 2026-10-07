import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const vazio = {
  id: "",
  codigo: "",
  titulo: "",
  tipo: "deliberacao",
  numero: "",
  data_ato: "",
  vigencia_inicio: "",
  vigencia_fim: "",
  url_oficial: "",
  observacao: "",
  ativa: true,
};

function vigenteHoje(norma: any) {
  if (!norma.ativa) return false;
  const hoje = new Date().toISOString().slice(0, 10);
  return norma.vigencia_inicio <= hoje && (!norma.vigencia_fim || norma.vigencia_fim >= hoje);
}

export function NormativasPvh() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "admin");
  const podeExcluir = hasRole(roles, "admin");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vazio);

  const query = useQuery({
    queryKey: ["pvh_normativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_normativas")
        .select("*")
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error("Informe o título da base normativa.");
      if (!form.codigo.trim()) throw new Error("Informe um código interno para a norma.");
      if (!form.vigencia_inicio) throw new Error("Informe quando a norma passa a valer no PVH.");
      if (form.vigencia_fim && form.vigencia_fim < form.vigencia_inicio)
        throw new Error("O fim da vigência não pode ser anterior ao início.");

      const payload = {
        codigo: form.codigo.trim(),
        titulo: form.titulo.trim(),
        tipo: form.tipo.trim() || "outro",
        numero: form.numero.trim() || null,
        data_ato: form.data_ato || null,
        vigencia_inicio: form.vigencia_inicio,
        vigencia_fim: form.vigencia_fim || null,
        url_oficial: form.url_oficial.trim() || null,
        observacao: form.observacao.trim() || null,
        ativa: form.ativa,
      };

      if (form.id) {
        const { error } = await supabase.from("pvh_normativas").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("pvh_normativas").insert({
          ...payload,
          created_by: auth.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_normativas"] });
      setOpen(false);
      toast.success(form.id ? "Base normativa atualizada." : "Base normativa cadastrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pvh_normativas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_normativas"] });
      toast.success("Base normativa removida.");
    },
    onError: (error: any) =>
      toast.error(
        error.code === "23503"
          ? "Essa norma já está vinculada a competências e deve ser mantida como registro histórico."
          : error.message,
      ),
  });

  const nova = () => {
    setForm(vazio);
    setOpen(true);
  };

  const editar = (norma: any) => {
    setForm({
      id: norma.id,
      codigo: norma.codigo ?? "",
      titulo: norma.titulo ?? "",
      tipo: norma.tipo ?? "deliberacao",
      numero: norma.numero ?? "",
      data_ato: norma.data_ato ?? "",
      vigencia_inicio: norma.vigencia_inicio ?? "",
      vigencia_fim: norma.vigencia_fim ?? "",
      url_oficial: norma.url_oficial ?? "",
      observacao: norma.observacao ?? "",
      ativa: norma.ativa !== false,
    });
    setOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Base normativa do PVH</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Cadastre aqui Deliberações, Portarias e outros atos que definem o PVH. A competência
              escolhe a norma pela vigência; por isso não apague uma referência histórica que já
              foi usada.
            </CardDescription>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={nova}>
              <Plus className="mr-2 h-4 w-4" />
              Nova base normativa
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isLoading ? (
            <p className="py-5 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : query.isError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as bases normativas.
            </p>
          ) : (
            (query.data ?? []).map((norma) => (
              <div
                key={norma.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{norma.titulo}</span>
                    <Badge variant={vigenteHoje(norma) ? "default" : "secondary"}>
                      {!norma.ativa ? "Desabilitada" : vigenteHoje(norma) ? "Vigente hoje" : "Histórica"}
                    </Badge>
                    <Badge variant="outline">{norma.tipo}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Vigência: {new Date(norma.vigencia_inicio + "T12:00").toLocaleDateString("pt-BR")}
                    {" → "}
                    {norma.vigencia_fim
                      ? new Date(norma.vigencia_fim + "T12:00").toLocaleDateString("pt-BR")
                      : "sem data final"}
                    {norma.numero ? " · " + norma.numero : ""}
                  </div>
                  {norma.observacao && (
                    <p className="mt-2 text-sm text-muted-foreground">{norma.observacao}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {norma.url_oficial && (
                    <Button asChild variant="ghost" size="icon" title="Abrir fonte oficial">
                      <a href={norma.url_oficial} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {podeEditar && (
                    <Button variant="ghost" size="icon" title="Editar base normativa" onClick={() => editar(norma)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {podeExcluir && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title="Excluir base normativa"
                      onClick={() =>
                        confirm(
                          "Excluir esta base normativa? Se ela já estiver vinculada a uma competência, o banco impedirá a exclusão.",
                        ) && excluir.mutate(norma.id)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar base normativa" : "Nova base normativa"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <b>Vigência</b> significa o período em que esta regra deve ser aplicada às competências
              do PVH. A data do ato pode ser diferente da data em que seus efeitos financeiros começam.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Código interno</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Ex.: 416-CIB-2026"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  <option value="deliberacao">Deliberação</option>
                  <option value="portaria_estadual">Portaria estadual</option>
                  <option value="portaria_municipal">Portaria municipal</option>
                  <option value="lei">Lei</option>
                  <option value="decreto">Decreto</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>Título</Label>
                <Input
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex.: Deliberação 416/CIB/2026"
                />
              </div>
              <div>
                <Label>Número do ato</Label>
                <Input
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="Ex.: 416/CIB/2026"
                />
              </div>
              <div>
                <Label>Data do ato</Label>
                <Input
                  type="date"
                  value={form.data_ato}
                  onChange={(e) => setForm({ ...form, data_ato: e.target.value })}
                />
              </div>
              <div>
                <Label>Início dos efeitos no PVH</Label>
                <Input
                  type="date"
                  value={form.vigencia_inicio}
                  onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim dos efeitos (opcional)</Label>
                <Input
                  type="date"
                  value={form.vigencia_fim}
                  onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Link oficial</Label>
                <Input
                  value={form.url_oficial}
                  onChange={(e) => setForm({ ...form, url_oficial: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Observação</Label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Explique o que mudou, a partir de qual competência ou qualquer ressalva relevante."
                />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={form.ativa}
                onCheckedChange={(ativa) => setForm({ ...form, ativa })}
              />
              <span>
                <span className="block font-medium">Disponível para vinculação</span>
                <span className="block text-xs text-muted-foreground">
                  Desative apenas quando a entrada estiver incorreta ou não deva mais ser usada para
                  novas competências. O histórico já vinculado permanece.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {form.id ? "Salvar alterações" : "Cadastrar base normativa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
