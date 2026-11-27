import {useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {CheckCircle2} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {useHistoricoAssinaturasManuais} from "@/hooks/useHistoricoAssinaturasManuais";
import {SeiLink} from "@/components/inputs/SeiLink";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {GRUPO_COMISSAO_SUBEMPENHO,GRUPO_FISCAL_SUBEMPENHO}
 from "@/components/emendas/MatrizSubempenhosEmenda";

type Doc=Tables<"emenda_subempenho_documentos_painel">;
type Ass=Tables<"emenda_subempenho_assinaturas">;
type Politica=Tables<"emenda_subempenho_matrizes">;

type Slot="comissao"|"fiscal";
const cargoComissao="Membro da Comissão de Gestão e Controle de Despesa";

export function AssinaturasSubempenhoEmenda({documento,matriz,assinaturas,podeEditar,onAtualizar}:{
 documento:Doc;matriz?:Politica;assinaturas:Ass[];podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const historico=useHistoricoAssinaturasManuais();
 const pool=useQuery({
  queryKey:["assinaturas_config","emendas-subempenho"],
  queryFn:async()=>{
   const r=await supabase.from("assinaturas_config").select("*")
    .eq("ativo",true).order("ordem").order("nome_servidor");
   if(r.error)throw r.error;
   return r.data??[];
  },staleTime:300000,
 });
 const comissaoExigida=(matriz?.grupos_obrigatorios??documento.grupos_obrigatorios??[])
  .includes(GRUPO_COMISSAO_SUBEMPENHO);
 const fiscalAdmitido=(matriz?.grupos_opcionais??[]).includes(GRUPO_FISCAL_SUBEMPENHO)||
  (matriz?.grupos_obrigatorios??[]).includes(GRUPO_FISCAL_SUBEMPENHO);
 const [nomeComissao,setNomeComissao]=useState("");
 const [fiscalSelecionado,setFiscalSelecionado]=useState("");
 const [numeroSei,setNumeroSei]=useState(documento.numero_sei??"");
 const [linkSei,setLinkSei]=useState(documento.link_sei??"");
 const [data,setData]=useState(documento.data_documento??"");
 const fiscais=(pool.data??[]).filter(p=>p.cargo==="Fiscal"&&p.ativo!==false);
 const assComissao=assinaturas.find(a=>a.grupo===GRUPO_COMISSAO_SUBEMPENHO);
 const assFiscal=assinaturas.find(a=>a.grupo===GRUPO_FISCAL_SUBEMPENHO);
 const salvar=useMutation({mutationFn:async(slot:Slot)=>{
  const pessoa=slot==="fiscal"?fiscais.find(p=>p.id===fiscalSelecionado):null;
  const nome=slot==="comissao"?nomeComissao.trim():pessoa?.nome_servidor?.trim()??"";
  const cargo=slot==="comissao"?cargoComissao:"Fiscal";
  const grupo=slot==="comissao"?GRUPO_COMISSAO_SUBEMPENHO:GRUPO_FISCAL_SUBEMPENHO;
  if(nome.length<3)throw Error("Informe ou selecione quem realmente assinou o documento.");
  if(!numeroSei.trim()||!/^https:\/\/\S+$/i.test(linkSei.trim())||!data)
   throw Error("Informe a evidência SEI e a data real da assinatura.");
  const documentoId=documento.id;
  if(!documentoId)throw Error("Documento de subempenho não localizado.");
  const r=await supabase.rpc("emenda_subempenho_assinar",{
   p_documento:documentoId,p_grupo:grupo,p_signatario:nome,p_cargo:cargo,
   p_numero_sei:numeroSei.trim(),p_link_sei:linkSei.trim(),p_data:data,
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{
  setNomeComissao("");setFiscalSelecionado("");
  await onAtualizar();
  toast.success("Assinatura conferida com a evidência SEI.");
 },onError:(e:Error)=>toast.error(e.message)});

 const assinado=(a:Ass)=><div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600"/>
  <div className="min-w-0 flex-1">
   <p className="text-xs font-medium">{a.signatario_nome}</p>
   <p className="text-[11px] text-muted-foreground">{a.cargo_signatario} · {a.data_assinatura}</p>
  </div>
  <a href={a.link_sei} target="_blank" rel="noopener noreferrer"
   className="text-xs text-primary underline">SEI {a.numero_sei}</a>
 </div>;

 return <div className="space-y-3 rounded-lg border bg-muted/10 p-3" aria-label="Matriz de assinaturas do subempenho">
  <div className="flex flex-wrap items-center gap-2">
   <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    Matriz de assinaturas
   </h5>
   <Badge variant={comissaoExigida&&!assComissao?"outline":"secondary"}>
    {comissaoExigida&&!assComissao?"Comissão pendente":"Assinaturas obrigatórias conferidas"}
   </Badge>
  </div>
  {fiscalAdmitido&&<div className="grid gap-2 md:grid-cols-[220px_1fr] md:items-center">
   <div>
    <p className="text-xs font-medium">Fiscal</p>
    <p className="text-[11px] text-muted-foreground">
     {matriz?.grupos_obrigatorios.includes(GRUPO_FISCAL_SUBEMPENHO)?"Obrigatório":"Opcional"}
    </p>
   </div>
   {assFiscal?assinado(assFiscal):podeEditar?
    <div className="flex flex-wrap gap-2">
     <div className="min-w-[210px] flex-1">
      <Select value={fiscalSelecionado} onValueChange={setFiscalSelecionado}>
       <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder="Selecionar fiscal cadastrado"/>
       </SelectTrigger>
       <SelectContent>
        {fiscais.map(p=><SelectItem key={p.id} value={p.id}>
         {p.nome_servidor}
        </SelectItem>)}
       </SelectContent>
      </Select>
     </div>
     <Button size="sm" variant="outline" disabled={!fiscalSelecionado||salvar.isPending}
      onClick={()=>salvar.mutate("fiscal")}>Conferir assinatura</Button>
     {!fiscais.length&&<p className="w-full text-xs text-muted-foreground">
      Nenhum Fiscal ativo no cadastro. Assinatura opcional não bloqueia a etapa.
     </p>}
    </div>:<span className="text-xs text-muted-foreground">Não informado</span>}
  </div>}
  {comissaoExigida&&<div className="grid gap-2 md:grid-cols-[220px_1fr] md:items-center">
   <div>
    <p className="text-xs font-medium">Membro da Comissão de Gestão e Controle de Despesa</p>
    <p className="text-[11px] text-muted-foreground">
     Obrigatório · digite ou escolha um nome já registrado
    </p>
   </div>
   {assComissao?assinado(assComissao):podeEditar?
    <div className="flex flex-wrap gap-2">
     <Input className="h-9 min-w-[210px] flex-1 text-xs"
      value={nomeComissao} onChange={e=>setNomeComissao(e.target.value)}
      placeholder="Digite ou selecione um nome já registrado"
      list={"emenda-comissao-historico-"+documento.id}/>
     <datalist id={"emenda-comissao-historico-"+documento.id}>
      {(historico.data??[]).filter(p=>p.slot==="comissao")
       .map(p=><option key={p.nome} value={p.nome}/>)}
     </datalist>
     <Button size="sm" disabled={!nomeComissao.trim()||salvar.isPending}
      onClick={()=>salvar.mutate("comissao")}>Conferir assinatura</Button>
    </div>:<span className="text-xs text-destructive">Pendente</span>}
  </div>}
  {podeEditar&&((fiscalAdmitido&&!assFiscal)||(comissaoExigida&&!assComissao))&&
   <div className="space-y-2 border-t pt-3">
    <p className="text-xs font-medium">Evidência da assinatura no SEI</p>
    <p className="text-[11px] text-muted-foreground">
     Número e link do documento sugeridos automaticamente.
     Confira se correspondem à assinatura real; altere se necessário.
     Nenhuma assinatura é registrada antes de clicar em Conferir assinatura.
    </p>
    <div className="grid gap-2 md:grid-cols-[190px_minmax(240px,1fr)_170px]">
     <div className="space-y-1">
      <Label className="text-xs">Número SEI</Label>
      <Input value={numeroSei} onChange={e=>setNumeroSei(e.target.value)}/>
     </div>
     <div className="space-y-1">
      <Label className="text-xs">Link SEI</Label>
      <SeiLink value={linkSei} onChange={setLinkSei}/>
     </div>
     <div className="space-y-1">
      <Label className="text-xs">Data real da assinatura</Label>
      <Input type="date" value={data} onChange={e=>setData(e.target.value)}/>
     </div>
    </div>
   </div>}
  {pool.error&&<p role="alert" className="text-xs text-destructive">
   O cadastro de fiscais não pôde ser consultado: {pool.error.message}
  </p>}
 </div>;
}
