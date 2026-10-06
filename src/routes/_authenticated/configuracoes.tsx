import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TriangleAlert, CalendarDays, FileSignature, Info } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";
import { ImportarHistoricoPC } from "@/components/ImportarHistoricoPC";
import { registrarAcesso } from "@/lib/acesso";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  // Defesa em profundidade: bloqueia não-admins já no roteamento.
  // A verdade continua sendo a RLS (admin-only) no banco.
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const isAdmin = (r ?? []).some((x) => x.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: ConfigPage,
});

function ConfigPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Configurações</h1>
      <p className="text-sm text-muted-foreground -mt-2">A gestão de usuários e papéis fica na página <b>Usuários</b> (menu lateral, exclusiva de administradores).</p>
      <Tabs defaultValue="assinaturas">
        <TabsList>
          <TabsTrigger value="assinaturas">Matriz de Assinaturas SEI</TabsTrigger>
          <TabsTrigger value="piso">Piso · regras e prazos</TabsTrigger>
          <TabsTrigger value="notif">Notificações</TabsTrigger>
          <TabsTrigger value="importar">Importar Histórico</TabsTrigger>
          <TabsTrigger value="avancado">Avançado</TabsTrigger>
        </TabsList>
        <TabsContent value="assinaturas"><div className="space-y-4"><AssinaturasMatriz /><SignatariosManuais /></div></TabsContent>
        <TabsContent value="piso"><ConfiguracoesPiso /></TabsContent>
        <TabsContent value="notif"><NotifLog /></TabsContent>
        <TabsContent value="importar"><ImportarHistoricoPC /></TabsContent>
        <TabsContent value="avancado"><Avancado /></TabsContent>
      </Tabs>
    </div>
  );
}

const PISO_DOCUMENTO_LABEL: Record<string, string> = {
  minuta: "Minuta da Portaria Municipal",
  memorando: "Memorando para publicação",
  portaria_municipal: "Portaria Municipal publicada",
  solicitacao_ne: "Solicitação de Nota de Empenho",
  nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Solicitação de Subempenho / Liquidação",
  aviso_liquidacao: "Aviso de Movimento - Empenho em Liquidação",
  aviso_subempenho: "Aviso de Movimento - Subempenho",
};

const PISO_DOCUMENTOS = Object.entries(PISO_DOCUMENTO_LABEL);

const slugBloco = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

