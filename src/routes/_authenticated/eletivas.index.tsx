import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { validarCompetenciaEletivas, ordemCompetenciaEletivas } from "@/lib/eletivas/fontes";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/eletivas/")({
  head: () => ({ meta: [{ title: "Encontro de Contas · Cirurgias Eletivas" }] }),
  component: EletivasLista,
});
function EletivasLista() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [competencia, setCompetencia] = useState("");
  const [busca, setBusca] = useState("");
  const [abrir, setAbrir] = useState(false);
  const editor = hasRole(roles, "acp") || hasRole(roles, "admin");
  const p = useQuery({ queryKey: ["ec-prestadores"], queryFn: async () => {
    const { data, error } = await supabase.from("prestadores").select("id,nome_instituicao");
    if (error) throw error;
    return (data ?? []).filter(x => /s[aã]o jos[eé]|hmsj/i.test(x.nome_instituicao));
  }});
  const comps = useQuery({ queryKey: ["ec-competencias"], queryFn: async () => {
    const { data, error } = await supabase.from("eletivas_competencias")
      .select("*,prestadores(nome_instituicao)").order("criado_em",{ascending:false});
    if (error) throw error;
    return data ?? [];
  }});
  const criar = useMutation({ mutationFn: async () => {
    if (!validarCompetenciaEletivas(competencia)) throw Error("Competência inválida: use MM/AAAA.");
    if (!p.data?.length) throw Error("Hospital Municipal São José não localizado no cadastro.");
    if (!user?.id) throw Error("Sessão expirada.");
    const { data, error } = await supabase.from("eletivas_competencias").insert({
      competencia, prestador_id:p.data[0].id, criado_por:user.id,
    }).select("id").single();
    if(error) throw error.code==="23505" ? Error("Competência já cadastrada.") : error;
    return data.id;
  },onSuccess: id => {
    qc.invalidateQueries({queryKey:["ec-competencias"]});
    toast.success("Encontro de Contas criado");setAbrir(false);
    navigate({to:"/eletivas/$id",params:{id}});
  },onError:(e:Error)=>toast.error(e.message)});
  const lista=(comps.data??[]).filter(x => (x.competencia+" "+x.prestadores?.nome_instituicao)
    .toLowerCase().includes(busca.toLowerCase()))
    .sort((a,b)=>ordemCompetenciaEletivas(b.competencia)-ordemCompetenciaEletivas(a.competencia));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase text-muted-foreground">Atesto de Produção</p>
        <h1 className="text-2xl font-bold">Encontro de Contas - Eletivas (HMSJ)</h1>
        <p className="text-sm text-muted-foreground">Fontes TabWin, SES/SC, auditoria de itens e documentos SEI.</p></div>
      {editor && <Button onClick={()=>setAbrir(!abrir)}><Plus className="mr-2 h-4 w-4"/>Nova competência</Button>}
    </div>
    {abrir && <Card><CardContent className="flex flex-wrap items-end gap-3 pt-5">
      <div><label className="mb-1 block text-sm font-medium">Competência</label>
        <CompetenciaInput value={competencia} onChange={setCompetencia}/></div>
      <Button disabled={criar.isPending || !p.data?.length} onClick={()=>criar.mutate()}>
        {criar.isPending ? "Criando…" : "Criar"}</Button>
      <Button variant="outline" onClick={()=>setAbrir(false)}>Cancelar</Button>
    </CardContent></Card>}
    <Card><CardHeader className="flex flex-row flex-wrap items-center gap-3">
      <CardTitle className="mr-auto text-base">{lista.length} encontro(s)</CardTitle>
      <Input className="w-full sm:w-64" value={busca} onChange={e=>setBusca(e.target.value)}
        placeholder="Buscar competência ou instituição"/>
    </CardHeader><CardContent>
      {comps.isLoading ? <p>Carregando…</p> : comps.isError ?
        <p role="alert" className="text-destructive">Falha de leitura. Confirme a migração SQL.</p> :
        !lista.length ? <p className="py-5 text-sm text-muted-foreground">Sem competências.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm">
          <thead><tr className="border-b text-left"><th className="p-2">Competência</th>
            <th>Instituição</th><th>Situação</th><th className="text-right">Valor fechado</th></tr></thead>
          <tbody>{lista.map(c=><tr className="border-b" key={c.id}>
            <td className="p-2"><Link className="font-semibold text-primary hover:underline"
              to="/eletivas/$id" params={{id:c.id}}>{c.competencia}</Link></td>
            <td>{c.prestadores?.nome_instituicao ?? "HMSJ"}</td><td>{c.status}</td>
            <td className="text-right">{c.valor_fechado==null ? "—" : brl(c.valor_fechado)}</td>
          </tr>)}</tbody>
        </table></div>}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground">A vinculação ao convênio está preparada,
      mas não transfere valores automaticamente à Etapa 6.</p>
  </div>;
}
