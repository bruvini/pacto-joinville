import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, History, Scale, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { brl } from "@/lib/format";
import { invalidarEmendas } from "@/hooks/useEmendas";
import { linkHttpsValido, saldoCadastro, type EmendaAjuste } from "@/lib/emendas/cadastro";
import { normalizarLinkSei } from "@/lib/sei";
import type { Tables } from "@/integrations/supabase/types";

type Historico=Tables<"emenda_historico">;
const dataBr=(v:string)=>new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
function descrEvento(row:Historico) {
  const prefixo:Record<string,string>={emendas:"Cadastro da emenda",emenda_documentos:"Documento SEI",emenda_fontes:"Dotação/fonte",emenda_ajustes_valor:"Ajuste formal"};
  return (prefixo[row.tabela]??row.tabela)+" · "+({INSERT:"incluído",UPDATE:"atualizado",DELETE:"excluído"} as Record<string,string>)[row.acao];
}
export function AjustesEHistoricoEmenda({emendaId,valorInicial,ajustes,historico,podeEditar,encerrada}:{
  emendaId:string;valorInicial:number;ajustes:EmendaAjuste[];historico:Historico[];
  podeEditar:boolean;encerrada:boolean;
}) {
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [modo,setModo]=useState<"acrescimo"|"reducao">("acrescimo");
  const [valor,setValor]=useState(0);
  const [motivo,setMotivo]=useState("");
  const [numero,setNumero]=useState("");
  const [link,setLink]=useState("");
  const [erro,setErro]=useState("");
  const saldo=useMemo(()=>saldoCadastro(Number(valorInicial),ajustes),[valorInicial,ajustes]);
  const registrar=useMutation({
    mutationFn:async()=>{
      if(!Number.isFinite(valor)||valor<=0) throw Error("Informe o valor da movimentação.");
      if(motivo.trim().length<10)throw Error("Justificativa deve conter ao menos dez caracteres.");
      if(!numero.trim()||!link.trim()||!linkHttpsValido(link))
        throw Error("Informe o número e o link SEI HTTPS do ato autorizativo.");
      const variacao=(modo==="reducao"?-1:1)*Math.round(valor*100)/100;
      if(saldo+variacao<0)throw Error("O limite vigente não pode ficar negativo.");
      const r=await supabase.rpc("emenda_registrar_ajuste",{
        p_emenda_id:emendaId,p_variacao:variacao,p_motivo:motivo.trim(),
        p_documento_sei_numero:numero.trim(),p_documento_sei_link:normalizarLinkSei(link),
      });
      if(r.error)throw r.error;
    },
    onSuccess:async()=>{
      await invalidarEmendas(qc);setOpen(false);setValor(0);setMotivo("");setNumero("");setLink("");
      toast.success("Movimentação formal registrada; valor original preservado.");
    },
    onError:e=>setErro(e.message),
  });
  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4"/>Limite autorizado e alterações formais</CardTitle>
          <CardDescription>Não representa saldo disponível para novos empenhos, pois a execução financeira será implementada nas próximas fases.</CardDescription>
        </div>
        {podeEditar&&!encerrada&&<Button size="sm" onClick={()=>{setErro("");setOpen(true);}}><Plus className="mr-1 h-4 w-4"/>Ajustar valor</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Autorizado inicial</p><b className="text-lg tabular-nums">{brl(valorInicial)}</b></div>
          <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Movimentações formais</p><b className="text-lg tabular-nums">{ajustes.length}</b></div>
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Limite vigente</p><b className="text-lg tabular-nums text-primary">{brl(saldo)}</b></div>
        </div>
        {ajustes.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2">
            {Number(a.variacao)>=0?<ArrowUpRight className="h-4 w-4 text-emerald-600"/>:<ArrowDownRight className="h-4 w-4 text-amber-600"/>}
            <div>
              <p><strong>{Number(a.variacao)>=0?"+":"−"}{brl(Math.abs(Number(a.variacao)))}</strong> · {dataBr(a.registrado_em)}</p>
              <p className="text-xs text-muted-foreground">{a.motivo}</p>
              <p className="text-xs text-muted-foreground">{brl(Number(a.valor_anterior))} → {brl(Number(a.valor_novo))}</p>
            </div>
          </div><SeiButton href={a.documento_sei_link} label={"SEI "+a.documento_sei_numero}/>
        </div>)}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4"/>Histórico e rastreabilidade</CardTitle>
        <CardDescription>Registros automáticos de cadastro, atualização de documentos, fontes e ajustes; até 150 eventos recentes.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {historico.length===0?<p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>:
          historico.map(h=><div key={h.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0">
            <Badge variant="outline">{h.acao}</Badge><span>{descrEvento(h)}</span>
            <span className="ml-auto text-xs text-muted-foreground">{dataBr(h.ocorrido_em)}</span>
          </div>)}
      </CardContent>
    </Card>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Movimentação formal do valor autorizado</DialogTitle>
          <DialogDescription>A operação será registrada com documento SEI e não poderá ser excluída ou editada silenciosamente.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Tipo de ajuste</Label>
            <Select value={modo} onValueChange={v=>setModo(v as "acrescimo"|"reducao")}>
              <SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="acrescimo">Acréscimo</SelectItem><SelectItem value="reducao">Redução</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Valor absoluto do ajuste *</Label><CurrencyInput value={valor} onChange={setValor}/></div>
          <div className="rounded-md border bg-muted/20 p-2 text-xs">Limite após ajuste: <b>{brl(saldo+(modo==="reducao"?-valor:valor))}</b></div>
          <div className="space-y-1"><Label>Justificativa formal *</Label><Textarea rows={3} value={motivo} onChange={e=>setMotivo(e.target.value)}/></div>
          <div className="space-y-1"><Label>Número do documento SEI *</Label><Input value={numero} onChange={e=>setNumero(e.target.value)}/></div>
          <div className="space-y-1"><Label>Link SEI HTTPS *</Label><Input value={link} onChange={e=>setLink(e.target.value)}/></div>
          {erro&&<p className="text-sm text-destructive" role="alert">{erro}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
          <Button disabled={registrar.isPending} onClick={()=>registrar.mutate()}>Registrar ajuste</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
