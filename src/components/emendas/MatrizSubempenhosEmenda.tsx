import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";

export const TIPOS_SUBEMENDA=[
 ["solicitacao_liquidacao","1. Solicitação de Subempenho / Liquidação"],
 ["movimento_liquidacao","2. Aviso de Movimento — Empenho em Liquidação"],
 ["aviso_subempenho","3. Aviso de Movimento — Subempenho"],
] as const;
export type TipoDocumentoEmenda=(typeof TIPOS_SUBEMENDA)[number][0];
type Politica=Tables<"emenda_subempenho_matrizes">;

export function MatrizSubempenhosEmenda({
 emendaId,matrizes,podeAdministrar,onAtualizar
}:{
 emendaId:string;matrizes:Politica[];podeAdministrar:boolean;onAtualizar:()=>Promise<void>;
}){
 return <section className="space-y-3 rounded-lg border bg-muted/10 p-3">
  <header>
   <h3 className="text-sm font-semibold">Matriz documental e de assinaturas · Emendas</h3>
   <p className="text-xs text-muted-foreground">
    Configuração própria da emenda, com referência formal no SEI. Nenhuma assinatura
    exigida no PVH é copiada automaticamente. As versões já utilizadas permanecem preservadas.
   </p>
  </header>
  <div className="grid gap-3 lg:grid-cols-3">
   {TIPOS_SUBEMENDA.map(([tipo,titulo])=><PoliticaEtapa
    key={tipo} tipo={tipo} titulo={titulo} emendaId={emendaId}
    politica={matrizes.find(x=>x.tipo===tipo&&x.ativa)}
    podeAdministrar={podeAdministrar} onAtualizar={onAtualizar}/>)}
  </div>
 </section>;
}

function PoliticaEtapa({tipo,titulo,emendaId,politica,podeAdministrar,onAtualizar}:{
 tipo:TipoDocumentoEmenda;titulo:string;emendaId:string;politica?:Politica;
 podeAdministrar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [editar,setEditar]=useState(false);
 const [grupos,setGrupos]=useState("");
 const [envio,setEnvio]=useState(tipo==="movimento_liquidacao");
 const [destino,setDestino]=useState(tipo==="movimento_liquidacao"?"SEFAZ.UAF.ADE":"");
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [justificativa,setJustificativa]=useState("");
 const homologar=useMutation({
  mutationFn:async()=>{
   const nomes=grupos.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   if(tipo==="movimento_liquidacao"&&!envio)throw Error("O encaminhamento à SEFAZ.UAF.ADE é obrigatório.");
   if(!numero.trim()||!/^https:\/\/\S+$/i.test(link.trim())||justificativa.trim().length<10)
    throw Error("Informe referência SEI, link HTTPS e justificativa formal.");
   if(new Set(nomes).size!==nomes.length)throw Error("Há grupos repetidos.");
   const r=await supabase.rpc("emenda_sub_matriz_homologar",{
    p_emenda:emendaId,p_tipo:tipo,p_grupos:nomes,
    p_exige_encaminhamento:envio,p_destino:envio?destino.trim():null,
    p_numero_sei:numero.trim(),p_link_sei:link.trim(),p_justificativa:justificativa.trim(),
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{setEditar(false);await onAtualizar();toast.success("Nova matriz homologada com histórico.");},
  onError:(e:Error)=>toast.error(e.message),
 });
 return <div className="space-y-2 rounded-md border bg-background p-3">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <p className="text-xs font-medium">{titulo}</p>
   <Badge variant={politica?"secondary":"outline"}>
    {politica?"Versão "+politica.versao:"Pendente"}
   </Badge>
  </div>
  {politica?<div className="space-y-1 text-[11px]">
   <p>Grupos exigidos: {politica.grupos_obrigatorios.length?
    politica.grupos_obrigatorios.join(" · "):"Nenhum, por homologação expressa"}</p>
   <p>Encaminhamento: {politica.exige_encaminhamento?
    politica.destino_encaminhamento:"Não exigido"}</p>
   <a href={politica.referencia_link_sei} target="_blank" rel="noopener noreferrer"
    className="text-primary underline">Referência SEI {politica.referencia_sei}</a>
  </div>:<p className="text-xs text-amber-700">
   Documento e avanço bloqueados até homologação administrativa.
  </p>}
  {podeAdministrar&&<Button size="sm" variant="outline" onClick={()=>setEditar(v=>!v)}>
   {editar?"Fechar configuração":politica?"Homologar nova versão":"Homologar matriz"}
  </Button>}
  {editar&&podeAdministrar&&<div className="space-y-2 border-t pt-3">
   <p className="text-[11px] text-muted-foreground">
    Informe um nome de grupo obrigatório por linha. Para não exigir assinatura,
    deixe vazio e documente essa decisão na referência SEI.
   </p>
   <Label className="text-xs" htmlFor={"grupos-"+tipo}>Grupos de assinatura exigíveis</Label>
   <Textarea id={"grupos-"+tipo} rows={3} value={grupos}
    onChange={e=>setGrupos(e.target.value)} placeholder={"Ex.: Fiscal\nGerência ACP"}/>
   <label className="flex items-center gap-2 text-xs">
    <input type="checkbox" checked={envio} disabled={tipo==="movimento_liquidacao"}
     onChange={e=>setEnvio(e.target.checked)}/>
    Exigir confirmação de encaminhamento
   </label>
   {envio&&<>
    <Label htmlFor={"destino-"+tipo} className="text-xs">Destino institucional</Label>
    <Input id={"destino-"+tipo} value={destino}
     disabled={tipo==="movimento_liquidacao"} onChange={e=>setDestino(e.target.value)}/>
   </>}
   <Label htmlFor={"ref-"+tipo} className="text-xs">Número da referência SEI</Label>
   <Input id={"ref-"+tipo} value={numero} onChange={e=>setNumero(e.target.value)}/>
   <Label htmlFor={"link-"+tipo} className="text-xs">Link da referência SEI</Label>
   <Input id={"link-"+tipo} value={link} onChange={e=>setLink(e.target.value)}/>
   <Label htmlFor={"just-"+tipo} className="text-xs">Justificativa da homologação</Label>
   <Textarea id={"just-"+tipo} rows={2} value={justificativa}
    onChange={e=>setJustificativa(e.target.value)}/>
   <Button size="sm" disabled={homologar.isPending} onClick={()=>homologar.mutate()}>
    Homologar versão
   </Button>
  </div>}
 </div>;
}
