import {createFileRoute,Link,useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {Plus,Pencil,Trash2,Info,Archive,RotateCcw} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {ordemCompetenciaEletivas} from "@/lib/eletivas/fontes";
import {resolverDestinoEncontro} from "@/lib/eletivas/competencias";
import {brl} from "@/lib/format";

export const Route=createFileRoute("/_authenticated/eletivas/")({
 head:()=>({meta:[{title:"Encontro de Contas · Cirurgias Eletivas"}]}),
 component:EletivasLista,
});
type ParcelaEC={
 lancamento_id:string;prestador_id:string;nome_instituicao:string;
 convenio_id:string;objeto:string|null;competencia:string;parcela:string|null;
 descricao:string|null;valor_atestado:number|null;cnes_institucional:string|null;
 encontro_id:string|null;encontro_lancamento_id:string|null;encontro_status:string|null;
};
type Encontro=NonNullable<ReturnType<typeof useQueryEncontros>["data"]>[number];
function useQueryEncontros(){
 return useQuery({queryKey:["ec-competencias"],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_competencias")
   .select("*,prestadores(nome_instituicao)").order("criado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
}
function EletivasLista(){
 const qc=useQueryClient(),navigate=useNavigate();
 const {roles}=useAuth(),editor=hasRole(roles,"acp")||hasRole(roles,"admin");
 const [abrir,setAbrir]=useState(false),[editId,setEditId]=useState<string|null>(null);
 const [somenteObservacao,setSomenteObservacao]=useState(false);
 const [prest,setPrest]=useState(""),[conv,setConv]=useState(""),[lanc,setLanc]=useState("");
 const [observacao,setObservacao]=useState(""),[motivo,setMotivo]=useState("");
 const [excluirId,setExcluirId]=useState<string|null>(null);
 const [mostrarArquivadas,setMostrarArquivadas]=useState(false);
 const [motivoExcluir,setMotivoExcluir]=useState<Record<string,string>>({});
 const [busca,setBusca]=useState("");
 const comps=useQueryEncontros();
 const parcelasQuery=useQuery({queryKey:["ec-parcelas-encontro"],queryFn:async()=>{
  const {data,error}=await supabase.rpc("ec_listar_parcelas_encontro");
  if(error)throw error;return data??[];
 }});
 const [atual,setAtual]=useState<ParcelaEC|null>(null);
 const opcoes:ParcelaEC[]=[...(parcelasQuery.data??[])];
 if(editId&&atual&&!opcoes.some(x=>x.lancamento_id===atual.lancamento_id))
  opcoes.push(atual);
 const instituicoes=[...new Map(opcoes.map(x=>[x.prestador_id,{
  id:x.prestador_id,nome:x.nome_instituicao}])).values()]
  .sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
 const convenios=[...new Map(opcoes.filter(x=>x.prestador_id===prest)
  .map(x=>[x.convenio_id,{id:x.convenio_id,objeto:x.objeto}])).values()];
 const parcelas=opcoes.filter(x=>x.prestador_id===prest&&x.convenio_id===conv);
 const escolhido=opcoes.find(x=>x.lancamento_id===lanc);
 const encontroSelecionado=escolhido?.encontro_id??null;
 const novo=()=>{
  setAbrir(true);setEditId(null);setSomenteObservacao(false);setAtual(null);
  setPrest("");setConv("");setLanc("");setObservacao("");setMotivo("");
 };
 const editar=async(c:Encontro)=>{
  if(c.status==="encerrada"){
   toast.error("Encontro encerrado: edição depende de reabertura formal. As evidências permanecem protegidas.");
   return;
  }
  let anterior:ParcelaEC|null=null,convenio="";
  // Valide antes de abrir o formulário; não exiba dados parciais na falha.
  if(c.lancamento_id&&c.status==="preparacao"){
   const {data,error}=await supabase.from("lancamentos_pagamento")
    .select("id,convenio_id,prestador_id,competencia,parcela,descricao,valor_atestado")
    .eq("id",c.lancamento_id).single();
   if(error||!data?.convenio_id||data.prestador_id!==c.prestador_id
     ||data.competencia!==c.competencia){
    toast.error("Não foi possível validar o lançamento anterior; nenhuma alteração foi iniciada.");
    return;
   }
   convenio=data.convenio_id;
   anterior={lancamento_id:data.id,convenio_id:convenio,
    prestador_id:c.prestador_id,nome_instituicao:c.prestadores?.nome_instituicao??"Instituição",
    competencia:data.competencia,parcela:data.parcela,descricao:data.descricao,
    valor_atestado:data.valor_atestado,cnes_institucional:c.cnes,
    encontro_id:c.id,encontro_lancamento_id:c.lancamento_id,encontro_status:c.status};
  }
  setEditId(c.id);setAbrir(true);setPrest(c.prestador_id);
  setObservacao(c.observacao??"");setMotivo("");
  setSomenteObservacao(c.status!=="preparacao");
  setLanc(c.lancamento_id??"");setConv(convenio);setAtual(anterior);
 };
 const atualizarListas=()=>{
  qc.invalidateQueries({queryKey:["ec-competencias"]});
  qc.invalidateQueries({queryKey:["ec-parcelas-encontro"]});
 };
 const salvar=useMutation({mutationFn:async()=>{
  if(editId&&somenteObservacao){
   if(motivo.trim().length<15)throw Error("Informe o motivo da alteração.");
   const {error}=await supabase.rpc("ec_atualizar_observacao_competencia",{
    p_comp:editId,p_observacao:observacao,p_motivo:motivo.trim()});
   if(error)throw error;return editId;
  }
  if(!prest||!conv||!lanc||!escolhido)
   throw Error("Selecione instituição, convênio e competência/parcela.");
  const destino=resolverDestinoEncontro(escolhido);
  if(!editId&&destino.acao!=="criar"){
   if(destino.acao==="abrir")return destino.id;
   if(destino.acao==="bloquear")throw Error(destino.motivo);
   if(motivo.trim().length<15)
    throw Error("Informe a justificativa para vincular o encontro já existente (15 caracteres).");
   const {error}=await supabase.rpc("ec_vincular_lancamento",{
    p_comp:destino.id,p_convenio:conv,p_lancamento:lanc,p_justificativa:motivo.trim()});
   if(error)throw error;return destino.id;
  }
  if(editId){
   if(motivo.trim().length<15)throw Error("Informe o motivo da edição.");
   if(escolhido.encontro_id&&escolhido.encontro_id!==editId)
    throw Error("Essa parcela já pertence a outro encontro.");
   const {error}=await supabase.rpc("ec_editar_competencia",{
    p_comp:editId,p_prest:prest,p_convenio:conv,p_lanc:lanc,
    p_cnes:escolhido.cnes_institucional??"",p_observacao:observacao,
    p_motivo:motivo.trim()});
   if(error)throw error;return editId;
  }
  const {data,error}=await supabase.rpc("ec_criar_competencia_vinculada",{
   p_prest:prest,p_convenio:conv,p_lanc:lanc});
  if(error)throw error;return data;
 },onSuccess:id=>{
  atualizarListas();
  toast.success(editId?"Competência atualizada com histórico.":
   encontroSelecionado?"Encontro existente aberto/vinculado sem duplicar auditoria.":
   "Encontro criado a partir do lançamento.");
  setAbrir(false);setEditId(null);
  navigate({to:"/eletivas/$id",params:{id}});
 },onError:(e:Error)=>{atualizarListas();toast.error(e.message);}});
 const arquivar=useMutation({mutationFn:async(id:string)=>{
  const motivo=(motivoExcluir[id]??"").trim();
  if(motivo.length<20)throw Error("Informe a justificativa (mínimo 20 caracteres).");
  const {error}=await supabase.rpc("ec_arquivar_competencia",{
   p_comp:id,p_motivo:motivo});
  if(error)throw error;
 },onSuccess:()=>{
  atualizarListas();setExcluirId(null);setMotivoExcluir({});
  toast.success("Competência retirada da lista ativa. Evidências e auditoria preservadas.");
 },onError:(e:Error)=>toast.error(e.message)});
 const restaurar=useMutation({mutationFn:async(id:string)=>{
  const motivo=(motivoExcluir[id]??"").trim();
  if(motivo.length<20)throw Error("Informe a justificativa (mínimo 20 caracteres).");
  const {error}=await supabase.rpc("ec_restaurar_competencia",{
   p_comp:id,p_motivo:motivo});
  if(error)throw error;
 },onSuccess:()=>{
  atualizarListas();setExcluirId(null);setMotivoExcluir({});
  toast.success("Competência restaurada com arquivos, decisões e histórico.");
 },onError:(e:Error)=>toast.error(e.message)});
 const excluir=useMutation({mutationFn:async(id:string)=>{
  const justificativa=(motivoExcluir[id]??"").trim();
  if(justificativa.length<20)throw Error("Informe o motivo (20 caracteres).");
  const {error}=await supabase.rpc("ec_excluir_competencia",{
   p_comp:id,p_motivo:justificativa});
  if(error)throw error;
 },onSuccess:()=>{
  atualizarListas();setExcluirId(null);
  toast.success("Rascunho excluído; registro da exclusão preservado.");
 },onError:(e:Error)=>toast.error(e.message)});
 const lista=(comps.data??[]).filter(c=>(mostrarArquivadas||!c.arquivada_em)&&
  (c.competencia+" "+(c.prestadores?.nome_instituicao??"")+" "+(c.observacao??""))
  .toLowerCase().includes(busca.toLowerCase()))
  .sort((a,b)=>ordemCompetenciaEletivas(b.competencia)-ordemCompetenciaEletivas(a.competencia));
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="text-xs uppercase text-muted-foreground">Atesto de Produção</p>
    <h1 className="text-2xl font-bold">Encontro de Contas — Eletivas</h1>
    <p className="text-sm text-muted-foreground">Encontro vinculado à competência/parcela
     aberta no Fluxo 1 de Lançamentos de Pagamento.</p></div>
   {editor&&<Button onClick={()=>abrir?setAbrir(false):novo()}>
     <Plus className="mr-2 h-4 w-4"/>Novo encontro</Button>}
  </div>
  {abrir&&<Card><CardContent className="space-y-3 pt-5">
   <h3 className="font-semibold">{editId?somenteObservacao?
     "Editar observação fiscal":"Editar cadastro da competência":
     "Novo encontro — selecionar lançamento de origem"}</h3>
   {!somenteObservacao&&<p className="text-xs text-muted-foreground">
    Selecione uma parcela aberta e não concluída. Quando a competência já tiver
    Encontro de Contas, ele será reutilizado. Um valor manual atestado
    não impede a seleção.</p>}
   {somenteObservacao?<p className="text-xs text-muted-foreground">
     Esta competência já possui auditoria. Para preservar as evidências,
     apenas sua observação pode ser modificada aqui. A alteração fica registrada.</p>:
   <>
    {parcelasQuery.isError&&<p role="alert" className="text-xs text-destructive">
      Falha ao consultar parcelas. Execute o SQL complementar.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
     <label className="text-xs">Instituição
      <Select value={prest} onValueChange={v=>{setPrest(v);setConv("");setLanc("");}}>
       <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a instituição"/></SelectTrigger>
       <SelectContent>{instituicoes.map(x=><SelectItem key={x.id} value={x.id}>
        {x.nome}</SelectItem>)}</SelectContent>
      </Select>
     </label>
     <label className="text-xs">Convênio
      <Select value={conv} disabled={!prest} onValueChange={v=>{setConv(v);setLanc("");}}>
       <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha o convênio"/></SelectTrigger>
       <SelectContent>{convenios.map(x=><SelectItem key={x.id} value={x.id}>
        {x.objeto??"Convênio sem descrição"}</SelectItem>)}</SelectContent>
      </Select>
     </label>
     <label className="text-xs">Competência / Parcela
      <Select value={lanc} disabled={!conv} onValueChange={setLanc}>
       <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a parcela"/></SelectTrigger>
       <SelectContent>{parcelas.map(x=><SelectItem key={x.lancamento_id} value={x.lancamento_id}>
        {x.competencia} · Parcela {x.parcela??"não numerada"}
        {x.encontro_id?" · Encontro existente":""}</SelectItem>)}</SelectContent>
      </Select>
     </label>
    </div>
    {escolhido&&<div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
      <p>{escolhido.descricao??"Lançamento"} · Competência <strong>{escolhido.competencia}</strong>
       {" "}· Valor atestado no lançamento: {brl(escolhido.valor_atestado??0)}</p>
      {escolhido.encontro_id&&<p className="font-semibold">
       <Info className="mr-1 inline h-3.5 w-3.5"/>
       Esta competência já possui um Encontro de Contas ({escolhido.encontro_status}).
       {escolhido.encontro_status==="arquivada"?
        " Para criar outro encontro neste mês, apague definitivamente o teste arquivado pela lista.":escolhido.encontro_lancamento_id===lanc?
        " Você poderá abrir o encontro existente.":escolhido.encontro_lancamento_id?
        " Já vinculado a outro lançamento.":" Será possível vinculá-lo a esta parcela, sem duplicar a conciliação."}
      </p>}
    </div>}
    {escolhido&&resolverDestinoEncontro(escolhido).acao==="bloquear"&&
     <p role="alert" className="text-xs text-destructive">
      {(resolverDestinoEncontro(escolhido) as {acao:"bloquear";motivo:string}).motivo}
     </p>}
    {!parcelasQuery.isLoading&&!opcoes.length&&<p className="text-xs text-amber-800">
      Nenhuma parcela aberta compatível encontrada. Confira se o lançamento
      foi concluído ou se a instituição já possui CNES cadastrado.</p>}
   </>}
   {editId&&<label className="block text-xs">Observação da competência
    <Textarea className="mt-1" rows={2} value={observacao}
     onChange={e=>setObservacao(e.target.value)}/>
   </label>}
   {(editId||encontroSelecionado&&!escolhido?.encontro_lancamento_id)&&
    <label className="block text-xs">Justificativa
     <Textarea className="mt-1" rows={2} value={motivo}
      onChange={e=>setMotivo(e.target.value)}
      placeholder="Motivo da edição ou do vínculo existente (mín. 15 caracteres)"/>
    </label>}
   <div className="flex flex-wrap gap-2">
    <Button disabled={salvar.isPending||(!somenteObservacao&&!escolhido)||
       (!editId&&!!escolhido&&resolverDestinoEncontro(escolhido).acao==="bloquear")||
       (!!editId||!!encontroSelecionado&&!escolhido?.encontro_lancamento_id)&&motivo.trim().length<15}
      onClick={()=>salvar.mutate()}>
      {salvar.isPending?"Salvando…":editId?"Salvar alteração":
       encontroSelecionado?escolhido?.encontro_lancamento_id===lanc?
       "Abrir encontro existente":"Vincular e abrir encontro existente":
       "Criar encontro vinculado"}
    </Button>
    <Button variant="outline" onClick={()=>{setAbrir(false);setEditId(null);}}>
     Cancelar</Button>
   </div>
  </CardContent></Card>}
  <Card><CardHeader className="flex flex-row flex-wrap items-center gap-3">
   <CardTitle className="mr-auto text-base">{lista.length} encontro(s)</CardTitle>
   <label className="flex items-center gap-2 text-xs text-muted-foreground">
    <input type="checkbox" checked={mostrarArquivadas}
     onChange={e=>setMostrarArquivadas(e.currentTarget.checked)}/>
    Mostrar arquivadas
   </label>
   <Input className="w-full sm:w-64" value={busca} onChange={e=>setBusca(e.target.value)}
    placeholder="Buscar competência ou instituição"/>
  </CardHeader><CardContent>
   {comps.isLoading?<p>Carregando…</p>:comps.isError?
    <p role="alert" className="text-destructive">Falha ao consultar encontros.</p>:
    !lista.length?<p className="text-sm text-muted-foreground">Nenhum encontro cadastrado.</p>:
    <div className="overflow-x-auto"><table className="w-full min-w-[670px] text-sm">
     <thead><tr className="border-b text-left">
      <th className="p-2">Competência</th><th>Instituição</th><th>Situação</th>
      <th className="text-right">Fechado</th><th className="text-right">Ações</th>
     </tr></thead>
     <tbody>{lista.map(c=><tr className="border-b" key={c.id}>
      <td className="p-2"><Link className="font-semibold text-primary hover:underline"
       to="/eletivas/$id" params={{id:c.id}}>{c.competencia}</Link></td>
      <td>{c.prestadores?.nome_instituicao??"—"}</td>
      <td>{c.arquivada_em?"Arquivada":c.status}</td>
      <td className="text-right">{c.valor_fechado==null?"—":brl(c.valor_fechado)}</td>
      <td className="p-2 text-right whitespace-nowrap">
       {editor&&<>
        {!c.arquivada_em&&<Button size="sm" variant="ghost" title={c.status==="encerrada"?
          "Fechado: edição somente após reabertura formal":
          c.status==="preparacao"?"Editar competência":"Editar observação fiscal"}
          aria-label={"Editar "+c.competencia}
          onClick={()=>editar(c)}><Pencil className="h-4 w-4"/></Button>}
        <Button size="sm" variant="ghost"
          title={c.arquivada_em?"Restaurar competência arquivada":
           "Excluir rascunho vazio ou arquivar encontro com auditoria"}
          aria-label={c.arquivada_em?"Restaurar "+c.competencia:"Excluir "+c.competencia}
          onClick={()=>setExcluirId(excluirId===c.id?null:c.id)}>
          {c.arquivada_em?<RotateCcw className="h-4 w-4"/>:
           <Trash2 className="h-4 w-4"/>}</Button>
       </>}
      </td>
     </tr>)}</tbody>
    </table></div>}
   {excluirId&&<div className="mt-3 space-y-3 rounded-md border p-3">
     <p className="text-xs font-semibold">Exclusão da competência · Gestão de testes e histórico</p>
     {comps.data?.find(c=>c.id===excluirId)?.arquivada_em?
      <p className="text-xs text-muted-foreground">
       A competência está arquivada, com documentos e auditoria preservados.
       Você pode restaurar o mesmo registro, inclusive seus arquivos e decisões.</p>:
      comps.data?.find(c=>c.id===excluirId)?.status==="encerrada"?
      <p role="alert" className="text-xs text-amber-800">
       Encontro encerrado: não é permitido excluir nem arquivar após fechamento.
       A reabertura fiscal possui procedimento próprio e não apaga os documentos.</p>:
      <div className="space-y-1 text-xs text-muted-foreground">
       <p><strong>Excluir definitivamente:</strong> somente rascunho em preparação
        sem nenhum arquivo, documento, decisão ou evidência, com registro de exclusão.</p>
       <p><strong>Arquivar:</strong> permite retirar da lista ativa um encontro de teste
        que já entrou em auditoria, mantendo fontes, hashes, decisões e histórico.
        Não libera nova competência para o mesmo prestador/mês; você poderá restaurá-la.
        Arquivamento bloqueado quando houve fechamento, integração ou escolha formal de atesto.</p>
      </div>}
     {comps.data?.find(c=>c.id===excluirId)?.status!=="encerrada"&&
      <label className="block text-xs">Justificativa obrigatória (mínimo 20 caracteres)
       <Textarea className="mt-1" rows={2} value={motivoExcluir[excluirId]??""}
        onChange={e=>setMotivoExcluir(v=>({...v,[excluirId]:e.target.value}))}
        placeholder="Ex.: Encontro de teste criado para homologação da importação"/>
      </label>}
     <div className="flex flex-wrap gap-2">
      {comps.data?.find(c=>c.id===excluirId)?.arquivada_em?
       <Button size="sm" variant="outline" disabled={restaurar.isPending||
         (motivoExcluir[excluirId]??"").trim().length<20}
        onClick={()=>{if(window.confirm("Restaurar esta competência com seu histórico?"))
         restaurar.mutate(excluirId);}}>
        <RotateCcw className="mr-1 h-4 w-4"/>Restaurar competência</Button>:
       comps.data?.find(c=>c.id===excluirId)?.status==="encerrada"?null:
       <>
        {comps.data?.find(c=>c.id===excluirId)?.status==="preparacao"&&
         <Button size="sm" variant="destructive" disabled={excluir.isPending||
           (motivoExcluir[excluirId]??"").trim().length<20}
          onClick={()=>{if(window.confirm("Excluir definitivamente apenas se o rascunho não tiver evidências?"))
           excluir.mutate(excluirId);}}>Excluir rascunho vazio</Button>}
        <Button size="sm" variant="outline" disabled={arquivar.isPending||
          (motivoExcluir[excluirId]??"").trim().length<20}
         onClick={()=>{if(window.confirm("Arquivar e retirar da lista ativa? As evidências permanecem e a competência poderá ser restaurada."))
          arquivar.mutate(excluirId);}}>
          <Archive className="mr-1 h-4 w-4"/>Arquivar e retirar da lista</Button>
       </>}
      <Button size="sm" variant="ghost" onClick={()=>setExcluirId(null)}>Cancelar</Button>
     </div>
   </div>}
  </CardContent></Card>
 </div>;
}
