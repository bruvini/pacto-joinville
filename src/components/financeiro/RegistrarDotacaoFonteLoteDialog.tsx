import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssinaturasLotePanel } from "@/components/assinaturas/AssinaturasLotePanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registrarAcesso } from "@/lib/acesso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  linhasPendentesPiso, linhasPendentesPvh, montarAtualizacaoPendente,
  type LinhaDotacaoFonte, type ModuloLote,
} from "@/lib/financeiro/dotacao-fonte-lote";

type Rascunho = { dotacao: string; fonte: string };
type Estado = "salvando" | "salvo" | "erro";

const fontes: Record<ModuloLote, { titulo: string; descricao: string }> = {
  piso: {
    titulo: "Piso da Enfermagem · Dotação e Fonte em lote",
    descricao: "Uma linha por obrigação financeira existente da Etapa 5. A mesma competência pode ter várias instituições e obrigações; não são criadas novas obrigações.",
  },
  pvh: {
    titulo: "PVH · Dotação e Fonte em lote",
    descricao: "Uma linha por Solicitação de Nota de Empenho já cadastrada na Etapa 3. Solicitações ainda não criadas e NEs já emitidas não são alteradas.",
  },
};

/** Só preenche lacunas de registros abertos. Cada linha é persistida separadamente,
 * sem assinar, concluir etapas, criar empenho ou disparar encaminhamentos.
 */
