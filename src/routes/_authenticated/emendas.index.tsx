import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, FileText, Landmark, Plus, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useCatalogosEmendas, useListaEmendas, invalidarEmendas } from "@/hooks/useEmendas";
import { FormularioEmenda } from "@/components/emendas/FormularioEmenda";
import { type CadastroEmenda, nomeSituacao } from "@/lib/emendas/cadastro";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/emendas/")({
  head:()=>({meta:[{title:"Emendas Parlamentares | PACTO Joinville"}]}),
  component:EmendasIndex,
});
function EmendasIndex(){
  const {roles}=useAuth();
  const podeEditar=hasRole(roles,"acp");
  const [dialog,setDialog]=useState(false);
  const [busca,setBusca]=useState("");
  const [situacao,setSituacao]=useState("todas");
  const qc=useQueryClient();
  const navigate=useNavigate();
  const catalogos=useCatalogosEmendas();
  const lista=useListaEmendas();
  const cadastro=lista.data?.cadastro??[];
  const resumo=lista.data?.resumo??[];
  const vigentePorId=new Map(resumo.map(x=>[x.id,Number(x.valor_autorizado_vigente??x.valor_autorizado_inicial??0)]));
  const livrePorId=new Map(resumo.map(x=>[x.id,Number(x.saldo_disponivel??x.valor_autorizado_vigente??0)]));
  const instit = new Map(catalogos.prestadores.map(x=>[x.id,x.nome_instituicao]));
  const filtrados=useMemo(()=>cadastro.filter(x=>{
    if(situacao!=="todas"&&x.situacao!==situacao)return false;
    const texto=[x.numero,x.objeto,x.autoria_parlamentar,x.numero_proposta, instit.get(x.prestador_id)].join(" ").toLocaleLowerCase("pt-BR");
    return texto.includes(busca.trim().toLocaleLowerCase("pt-BR"));
  }),[cadastro,situacao,busca,catalogos.prestadores]);
  const criar=useMutation({
    mutationFn:async(form:CadastroEmenda)=>{
      const {data,error}=await supabase.from("emendas").insert(form).select("id").single();
      if(error)throw error;
      return data.id;
    },
    onSuccess:async id=>{
      await invalidarEmendas(qc);setDialog(false);
      toast.success("Emenda cadastrada. Informe documentos e dotações na página de detalhes.");
      await navigate({to:"/emendas/$id",params:{id}});
    },
  });
  return <div className="space-y-5">
    <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-2">
          <Badge variant="outline">Emendas · Cadastro e solicitações de empenho</Badge>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary"><Landmark className="h-6 w-6"/>Execução de Emendas Parlamentares</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Cadastre a emenda, sua portaria municipal, documentos, valores e rendimentos. Abra competências e formalize solicitações mensais, trimestrais ou anuais, com reserva gerencial e notas individualizadas.
          </p>
        </div>
        {podeEditar&&<Button onClick={()=>setDialog(true)}><Plus className="mr-2 h-4 w-4"/>Nova emenda</Button>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card/75 p-3"><p className="text-xs text-muted-foreground">Emendas cadastradas</p><b className="text-xl">{cadastro.length}</b></div>
        <div className="rounded-lg border bg-card/75 p-3"><p className="text-xs text-muted-foreground">Emendas ativas</p><b className="text-xl">{cadastro.filter(x=>x.situacao==="ativa").length}</b></div>
        <div className="rounded-lg border bg-card/75 p-3"><p className="text-xs text-muted-foreground">Limite total da emenda + rendimentos + ajustes</p>
          <b className="text-xl tabular-nums">{brl(cadastro.reduce((a,x)=>a+(vigentePorId.get(x.id)??Number(x.valor_autorizado_inicial)),0))}</b>
        </div>
      </div>
    </section>
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
      <p><b className="text-foreground">Escopo da Fase 2:</b> cadastro, competências globais, solicitações, reservas e registro de NEs emitidas. Pagamentos, liberações e anulações virão nas próximas fases. Nenhum valor representa execução automática na SEFAZ.</p>
    </div>
    <Card>
      <CardHeader><CardTitle className="text-base">Emendas cadastradas</CardTitle>
        <CardDescription>Filtre por situação, instituição, objeto ou número e abra a emenda para conferir os dados e documentos.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[minmax(200px,1fr)_190px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
            <Input className="pl-9" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Número, instituição, objeto, autoria..."/></div>
          <Select value={situacao} onValueChange={setSituacao}><SelectTrigger aria-label="Filtrar situação"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas as situações</SelectItem>{["cadastrada","ativa","suspensa","encerrada"].map(v=><SelectItem key={v} value={v}>{nomeSituacao(v)}</SelectItem>)}</SelectContent></Select>
        </div>
        {lista.isPending||catalogos.loading?<p className="p-4 text-sm text-muted-foreground">Carregando emendas...</p>:
          lista.error||catalogos.error?<div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            Não foi possível consultar o módulo. Verifique se a migration da Fase 1 foi aplicada e se o usuário possui acesso. {String((lista.error||catalogos.error)?.message??"")}
          </div>:
          filtrados.length===0?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma emenda encontrada para os filtros selecionados.</p>:
          <div className="grid gap-3 lg:grid-cols-2">
            {filtrados.map(e=><Link key={e.id} to="/emendas/$id" params={{id:e.id}}
              className="group block rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/20">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1"><p className="text-sm font-bold text-primary">{e.numero}</p>
                  <p className="text-xs text-muted-foreground">{instit.get(e.prestador_id)??"Instituição não localizada"}</p></div>
                <div className="flex items-center gap-2"><Badge variant="secondary">{nomeSituacao(e.situacao)}</Badge><ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary"/></div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm">{e.objeto}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                <span className="text-muted-foreground">{e.modalidade} · {e.autoria_parlamentar}</span>
                <div className="text-right"><strong className="block text-sm tabular-nums">{brl(vigentePorId.get(e.id)??Number(e.valor_autorizado_inicial))}</strong><span className="text-[11px] text-muted-foreground">Livre para novos empenhos: {brl(livrePorId.get(e.id)??0)}</span></div>
              </div>
            </Link>)}
          </div>}
      </CardContent>
    </Card>
    <Dialog open={dialog} onOpenChange={setDialog}>
      <DialogContent className="max-h-[95vh] w-[min(98vw,1000px)] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Emenda Parlamentar</DialogTitle>
          <DialogDescription>Comece pelo cadastro. Documentos e dotações podem ser adicionados após a criação.</DialogDescription></DialogHeader>
        <FormularioEmenda {...catalogos} onCancelar={()=>setDialog(false)} onSalvar={async dados=>{await criar.mutateAsync(dados);}}/>
      </DialogContent>
    </Dialog>
  </div>;
}
