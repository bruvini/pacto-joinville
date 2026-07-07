import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { HelpTip } from "@/components/HelpTip";
import { toast } from "sonner";
import { registrarAcesso } from "@/lib/acesso";
import { Upload, Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { norm, statusPcHistorico, type LinhaImport } from "@/lib/import-historico";
import { lerWorkbook, extrairLinhas } from "@/lib/import-historico-xlsx";
import type { WorkBook } from "xlsx";

type Resultado = { criadosLanc: number; atualizadosPc: number; erros: { linha: number; msg: string }[] };

export function ImportarHistoricoPC() {
  const [wb, setWb] = useState<WorkBook | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [aba, setAba] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaImport[]>([]);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [res, setRes] = useState<Resultado | null>(null);

  const carregarAba = (w: WorkBook, nome: string) => {
    setAba(nome);
    setLinhas(extrairLinhas(w, nome));
    setRes(null);
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const { wb: w, abas: as, abaProvavel } = lerWorkbook(buf);
      setWb(w); setAbas(as);
      carregarAba(w, abaProvavel);
    } catch (e: any) {
      toast.error(`Falha ao ler a planilha: ${e.message}`);
    }
  };

  const validas = linhas.filter((l) => l._erros.length === 0);
  const comErro = linhas.filter((l) => l._erros.length > 0);

  const importar = async () => {
    if (validas.length === 0) return;
    setRodando(true); setProgresso(0);
    const erros: { linha: number; msg: string }[] = [];
    let criadosLanc = 0, atualizadosPc = 0;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      // Pré-carrega o universo existente (índices em memória).
      const [{ data: prestadores }, { data: convenios }, { data: lancs }, { data: pcs }, { data: roles }] = await Promise.all([
        supabase.from("prestadores").select("id, nome_instituicao"),
        supabase.from("convenios").select("id, prestador_id, objeto, numero_processo_sei_mae"),
        supabase.from("lancamentos_pagamento").select("id, convenio_id, numero_empenho, competencia"),
        supabase.from("prestacoes_contas").select("lancamento_id"),
        supabase.from("user_roles").select("user_id").eq("role", "acp"),
      ]);
      const listaPrest = [...(prestadores ?? [])];
      const listaConv = [...(convenios ?? [])];
      const listaLanc = [...(lancs ?? [])];
      const pcExistentes = new Set((pcs ?? []).map((p: any) => p.lancamento_id));
      const apcIds = (roles ?? []).map((r: any) => r.user_id);
      const { data: apcProfiles } = apcIds.length
        ? await supabase.from("profiles").select("id, nome").in("id", apcIds)
        : { data: [] as any[] };

      const acharPrestador = async (nome: string): Promise<string> => {
        const k = norm(nome);
        const ex = listaPrest.find((p: any) => { const pn = norm(p.nome_instituicao); return pn === k || pn.startsWith(k) || k.startsWith(pn); });
        if (ex) return ex.id;
        const { data, error } = await supabase.from("prestadores").insert({ nome_instituicao: nome }).select("id, nome_instituicao").single();
        if (error) throw error;
        listaPrest.push(data); return data.id;
      };
      const acharConvenio = async (prestadorId: string, termo: string, objeto: string): Promise<string> => {
        const kt = norm(termo);
        const ex = listaConv.find((c: any) => c.prestador_id === prestadorId && (
          (kt && (norm(c.numero_processo_sei_mae) === kt || norm(c.objeto).includes(kt))) ||
          (!kt && true) // sem termo: usa o primeiro convênio do prestador
        ));
        if (ex) return ex.id;
        const { data, error } = await supabase.from("convenios").insert({
          prestador_id: prestadorId,
          numero_processo_sei_mae: termo || null,
          objeto: objeto || (termo ? `Convênio ${termo}` : null),
          prazo_prestacao_contas_dias: 30,
          exige_prestacao_contas: true,
        }).select("id, prestador_id, objeto, numero_processo_sei_mae").single();
        if (error) throw error;
        listaConv.push(data); return data.id;
      };
      const acharResponsavel = (nome: string): { responsavel_id: string | null; redistribuir: boolean } => {
        const n = norm(nome);
        if (!n) return { responsavel_id: null, redistribuir: false };
        if (n === "outro" || n.startsWith("outro")) return { responsavel_id: null, redistribuir: true };
        const first = n.split(" ")[0];
        const p = (apcProfiles ?? []).find((x: any) => norm(x.nome).startsWith(first));
        return { responsavel_id: p?.id ?? null, redistribuir: false };
      };

      for (let i = 0; i < validas.length; i++) {
        const l = validas[i];
        try {
          const prestadorId = await acharPrestador(l.instituicao);
          const convenioId = await acharConvenio(prestadorId, l.termo, l.termo ? `Convênio ${l.termo}` : "");

          // Lançamento: casa por convênio + empenho + competência.
          let lanc = listaLanc.find((x: any) => x.convenio_id === convenioId
            && norm(x.numero_empenho) === norm(l.empenho)
            && (x.competencia ?? "") === (l.competencia ?? ""));
          if (!lanc) {
            const { data, error } = await supabase.from("lancamentos_pagamento").insert({
              prestador_id: prestadorId,
              convenio_id: convenioId,
              descricao: l.termo ? `Convênio ${l.termo}` : null,
              competencia: l.competencia,
              parcela: l.parcela || null,
              numero_empenho: l.empenho || null,
              valor_solicitado: l.valor || 0,
              valor_atestado: l.valor || 0,
              data_pagamento: l.dataPagamento,
              concluido: true,
              created_by: uid,
            }).select("id, convenio_id, numero_empenho, competencia").single();
            if (error) throw error;
            lanc = data; listaLanc.push(data); criadosLanc++;
          }

          const { responsavel_id, redistribuir } = acharResponsavel(l.responsavel);
          const status = statusPcHistorico(l);
          const patch: any = {
            numero_processo_pc: l.numeroProcessoPc || null,
            data_recebimento: l.dataRecebimento,
            link_relatorio_analise_sei: l.linkRelatorioAnalise || null,
            data_envio_entidade: l.dataEnvioEntidade,
            data_retorno_entidade: l.dataRetornoEntidade,
            link_parecer_ses_sei: l.linkParecerSes || null,
            data_enc_cgm: l.dataEncCgm,
            data_retorno_cgm: l.dataRetornoCgm,
            link_manifestacao_cgm_sei: l.linkManifestacaoCgm || null,
            status_cgm: l.statusCgm,
            data_baixa_contabil: l.dataBaixaContabil,
            situacao_baixa: l.situacaoBaixa,
            exercicio_baixa: l.exercicioBaixa,
            observacao: l.observacao || null,
            responsavel_id,
            redistribuir,
            status,
            decidido_em: status === "aprovada" ? (l.dataBaixaContabil ? `${l.dataBaixaContabil}T12:00:00Z` : null) : null,
            decidido_por: status === "aprovada" ? (l.responsavel || null) : null,
          };

          if (pcExistentes.has(lanc.id)) {
            const { error } = await supabase.from("prestacoes_contas").update(patch).eq("lancamento_id", lanc.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("prestacoes_contas").insert({ lancamento_id: lanc.id, ...patch });
            if (error) throw error;
            pcExistentes.add(lanc.id);
          }
          atualizadosPc++;
        } catch (e: any) {
          erros.push({ linha: l.linha, msg: e.message ?? String(e) });
        }
        if (i % 5 === 0 || i === validas.length - 1) setProgresso(Math.round(((i + 1) / validas.length) * 100));
      }

      setRes({ criadosLanc, atualizadosPc, erros });
      void registrarAcesso("config", { detalhe: `Importação de histórico de PC: ${criadosLanc} lançamentos criados, ${atualizadosPc} prestações gravadas, ${erros.length} erros` });
      if (erros.length === 0) toast.success(`Importação concluída: ${atualizadosPc} prestações.`);
      else toast.warning(`Importação concluída com ${erros.length} erro(s).`);
    } catch (e: any) {
      toast.error(`Falha na importação: ${e.message} — verifique se a migração 20260707120000 foi aplicada e se você é admin.`);
    } finally {
      setRodando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-primary" />Importar histórico da planilha (Prestação de Contas)</CardTitle>
        <CardDescription>
          Migração única do controle manual. Para cada linha, o sistema cria (se faltar) o <b>prestador</b>, o <b>convênio</b> e um
          <b> lançamento concluído</b> (retroativo), e grava a <b>prestação de contas</b> com toda a esteira preenchida. Reexecutar
          é seguro: linhas já importadas são <b>atualizadas</b>, não duplicadas. Somente administradores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs flex items-center gap-1"><Upload className="h-3 w-3" />Planilha (.xlsx)</Label>
            <input type="file" accept=".xlsx,.xls" className="block text-sm mt-1"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </div>
          {abas.length > 0 && (
            <div className="w-64">
              <Label className="text-xs">Aba</Label>
              <Select value={aba} onValueChange={(v) => wb && carregarAba(wb, v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{abas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>

        {linhas.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{linhas.length} linhas lidas</Badge>
              <Badge className="bg-success text-success-foreground">{validas.length} válidas</Badge>
              {comErro.length > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{comErro.length} com problema (serão ignoradas)</Badge>}
            </div>

            <div className="overflow-x-auto rounded-lg border max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-left uppercase text-muted-foreground border-b bg-muted/20 sticky top-0">
                  <tr>
                    <th className="p-2">Linha</th><th className="p-2">Instituição</th><th className="p-2">Empenho</th>
                    <th className="p-2">Comp.</th><th className="p-2">Valor</th><th className="p-2">Status</th><th className="p-2">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 50).map((l) => (
                    <tr key={l.linha} className={`border-b ${l._erros.length ? "bg-destructive/10" : ""}`}>
                      <td className="p-2 tabular-nums">{l.linha}</td>
                      <td className="p-2 max-w-[220px] truncate" title={l.instituicao}>{l.instituicao || "—"}</td>
                      <td className="p-2">{l.empenho || "—"}</td>
                      <td className="p-2">{l.competencia ?? <span className="text-destructive">inválida</span>}</td>
                      <td className="p-2 tabular-nums">{l.valor ? l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                      <td className="p-2">{statusPcHistorico(l)}</td>
                      <td className="p-2">{l.responsavel || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 50 && <div className="p-2 text-center text-muted-foreground">… e mais {linhas.length - 50} linha(s)</div>}
            </div>

            {rodando && <Progress value={progresso} className="h-2" />}

            <div className="flex items-center gap-3">
              <Button onClick={importar} disabled={rodando || validas.length === 0}>
                <Database className="h-4 w-4 mr-1.5" />{rodando ? `Importando… ${progresso}%` : `Importar ${validas.length} linhas`}
              </Button>
              <span className="text-xs text-muted-foreground">Recomendado: ative o <b>Modo retroativo</b> antes, para preencher sem as travas de sequência.</span>
            </div>

            {res && (
              <div className={`rounded-lg border p-3 text-sm ${res.erros.length ? "border-warning/50 bg-warning/10" : "border-success/50 bg-success/10"}`}>
                <div className="font-semibold flex items-center gap-1.5">
                  {res.erros.length ? <AlertTriangle className="h-4 w-4 text-warning-foreground" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  Importação finalizada
                </div>
                <div className="text-xs mt-1">Lançamentos criados: <b>{res.criadosLanc}</b> · Prestações gravadas: <b>{res.atualizadosPc}</b> · Erros: <b>{res.erros.length}</b></div>
                {res.erros.length > 0 && (
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {res.erros.slice(0, 30).map((e, i) => <li key={i} className="text-xs text-destructive">Linha {e.linha}: {e.msg}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
