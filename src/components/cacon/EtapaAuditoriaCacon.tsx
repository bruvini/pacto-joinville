import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  PencilLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, dateTime } from "@/lib/format";
import { etapa2Completa, extracaoCaconConfirmada } from "@/lib/cacon/etapas";
import type { DadosCaconEditaveis } from "@/lib/cacon/dados";

type CampoManual = keyof DadosCaconEditaveis;

const campos: Array<{
  key: CampoManual;
  label: string;
  obrigatorio?: boolean;
  moeda?: boolean;
}> = [
  { key: "total_unidades", label: "Unidades fornecidas", obrigatorio: true },
  { key: "valor_medio_unitario", label: "Valor médio unitário", obrigatorio: true, moeda: true },
  { key: "valor_medio_dia", label: "Valor médio por dia", obrigatorio: true, moeda: true },
  { key: "valor_fornecido", label: "Valor fornecido", obrigatorio: true, moeda: true },
  { key: "pacientes_oral", label: "Pacientes · via oral" },
  { key: "dias_oral", label: "Dias · via oral" },
  { key: "pacientes_enteral", label: "Pacientes · via enteral" },
  { key: "dias_enteral", label: "Dias · via enteral" },
];

const valorInicial = (c: any, key: CampoManual) =>
  c?.[key] == null ? "" : String(c[key]);

const numero = (valor: string): number | null => {
  const bruto = valor.trim();
  if (!bruto) return null;
  const normalizado = bruto.includes(",")
    ? bruto.split(".").join("").replace(",", ".")
    : bruto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
};

function Metrica({
  label,
  valor,
  destaque = false,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        destaque ? "border-primary/30 bg-primary/5" : "bg-card"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-primary">{valor}</div>
    </div>
  );
}

