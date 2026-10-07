import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, ChevronLeft, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/pvh/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do PVH — SMS Joinville" },
      { name: "description", content: "Configurações versionadas por instituição para o PVH." },
    ],
  }),
  component: PvhConfiguracoesPage,
});

const hojeIso = () => new Date().toISOString().slice(0, 10);

function PvhConfiguracoesPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prestador_id: "",
    vigencia_inicio: hojeIso(),
    vigencia_fim: "",
    notificar_email: false,
    exige_prestacao_contas: false,
    prazo_prestacao_contas_dias: "",
    cr_dotacao: "",
    natureza_despesa: "",
    fonte_recurso: "",
    processo_empenho_sei: "",
    processo_subempenho_sei: "",
    observacao: "",
  });

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

  const configuracoes = useQuery({
    queryKey: ["pvh_prestador_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_prestador_config")
        .select("*")
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const normativas = useQuery({
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

  const prestadorPorId = useMemo(
    () => new Map((prestadores.data ?? []).map((p) => [p.id, p])),
    [prestadores.data],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.prestador_id) throw new Error("Selecione a instituição.");
      if (!form.vigencia_inicio) throw new Error("Informe o início da vigência.");
      if (
        form.exige_prestacao_contas &&
        form.prazo_prestacao_contas_dias &&
        Number(form.prazo_prestacao_contas_dias) <= 0
      ) {
        throw new Error("O prazo de prestação de contas deve ser maior que zero.");
      }

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pvh_prestador_config").insert({
        prestador_id: form.prestador_id,
        vigencia_inicio: form.vigencia_inicio,
        vigencia_fim: form.vigencia_fim || null,
        notificar_email: form.notificar_email,
        exige_prestacao_contas: form.exige_prestacao_contas,
        prazo_prestacao_contas_dias:
          form.exige_prestacao_contas && form.prazo_prestacao_contas_dias
            ? Number(form.prazo_prestacao_contas_dias)
            : null,
        cr_dotacao: form.cr_dotacao.trim() || null,
        natureza_despesa: form.natureza_despesa.trim() || null,
        fonte_recurso: form.fonte_recurso.trim() || null,
        processo_empenho_sei: form.processo_empenho_sei.trim() || null,
        processo_subempenho_sei: form.processo_subempenho_sei.trim() || null,
        observacao: form.observacao.trim() || null,
        created_by: auth.user?.id ?? null,
      });
      if (error) {
        if (error.code === "23505")
          throw new Error("Já existe uma configuração iniciando nesta data para a instituição.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_prestador_config"] });
      setOpen(false);
      toast.success("Nova vigência de configuração cadastrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const novaConfiguracao = () => {
    setForm({
      prestador_id: "",
      vigencia_inicio: hojeIso(),
      vigencia_fim: "",
      notificar_email: false,
      exige_prestacao_contas: false,
      prazo_prestacao_contas_dias: "",
      cr_dotacao: "",
      natureza_despesa: "",
      fonte_recurso: "",
      processo_empenho_sei: "",
      processo_subempenho_sei: "",
      observacao: "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/pvh"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar ao PVH
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
            <Settings2 className="h-6 w-6" />
            Configurações do PVH
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Aqui ficam as regras que mudam por instituição e por período. Ao incluir uma
            instituição numa competência, o sistema guarda uma cópia da configuração vigente.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={novaConfiguracao}>
            <Plus className="mr-2 h-4 w-4" />
            Nova vigência
          </Button>
        )}
      </div>

      <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpenCheck className="h-4 w-4 text-primary" />
            Antes de abrir uma competência
          </CardTitle>
          <CardDescription>
            Mesmo quem nunca executou o PVH deve conseguir validar estes quatro pontos antes de começar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          {[
            ["1. Participação", "A instituição participa do PVH neste período?"],
            ["2. Comunicação", "Ela deve receber o aviso institucional por e-mail?"],
            ["3. Prestação de contas", "Há obrigação de prestação? Qual é o prazo do instrumento?"],
            ["4. Orçamento", "CR/dotação, natureza, fonte e processos SEI estão corretos?"],
          ].map(([titulo, texto]) => (
            <div key={titulo} className="rounded-lg border bg-background p-3">
              <div className="font-semibold">{titulo}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base normativa cadastrada</CardTitle>
          <CardDescription>
            A competência guarda a normativa vigente como referência histórica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(normativas.data ?? []).map((norma) => (
            <div
              key={norma.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <div className="font-semibold">{norma.titulo}</div>
                <div className="text-xs text-muted-foreground">
                  Vigência desde {new Date(norma.vigencia_inicio + "T12:00").toLocaleDateString("pt-BR")}
                  {norma.observacao ? " · " + norma.observacao : ""}
                </div>
              </div>
              <Badge variant={norma.ativa ? "default" : "secondary"}>
                {norma.ativa ? "Ativa" : "Histórica"}
              </Badge>
            </div>
          ))}
          {normativas.isError && (
            <p className="text-sm text-destructive">
              Não foi possível consultar a base normativa. A migration do PVH precisa estar aplicada.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vigências por instituição</CardTitle>
          <CardDescription>
            Para mudar uma regra, prefira criar uma nova vigência. Assim competências antigas continuam reconstruíveis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configuracoes.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : configuracoes.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as configurações do PVH. Verifique se a migration foi aplicada.
            </div>
          ) : (configuracoes.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma instituição configurada para o PVH ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Instituição</th>
                    <th>Vigência</th>
                    <th>E-mail</th>
                    <th>Prestação</th>
                    <th>CR / dotação</th>
                    <th>Natureza</th>
                    <th>Fonte</th>
                    <th>Processos anuais</th>
                  </tr>
                </thead>
                <tbody>
                  {(configuracoes.data ?? []).map((cfg) => {
                    const prestador = prestadorPorId.get(cfg.prestador_id);
                    return (
                      <tr key={cfg.id} className="border-b align-top">
                        <td className="py-3 font-medium">
                          {prestador?.nome_instituicao ?? "Prestador não encontrado"}
                        </td>
                        <td className="py-3">
                          {new Date(cfg.vigencia_inicio + "T12:00").toLocaleDateString("pt-BR")}
                          {" → "}
                          {cfg.vigencia_fim
                            ? new Date(cfg.vigencia_fim + "T12:00").toLocaleDateString("pt-BR")
                            : "vigente"}
                        </td>
                        <td className="py-3">
                          <Badge variant={cfg.notificar_email ? "default" : "secondary"}>
                            {cfg.notificar_email ? "Obrigatório" : "Não aplicável"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {cfg.exige_prestacao_contas
                            ? "Sim" + (cfg.prazo_prestacao_contas_dias ? " · " + cfg.prazo_prestacao_contas_dias + " dias" : "")
                            : "Não"}
                        </td>
                        <td className="py-3">{cfg.cr_dotacao ?? "—"}</td>
                        <td className="py-3">{cfg.natureza_despesa ?? "—"}</td>
                        <td className="py-3">{cfg.fonte_recurso ?? "—"}</td>
                        <td className="py-3 text-xs text-muted-foreground">
                          <div>Empenho: {cfg.processo_empenho_sei ?? "—"}</div>
                          <div>Subempenho: {cfg.processo_subempenho_sei ?? "—"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova vigência de configuração PVH</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              Cadastre uma nova vigência quando a regra da instituição mudar. Não substitua configurações históricas usadas em competências já processadas.
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
                  {(prestadores.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome_instituicao}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Início da vigência</Label>
                <Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Fim da vigência (opcional)</Label>
                <Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox checked={form.notificar_email} onCheckedChange={(checked) => setForm({ ...form, notificar_email: checked === true })} />
                <span>
                  <span className="block font-medium">Notificação por e-mail obrigatória</span>
                  <span className="block text-xs text-muted-foreground">Se desmarcado, a comunicação aparece como “Não aplicável”.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox checked={form.exige_prestacao_contas} onCheckedChange={(checked) => setForm({ ...form, exige_prestacao_contas: checked === true })} />
                <span>
                  <span className="block font-medium">Exige prestação de contas</span>
                  <span className="block text-xs text-muted-foreground">A obrigação é configurável; não é inferida pelo nome do hospital.</span>
                </span>
              </label>
            </div>

            {form.exige_prestacao_contas && (
              <div>
                <Label>Prazo da prestação de contas em dias</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.prazo_prestacao_contas_dias}
                  onChange={(e) => setForm({ ...form, prazo_prestacao_contas_dias: e.target.value })}
                  placeholder="Deixe vazio quando o instrumento não definir prazo em dias"
                />
              </div>
            )}

            <div>
              <div className="mb-2 font-medium">Classificação orçamentária</div>
              <div className="grid gap-3 md:grid-cols-3">
                <div><Label>CR / dotação</Label><Input value={form.cr_dotacao} onChange={(e) => setForm({ ...form, cr_dotacao: e.target.value })} /></div>
                <div><Label>Natureza da despesa</Label><Input value={form.natureza_despesa} onChange={(e) => setForm({ ...form, natureza_despesa: e.target.value })} /></div>
                <div><Label>Fonte</Label><Input value={form.fonte_recurso} onChange={(e) => setForm({ ...form, fonte_recurso: e.target.value })} /></div>
              </div>
            </div>

            <div>
              <div className="mb-2 font-medium">Processos SEI anuais</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Processo de empenhos</Label><Input value={form.processo_empenho_sei} onChange={(e) => setForm({ ...form, processo_empenho_sei: e.target.value })} /></div>
                <div><Label>Processo de subempenhos</Label><Input value={form.processo_subempenho_sei} onChange={(e) => setForm({ ...form, processo_subempenho_sei: e.target.value })} /></div>
              </div>
            </div>

            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: regra contratual específica, observação do exercício…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={!form.prestador_id || !form.vigencia_inicio || salvar.isPending}>
              Salvar nova vigência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
