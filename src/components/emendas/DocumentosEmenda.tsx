import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Pencil, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkHttpsValido, CATEGORIAS_DOCUMENTO, type EmendaDocumento } from "@/lib/emendas/cadastro";
import { normalizarLinkSei } from "@/lib/sei";
import { invalidarEmendas } from "@/hooks/useEmendas";

type Form = Pick<EmendaDocumento,"categoria" | "tipo" | "numero_sei" | "link_sei" | "data_documento" | "descricao" | "situacao" | "origem">;
const empty=():Form=>({categoria:"normativa",tipo:"",numero_sei:"",link_sei:"",data_documento:null,descricao:"",situacao:"informado",origem:null});
const situacoes=["informado","conferido","substituido","cancelado"];
const labels:Record<string,string>={normativa:"Normativa",administrativa:"Administrativa",processo:"Processo SEI",financeira:"Financeira",outros:"Outros"};

export function DocumentosEmenda({emendaId,documentos,podeEditar}:{emendaId:string;documentos:EmendaDocumento[];podeEditar:boolean}) {
  const qc=useQueryClient();
  const [aberto,setAberto]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [f,setF]=useState<Form>(empty);
  const [erro,setErro]=useState("");
  const abrir=(doc?:EmendaDocumento)=>{
    setEditId(doc?.id??null);setF(doc?{
      categoria:doc.categoria,tipo:doc.tipo,numero_sei:doc.numero_sei,link_sei:doc.link_sei,
      data_documento:doc.data_documento,descricao:doc.descricao,situacao:doc.situacao,origem:doc.origem,
    }:empty());setErro("");setAberto(true);
  };
  const save=useMutation({
    mutationFn:async()=>{
      if(f.tipo.trim().length<2||!f.numero_sei.trim()||!linkHttpsValido(f.link_sei)||!f.link_sei.trim())
        throw new Error("Informe tipo, número SEI e link HTTPS válido.");
      const dados={...f,tipo:f.tipo.trim(),numero_sei:f.numero_sei.trim(),
        link_sei:normalizarLinkSei(f.link_sei),descricao:f.descricao.trim()};
      const q=editId
        ? await supabase.from("emenda_documentos").update(dados).eq("id",editId).eq("emenda_id",emendaId)
        : await supabase.from("emenda_documentos").insert({...dados,emenda_id:emendaId});
      if(q.error)throw q.error;
    },
    onSuccess:async()=>{await invalidarEmendas(qc);setAberto(false);toast.success("Documento registrado com rastreabilidade.");},
    onError:e=>setErro(e.message),
  });
  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4"/>Documentos e normas</CardTitle>
        <CardDescription>Múltiplos atos por categoria, com número, link, data e situação. O histórico permanece registrado.</CardDescription>
      </div>
      {podeEditar&&<Button size="sm" onClick={()=>abrir()}><FilePlus2 className="mr-1 h-4 w-4"/>Documento</Button>}
    </CardHeader>
    <CardContent className="space-y-2">
      {documentos.length===0?<p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhum documento cadastrado.</p>:
        documentos.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-sm">{d.tipo}</b><Badge variant="outline">{labels[d.categoria]??d.categoria}</Badge>
              <Badge variant={d.situacao==="conferido"?"default":"secondary"}>{d.situacao}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">SEI {d.numero_sei} · {d.data_documento?new Date(d.data_documento+"T12:00:00").toLocaleDateString("pt-BR"):"Data não informada"}</p>
            {d.descricao&&<p className="mt-1 text-xs text-muted-foreground">{d.descricao}</p>}
          </div>
          <div className="flex items-center gap-2">
            <SeiButton href={d.link_sei} label="SEI"/>
            {podeEditar&&<Button variant="outline" size="icon" aria-label="Editar documento" onClick={()=>abrir(d)}><Pencil className="h-4 w-4"/></Button>}
          </div>
        </div>)}
    </CardContent>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editId?"Atualizar documento":"Novo documento da emenda"}</DialogTitle>
          <DialogDescription>Não substitui a assinatura ou publicação efetiva no SEI.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Categoria *</Label><Select value={f.categoria} onValueChange={v=>setF(p=>({...p,categoria:v}))}>
            <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATEGORIAS_DOCUMENTO.map(v=><SelectItem key={v} value={v}>{labels[v]}</SelectItem>)}</SelectContent>
          </Select></div>
          <div className="space-y-1"><Label>Tipo de documento *</Label><Input value={f.tipo} onChange={e=>setF(p=>({...p,tipo:e.target.value}))} placeholder="Portaria, memorando, autorização..."/></div>
          <div className="space-y-1"><Label>Número do documento SEI *</Label><Input value={f.numero_sei} onChange={e=>setF(p=>({...p,numero_sei:e.target.value}))}/></div>
          <div className="space-y-1"><Label>Data do documento</Label><Input type="date" value={f.data_documento??""} onChange={e=>setF(p=>({...p,data_documento:e.target.value||null}))}/></div>
          <div className="space-y-1 sm:col-span-2"><Label>Link SEI (HTTPS) *</Label><Input value={f.link_sei} onChange={e=>setF(p=>({...p,link_sei:e.target.value}))}/></div>
          <div className="space-y-1"><Label>Situação</Label><Select value={f.situacao} onValueChange={v=>setF(p=>({...p,situacao:v}))}>
            <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{situacoes.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Origem/órgão emissor</Label><Input value={f.origem??""} onChange={e=>setF(p=>({...p,origem:e.target.value||null}))}/></div>
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea value={f.descricao} onChange={e=>setF(p=>({...p,descricao:e.target.value}))}/></div>
        </div>
        {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={()=>setAberto(false)}>Cancelar</Button><Button disabled={save.isPending} onClick={()=>save.mutate()}>Salvar documento</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
