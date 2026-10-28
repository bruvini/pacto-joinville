import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { brl } from "@/lib/format";
import { type EmendaFonte, linkHttpsValido } from "@/lib/emendas/cadastro";
import { normalizarLinkSei } from "@/lib/sei";
import { invalidarEmendas } from "@/hooks/useEmendas";

type Form=Pick<EmendaFonte,"exercicio"|"dotacao"|"fonte"|"valor_referencia"|"documento_sei_numero"|"documento_sei_link"|"observacoes"|"ativa">;
const empty=(ano:number):Form=>({exercicio:ano,dotacao:"",fonte:"",valor_referencia:null,documento_sei_numero:null,documento_sei_link:null,observacoes:"",ativa:true});

export function FontesEmenda({emendaId,exercicio,fontes,podeEditar}:{emendaId:string;exercicio:number;fontes:EmendaFonte[];podeEditar:boolean}){
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [f,setF]=useState<Form>(empty(exercicio));
  const [erro,setErro]=useState("");
  const abrir=(v?:EmendaFonte)=>{
    setEditId(v?.id??null);
    setF(v?{exercicio:v.exercicio,dotacao:v.dotacao,fonte:v.fonte,
      valor_referencia:v.valor_referencia,documento_sei_numero:v.documento_sei_numero,
      documento_sei_link:v.documento_sei_link,observacoes:v.observacoes,ativa:v.ativa}:empty(exercicio));
    setErro("");setOpen(true);
  };
  const save=useMutation({
    mutationFn:async()=>{
      if(!Number.isInteger(f.exercicio)||f.exercicio<2000||f.exercicio>2100)
        throw Error("Exercício inválido.");
      if(!f.dotacao.trim()||!f.fonte.trim())throw Error("Informe dotação e fonte.");
      if(f.valor_referencia!=null&&(!Number.isFinite(f.valor_referencia)||f.valor_referencia<0))
        throw Error("Valor de referência inválido.");
      if(!linkHttpsValido(f.documento_sei_link))throw Error("Link SEI deve utilizar HTTPS.");
      const dados={...f,dotacao:f.dotacao.trim(),fonte:f.fonte.trim(),observacoes:f.observacoes.trim(),
        documento_sei_link:f.documento_sei_link?normalizarLinkSei(f.documento_sei_link):null};
      const r=editId
        ? await supabase.from("emenda_fontes").update(dados).eq("id",editId).eq("emenda_id",emendaId)
        : await supabase.from("emenda_fontes").insert({...dados,emenda_id:emendaId});
      if(r.error)throw r.error;
    },
    onSuccess:async()=>{await invalidarEmendas(qc);setOpen(false);toast.success("Classificação financeira registrada.");},
    onError:e=>setErro(e.message),
  });
  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-2">
      <div><CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4"/>Dotação e fontes</CardTitle>
        <CardDescription>Referências de autorização ou disponibilidade financeira. Não representam empenho ou pagamento.</CardDescription></div>
      {podeEditar&&<Button size="sm" onClick={()=>abrir()}><Plus className="mr-1 h-4 w-4"/>Fonte</Button>}
    </CardHeader>
    <CardContent className="space-y-2">
      {!fontes.length?<p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhuma dotação/fonte cadastrada.</p>:
        fontes.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm"><strong>Dotação {item.dotacao} · Fonte {item.fonte}</strong><Badge variant={item.ativa?"secondary":"outline"}>{item.ativa?"Ativa":"Inativa"}</Badge></div>
            <p className="text-xs text-muted-foreground">Exercício {item.exercicio} · Valor de referência {item.valor_referencia==null?"não declarado":brl(Number(item.valor_referencia))}</p>
            {item.observacoes&&<p className="text-xs text-muted-foreground">{item.observacoes}</p>}
          </div>
          <div className="flex items-center gap-2">
            {item.documento_sei_link&&<SeiButton href={item.documento_sei_link} label="SEI"/>}
            {podeEditar&&<Button variant="outline" size="icon" aria-label="Editar dotação" onClick={()=>abrir(item)}><Pencil className="h-4 w-4"/></Button>}
          </div>
        </div>)}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editId?"Editar fonte":"Adicionar classificação financeira"}</DialogTitle>
          <DialogDescription>As referências podem ser diferentes do limite global autorizado da emenda.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Exercício *</Label><Input type="number" min={2000} max={2100} value={f.exercicio} onChange={e=>setF(p=>({...p,exercicio:Number(e.target.value)}))}/></div>
          <div className="space-y-1"><Label>Dotação *</Label><Input value={f.dotacao} onChange={e=>setF(p=>({...p,dotacao:e.target.value}))}/></div>
          <div className="space-y-1"><Label>Fonte *</Label><Input value={f.fonte} onChange={e=>setF(p=>({...p,fonte:e.target.value}))}/></div>
          <div className="space-y-1"><Label>Valor de referência (opcional)</Label>
            <CurrencyInput value={f.valor_referencia} onChange={v=>setF(p=>({...p,valor_referencia:v}))}/></div>
          <div className="space-y-1"><Label>Número SEI da autorização</Label><Input value={f.documento_sei_numero??""} onChange={e=>setF(p=>({...p,documento_sei_numero:e.target.value||null}))}/></div>
          <div className="space-y-1"><Label>Link SEI da autorização</Label><Input value={f.documento_sei_link??""} onChange={e=>setF(p=>({...p,documento_sei_link:e.target.value||null}))}/></div>
          <div className="sm:col-span-2 space-y-1"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={e=>setF(p=>({...p,observacoes:e.target.value}))}/></div>
          <div className="sm:col-span-2 flex items-center gap-2"><Checkbox checked={f.ativa} onCheckedChange={x=>setF(p=>({...p,ativa:x===true}))}/><Label>Classificação vigente</Label></div>
        </div>
        {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={save.isPending} onClick={()=>save.mutate()}>Salvar classificação</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