export function EtapaAuditoriaCacon({
  c,
  arquivo,
  canEdit,
  busy,
  importarPdf,
  reprocessar,
  confirmarExtracao,
  salvarManual,
}: {
  c: any;
  arquivo: any;
  canEdit: boolean;
  busy: string | null;
  importarPdf: (file: File) => void;
  reprocessar: () => void;
  confirmarExtracao: () => Promise<void>;
  salvarManual: (dados: DadosCaconEditaveis) => Promise<void>;
}) {
  const auditoria = c.auditoria ?? {};
  const criticas = Number(auditoria.criticas ?? 0);
  const alertas = Number(auditoria.alertas ?? 0);
  const confirmada = extracaoCaconConfirmada(c);
  const falhaExtracao =
    c.extracao?.status === "requer_preenchimento_manual" ||
    c.extracao?.modo === "falha_extracao";
  const [manualAberto, setManualAberto] = useState(Boolean(falhaExtracao));
  const [form, setForm] = useState<Record<CampoManual, string>>(() =>
    Object.fromEntries(campos.map((campo) => [campo.key, valorInicial(c, campo.key)])) as Record<
      CampoManual,
      string
    >,
  );

  useEffect(() => {
    setForm(
      Object.fromEntries(campos.map((campo) => [campo.key, valorInicial(c, campo.key)])) as Record<
        CampoManual,
        string
      >,
    );
    if (falhaExtracao) setManualAberto(true);
  }, [
    c.total_unidades,
    c.valor_medio_unitario,
    c.valor_medio_dia,
    c.valor_fornecido,
    c.pacientes_oral,
    c.dias_oral,
    c.pacientes_enteral,
    c.dias_enteral,
    falhaExtracao,
  ]);

  const dadosManuais = useMemo(
    () =>
      Object.fromEntries(
        campos.map((campo) => [campo.key, numero(form[campo.key])]),
      ) as DadosCaconEditaveis,
    [form],
  );

  const obrigatoriosOk = campos
    .filter((campo) => campo.obrigatorio)
    .every((campo) => Number(dadosManuais[campo.key] ?? 0) > 0);

  const ok = etapa2Completa(c);
  const aguardandoConfirmacao = Boolean(c.processado_em) && !confirmada;

  return (
    <>
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">PDF original, extração e conferência humana</h3>
          <Badge
            className={ok ? "bg-success text-success-foreground" : ""}
            variant={ok ? "default" : "outline"}
          >
            {ok
              ? "Auditado e confirmado"
              : falhaExtracao
                ? "Preenchimento manual necessário"
                : aguardandoConfirmacao
                  ? "Aguardando conferência"
                  : "Pendente"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          O sistema tenta extrair os indicadores do PDF, mas a etapa só é concluída após
          conferência humana. Se a leitura automática falhar, os mesmos dados podem ser informados
          manualmente, mantendo o PDF original como evidência.
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <FileUp className="mr-2 h-4 w-4" />
              {busy === "upload"
                ? "Processando…"
                : arquivo
                  ? "Enviar novo PDF"
                  : "Anexar relatório CACON"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={Boolean(busy)}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importarPdf(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {arquivo && canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
              disabled={Boolean(busy)}
              onClick={reprocessar}
            >
              <RefreshCw
                className={`mr-1.5 h-4 w-4 ${
                  busy === "reprocessar" ? "animate-spin" : ""
                }`}
              />
              Reprocessar extração
            </Button>
          )}
          {canEdit && arquivo && (
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => setManualAberto((atual) => !atual)}
            >
              <PencilLine className="mr-1.5 h-4 w-4" />
              {manualAberto ? "Ocultar preenchimento manual" : "Preencher/corrigir manualmente"}
            </Button>
          )}
        </div>
        {arquivo && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {arquivo.nome_original} · {(Number(arquivo.tamanho ?? 0) / 1024).toFixed(0)} KB ·
            SHA-256 {arquivo.sha256}
          </p>
        )}
      </div>

      {falhaExtracao && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">A extração automática não conseguiu fechar os dados.</p>
              <p className="mt-1">
                {c.extracao?.erro ||
                  "Preencha os indicadores manualmente abaixo e confirme os valores conferidos no PDF."}
              </p>
            </div>
          </div>
        </div>
      )}

      {c.processado_em && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica
              label="Unidades fornecidas"
              valor={Number(c.total_unidades).toLocaleString("pt-BR")}
            />
            <Metrica label="Valor médio unitário" valor={brl(c.valor_medio_unitario)} />
            <Metrica label="Valor médio por dia" valor={brl(c.valor_medio_dia)} />
            <Metrica label="Valor fornecido" valor={brl(c.valor_fornecido)} destaque />
            <Metrica
              label="Pacientes · via oral"
              valor={
                c.pacientes_oral == null ? "—" : Number(c.pacientes_oral).toLocaleString("pt-BR")
              }
            />
            <Metrica
              label="Dias · via oral"
              valor={c.dias_oral == null ? "—" : Number(c.dias_oral).toLocaleString("pt-BR")}
            />
            <Metrica
              label="Pacientes · via enteral"
              valor={
                c.pacientes_enteral == null
                  ? "—"
                  : Number(c.pacientes_enteral).toLocaleString("pt-BR")
              }
            />
            <Metrica
              label="Dias · via enteral"
              valor={
                c.dias_enteral == null ? "—" : Number(c.dias_enteral).toLocaleString("pt-BR")
              }
            />
          </div>

          <div
            className={`rounded-lg border p-4 ${
              criticas
                ? "border-destructive/40 bg-destructive/5"
                : confirmada
                  ? "border-success/40 bg-success/5"
                  : "border-primary/30 bg-primary/5"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <b>Auditoria dos dados</b>
              <Badge variant={criticas ? "destructive" : "secondary"}>
                {criticas} crítica(s)
              </Badge>
              <Badge variant="outline">{alertas} alerta(s)</Badge>
              <Badge variant={confirmada ? "secondary" : "outline"}>
                {confirmada ? "Conferência humana registrada" : "Conferência humana pendente"}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                Processado em {dateTime(c.processado_em)}
              </span>
            </div>

            {(auditoria.ocorrencias ?? []).length > 0 && (
              <div className="mt-3 space-y-2">
                {(auditoria.ocorrencias ?? []).map((o: any, i: number) => (
                  <div
                    key={`${o.regra}-${i}`}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <b
                      className={
                        o.severidade === "critica"
                          ? "text-destructive"
                          : o.severidade === "alerta"
                            ? "text-amber-700"
                            : "text-muted-foreground"
                      }
                    >
                      {o.severidade === "critica"
                        ? "CRÍTICA"
                        : o.severidade === "alerta"
                          ? "ALERTA"
                          : "INFO"}
                    </b>
                    <span className="ml-2">{o.descricao}</span>
                  </div>
                ))}
              </div>
            )}

            {canEdit && !confirmada && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                <Button
                  disabled={Boolean(busy) || criticas > 0}
                  onClick={() => void confirmarExtracao()}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirmar dados extraídos
                </Button>
                <Button variant="outline" onClick={() => setManualAberto(true)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Corrigir manualmente
                </Button>
                {criticas > 0 && (
                  <span className="text-xs text-destructive">
                    Há crítica bloqueante; corrija os dados antes de confirmar.
                  </span>
                )}
              </div>
            )}

            {confirmada && c.extracao?.confirmada_por_nome && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Conferido por <b>{c.extracao.confirmada_por_nome}</b> em{" "}
                {dateTime(c.extracao.confirmada_em)}.
              </p>
            )}
          </div>
        </>
      )}

      {manualAberto && canEdit && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.025] p-4">
          <div className="mb-3">
            <h4 className="font-semibold">Preenchimento / correção manual</h4>
            <p className="text-xs text-muted-foreground">
              Confira diretamente no PDF. Os quatro indicadores financeiros são obrigatórios; os
              quantitativos de pacientes e dias podem ficar vazios quando o documento não trouxer
              informação confiável.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {campos.map((campo) => (
              <div key={campo.key} className="space-y-1.5">
                <Label htmlFor={`cacon-manual-${campo.key}`}>
                  {campo.label}
                  {campo.obrigatorio ? " *" : ""}
                </Label>
                <Input
                  id={`cacon-manual-${campo.key}`}
                  inputMode="decimal"
                  value={form[campo.key]}
                  placeholder={campo.moeda ? "0,00" : "0"}
                  onChange={(e) =>
                    setForm((atual) => ({ ...atual, [campo.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              disabled={!obrigatoriosOk || Boolean(busy)}
              onClick={() => void salvarManual(dadosManuais)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar e confirmar dados manuais
            </Button>
            {!obrigatoriosOk && (
              <span className="text-xs text-muted-foreground">
                Preencha os quatro campos obrigatórios com valores maiores que zero.
              </span>
            )}
          </div>
        </div>
      )}

      {!arquivo && (
        <p className="text-sm text-muted-foreground">
          Anexe o PDF do Anexo/Boletim CACON para iniciar a extração.
        </p>
      )}
    </>
  );
}
