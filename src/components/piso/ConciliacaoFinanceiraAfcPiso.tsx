import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { CampoBlur } from "@/components/piso/campos";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";
import {
  disponibilidadeExtratoAfc,
  situacaoConciliacaoAfc,
  type ContaAfcFms,
} from "@/lib/piso/conciliacao-afc";
import type { CtxPiso } from "@/lib/piso/regras";

type CampoConta =
  | "data_saldo" | "saldo_bancario" | "compromissos_preexistentes"
  | "documento_sei" | "documento_link" | "observacao";
type CampoRevisao =
  | "revisao_situacao" | "revisao_justificativa" | "revisao_oficio"
  | "revisao_protocolo" | "revisao_data" | "revisao_decisao"
  | "justificativa" | "autorizacao_excecao_sei"
  | "autorizacao_excecao_link" | "responsavel_excecao";

const moeda = (valor: number | null | undefined) =>
  valor == null ? "Não informado" : brl(valor);

export function ConciliacaoFinanceiraAfcPiso({
  ctx, onChange, canEdit,
}: { ctx: CtxPiso; onChange: () => void; canEdit: boolean }) {
  const { roles } = useAuth();
  const podeConferir = canEdit &&
    (hasRole(roles, "acp") || hasRole(roles, "admin")) &&
    ctx.comp.status !== "encerrada";
  const ehAdmin = hasRole(roles, "admin");
  const qc = useQueryClient();
  const [novoIdentificador, setNovoIdentificador] = useState("");
  const [busy, setBusy] = useState(false);
  const registro = ctx.conciliacaoAfc;
  const cid = String(ctx.comp.id);
  const contas = useQuery({
    queryKey: ["piso_contas_afc"],
    enabled: ctx.afcHabilitada !== false,
    queryFn: async () => {
      const { data, error } = await supabase.from("piso_afc_contas_fms")
        .select("*").order("identificacao");
      if (error) throw error;
      return data ?? [];
    },
  });

  const conta = registro?.piso_afc_contas_fms as ContaAfcFms | null | undefined;
  const outrasReservas = (ctx.reservasAfc ?? [])
    .filter((r) => r.conta_id === conta?.id && r.competencia_id !== cid)
    .reduce((sum, r) => sum + Number(r.valor_reservado ?? 0), 0);
  const saldo = disponibilidadeExtratoAfc(conta, conta ? outrasReservas : null);
  const status = situacaoConciliacaoAfc(ctx.comp, registro, conta, conta ? outrasReservas : null);
  const statusConfirmado = registro?.situacao === "confirmada";
  const statusExcecao = registro?.situacao === "excecao_autorizada";

  const salvar = async (fn: () => Promise<void>) => {
    if (!podeConferir || busy) return;
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["piso_contas_afc"] }),
        qc.invalidateQueries({ queryKey: ["piso_extra", cid] }),
      ]);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const criarRegistro = (contaId?: string | null) => salvar(async () => {
    if (registro) {
      if (registro.situacao === "confirmada") throw new Error(
        "Reabra a conciliação, com justificativa, antes de mudar a conta.");
      const { error } = await supabase.from("piso_afc_conciliacoes")
        .update({ conta_id: contaId ?? null }).eq("id", registro.id!);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("piso_afc_conciliacoes").insert({
        competencia_id: cid, conta_id: contaId ?? null,
      });
      if (error) throw error;
    }
    toast.success("Fonte financeira vinculada à competência.");
  });
  const criarConta = () => salvar(async () => {
    const identificacao = novoIdentificador.trim();
    if (identificacao.length < 3) throw new Error("Identifique a conta do Fundo Municipal de Saúde.");
    const { data, error } = await supabase.from("piso_afc_contas_fms")
      .insert({ identificacao }).select("id").single();
    if (error) throw error;
    if (registro) {
      const { error: vinculoErro } = await supabase.from("piso_afc_conciliacoes")
        .update({ conta_id: data.id }).eq("id", registro.id!);
      if (vinculoErro) throw vinculoErro;
    } else {
      const { error: vinculoErro } = await supabase.from("piso_afc_conciliacoes")
        .insert({ competencia_id: cid, conta_id: data.id });
      if (vinculoErro) throw vinculoErro;
    }
    setNovoIdentificador("");
    toast.success("Fonte bancária cadastrada no FMS.");
  });
  const salvarConta = (campo: CampoConta, valor: unknown) => salvar(async () => {
    if (!conta) throw new Error("Selecione uma conta FMS.");
    if (statusConfirmado) throw new Error("Reabra a conciliação antes de alterar um saldo comprovado.");
    const { error } = await supabase.from("piso_afc_contas_fms")
      .update({ [campo]: valor === "" ? null : valor } as
        Database["public"]["Tables"]["piso_afc_contas_fms"]["Update"]).eq("id", conta.id);
    if (error) throw error;
  });
  const salvarRevisao = (campo: CampoRevisao, valor: unknown) => salvar(async () => {
    if (!registro?.id) throw new Error("Inicie a conciliação antes de registrar o documento.");
    const { error } = await supabase.from("piso_afc_conciliacoes")
      .update({ [campo]: valor === "" ? null : valor } as
        Database["public"]["Tables"]["piso_afc_conciliacoes"]["Update"]).eq("id", registro.id);
    if (error) throw error;
  });
  const mudarSituacao = (situacao: "confirmada"|"reconferir"|"excecao_autorizada") => salvar(async () => {
    if (!registro?.id) throw new Error("Vincule uma conta FMS antes de confirmar.");
    if (situacao === "excecao_autorizada" && !ehAdmin)
      throw new Error("Decisão excepcional restrita a administradores.");
    const { error } = await supabase.from("piso_afc_conciliacoes")
      .update({ situacao }).eq("id", registro.id);
    if (error) throw error;
    toast.success(situacao === "confirmada"
      ? "Disponibilidade conferida e reservada para esta competência."
      : situacao === "excecao_autorizada"
        ? "Decisão excepcional formal registrada, sem presumir saldo disponível."
        : "Conciliação reaberta com rastreabilidade.");
  });

  if (ctx.afcHabilitada === false) {
    return (
      <section role="note" className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 text-sm">
        <h3 className="font-semibold">Conciliação Financeira da Assistência Complementar</h3>
        <p className="mt-1 text-muted-foreground">
          Estrutura de conciliação ainda não instalada neste banco. Acompanhe
          normalmente as etapas existentes; a nova exigência de encerramento
          só será ativada após a migration AFC ser aplicada e validada.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4" /> Conciliação Financeira da Assistência Complementar
          </h3>
          <p className="text-xs text-muted-foreground">
            Controle no âmbito do FMS, não por instituição. Extrato bancário,
            compromissos anteriores e reservas de outras competências devem ser conferidos.
          </p>
        </div>
        <span className="self-start rounded-md border px-2 py-1 text-xs font-medium">{status}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Homologado pela União",ctx.comp.valor_homologado],
          ["Compensação federal (desconto)",ctx.comp.desconto_saldo],
          ["Acerto de contas federal",ctx.comp.acerto_contas],
          ["Transferência prevista",ctx.comp.valor_transferido],
          ["Crédito efetivamente registrado",ctx.comp.credito_fms_valor],
          ["Saldo anterior informado (não comprovado)",ctx.comp.saldo_afc_anterior],
          ["Reservas de outras competências",conta ? outrasReservas : null],
          ["Disponibilidade líquida do extrato",saldo],
        ].map(([nome, valor]) => (
          <div key={String(nome)} className="rounded-md border bg-muted/15 p-3">
            <p className="text-xs text-muted-foreground">{nome}</p>
            <b className="mt-1 block text-base tabular-nums">{moeda(valor as number | null)}</b>
          </div>
        ))}
      </div>
      <p className="rounded-md border border-amber-400/40 bg-amber-50/40 p-3 text-xs text-foreground">
        O desconto federal não é anulação de empenho nem prova de saldo livre.
        O saldo do extrato já contempla os créditos ocorridos até a data do documento;
        por isso o crédito federal não é somado outra vez à disponibilidade.
      </p>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Conta vinculada e memória bancária</h4>
        <div className="flex flex-wrap gap-2">
          <select className="h-9 min-w-[240px] flex-1 rounded-md border bg-background px-3 text-sm"
            aria-label="Selecionar conta vinculada ao FMS" disabled={!podeConferir || busy || statusConfirmado}
            value={registro?.conta_id ?? ""}
            onChange={(e) => void criarRegistro(e.target.value || null)}>
            <option value="">Selecione a conta FMS</option>
            {(contas.data ?? []).map(c => <option key={c.id} value={c.id}>{c.identificacao}</option>)}
          </select>
          {podeConferir && !registro && (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void criarRegistro(null)}>Iniciar conciliação</Button>
          )}
        </div>
        {podeConferir && !statusConfirmado && (
          <div className="flex flex-wrap gap-2">
            <input value={novoIdentificador} onChange={e => setNovoIdentificador(e.target.value)}
              disabled={busy} placeholder="Identificação da conta / fonte FMS"
              aria-label="Identificação da nova conta FMS"
              className="h-9 min-w-[220px] flex-1 rounded-md border bg-background px-3 text-sm"/>
            <Button size="sm" variant="outline" disabled={busy || novoIdentificador.trim().length < 3}
              onClick={() => void criarConta()}>Cadastrar conta FMS</Button>
          </div>
        )}
        {conta ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoBlur label="Data de referência do extrato" type="date"
              value={conta.data_saldo} disabled={!podeConferir || busy || statusConfirmado}
              onSave={v => salvarConta("data_saldo",v)}/>
            <CampoBlur label="Saldo bancário total do extrato" type="moeda"
              value={conta.saldo_bancario} disabled={!podeConferir || busy || statusConfirmado}
              onSave={v => salvarConta("saldo_bancario",v)}/>
            <CampoBlur label="Compromissos anteriores ainda não liquidados/pagos" type="moeda"
              value={conta.compromissos_preexistentes} disabled={!podeConferir || busy || statusConfirmado}
              onSave={v => salvarConta("compromissos_preexistentes",v)}/>
            <CampoBlur label="Número SEI da evidência bancária"
              value={conta.documento_sei} disabled={!podeConferir || busy || statusConfirmado}
              onSave={v => salvarConta("documento_sei",v)}/>
            <div className="sm:col-span-2">
              <CampoBlur label="Link SEI do extrato/documento comprobatório"
                value={conta.documento_link} disabled={!podeConferir || busy || statusConfirmado}
                onSave={v => salvarConta("documento_link",v)}/>
            </div>
          </div>
        ) : <p className="text-xs text-muted-foreground">
          Nenhuma fonte bancária selecionada. Valores não comprovados permanecem como não informados.
        </p>}
        {registro?.id && (
          <CampoBlur multiline label="Justificativa / revisão documental"
            value={registro.justificativa} disabled={!podeConferir || busy}
            onSave={v => salvarRevisao("justificativa",v)}/>
        )}
        {registro?.id && podeConferir && (
          <div className="flex flex-wrap gap-2">
            {!statusConfirmado && !statusExcecao && (
              <Button size="sm" disabled={busy || !conta}
                onClick={() => void mudarSituacao("confirmada")}>
                <CheckCircle2 className="mr-2 h-4 w-4"/> Confirmar conciliação
              </Button>
            )}
            {(statusConfirmado || statusExcecao) && (
              <Button size="sm" variant="outline" disabled={busy ||
                (registro.justificativa ?? "").trim().length < 20}
                onClick={() => void mudarSituacao("reconferir")}>
                <RefreshCw className="mr-2 h-4 w-4"/> Reabrir com justificativa
              </Button>
            )}
          </div>
        )}
        {registro?.situacao === "confirmada" &&
          <p className="text-xs text-muted-foreground">
            Reserva comprovada nesta conta: {moeda(registro.valor_reservado)}.
            Para corrigir a memória, reabra formalmente a conferência.
          </p>}
      </div>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Revisão de compensação federal (quando cabível)</h4>
        <p className="text-xs text-muted-foreground">
          O pedido de revisão registra ofício, protocolo e decisão; não altera os valores homologados.
        </p>
        <div className="rounded-md border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
          <strong>Referência normativa:</strong> a Portaria GM/MS nº 12.456/2026,
          publicada em 04/11/2026, alterou o § 8º do art. 1120-D da
          Portaria de Consolidação GM/MS nº 6/2017: a compensação de saldo
          excedente passa a considerar a última competência mensal homologada.
          A aplicação ao caso concreto depende da data e dos documentos do ato
          de desconto. Esta regra não recalcula descontos já publicados nem
          permite tratar a compensação federal como anulação de empenho.
        </div>
        {registro && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Situação do pedido</label>
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                disabled={!podeConferir || busy}
                value={(registro as any).revisao_situacao ?? "nao_solicitada"}
                onChange={e => void salvarRevisao("revisao_situacao",e.target.value)}>
                {[
                  ["nao_solicitada","Não solicitada"],["em_preparacao","Em preparação"],
                  ["protocolada","Protocolada"],["em_analise","Em análise"],
                  ["deferida","Deferida"],["indeferida","Indeferida"],["encerrada","Encerrada"],
                ].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <CampoBlur label="Ofício" value={(registro as any).revisao_oficio}
              disabled={!podeConferir || busy} onSave={v => salvarRevisao("revisao_oficio",v)}/>
            <CampoBlur label="Protocolo" value={(registro as any).revisao_protocolo}
              disabled={!podeConferir || busy} onSave={v => salvarRevisao("revisao_protocolo",v)}/>
            <CampoBlur label="Data de protocolo" type="date"
              value={(registro as any).revisao_data}
              disabled={!podeConferir || busy} onSave={v => salvarRevisao("revisao_data",v)}/>
            <CampoBlur multiline label="Justificativa da revisão"
              value={(registro as any).revisao_justificativa}
              disabled={!podeConferir || busy} onSave={v => salvarRevisao("revisao_justificativa",v)}/>
            <CampoBlur multiline label="Decisão / resposta oficial"
              value={(registro as any).revisao_decisao}
              disabled={!podeConferir || busy} onSave={v => salvarRevisao("revisao_decisao",v)}/>
          </div>
        )}
      </div>

      {ehAdmin && registro?.id && registro.situacao !== "confirmada" && (
        <div className="space-y-3 border-t pt-3">
          <h4 className="text-sm font-semibold">Decisão institucional excepcional</h4>
          <p className="text-xs text-muted-foreground">
            Apenas com autorização documental; não declara disponibilidade financeira comprovada.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoBlur label="Número SEI da autorização" value={(registro as any).autorizacao_excecao_sei}
              disabled={!podeConferir || busy} onSave={v=>salvarRevisao("autorizacao_excecao_sei",v)}/>
            <CampoBlur label="Responsável institucional" value={(registro as any).responsavel_excecao}
              disabled={!podeConferir || busy} onSave={v=>salvarRevisao("responsavel_excecao",v)}/>
            <div className="sm:col-span-2">
              <CampoBlur label="Link SEI da autorização" value={(registro as any).autorizacao_excecao_link}
                disabled={!podeConferir || busy} onSave={v=>salvarRevisao("autorizacao_excecao_link",v)}/>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={busy || !podeConferir}
            onClick={()=>void mudarSituacao("excecao_autorizada")}>
            Registrar exceção formal autorizada
          </Button>
        </div>
      )}
      {status === "Divergência documental" && (
        <p className="flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Confira o crédito versus a transferência prevista,
          com justificativa documental e os extratos do FMS.
        </p>
      )}
    </section>
  );
}
