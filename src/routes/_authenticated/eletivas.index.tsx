import {createFileRoute,Link,useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {Plus,Pencil,Trash2} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {ordemCompetenciaEletivas} from "@/lib/eletivas/fontes";
import {brl} from "@/lib/format";

export const Route=createFileRoute("/_authenticated/eletivas/")({
  head:()=>({meta:[{title:"Encontro de Contas · Cirurgias Eletivas"}]}),
  component:EletivasLista,
});
type Elegivel={
 lancamento_id:string;prestador_id:string;nome_instituicao:string;convenio_id:string;
 objeto:string|null;competencia:string;parcela:string|null;descricao:string|null;
 valor_atestado:number|null;cnes_sugerido:string|null;
};
function EletivasLista(){
 const qc=useQueryClient(),navigate=useNavigate();
 const {roles}=useAuth(),editor=hasRole(roles,"acp")||hasRole(roles,"admin");
 const [abrir,setAbrir]=useState(false);
 const [editId,setEditId]=useState<string|null>(null);
 const [prest,setPrest]=useState(""),[conv,setConv]=useState(""),[lanc,setLanc]=useState("");
 const [cnes,setCnes]=useState(""),[observacao,setObservacao]=useState("");
 const [motivo,setMotivo]=useState(""),[motivoExcluir,setMotivoExcluir]=useState<Record<string,string>>({});
 const [excluirId,setExcluirId]=useState<string|null>(null),[busca,setBusca]=useState("");
 const comps=useQuery({queryKey:["ec-competencias"],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_competencias")
    .select("*,prestadores(nome_instituicao)").order("criado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const elegiveis=useQuery({queryKey:["ec-lancamentos-elegiveis"],queryFn:async()=>{
  const {data,error}=await supabase.rpc("ec_listar_lancamentos_disponiveis");
  if(error)throw error;return data??[];
 }});
 const [existente,setExistente]=useState<Elegivel|null>(null);
 const opcoes=[...(elegiveis.data??[])];
 if(editId&&existente&&!opcoes.some(x=>x.lancamento_id===existente.lancamento_id))
  opcoes.push(existente);
 const instituicoes=[...new Map(opcoes.map(x=>[x.prestador_id,{
  id:x.prestador_id,nome:x.nome_instituicao}])).values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
 const convenios=[...new Map(opcoes.filter(x=>x.prestador_id===prest)
  .map(x=>[x.convenio_id,{id:x.convenio_id,objeto:x.objeto}])).values()];
 const parcelas=opcoes.filter(x=>x.prestador_id===prest&&x.convenio_id===conv);
 const escolhido=opcoes.find(x=>x.lancamento_id===lanc);
 const abrirNovo=()=>{
  setAbrir(true);setEditId(null);setExistente(null);setPrest("");setConv("");setLanc("");
  setCnes("");setObservacao("");setMotivo("");
 };
 const editar=async(c:NonNullable<typeof comps.data>[number])=>{
  if(c.status!=="preparacao"){toast.error("Só é possível editar uma competência ainda em preparação.");return;}
  setEditId(c.id);setAbrir(true);setPrest(c.prestador_id);setLanc(c.lancamento_id??"");
  setCnes(c.cnes);setObservacao(c.observacao??"");setMotivo("");
  setConv("");setExistente(null);
  if(c.lancamento_id){
   const {data,error}=await supabase.from("lancamentos_pagamento")
    .select("id,convenio_id,prestador_id,competencia,parcela,descricao,valor_atestado")
    .eq("id",c.lancamento_id).single();
   if(error||!data?.convenio_id){
    toast.error("Lançamento anterior indisponível; selecione outro vínculo.");
    return;
   }
   setConv(data.convenio_id);
   setExistente({lancamento_id:data.id,convenio_id:data.convenio_id,
    prestador_id:c.prestador_id,nome_instituicao:c.prestadores?.nome_instituicao??"Instituição",
    competencia:data.competencia??c.competencia,parcela:data.parcela,
    descricao:data.descricao,valor_atestado:data.valor_atestado,
    objeto:"Vínculo atual",cnes_sugerido:c.cnes});
  }
 };
 const criar=useMutation({mutationFn:async()=>{
  if(!prest||!conv||!lanc||!escolhido)throw Error("Selecione instituição, convênio e parcela existente.");
  if(!/^\d{7}$/.test(cnes))throw Error("Informe CNES institucional válido (7 dígitos).");
  if(editId){
   if(motivo.trim().length<15)throw Error("Informe o motivo da edição (15 caracteres).");
   const {error}=await supabase.rpc("ec_editar_competencia",{
    p_comp:editId,p_prest:prest,p_convenio:conv,p_lanc:lanc,
    p_cnes:cnes,p_observacao:observacao,p_motivo:motivo.trim()});
   if(error)throw error;return editId;
  }
  const {data,error}=await supabase.rpc("ec_criar_competencia_vinculada",{
   p_prest:prest,p_convenio:conv,p_lanc:lanc,p_cnes:cnes});
  if(error)throw error;return data;
 },onSuccess:id=>{
  qc.invalidateQueries({queryKey:["ec-competencias"]});
  qc.invalidateQueries({queryKey:["ec-lancamentos-elegiveis"]});
  toast.success(editId?"Competência atualizada com histórico.":"Encontro criado a partir do lançamento.");
  setAbrir(false);setEditId(null);
  navigate({to:"/eletivas/$id",params:{id}});
 },onError:(e:Error)=>toast.error(e.message)});
 const excluir=useMutation({mutationFn:async(id:string)=>{
  const justificativa=(motivoExcluir[id]??"").trim();
  if(justificativa.length<20)throw Error("Informe a justificativa de exclusão (20 caracteres).");
  const {error}=await supabase.rpc("ec_excluir_competencia",{
   p_comp:id,p_motivo:justificativa});
  if(error)throw error;
 },onSuccess:()=>{
  qc.invalidateQueries({queryKey:["ec-competencias"]});
  qc.invalidateQueries({queryKey:["ec-lancamentos-elegiveis"]});
  setExcluirId(null);toast.success("Rascunho excluído; trilha de exclusão preservada.");
 },onError:(e:Error)=>toast.error(e.message)});
 const lista=(comps.data??[]).filter(c=>(c.competencia+" "+
  (c.prestadores?.nome_instituicao??"")+" "+(c.observacao??""))
  .toLowerCase().includes(busca.toLowerCase()))
  .sort((a,b)=>ordemCompetenciaEletivas(b.competencia)-ordemCompetenciaEletivas(a.competencia));
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="text-xs uppercase text-muted-foreground">Atesto de Produção</p>
    <h1 className="text-2xl font-bold">Encontro de Contas — Eletivas</h1>
    <p className="text-sm text-muted-foreground">Cada encontro nasce de uma competência/parcela
      já aberta no Fluxo 1 de Lançamentos de Pagamento.</p></div>
   {editor&&<Button onClick={()=>abrir?setAbrir(false):abrirNovo()}>
    <Plus className="mr-2 h-4 w-4"/>Novo encontro</Button>}
  </div>
  {abrir&&<Card><CardContent className="space-y-3 pt-5">
   <h3 className="font-semibold">{editId?"Editar competência em preparação":"Novo encontro — selecionar lançamento de origem"}</h3>
   <p className="text-xs text-muted-foreground">As opções são filtradas pelo banco:
     lançamentos não concluídos, não pagos, individuais e ainda sem Encontro de Contas.
     Para um processo com vários meses, selecione a parcela filha criada no Fluxo 1.</p>
   {elegiveis.isError&&<p role="alert" className="text-destructive text-xs">
     Não foi possível consultar lançamentos. Execute a migration complementar.</p>}
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs">Instituição
     <Select value={prest} onValueChange={v=>{setPrest(v);setConv("");setLanc("");
      setCnes(opcoes.find(x=>x.prestador_id===v)?.cnes_sugerido??"");}}>
      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a instituição"/></SelectTrigger>
      <SelectContent>{instituicoes.map(x=><SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
     </Select>
    </label>
    <label className="text-xs">Convênio
     <Select disabled={!prest} value={conv} onValueChange={v=>{setConv(v);setLanc("");}}>
      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o convênio"/></SelectTrigger>
      <SelectContent>{convenios.map(x=><SelectItem key={x.id} value={x.id}>
       {(x.objeto??"Convênio sem descrição").slice(0,80)} · {x.id.slice(0,8)}
      </SelectItem>)}</SelectContent>
     </Select>
    </label>
    <label className="text-xs">Competência / Parcela já aberta
     <Select disabled={!conv} value={lanc} onValueChange={v=>{
      setLanc(v);setCnes(opcoes.find(x=>x.lancamento_id===v)?.cnes_sugerido??cnes);}}>
      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a parcela"/></SelectTrigger>
      <SelectContent>{parcelas.map(x=><SelectItem key={x.lancamento_id} value={x.lancamento_id}>
       {x.competencia} · Parcela {x.parcela??"não numerada"} · {x.lancamento_id.slice(0,8)}
      </SelectItem>)}</SelectContent>
     </Select>
    </label>
   </div>
   {escolhido&&<p className="rounded-md bg-muted/30 p-3 text-xs">
    Lançamento: {escolhido.descricao??"Sem descrição"} · Competência <b>{escolhido.competencia}</b>
    {" "}· Atesto atual: {brl(escolhido.valor_atestado??0)}
    {" "}· ID: {escolhido.lancamento_id}</p>}
   {!elegiveis.isLoading&&!opcoes.length&&<p className="text-xs text-amber-800">
    Nenhum lançamento elegível. Abra primeiro a competência no módulo de Lançamentos
    (e, em processos multicompetência, aguarde a criação das parcelas filhas).</p>}
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs">CNES da instituição (7 dígitos)
      <Input className="mt-1" inputMode="numeric" maxLength={7}
       value={cnes} onChange={e=>setCnes(e.target.value.replace(/\D/g,"").slice(0,7))}/>
    </label>
    {editId&&<label className="text-xs">Observação
      <Input className="mt-1" value={observacao} onChange={e=>setObservacao(e.target.value)}/>
    </label>}
   </div>
   {editId&&<Textarea rows={2} value={motivo} onChange={e=>setMotivo(e.target.value)}
     placeholder="Motivo da alteração do encontro e do vínculo (mín. 15 caracteres)"/>}
   <div className="flex gap-2">
    <Button disabled={criar.isPending||!lanc||!/^\d{7}$/.test(cnes)||editId!==null&&motivo.trim().length<15}
      onClick={()=>criar.mutate()}>{criar.isPending?"Salvando…":editId?"Salvar alterações":"Criar encontro vinculado"}</Button>
    <Button variant="outline" onClick={()=>{setAbrir(false);setEditId(null);}}>Cancelar</Button>
   </div>
  </CardContent></Card>}
  <Card><CardHeader className="flex flex-row flex-wrap items-center gap-3">
   <CardTitle className="mr-auto text-base">{lista.length} encontro(s)</CardTitle>
   <Input className="w-full sm:w-64" value={busca} onChange={e=>setBusca(e.target.value)}
     placeholder="Buscar competência ou instituição"/>
  </CardHeader><CardContent>
   {comps.isLoading?<p>Carregando…</p>:comps.isError?
     <p role="alert" className="text-destructive">Falha ao consultar competências.</p>:
    !lista.length?<p className="text-sm text-muted-foreground">Nenhum encontro cadastrado.</p>:
    <div className="overflow-x-auto"><table className="w-full min-w-[670px] text-sm">
     <thead><tr className="border-b text-left"><th className="p-2">Competência</th>
      <th>Instituição</th><th>Situação</th><th className="text-right">Fechado</th>
      <th className="text-right">Ações</th></tr></thead>
     <tbody>{lista.map(c=><tr className="border-b" key={c.id}>
      <td className="p-2"><Link className="font-semibold text-primary hover:underline"
       to="/eletivas/$id" params={{id:c.id}}>{c.competencia}</Link></td>
      <td>{c.prestadores?.nome_instituicao??"—"}</td>
      <td>{c.status}</td>
      <td className="text-right">{c.valor_fechado==null?"—":brl(c.valor_fechado)}</td>
      <td className="p-2 text-right whitespace-nowrap">
       {editor&&c.status==="preparacao"&&<>
        <Button size="sm" variant="ghost" title="Editar rascunho" onClick={()=>editar(c)}>
         <Pencil className="h-4 w-4"/></Button>
        <Button size="sm" variant="ghost" title="Excluir rascunho sem evidências"
         onClick={()=>setExcluirId(excluirId===c.id?null:c.id)}>
         <Trash2 className="h-4 w-4"/></Button>
       </>}
      </td>
     </tr>)}</tbody>
    </table></div>}
   {excluirId&&<div className="mt-3 space-y-2 rounded-md border p-3">
    <p className="text-xs font-semibold">Excluir rascunho</p>
    <p className="text-xs text-muted-foreground">Somente rascunhos sem qualquer
      evidência ou cálculo podem ser excluídos; a exclusão fica auditada.</p>
    <Textarea rows={2} value={motivoExcluir[excluirId]??""}
      onChange={e=>setMotivoExcluir(v=>({...v,[excluirId]:e.target.value}))}
      placeholder="Justificativa obrigatória (mín. 20 caracteres)"/>
    <Button size="sm" variant="destructive"
      disabled={excluir.isPending||(motivoExcluir[excluirId]??"").trim().length<20}
      onClick={()=>{if(window.confirm("Excluir este rascunho sem evidências?"))
         excluir.mutate(excluirId);}}>Confirmar exclusão auditada</Button>
    <Button size="sm" variant="outline" onClick={()=>setExcluirId(null)}>Cancelar</Button>
   </div>}
  </CardContent></Card>
  <p className="text-xs text-muted-foreground">Criar o encontro apenas vincula
    a competência ao lançamento existente. O valor só poderá chegar à Etapa 6 após
    fechamento e proposta fiscal autorizada.</p>
 </div>;
}
