import { Pencil, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { competenciaValidaPvh } from "@/lib/pvh/etapas";

function dataParaCompetencia(data?: string | null) {
  if (!data) return "";
  const [ano, mes] = data.split("-");
  return mes && ano ? mes + "/" + ano : "";
}

function competenciaParaData(comp: string) {
  if (!competenciaValidaPvh(comp)) return null;
  const [mes, ano] = comp.split("/");
  return ano + "-" + mes + "-01";
}

const vazio = {
  id: "",
  prestador_id: "",
  inicio_competencia: "",
  fim_competencia: "",
  notificar_email: false,
  exige_prestacao_contas: false,
  prazo_prestacao_contas_dias: "",
  observacao: "",
};

export function ConfiguracoesInstituicoesPvh() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "admin");
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

  const configs = useQuery({
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

  const prestadorPorId = useMemo(
    () => new Map((prestadores.data ?? []).map((item) => [item.id, item])),
    [prestadores.data],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.prestador_id) throw new Error("Selecione a instituição.");
      if (!competenciaValidaPvh(form.inicio_competencia))
        throw new Error("Informe a primeira competência em que a configuração vale.");
      if (form.fim_competencia && !competenciaValidaPvh(form.fim_competencia))
        throw new Error("Informe a última competência no formato MM/AAAA.");
      const vigencia_inicio = competenciaParaData(form.inicio_competencia)!;
      const vigencia_fim = form.fim_competencia
        ? competenciaParaData(form.fim_competencia)
        : null;
      if (vigencia_fim && vigencia_fim < vigencia_inicio)
        throw new Error("A última competência não pode ser anterior à primeira.");

      const fimNovo = vigencia_fim ?? "9999-12-31";
      const vigenciaSobreposta = (configs.data ?? []).find(
        (cfg) =>
          cfg.id !== form.id &&
          cfg.prestador_id === form.prestador_id &&
          cfg.ativo === true &&
          cfg.vigencia_inicio <= fimNovo &&
          (cfg.vigencia_fim ?? "9999-12-31") >= vigencia_inicio,
      );
      if (vigenciaSobreposta) {
        throw new Error(
          "Já existe uma vigência ativa que cobre esse período. Encerre a vigência anterior antes de criar a nova regra.",
        );
      }
      if (
        form.exige_prestacao_contas &&
        form.prazo_prestacao_contas_dias &&
        Number(form.prazo_prestacao_contas_dias) <= 0
      ) {
        throw new Error("O prazo de prestação de contas deve ser maior que zero.");
      }

      const payload = {
        prestador_id: form.prestador_id,
        vigencia_inicio,
        vigencia_fim,
        notificar_email: form.notificar_email,
        exige_prestacao_contas: form.exige_prestacao_contas,
        prazo_prestacao_contas_dias:
          form.exige_prestacao_contas && form.prazo_prestacao_contas_dias
            ? Number(form.prazo_prestacao_contas_dias)
            : null,
        observacao: form.observacao.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase
          .from("pvh_prestador_config")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("pvh_prestador_config").insert({
          ...payload,
          created_by: auth.user?.id ?? null,
        });
        if (error) {
          if (error.code === "23505")
            throw new Error("Já existe uma configuração iniciando nessa competência.");
          throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pvh_prestador_config"] });
      setOpen(false);
      toast.success(form.id ? "Configuração atualizada." : "Configuração cadastrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const nova = () => {
    setForm(vazio);
    setOpen(true);
  };

  const editar = (cfg: any) => {
    setForm({
      id: cfg.id,
      prestador_id: cfg.prestador_id,
      inicio_competencia: dataParaCompetencia(cfg.vigencia_inicio),
      fim_competencia: dataParaCompetencia(cfg.vigencia_fim),
      notificar_email: cfg.notificar_email === true,
      exige_prestacao_contas: cfg.exige_prestacao_contas === true,
      prazo_prestacao_contas_dias: cfg.prazo_prestacao_contas_dias
        ? String(cfg.prazo_prestacao_contas_dias)
        : "",
      observacao: cfg.observacao ?? "",
    });
    setOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Regras por instituição e competência</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Aqui ficam somente regras institucionais: participação no PVH, comunicação e
              prestação de contas. Classificação orçamentária não fica nesta configuração; ela é
              registrada em cada Nota de Empenho.
            </CardDescription>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={nova}>
              <Plus className="mr-2 h-4 w-4" />
              Nova vigência
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {configs.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : configs.isError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as configurações das instituições.
            </p>
          ) : (configs.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma instituição configurada para o PVH.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Instituição</th>
                    <th>Competências</th>
                    <th>Comunicação</th>
                    <th>Prestação de contas</th>
                    <th>Observação</th>
                    {podeEditar && <th aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {(configs.data ?? []).map((cfg) => (
                    <tr key={cfg.id} className="border-b align-top">
                      <td className="py-3 font-medium">
                        {prestadorPorId.get(cfg.prestador_id)?.nome_instituicao ??
                          "Prestador não encontrado"}
                      </td>
                      <td className="py-3">
                        {dataParaCompetencia(cfg.vigencia_inicio)}
                        {" → "}
                        {cfg.vigencia_fim ? dataParaCompetencia(cfg.vigencia_fim) : "em aberto"}
                      </td>
                      <td className="py-3">
                        <Badge variant={cfg.notificar_email ? "default" : "secondary"}>
                          {cfg.notificar_email ? "E-mail obrigatório" : "Não aplicável"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {cfg.exige_prestacao_contas
                          ? "Sim" +
                            (cfg.prazo_prestacao_contas_dias
                              ? " · " + cfg.prazo_prestacao_contas_dias + " dias"
                              : "")
                          : "Não"}
                      </td>
                      <td className="max-w-sm py-3 text-xs text-muted-foreground">
                        {cfg.observacao ?? "—"}
                      </td>
                      {podeEditar && (
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar configuração"
                            onClick={() => editar(cfg)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar configuração PVH" : "Nova vigência de configuração PVH"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 text-sm leading-relaxed text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              <b>O que significa “início da vigência”?</b> É a primeira <b>competência mensal</b>
              em que esta regra da instituição deve ser aplicada. Exemplo: se a obrigação de
              prestação de contas mudou a partir de julho/2026, informe <b>07/2026</b>. Não use
              automaticamente a data em que você está fazendo o cadastro.
            </div>

            <div>
              <Label>Instituição</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.prestador_id}
                onChange={(e) => setForm({ ...form, prestador_id: e.target.value })}
                disabled={Boolean(form.id)}
              >
                <option value="">Selecione…</option>
                {(prestadores.data ?? []).map((prestador) => (
                  <option key={prestador.id} value={prestador.id}>
                    {prestador.nome_instituicao}
                  </option>
                ))}
              </select>
              {form.id && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Para evitar trocar uma regra histórica de instituição, o prestador não é alterado
                  durante a edição. Crie outra vigência se necessário.
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Primeira competência em que a regra vale</Label>
                <CompetenciaInput
                  value={form.inicio_competencia}
                  onChange={(inicio_competencia) =>
                    setForm({ ...form, inicio_competencia })
                  }
                />
              </div>
              <div>
                <Label>Última competência (opcional)</Label>
                <CompetenciaInput
                  value={form.fim_competencia}
                  onChange={(fim_competencia) => setForm({ ...form, fim_competencia })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Deixe vazio quando a regra continuar vigente.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={form.notificar_email}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, notificar_email: checked === true })
                  }
                />
                <span>
                  <span className="block font-medium">Exige aviso por e-mail</span>
                  <span className="block text-xs text-muted-foreground">
                    Se não exigir, a etapa de comunicação registra “Não aplicável” e não bloqueia
                    o encerramento.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={form.exige_prestacao_contas}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, exige_prestacao_contas: checked === true })
                  }
                />
                <span>
                  <span className="block font-medium">Exige prestação de contas</span>
                  <span className="block text-xs text-muted-foreground">
                    A obrigação é explícita por instituição e período; o sistema não tenta inferir
                    pelo nome do hospital.
                  </span>
                </span>
              </label>
            </div>

            {form.exige_prestacao_contas && (
              <div>
                <Label>Prazo em dias, se o instrumento definir</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.prazo_prestacao_contas_dias}
                  onChange={(e) =>
                    setForm({ ...form, prazo_prestacao_contas_dias: e.target.value })
                  }
                  placeholder="Deixe vazio se não houver prazo expresso em dias"
                />
              </div>
            )}

            <div>
              <Label>Observação da vigência</Label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                placeholder="Explique a origem da mudança ou qualquer particularidade da instituição."
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              <b>CR/dotação, natureza e fonte não são configurados aqui.</b> Eles pertencem à
              Nota de Empenho emitida e podem mudar durante o exercício. O cadastro da NE captura
              esses dados no momento correto.
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => salvar.mutate()}
              disabled={
                !form.prestador_id ||
                !competenciaValidaPvh(form.inicio_competencia) ||
                salvar.isPending
              }
            >
              {form.id ? "Salvar alterações" : "Cadastrar vigência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
