import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

const TIPOS: Record<string, string> = {
  empenho: "Empenhos",
  liquidacao_pagamento: "Liquidação e pagamento",
  aplicacao_recursos: "Aplicação dos recursos / ofícios",
  comunicacao: "Comunicações",
  outro: "Outro",
};

const vazio = {
  id: "",
  prestador_id: "",
  ano: String(new Date().getFullYear()),
  tipo: "empenho",
  numero_sei: "",
  link_sei: "",
  descricao: "",
  ativo: true,
};

export function ProcessosAnuaisPvh() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "admin");
  const podeExcluir = hasRole(roles, "admin");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vazio);

  const prestadores = useQuery({
    queryKey: ["pvh-config-prestadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestadores")
        .select("id,nome_instituicao,status")
        .eq("status", "ativo")
        .order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
  });

  const processos = useQuery({
    queryKey: ["pvh_processos_anuais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_processos_anuais")
        .select("*")
        .order("ano", { ascending: false })
        .order("tipo")
        .order("numero_sei");
      if (error) throw error;
      return data ?? [];
    },
  });

  const prestadorPorId = useMemo(
    () => new Map((prestadores.data ?? []).map((item) => [item.id, item])),
    [prestadores.data],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const ano = Number(form.ano);
      if (!form.prestador_id) throw new Error("Selecione a instituição.");
      if (!Number.isInteger(ano) || ano < 2024 || ano > 2100)
        throw new Error("Informe um ano válido.");
      if (!form.numero_sei.trim()) throw new Error("Informe o número do processo SEI.");

      const payload = {
        prestador_id: form.prestador_id,
        ano,
        tipo: form.tipo,
        numero_sei: form.numero_sei.trim(),
        link_sei: form.link_sei.trim() || null,
        descricao: form.descricao.trim() || null,
        ativo: form.ativo,
      };

      if (form.id) {
        const { error } = await supabase
          .from("pvh_processos_anuais")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("pvh_processos_anuais").insert({
          ...payload,
          created_by: auth.user?.id ?? null,
        });
        if (error) {
          if (error.code === "23505")
            throw new Error("Esse processo já foi cadastrado para a instituição, ano e finalidade.");
          throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_processos_anuais"] });
      setOpen(false);
      toast.success(form.id ? "Processo anual atualizado." : "Processo anual cadastrado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pvh_processos_anuais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_processos_anuais"] });
      toast.success("Processo anual removido.");
    },
    onError: (error: any) =>
      toast.error(
        error.code === "23503"
          ? "Esse processo já está vinculado a movimentações financeiras e deve ser preservado."
          : error.message,
      ),
  });

  const novo = () => {
    setForm({ ...vazio, ano: String(new Date().getFullYear()) });
    setOpen(true);
  };

  const editar = (item: any) => {
    setForm({
      id: item.id,
      prestador_id: item.prestador_id,
      ano: String(item.ano),
      tipo: item.tipo,
      numero_sei: item.numero_sei ?? "",
      link_sei: item.link_sei ?? "",
      descricao: item.descricao ?? "",
      ativo: item.ativo !== false,
    });
    setOpen(true);
  };

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of processos.data ?? []) {
      const key = String(item.ano);
      const lista = map.get(key) ?? [];
      lista.push(item);
      map.set(key, lista);
    }
    return [...map.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }, [processos.data]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Processos SEI anuais</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Registre o processo do exercício por instituição e finalidade. O número e o link ficam
              disponíveis dentro das etapas financeiras para o usuário não precisar procurar o
              processo manualmente.
            </CardDescription>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={novo}>
              <Plus className="mr-2 h-4 w-4" />
              Novo processo SEI
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            <b>Exemplo observado nos documentos de 2026:</b> há processos separados por instituição
            para empenhos e para liquidação/pagamento. O cadastro por ano evita reaproveitar
            automaticamente um processo de exercício anterior.
          </div>

          {processos.isLoading ? (
            <p className="py-5 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : processos.isError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar os processos anuais do PVH.
            </p>
          ) : grupos.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum processo anual cadastrado.
            </div>
          ) : (
            grupos.map(([ano, itens]) => (
              <div key={ano}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Exercício {ano}
                </div>
                <div className="divide-y rounded-lg border">
                  {itens.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {prestadorPorId.get(item.prestador_id)?.nome_instituicao ??
                              "Prestador não encontrado"}
                          </span>
                          <Badge variant="outline">{TIPOS[item.tipo] ?? item.tipo}</Badge>
                          {!item.ativo && <Badge variant="secondary">Inativo</Badge>}
                        </div>
                        <div className="mt-1 font-mono text-sm">{item.numero_sei}</div>
                        {item.descricao && (
                          <div className="mt-1 text-xs text-muted-foreground">{item.descricao}</div>
                        )}
                      </div>

                      <div className="flex gap-1">
                        {item.link_sei && (
                          <Button asChild size="sm" variant="outline">
                            <a href={item.link_sei} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Abrir no SEI
                            </a>
                          </Button>
                        )}
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar processo"
                            onClick={() => editar(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {podeExcluir && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Excluir processo"
                            onClick={() =>
                              confirm(
                                "Excluir este processo anual? Se já houver movimentação vinculada, a exclusão será bloqueada.",
                              ) && excluir.mutate(item.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar processo SEI anual" : "Novo processo SEI anual"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              Cadastre o <b>processo-mãe do exercício</b>. Documentos mensais como solicitações,
              NEs, avisos e subempenhos continuam sendo registrados na competência/Nota de Empenho;
              este cadastro serve para indicar onde eles tramitam.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Instituição</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.prestador_id}
                  onChange={(e) => setForm({ ...form, prestador_id: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {(prestadores.data ?? []).map((prestador) => (
                    <option key={prestador.id} value={prestador.id}>
                      {prestador.nome_instituicao}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Ano / exercício</Label>
                <Input
                  type="number"
                  min={2024}
                  max={2100}
                  value={form.ano}
                  onChange={(e) => setForm({ ...form, ano: e.target.value })}
                />
              </div>

              <div>
                <Label>Finalidade</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {Object.entries(TIPOS).map(([valor, label]) => (
                    <option key={valor} value={valor}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Número do processo SEI</Label>
                <Input
                  value={form.numero_sei}
                  onChange={(e) => setForm({ ...form, numero_sei: e.target.value })}
                  placeholder="Ex.: 26.0.000654-5"
                />
              </div>

              <div>
                <Label>Link do processo SEI</Label>
                <Input
                  value={form.link_sei}
                  onChange={(e) => setForm({ ...form, link_sei: e.target.value })}
                  placeholder="https://sei.joinville.sc.gov.br/..."
                />
              </div>

              <div className="md:col-span-2">
                <Label>Descrição / orientação</Label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Ex.: Solicitações de Nota de Empenho e NEs do PVH no exercício."
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={form.ativo}
                onCheckedChange={(ativo) => setForm({ ...form, ativo })}
              />
              <span>
                <span className="block font-medium">Disponível nas etapas</span>
                <span className="block text-xs text-muted-foreground">
                  Desative quando o processo não deve mais aparecer como opção para novos registros.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {form.id ? "Salvar alterações" : "Cadastrar processo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