function ConfiguracoesPiso() {
  const qc = useQueryClient();
  const [feriado, setFeriado] = useState({ data: "", descricao: "" });
  const [slot, setSlot] = useState({
    tipo_documento: "minuta",
    label: "",
    cargos: "",
    manual: false,
    opcional: false,
  });

  const { data: feriados = [] } = useQuery({
    queryKey: ["piso-feriados"],
    queryFn: async () =>
      (await supabase.from("piso_feriados").select("*").order("data")).data ?? [],
  });

  const { data: matriz = [] } = useQuery({
    queryKey: ["piso-matriz"],
    queryFn: async () =>
      (
        await supabase
          .from("piso_assinatura_matriz")
          .select("*")
          .order("tipo_documento")
          .order("ordem")
      ).data ?? [],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["piso-feriados"] });
    qc.invalidateQueries({ queryKey: ["piso-matriz"] });
  };

  const salvarFeriado = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("piso_feriados")
        .insert(feriado as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setFeriado({ data: "", descricao: "" });
      invalidate();
      toast.success("Data adicionada ao calendário do Piso");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const apagarFeriado = useMutation({
    mutationFn: async (data: string) => {
      const { error } = await supabase
        .from("piso_feriados")
        .delete()
        .eq("data", data);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const salvarSlot = useMutation({
    mutationFn: async () => {
      const label = slot.label.trim();
      const slotKey = slugBloco(label);
      if (!label || !slotKey) throw new Error("Informe o nome da assinatura exigida.");

      const cargos = slot.cargos
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (!slot.manual && cargos.length === 0)
        throw new Error("Informe ao menos um cargo aceito ou marque como assinatura manual.");

      const ordemDocumento =
        (matriz as any[])
          .filter((m) => m.tipo_documento === slot.tipo_documento)
          .reduce((maior, m) => Math.max(maior, Number(m.ordem ?? 0)), 0) + 1;

      const { error } = await supabase.from("piso_assinatura_matriz").insert({
        tipo_documento: slot.tipo_documento,
        slot_key: slotKey,
        label,
        cargos,
        manual: slot.manual,
        opcional: slot.opcional,
        ordem: ordemDocumento,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setSlot({
        tipo_documento: "minuta",
        label: "",
        cargos: "",
        manual: false,
        opcional: false,
      });
      invalidate();
      toast.success("Regra de assinatura adicionada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const apagarSlot = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Remover esta regra de assinatura do fluxo do Piso?")) return;
      const { error } = await supabase
        .from("piso_assinatura_matriz")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const matrizPorDocumento = (matriz as any[]).reduce(
    (acc: Record<string, any[]>, item: any) => {
      (acc[item.tipo_documento] = acc[item.tipo_documento] ?? []).push(item);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-primary">O que esta configuração controla?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta área não guarda dados de uma competência específica. Ela define
              <b> regras gerais do módulo Piso da Enfermagem</b>: quais datas não contam
              como dia útil e quais assinaturas cada documento da esteira exige. Alterações
              aqui passam a valer para todas as competências do Piso.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[.9fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Calendário de dias úteis
            </CardTitle>
            <CardDescription>
              O sistema já desconsidera sábados, domingos e feriados nacionais fixos.
              Cadastre aqui feriados municipais, estaduais ou datas adicionais que devam
              ser ignoradas no cálculo do 5º, 10º e 15º dia útil.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <Label className="text-xs">Nova data sem expediente</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                <Input
                  type="date"
                  value={feriado.data}
                  onChange={(e) =>
                    setFeriado({ ...feriado, data: e.target.value })
                  }
                />
                <Input
                  placeholder="Ex.: Aniversário de Joinville"
                  value={feriado.descricao}
                  onChange={(e) =>
                    setFeriado({ ...feriado, descricao: e.target.value })
                  }
                />
                <Button
                  onClick={() => salvarFeriado.mutate()}
                  disabled={
                    !feriado.data ||
                    !feriado.descricao ||
                    salvarFeriado.isPending
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Datas adicionais cadastradas
              </div>
              {(feriados as any[]).length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhuma data adicional cadastrada. Isso não significa que fins de
                  semana e feriados nacionais fixos sejam contados como dias úteis.
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {(feriados as any[]).map((f) => (
                    <div
                      key={f.data}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div>
                        <div className="font-medium">{f.descricao}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(`${f.data}T12:00`).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover data"
                        onClick={() => apagarFeriado.mutate(f.data)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4 text-primary" />
              Regras de assinatura da esteira
            </CardTitle>
            <CardDescription>
              Cada item abaixo representa uma assinatura que o sistema verifica antes de
              considerar um documento completo. O nome técnico interno é gerado
              automaticamente; você trabalha apenas com documento, rótulo e cargos aceitos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 font-medium">Adicionar nova exigência de assinatura</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Documento da esteira</Label>
                  <Select
                    value={slot.tipo_documento}
                    onValueChange={(tipo_documento) =>
                      setSlot({ ...slot, tipo_documento })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PISO_DOCUMENTOS.map(([codigo, label]) => (
                        <SelectItem key={codigo} value={codigo}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Assinatura exigida</Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex.: Diretor de Serviços Complementares"
                    value={slot.label}
                    onChange={(e) => setSlot({ ...slot, label: e.target.value })}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs">
                    Cargos aceitos
                    <span className="ml-1 font-normal text-muted-foreground">
                      (separados por vírgula)
                    </span>
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex.: Gerente, Coordenador ACP"
                    value={slot.cargos}
                    disabled={slot.manual}
                    onChange={(e) => setSlot({ ...slot, cargos: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-5 rounded-md border bg-background px-3 py-2.5 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch
                    checked={slot.manual}
                    onCheckedChange={(manual) =>
                      setSlot({
                        ...slot,
                        manual,
                        cargos: manual ? "" : slot.cargos,
                      })
                    }
                  />
                  <span>
                    <b>Nome informado manualmente</b>
                    <span className="block text-xs text-muted-foreground">
                      Para membros de comissão ou outros signatários sem cargo fixo no pool.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-2">
                  <Switch
                    checked={slot.opcional}
                    onCheckedChange={(opcional) =>
                      setSlot({ ...slot, opcional })
                    }
                  />
                  <span>
                    <b>Assinatura opcional</b>
                    <span className="block text-xs text-muted-foreground">
                      A ausência não bloqueia a conclusão do documento.
                    </span>
                  </span>
                </label>
              </div>

              <Button
                className="mt-3"
                size="sm"
                onClick={() => salvarSlot.mutate()}
                disabled={!slot.label.trim() || salvarSlot.isPending}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar regra
              </Button>
            </div>

            <div className="space-y-4">
              {Object.entries(matrizPorDocumento)
                .sort(([a], [b]) =>
                  (PISO_DOCUMENTO_LABEL[a] ?? a).localeCompare(
                    PISO_DOCUMENTO_LABEL[b] ?? b,
                    "pt-BR",
                  ),
                )
                .map(([tipo, regras]) => (
                  <div key={tipo} className="rounded-lg border">
                    <div className="border-b bg-muted/25 px-3 py-2.5">
                      <div className="font-semibold">
                        {PISO_DOCUMENTO_LABEL[tipo] ?? tipo}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(regras as any[]).length} assinatura(s) configurada(s)
                      </div>
                    </div>

                    <div className="divide-y">
                      {(regras as any[])
                        .sort(
                          (a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0),
                        )
                        .map((regra) => (
                          <div
                            key={regra.id}
                            className="flex items-start justify-between gap-3 px-3 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{regra.label}</span>
                                {regra.manual && (
                                  <Badge variant="secondary">Nome manual</Badge>
                                )}
                                {regra.opcional && (
                                  <Badge variant="outline">Opcional</Badge>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {regra.manual
                                  ? "O usuário informa o nome do signatário."
                                  : regra.cargos?.length
                                    ? `Cargos aceitos: ${regra.cargos.join(", ")}`
                                    : "Nenhum cargo definido."}
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              title="Remover regra"
                              onClick={() => apagarSlot.mutate(regra.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}

              {(matriz as any[]).length === 0 && (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  Nenhuma regra de assinatura está configurada para o Piso.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const CARGOS = [
  "Fiscal",
  "Coordenador de Orçamentos",
  "Coordenador ACP",
  "Gerente",
  "Diretor de Serviços Complementares",
  "Diretoria Financeira",
  "Secretária de Saúde",
];

function AssinaturasMatriz() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", ordem: 0 });
  const { data = [] } = useQuery({
    queryKey: ["assinaturas_config"],
    queryFn: async () => (await supabase.from("assinaturas_config").select("*").order("etapa").order("ordem")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assinaturas_config").insert(form as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas_config"] }); void registrarAcesso("signatario_gerenciado", { detalhe: `Cadastrado ${form.nome_servidor} · ${form.cargo}` }); setForm({ etapa: "solicitacao_empenho", nome_servidor: "", cargo: "", ordem: 0 }); toast.success("Assinatura cadastrada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (a: any) => { await supabase.from("assinaturas_config").update({ ativo: !a.ativo }).eq("id", a.id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assinaturas_config"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("assinaturas_config").delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas_config"] }); void registrarAcesso("signatario_gerenciado", { detalhe: "Signatário removido" }); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signatários (pool de assinaturas)</CardTitle>
        <CardDescription>
          Cadastre cada servidor uma vez (nome + cargo). Eles ficam disponíveis para assinar
          em qualquer etapa, conforme o cargo exigido em cada bloco de assinatura.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 bg-muted/30 rounded">
          <div className="md:col-span-3"><Label className="text-xs flex items-center gap-1">Servidor <HelpTip text="Nome completo do servidor signatário." /></Label><Input value={form.nome_servidor} onChange={(e) => setForm({ ...form, nome_servidor: e.target.value })} /></div>
          <div className="md:col-span-2"><Label className="text-xs flex items-center gap-1">Cargo <HelpTip text="Função do signatário. Os blocos de assinatura aceitam cargos compatíveis (ex.: o slot 'Gerente/Coordenador ACP' aceita Gerente ou Coordenador ACP)." /></Label>
            <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
              <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={!form.nome_servidor || !form.cargo}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        {data.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum signatário cadastrado.</p> : (
          <div className="space-y-4">
            {/* Agrupamento estático por cargo cadastrado. */}
            {(() => {
              const grupos = (data as any[]).reduce((acc: Record<string, any[]>, a: any) => {
                const k = a.cargo || "Sem cargo";
                (acc[k] = acc[k] ?? []).push(a);
                return acc;
              }, {});
              const ordem = [...CARGOS, "Sem cargo"];
              return Object.keys(grupos)
                .sort((x, y) => ordem.indexOf(x) - ordem.indexOf(y))
                .map((cargo) => (
                  <div key={cargo}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-2">
                      {cargo} <Badge variant="secondary" className="font-normal">{grupos[cargo].length}</Badge>
                    </div>
                    <ul className="space-y-1">
                      {grupos[cargo].map((a: any) => (
                        <li key={a.id} className="flex items-center gap-3 p-2 border rounded">
                          <Switch checked={a.ativo} onCheckedChange={() => toggle.mutate(a)} />
                          <div className="flex-1 text-sm"><div className="font-medium">{a.nome_servidor}</div></div>
                          {!a.ativo && <Badge variant="secondary">inativo</Badge>}
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ));
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Signatários de texto livre (Membros da SEFAZ / Comissão) coletados do histórico
 * de assinaturas. O admin pode corrigir a grafia ou ocultar da lista de sugestões,
 * sem alterar o histórico imutável de assinaturas_etapa.
 */
function SignatariosManuais() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ original: string; valor: string } | null>(null);

  // Nomes distintos preenchidos manualmente no histórico (cargo "SEFAZ" = texto livre).
  const { data: historico = [] } = useQuery({
    queryKey: ["assinaturas-manuais-historico"],
    queryFn: async () => {
      const { data } = await supabase.from("assinaturas_etapa").select("servidor_nome").eq("cargo", "SEFAZ");
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.servidor_nome) set.add(String(r.servidor_nome).trim()); });
      return Array.from(set);
    },
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ["assinaturas-manuais-override"],
    queryFn: async () => (await supabase.from("assinaturas_manual_override").select("*")).data ?? [],
  });

  const ovMap = new Map((overrides as any[]).map((o) => [o.nome_original, o]));
  // Lista de sugestões efetivas: aplica renomeações e remove ocultos; distinct final.
  const sugestoes = Array.from(
    new Map(
      (historico as string[])
        .map((nome) => {
          const ov = ovMap.get(nome);
          if (ov?.oculto) return null;
          return [ov?.nome_novo?.trim() || nome, nome] as [string, string];
        })
        .filter(Boolean) as [string, string][],
    ).entries(),
  ).map(([exibicao, original]) => ({ exibicao, original }));

  const salvarEdicao = useMutation({
    mutationFn: async ({ original, valor }: { original: string; valor: string }) => {
      const novo = valor.trim();
      if (!novo) throw new Error("Informe o nome corrigido.");
      const { error } = await supabase.from("assinaturas_manual_override")
        .upsert({ nome_original: original, nome_novo: novo, oculto: false, updated_at: new Date().toISOString() } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas-manuais-override"] }); setEdit(null); toast.success("Grafia corrigida na lista de sugestões"); void registrarAcesso("signatario_gerenciado", { detalhe: "Grafia de signatário manual corrigida" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const ocultar = useMutation({
    mutationFn: async (original: string) => {
      const { error } = await supabase.from("assinaturas_manual_override")
        .upsert({ nome_original: original, oculto: true, updated_at: new Date().toISOString() } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assinaturas-manuais-override"] }); toast.success("Nome removido das sugestões (o histórico foi preservado)"); void registrarAcesso("signatario_gerenciado", { detalhe: "Signatário manual ocultado das sugestões" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signatários Registrados Manualmente</CardTitle>
        <CardDescription>
          Nomes preenchidos em campos de texto livre (Membros da SEFAZ e da Comissão de Gestão e Controle
          de Despesa), coletados do histórico com remoção de duplicatas. Corrigir a grafia ou excluir aqui
          afeta apenas as <b>sugestões automáticas</b> — o histórico de assinaturas é preservado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sugestoes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum signatário manual registrado ainda.</p>
        ) : (
          <ul className="space-y-1">
            {sugestoes.sort((a, b) => a.exibicao.localeCompare(b.exibicao, "pt-BR")).map(({ exibicao, original }) => (
              <li key={original} className="flex items-center gap-2 p-2 border rounded">
                {edit?.original === original ? (
                  <>
                    <Input className="h-8 flex-1" value={edit.valor} autoFocus onChange={(e) => setEdit({ original, valor: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") salvarEdicao.mutate(edit); if (e.key === "Escape") setEdit(null); }} />
                    <Button size="sm" className="h-8" disabled={salvarEdicao.isPending} onClick={() => salvarEdicao.mutate(edit)}>Salvar</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEdit(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{exibicao}</span>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setEdit({ original, valor: exibicao })}>Editar</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir das sugestões" onClick={() => ocultar.mutate(original)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Chaves de sistema (sistema_config) — por ora, o modo retroativo. */
function Avancado() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["cfg-retroativo"],
    queryFn: async () => (await supabase.from("sistema_config").select("valor").eq("chave", "modo_retroativo").maybeSingle()).data,
  });
  const ativo = cfg?.valor === "1";

  const alternar = useMutation({
    mutationFn: async (ligar: boolean) => {
      const { error } = await supabase.from("sistema_config").update({ valor: ligar ? "1" : "0" }).eq("chave", "modo_retroativo");
      if (error) throw error;
      // Trilha de auditoria: ligar/desligar o modo retroativo fica registrado.
      await registrarAcesso("config", { detalhe: `Modo retroativo ${ligar ? "ATIVADO" : "desativado"}` });
    },
    onSuccess: (_d, ligar) => { qc.invalidateQueries({ queryKey: ["cfg-retroativo"] }); toast.success(ligar ? "Modo retroativo ativado" : "Modo retroativo desativado"); },
    onError: (e: any) => toast.error(`${e.message} — rode a migração 20260705120000 no SQL editor.`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-warning-foreground" />Modo retroativo (migração de dados históricos)</CardTitle>
        <CardDescription>
          Libera o preenchimento dos lançamentos <b>sem as travas de sequência de etapas</b>: dá para registrar processos
          antigos mesmo sem todas as assinaturas ou documentos, e concluí-los com etapas incompletas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${ativo ? "border-warning/50 bg-warning/10" : ""}`}>
          <div className="text-sm">
            <div className="font-semibold">{ativo ? "ATIVADO — travas de etapas desligadas para todos" : "Desativado — fluxo normal com travas"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Vale para todos os usuários enquanto estiver ligado. Cada ativação/desativação fica registrada nos Logs de Acesso.</div>
          </div>
          <Switch checked={ativo} onCheckedChange={(v) => alternar.mutate(v)} disabled={alternar.isPending} />
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>As etapas continuam mostrando o que está faltando (badges e % de progresso) — apenas as travas somem.</li>
          <li>O aviso de "reverter etapas seguintes" fica suspenso enquanto o modo estiver ativo.</li>
          <li><b>Desligue ao terminar a migração</b> para restaurar a disciplina do fluxo.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function NotifLog() {
  const { data = [] } = useQuery({
    queryKey: ["notificacoes_log_full"],
    queryFn: async () => (await supabase.from("notificacoes_log").select("*").order("data_envio", { ascending: false }).limit(50)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Log de notificações simuladas</CardTitle>
        <CardDescription>Avisos disparados automaticamente quando processos mudam de etapa ou setor responsável.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p> : (
          <ul className="space-y-2">
            {data.map((n: any) => (
              <li key={n.id} className="border rounded p-3">
                <div className="flex justify-between text-xs text-muted-foreground"><span>{n.tipo}</span><span>{dateTime(n.data_envio)}</span></div>
                <div className="font-medium text-sm">{n.assunto}</div>
                <div className="text-xs text-muted-foreground">Para: {n.destinatario}</div>
                {n.mensagem && <div className="text-sm mt-1">{n.mensagem}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