export function RegistrarDotacaoFonteLoteDialog({
  modulo, podeEditar,
}: {
  modulo: ModuloLote;
  podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const emAndamento = useRef(new Set<string>());
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: ["dotacao-fonte-pendentes", modulo],
    enabled: aberto && podeEditar,
    queryFn: async () => {
      if (modulo === "piso") {
        const { data, error } = await supabase.from("piso_competencias")
          .select("id,competencia,status,tipo_parcela,piso_participantes(id,prestador_id,prestadores(nome_instituicao),piso_obrigacoes(id,cr_dotacao,fonte,origem_recurso,updated_at))")
          .neq("status", "encerrada");
        if (error) throw error;
        return linhasPendentesPiso(data ?? []);
      }
      const { data, error } = await supabase.from("pvh_empenhos")
        .select("id,prestador_id,solicitacao_competencia_id,status,solicitacao_sei_numero,solicitacao_enviada_sefaz,numero_ne,cr_dotacao,fonte_recurso,updated_at,prestadores(nome_instituicao),pvh_competencias!pvh_empenhos_solicitacao_competencia_id_fkey(id,competencia,status)")
        .not("solicitacao_competencia_id", "is", null);
      if (error) throw error;
      return linhasPendentesPvh(data ?? []);
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const linhas = consulta.data ?? [];
  useEffect(() => {
    if (!aberto) return;
    setRascunhos(atuais => {
      const novos = { ...atuais };
      for (const row of linhas) {
        if (!novos[row.id]) novos[row.id] = {
          dotacao: row.dotacao, fonte: row.fonte,
        };
      }
      return novos;
    });
  }, [aberto, consulta.data]);

  const elegiveis = useMemo(() => linhas.filter(row => {
    const r = rascunhos[row.id] ?? row;
    return !!r.dotacao.trim() && !!r.fonte.trim();
  }), [linhas, rascunhos]);

  const alterar = (id: string, campo: keyof Rascunho, valor: string) => {
    setRascunhos(v => ({
      ...v, [id]: { dotacao: v[id]?.dotacao ?? "", fonte: v[id]?.fonte ?? "", [campo]: valor },
    }));
    setEstados(v => { const n = { ...v }; delete n[id]; return n; });
    setErros(v => { const n = { ...v }; delete n[id]; return n; });
  };

  const salvarLinha = async (row: LinhaDotacaoFonte): Promise<boolean> => {
    if (!podeEditar || emAndamento.current.has(row.id)) return false;
    const draft = rascunhos[row.id] ?? { dotacao: row.dotacao, fonte: row.fonte };
    emAndamento.current.add(row.id);
    setEstados(v => ({ ...v, [row.id]: "salvando" }));
    try {
      const tabela = modulo === "piso" ? "piso_obrigacoes" : "pvh_empenhos";
      const { data: competencia, error: compErro } = await (supabase as any)
        .from(modulo === "piso" ? "piso_competencias" : "pvh_competencias")
        .select("status").eq("id", row.competenciaId).single();
      if (compErro || !competencia || competencia.status === "encerrada")
        throw new Error("Competência encerrada ou indisponível; nenhuma alteração realizada.");

      const { data: atual, error: lerErro } = await (supabase as any)
        .from(tabela).select("*").eq("id", row.id).single();
      if (lerErro || !atual) throw new Error("Registro não encontrado.");
      if (modulo === "pvh" &&
          (atual.solicitacao_competencia_id !== row.competenciaId ||
            atual.solicitacao_enviada_sefaz || atual.numero_ne || atual.status === "ativo"))
        throw new Error("Solicitação já encaminhada/emitida ou desvinculada. Use a Etapa 3.");
      if (modulo === "piso") {
        const { data: part, error: partErro } = await supabase.from("piso_participantes")
          .select("competencia_id").eq("id", atual.participante_id).single();
        if (partErro || part?.competencia_id !== row.competenciaId)
          throw new Error("A obrigação não pertence mais à competência indicada.");
      }
      if (row.atualizadoEm && atual.updated_at !== row.atualizadoEm)
        throw new Error("O registro mudou desde a abertura. Feche e reabra o modal.");
      const payload = montarAtualizacaoPendente(atual, draft, modulo);
      let q = (supabase as any).from(tabela).update(payload).eq("id", row.id);
      if (atual.updated_at) q = q.eq("updated_at", atual.updated_at);
      const { data: atualizados, error: salvarErro } = await q.select("id");
      if (salvarErro) throw salvarErro;
      if (!atualizados?.length)
        throw new Error("Outra alteração foi registrada; não sobrescrevemos informações novas.");
      void registrarAcesso("dotacao_fonte_lote", {
        rota: modulo === "piso" ? "/piso" : "/pvh",
        detalhe: `Módulo ${modulo} · competência ${row.competenciaId} · registro ${row.id}`,
      });
      setEstados(v => ({ ...v, [row.id]: "salvo" }));
      setErros(v => { const n = { ...v }; delete n[row.id]; return n; });
      return true;
    } catch (e) {
      setEstados(v => ({ ...v, [row.id]: "erro" }));
      setErros(v => ({ ...v, [row.id]: e instanceof Error ? e.message : "Falha ao salvar." }));
      return false;
    } finally {
      emAndamento.current.delete(row.id);
    }
  };

  const salvarEmLote = async () => {
    if (ocupado) return;
    setOcupado(true);
    let salvos = 0;
    try {
      for (const row of elegiveis) {
        if (await salvarLinha(row)) salvos++;
      }
      if (salvos) {
        toast.success(`${salvos} registro(s) atualizado(s) sem alterar outras etapas.`);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["dotacao-fonte-pendentes", modulo] }),
          qc.invalidateQueries({ queryKey: [modulo === "piso" ? "piso_competencias" : "pvh_competencias"] }),
          qc.invalidateQueries({ queryKey: [modulo === "piso" ? "piso_obrigacoes" : "pvh_empenhos"] }),
        ]);
      }
      if (salvos < elegiveis.length) toast.warning("Algumas linhas não foram salvas. Confira os erros na tabela.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => {
      if (ocupado) return;
      setAberto(v);
      if (!v) { setRascunhos({}); setEstados({}); setErros({}); }
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={!podeEditar}>
          <Landmark className="mr-2 h-4 w-4" />
          Registrar Dotação e Fonte
          {consulta.data && <Badge className="ml-2" variant="secondary">{linhas.length}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Operações em lote · {modulo === "piso" ? "Piso da Enfermagem" : "PVH"}</DialogTitle>
          <DialogDescription>{fontes[modulo].descricao}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="dotacao" className="space-y-3">
          <TabsList>
            <TabsTrigger value="dotacao">Dotação e Fonte</TabsTrigger>
            <TabsTrigger value="assinaturas">Assinaturas pendentes</TabsTrigger>
          </TabsList>
          <TabsContent value="dotacao" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Somente campos vazios podem ser preenchidos; campos existentes ficam bloqueados.
          Os lançamentos concluídos ou encaminhados não são modificados.
          O cadastro não cria empenhos, não assina documentos nem conclui etapas.
        </p>
        {consulta.isLoading && <p className="text-sm">Consultando registros financeiros…</p>}
        {consulta.isError && (
          <div className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
            <p>Não foi possível consultar os registros. Nenhuma alteração foi feita.</p>
            <Button size="sm" variant="outline" onClick={() => void consulta.refetch()}>Tentar novamente</Button>
          </div>
        )}
        {consulta.isSuccess && !linhas.length && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma {modulo === "piso" ? "obrigação financeira" : "Solicitação de NE"}
            {" "}aberta e com dotação ou fonte pendente.
          </div>
        )}
        {consulta.isSuccess && !!linhas.length && (
          <>
            <div className="max-h-[56vh] overflow-auto rounded-md border">
              <table className="w-full min-w-[830px] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs">
                  <tr>
                    <th className="p-2">Instituição / competência</th>
                    <th className="p-2">Registro financeiro</th>
                    <th className="p-2">Dotação</th>
                    <th className="p-2">Fonte</th>
                    <th className="p-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(row => {
                    const r = rascunhos[row.id] ?? row;
                    const estado = estados[row.id];
                    return (
                      <tr key={row.id} className="border-t align-top">
                        <td className="min-w-[180px] p-2">
                          <div className="font-medium">{row.instituicao}</div>
                          <div className="text-xs text-muted-foreground">{row.competencia}</div>
                        </td>
                        <td className="min-w-[165px] p-2 text-xs text-muted-foreground">{row.detalhe}</td>
                        <td className="p-2">
                          <Input aria-label={`Dotação ${row.instituicao} ${row.competencia}`}
                            className="h-8 min-w-32" maxLength={100} value={r.dotacao}
                            disabled={ocupado || !!row.dotacao}
                            onChange={e => alterar(row.id, "dotacao", e.target.value)}
                            placeholder="Dotação" />
                        </td>
                        <td className="p-2">
                          <Input aria-label={`Fonte ${row.instituicao} ${row.competencia}`}
                            className="h-8 min-w-32" maxLength={100} value={r.fonte}
                            disabled={ocupado || !!row.fonte}
                            onChange={e => alterar(row.id, "fonte", e.target.value)}
                            placeholder="Fonte" />
                        </td>
                        <td className="min-w-28 p-2 text-xs">
                          {estado === "salvando" ? <span className="inline-flex gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Salvando</span>
                            : estado === "salvo" ? <span className="inline-flex gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> Salvo</span>
                              : estado === "erro" ? <span className="text-destructive" title={erros[row.id]}>Erro: {erros[row.id]}</span>
                                : <span className="text-muted-foreground">Pendente</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {linhas.length} registro(s) com lacunas · {elegiveis.length} pronto(s) para salvar.
              </p>
              <Button type="button" onClick={() => void salvarEmLote()}
                disabled={ocupado || !elegiveis.length}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar {elegiveis.length} registro(s)
              </Button>
            </div>
          </>
        )}
          </TabsContent>
          <TabsContent value="assinaturas" className="space-y-3">
            <AssinaturasLotePanel modulo={modulo} podeEditar={podeEditar} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
