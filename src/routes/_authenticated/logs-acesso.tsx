import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTip } from "@/components/HelpTip";
import { dateTime } from "@/lib/format";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  History,
  Filter,
  FileDown,
  ShieldCheck,
  Users,
  MousePointerClick,
  Activity,
  LogIn,
} from "lucide-react";
import { LimparFiltrosButton } from "@/components/LimparFiltrosButton";

export const Route = createFileRoute("/_authenticated/logs-acesso")({
  head: () => ({ meta: [{ title: "Logs de Acesso" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    if (!(r ?? []).some((x) => x.role === "admin"))
      throw redirect({ to: "/dashboard" });
  },
  component: LogsAcessoPage,
});

const ACAO_LABEL: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  navegacao: "Navegação",
  relatorio: "Relatório",
  config: "Configuração",
  lancamento_criado: "Empenho criado",
  lancamento_editado: "Empenho alterado",
  lancamento_excluido: "Empenho excluído",
  processo_concluido: "Processo concluído",
  processo_reaberto: "Processo reaberto",
  etapas_revertidas: "Etapas revertidas",
  revisao_registrada: "Revisão registrada",
  revisao_revertida: "Revisão revertida",
  assinatura_registrada: "Assinatura registrada",
  assinatura_removida: "Assinatura removida",
  prestacao_atualizada: "Prestação atualizada",
  prestacao_decidida: "Prestação decidida",
  signatario_gerenciado: "Signatário gerenciado",
  convenio_gerenciado: "Convênio gerenciado",
  usuario_gerenciado: "Usuário gerenciado",
  cacon_relatorio_processado: "CACON auditado",
  cacon_encaminhado: "CACON encaminhado",
};

const ROTA_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/lancamentos": "Empenhos de Contratos",
  "/prestacao-contas": "Prestação de Contas",
  "/auditoria": "Auditoria de Anulações",
  "/piso": "Piso da Enfermagem",
  "/cacon": "Dieta CACON",
  "/convenios": "Convênios",
  "/prestadores": "Prestadores",
  "/usuarios": "Gestão de Usuários",
  "/logs-acesso": "Logs de Acesso",
  "/configuracoes": "Configurações",
  "/sobre": "Sobre",
};

const DOCUMENTO_LABEL: Record<string, string> = {
  solicitacao_ne: "Solicitação de Nota de Empenho",
  nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Solicitação de Subempenho / Liquidação",
  aviso_liquidacao: "Aviso de Movimento - Empenho em Liquidação",
  aviso_subempenho: "Aviso de Movimento - Subempenho",
  minuta: "Minuta da Portaria Municipal",
  memorando: "Memorando para publicação",
  portaria_municipal: "Portaria Municipal",
};

const ACAO_OPERACIONAL = new Set(
  Object.keys(ACAO_LABEL).filter(
    (acao) => !["login", "logout", "navegacao"].includes(acao),
  ),
);

function csvSeguro(value: unknown): string {
  const raw = String(value ?? "");
  const neutralizado = /^[\s\t\r\n]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralizado.replace(/"/g, '""')}"`;
}

function dispositivoAmigavel(userAgent?: string | null) {
  const ua = userAgent ?? "";
  if (!ua) return "Não identificado";

  const navegador =
    ua.match(/Edg\/([\d.]+)/)?.[1]
      ? `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1]?.split(".")[0]}`
      : ua.match(/Chrome\/([\d.]+)/)?.[1]
        ? `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]?.split(".")[0]}`
        : ua.match(/Firefox\/([\d.]+)/)?.[1]
          ? `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]?.split(".")[0]}`
          : ua.match(/Version\/([\d.]+).*Safari/)?.[1]
            ? `Safari ${ua.match(/Version\/([\d.]+)/)?.[1]?.split(".")[0]}`
            : "Navegador";

  const sistema = /Windows NT/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS/iPadOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Sistema não identificado";

  return `${navegador} · ${sistema}`;
}

function detalheAmigavel(detalhe?: string | null) {
  if (!detalhe) return "";
  let texto = detalhe;

  for (const [codigo, label] of Object.entries(DOCUMENTO_LABEL)) {
    texto = texto.replaceAll(`bloco ${codigo}`, label);
  }

  texto = texto
    .replace(/Papel definido:\s*admin/gi, "Papel definido: Administrador")
    .replace(/Papel definido:\s*acp/gi, "Papel definido: ACP")
    .replace(/Papel definido:\s*aco/gi, "Papel definido: UFI")
    .replace(/papel definido:\s*admin/gi, "papel definido: Administrador")
    .replace(/papel definido:\s*acp/gi, "papel definido: ACP")
    .replace(/papel definido:\s*aco/gi, "papel definido: UFI");

  return texto;
}

function LogsAcessoPage() {
  const [fUser, setFUser] = useState("all");
  const [fAcao, setFAcao] = useState("all");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  const { data: perfis = [] } = useQuery({
    queryKey: ["perfis-logs"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, nome").order("nome")).data ?? [],
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["logs-acesso", fUser, fAcao, fDe, fAte],
    queryFn: async () => {
      let q = supabase
        .from("logs_acesso")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (fUser !== "all") q = q.eq("user_id", fUser);
      if (fAcao !== "all") q = q.eq("acao", fAcao);
      if (fDe) q = q.gte("created_at", `${fDe}T00:00:00`);
      if (fAte) q = q.lte("created_at", `${fAte}T23:59:59`);
      return (await q).data ?? [];
    },
  });

  const lancamentoIds = useMemo(
    () =>
      Array.from(
        new Set(
          (logs as any[])
            .map((l) => String(l.rota ?? "").match(/^\/lancamentos\/([0-9a-f-]+)$/i)?.[1])
            .filter(Boolean),
        ),
      ) as string[],
    [logs],
  );

  const pisoIds = useMemo(
    () =>
      Array.from(
        new Set(
          (logs as any[])
            .map((l) => String(l.rota ?? "").match(/^\/piso\/([0-9a-f-]+)$/i)?.[1])
            .filter(Boolean),
        ),
      ) as string[],
    [logs],
  );

  const caconIds = useMemo(
    () =>
      Array.from(
        new Set(
          (logs as any[])
            .map((l) => String(l.rota ?? "").match(/^\/cacon\/([0-9a-f-]+)$/i)?.[1])
            .filter(Boolean),
        ),
      ) as string[],
    [logs],
  );

  const { data: lancamentosContexto = [] } = useQuery({
    queryKey: ["logs-lancamentos-contexto", lancamentoIds],
    enabled: lancamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("lancamentos_pagamento")
        .select("id,competencia,descricao,prestadores(nome_instituicao)")
        .in("id", lancamentoIds);
      return data ?? [];
    },
  });

  const { data: pisoContexto = [] } = useQuery({
    queryKey: ["logs-piso-contexto", pisoIds],
    enabled: pisoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("piso_competencias")
        .select("id,competencia")
        .in("id", pisoIds);
      return data ?? [];
    },
  });

  const { data: caconContexto = [] } = useQuery({
    queryKey: ["logs-cacon-contexto", caconIds],
    enabled: caconIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("cacon_competencias")
        .select("id,competencia,prestadores(nome_instituicao)")
        .in("id", caconIds);
      return data ?? [];
    },
  });

  const lancById = useMemo(
    () => new Map((lancamentosContexto as any[]).map((l) => [l.id, l])),
    [lancamentosContexto],
  );
  const pisoById = useMemo(
    () => new Map((pisoContexto as any[]).map((c) => [c.id, c])),
    [pisoContexto],
  );
  const caconById = useMemo(
    () => new Map((caconContexto as any[]).map((c) => [c.id, c])),
    [caconContexto],
  );

  const contextoLog = (log: any) => {
    const rota = String(log.rota ?? "");
    if (ROTA_LABEL[rota]) return ROTA_LABEL[rota];

    const lancId = rota.match(/^\/lancamentos\/([0-9a-f-]+)$/i)?.[1];
    if (lancId) {
      const lanc = lancById.get(lancId) as any;
      const prestador = Array.isArray(lanc?.prestadores)
        ? lanc.prestadores[0]?.nome_instituicao
        : lanc?.prestadores?.nome_instituicao;
      const partes = [
        "Empenho de Contrato",
        prestador,
        lanc?.competencia ? `competência ${lanc.competencia}` : null,
      ].filter(Boolean);
      return partes.join(" · ");
    }

    const pisoId = rota.match(/^\/piso\/([0-9a-f-]+)$/i)?.[1];
    if (pisoId) {
      const comp = pisoById.get(pisoId) as any;
      return comp?.competencia
        ? `Piso da Enfermagem · competência ${comp.competencia}`
        : "Competência do Piso da Enfermagem";
    }

    const caconId = rota.match(/^\/cacon\/([0-9a-f-]+)$/i)?.[1];
    if (caconId) {
      const comp = caconById.get(caconId) as any;
      const prestador = Array.isArray(comp?.prestadores)
        ? comp.prestadores[0]?.nome_instituicao
        : comp?.prestadores?.nome_instituicao;
      return comp?.competencia
        ? `Dieta CACON · ${prestador ?? "prestador"} · competência ${comp.competencia}`
        : "Competência da Dieta CACON";
    }

    if (log.acao === "usuario_gerenciado") return "Gestão de Usuários";
    if (log.acao === "signatario_gerenciado" || log.acao === "config")
      return "Configurações";
    if (log.acao === "convenio_gerenciado") return "Convênios";

    return rota || "Sistema";
  };

  const descricaoLog = (log: any) => {
    const contexto = contextoLog(log);
    const detalhe = detalheAmigavel(log.detalhe);

    switch (log.acao) {
      case "navegacao":
        return `Acessou ${contexto}.`;
      case "login":
        return "Entrou no sistema com uma sessão autenticada.";
      case "logout":
        return "Encerrou a sessão no sistema.";
      case "lancamento_criado":
        return detalhe || "Criou um novo processo de empenho de contrato.";
      case "lancamento_editado":
        return detalhe || "Alterou dados de um processo de empenho de contrato.";
      case "lancamento_excluido":
        return detalhe || "Excluiu um processo de empenho de contrato.";
      case "assinatura_registrada":
        return detalhe ? `Registrou assinatura: ${detalhe}.` : "Registrou uma assinatura.";
      case "assinatura_removida":
        return detalhe ? `Removeu assinatura de ${detalhe}.` : "Removeu uma assinatura.";
      case "usuario_gerenciado":
        return detalhe ? `Alterou cadastro de acesso — ${detalhe}.` : "Alterou papel ou setor de um usuário.";
      case "signatario_gerenciado":
        return detalhe ? `Alterou configuração de signatário — ${detalhe}.` : "Alterou configuração de signatário.";
      case "config":
        return detalhe || "Alterou uma configuração administrativa.";
      default:
        return detalhe || `${ACAO_LABEL[log.acao] ?? log.acao} em ${contexto}.`;
    }
  };

  const usuariosDistintos = new Set((logs as any[]).map((l) => l.user_id).filter(Boolean)).size;
  const operacionais = (logs as any[]).filter((l) => ACAO_OPERACIONAL.has(l.acao)).length;
  const navegacoes = (logs as any[]).filter((l) => l.acao === "navegacao").length;
  const logins = (logs as any[]).filter((l) => l.acao === "login").length;

  const exportarCsv = () => {
    if ((logs as any[]).length === 0)
      return toast.error("Nada para exportar neste recorte.");

    const cab = [
      "Data/Hora",
      "Usuário",
      "E-mail",
      "Evento",
      "Contexto",
      "Descrição para auditoria",
      "Rota técnica",
      "Detalhe original",
      "Dispositivo",
      "User-Agent",
    ];

    const linhas = (logs as any[]).map((l) => [
      dateTime(l.created_at),
      l.usuario_nome ?? "",
      l.usuario_email ?? "",
      ACAO_LABEL[l.acao] ?? l.acao,
      contextoLog(l),
      descricaoLog(l),
      l.rota ?? "",
      l.detalhe ?? "",
      dispositivoAmigavel(l.user_agent),
      l.user_agent ?? "",
    ]);

    const csv = [cab, ...linhas]
      .map((row) => row.map(csvSeguro).join(";"))
      .join("\r\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logs-acesso-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-primary">
              Logs de Acesso
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Trilha de auditoria: quem fez, o que fez, onde e quando.
              <HelpTip text="São exibidos os 500 eventos mais recentes do recorte. A exportação mantém também a rota técnica, o detalhe original e o User-Agent para investigação." />
            </p>
          </div>
        </div>

        <Button variant="outline" className="h-9" onClick={exportarCsv}>
          <FileDown className="mr-1.5 h-4 w-4" />
          Exportar trilha CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo icon={Activity} label="Eventos no recorte" valor={logs.length} detalhe="Máximo de 500 por consulta" />
        <Resumo icon={Users} label="Usuários distintos" valor={usuariosDistintos} detalhe="Responsáveis identificados" />
        <Resumo icon={MousePointerClick} label="Ações operacionais" valor={operacionais} detalhe="Alterações além de navegação" />
        <Resumo icon={LogIn} label="Logins registrados" valor={logins} detalhe={`${navegacoes} navegação(ões) no recorte`} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_.9fr_.8fr_.8fr_auto] xl:items-end">
            <div>
              <Label className="flex items-center gap-1 text-xs">
                <Filter className="h-3 w-3" />
                Usuário
              </Label>
              <Select value={fUser} onValueChange={setFUser}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {(perfis as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Evento</Label>
              <Select value={fAcao} onValueChange={setFAcao}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  {Object.entries(ACAO_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={fDe}
                onChange={(e) => setFDe(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={fAte}
                onChange={(e) => setFAte(e.target.value)}
              />
            </div>

            <LimparFiltrosButton
              ativo={
                fUser !== "all" ||
                fAcao !== "all" ||
                fDe !== "" ||
                fAte !== ""
              }
              onClear={() => {
                setFUser("all");
                setFAcao("all");
                setFDe("");
                setFAte("");
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Data / hora</th>
                  <th className="py-3">Responsável</th>
                  <th className="py-3">Evento</th>
                  <th className="py-3">Contexto</th>
                  <th className="py-3">O que aconteceu</th>
                  <th className="py-3 pr-4">
                    Dispositivo{" "}
                    <HelpTip text="Resumo amigável do navegador e sistema operacional. O User-Agent completo permanece disponível no tooltip e no CSV." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {(logs as any[]).map((log: any) => {
                  const contexto = contextoLog(log);
                  const descricao = descricaoLog(log);
                  return (
                    <tr
                      key={log.id}
                      className="border-b align-top last:border-0 hover:bg-accent/30"
                    >
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {dateTime(log.created_at)}
                      </td>
                      <td className="py-3">
                        <div className="font-medium">{log.usuario_nome ?? "—"}</div>
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {log.usuario_email ?? ""}
                        </div>
                      </td>
                      <td className="py-3">
                        <EventoBadge acao={log.acao} />
                      </td>
                      <td className="max-w-[240px] py-3">
                        <div className="font-medium">{contexto}</div>
                        {log.rota && (
                          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={log.rota}>
                            {log.rota}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[420px] py-3 pr-4">
                        <div className="leading-relaxed">{descricao}</div>
                        {log.detalhe && detalheAmigavel(log.detalhe) !== log.detalhe && (
                          <div className="mt-1 truncate text-[10px] text-muted-foreground" title={log.detalhe}>
                            Original: {log.detalhe}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[180px] py-3 pr-4">
                        <span
                          className="text-xs text-muted-foreground"
                          title={log.user_agent ?? ""}
                        >
                          {dispositivoAmigavel(log.user_agent)}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!isLoading && (logs as any[]).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Nenhum evento encontrado neste recorte.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Para auditoria formal, use a coluna <b>O que aconteceu</b> como leitura
        gerencial e mantenha a rota, o detalhe original e o User-Agent exportados
        no CSV como evidência técnica.
      </p>
    </div>
  );
}

function EventoBadge({ acao }: { acao: string }) {
  const classe =
    acao === "login"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : acao === "logout"
        ? "border-slate-300 text-slate-700"
        : acao === "navegacao"
          ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
          : "bg-violet-100 text-violet-800 hover:bg-violet-100";

  return (
    <Badge variant={acao === "logout" ? "outline" : "secondary"} className={classe}>
      {ACAO_LABEL[acao] ?? acao}
    </Badge>
  );
}

function Resumo({
  icon: Icon,
  label,
  valor,
  detalhe,
}: {
  icon: any;
  label: string;
  valor: number;
  detalhe: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{valor}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
