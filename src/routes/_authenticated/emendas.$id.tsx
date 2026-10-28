import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Landmark, ShieldCheck, Scale, Clock, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useCatalogosEmendas, useDetalheEmenda, invalidarEmendas } from "@/hooks/useEmendas";
import { FormularioEmenda } from "@/components/emendas/FormularioEmenda";
import { ExecucaoEmenda } from "@/components/emendas/ExecucaoEmenda";
import { type CadastroEmenda, totalAutorizado, nomeSituacao } from "@/lib/emendas/cadastro";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeiButton } from "@/components/inputs/SeiLink";

export const Route = createFileRoute("/_authenticated/emendas/$id")({
  head:()=>({meta:[{title:"Detalhamento da Emenda | PACTO Joinville"}]}),
  component:DetalheEmendaPage,
});

function Resumo({titulo,valor,detalhe}:{titulo:string;valor:string;detalhe?:string}) {
  return <div className="rounded-xl border bg-card p-4">
    <p className="text-xs text-muted-foreground">{titulo}</p>
    <b className="mt-1 block text-lg tabular-nums text-primary">{valor}</b>
    {detalhe&&<p className="mt-1 text-[11px] text-muted-foreground">{detalhe}</p>}
  </div>;
}

function DetalheEmendaPage() {
  const {id}=Route.useParams();
  const {roles}=useAuth();
  const podeEditar=hasRole(roles,"acp");
  const [aba,setAba]=useState("visao");
  const catalogos=useCatalogosEmendas();
  const detalhe=useDetalheEmenda(id);
  const qc=useQueryClient();
  const e=detalhe.data?.emenda;
  const ajustes=detalhe.data?.ajustes??[];
  const andamento=useQuery({
    queryKey:["emendas","painel-lancamentos",id],
    enabled:!!id,
    queryFn:async()=>{
      const r=await supabase.from("emenda_lancamentos").select("id,status,created_at").eq("emenda_id",id).order("created_at",{ascending:false});
      if(r.error)throw r.error;
      return r.data??[];
    },
  });
  const valorVigente=e?totalAutorizado(Number(e.valor_autorizado_inicial),Number(e.valor_rendimento??0),ajustes):0;
  const instituicao=catalogos.prestadores.find(p=>p.id===e?.prestador_id)?.nome_instituicao;
  const convenio=catalogos.convenios.find(c=>c.id===e?.convenio_id);
  const termo=catalogos.termos.find(t=>t.id===e?.termo_aditivo_id);
  const salvar=useMutation({
    mutationFn:async(form:CadastroEmenda)=>{
      const {valor_autorizado_inicial:_original,...editaveis}=form;
      const {error}=await supabase.from("emendas").update(editaveis).eq("id",id);
      if(error)throw error;
    },
    onSuccess:async()=>{await invalidarEmendas(qc);toast.success("Cadastro atualizado com histórico.");setAba("visao");},
  });
  if(detalhe.isPending||catalogos.loading)return <p className="p-6 text-sm text-muted-foreground">Carregando cadastro da emenda...</p>;
  if(detalhe.isError||catalogos.error)return <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
    Não foi possível carregar a emenda. {String((detalhe.error||catalogos.error)?.message??"")}
  </div>;
  if(!e)return <div className="space-y-4"><p>Emenda não encontrada.</p><Link to="/emendas" className="text-primary underline">Voltar à listagem</Link></div>;
  return <div className="space-y-5">
    <div>
      <Link to="/emendas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4"/>Voltar às emendas</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary"><Landmark className="h-6 w-6"/>Emenda {e.numero}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{instituicao??"Instituição não localizada"} · {e.autoria_parlamentar}</p>
          <p className="mt-1 max-w-4xl text-sm">{e.objeto}</p>
        </div>
        <Badge variant="secondary" className="text-sm">{nomeSituacao(e.situacao)}</Badge>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Resumo titulo="Emenda + rendimento + ajustes" valor={brl(valorVigente)} detalhe={"Rendimento: "+brl(Number(e.valor_rendimento??0))}/>
      <Resumo titulo="Reservado em solicitações" valor={brl(Number(detalhe.data?.resumo?.valor_reservado??0))} detalhe="Solicitações ainda sem NE"/>
      <Resumo titulo="Notas de empenho registradas" valor={brl(Number(detalhe.data?.resumo?.valor_empenhado??0))} detalhe="NE emitidas e registradas no PACTO"/>
      <Resumo titulo="Disponível para novos empenhos" valor={brl(Number(detalhe.data?.resumo?.saldo_disponivel??valorVigente))} detalhe="Saldo gerencial, não operação SEFAZ"/>
    </div>
    <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
      <p><b className="text-foreground">Emendas — Etapas documentais.</b> A criação do lançamento gera parcelas previstas, sem reserva. Dotação, autorização, solicitação e assinaturas documentadas antecedem a reserva; a NE é registrada após sua emissão.</p>
    </div>
    <Tabs value={aba} onValueChange={setAba} className="space-y-4">
      <TabsList className="h-auto flex flex-wrap justify-start gap-1">
        <TabsTrigger value="visao">Visão geral</TabsTrigger>
        <TabsTrigger value="execucao">Lançamentos</TabsTrigger>
        <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
      </TabsList>
      <TabsContent value="visao" className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Vinculação e proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Instituição:</span> {instituicao}</p>
              <p><span className="text-muted-foreground">Convênio:</span> {convenio?.objeto??"Não vinculado"}</p>
              <p><span className="text-muted-foreground">Termo aditivo:</span> {termo?.identificador??"Não aplicável"}</p>
              <p><span className="text-muted-foreground">Proposta:</span> {e.numero_proposta??"Não informada"}</p>
              <p><span className="text-muted-foreground">Modalidade:</span> {e.modalidade}</p>
              <p><span className="text-muted-foreground">Origem do recurso:</span> {e.origem_recurso}</p>
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Regras de referência</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Valor original:</span> {brl(Number(e.valor_autorizado_inicial))}</p>
              <p><span className="text-muted-foreground">Rendimento registrado:</span> {brl(Number(e.valor_rendimento??0))}</p>
              <p><span className="text-muted-foreground">Prazo de execução:</span> {e.prazo_execucao_dias?e.prazo_execucao_dias+" dias":"Não informado"}</p>
              <p><span className="text-muted-foreground">Atesto documental:</span> {e.exige_atesto?"Exigido":"Não exigido"}</p>
              <p><span className="text-muted-foreground">Portaria municipal:</span> {e.numero_portaria_municipal??"Não informada"}</p>
              <p><span className="text-muted-foreground">Número SEI da portaria:</span> {e.portaria_municipal_numero_sei??"Não informado"}</p>
              {e.portaria_municipal_link_sei&&<SeiButton href={e.portaria_municipal_link_sei} label="Portaria SEI"/>}
              <p><span className="text-muted-foreground">Processo principal:</span> {e.processo_sei_numero??"Não informado"}</p>
              {e.processo_sei_link&&<SeiButton href={e.processo_sei_link} label="Processo SEI"/>}
            </CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4"/>Resumo dos lançamentos</CardTitle>
          <CardDescription>Indicadores da emenda. Detalhes, parcelas, documentos e linha do tempo ficam em Lançamentos.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
             ["Lançamentos",andamento.data?.length??0],
             ["Em preparação",andamento.data?.filter(l=>l.status==="rascunho").length??0],
             ["Solicitações formalizadas",andamento.data?.filter(l=>l.status==="formalizado").length??0],
             ["NEs registradas",andamento.data?.filter(l=>l.status==="emitido").length??0],
            ].map(([label,value])=><div key={String(label)} className="rounded-lg border bg-muted/20 px-3 py-3">
             <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p>
            </div>)}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="execucao"><ExecucaoEmenda emendaId={id} convenioId={e.convenio_id} podeEditar={podeEditar} statusEmenda={e.situacao}/></TabsContent>
      <TabsContent value="cadastro">
        {podeEditar?<FormularioEmenda key={e.updated_at} inicial={e} editando {...catalogos}
          onSalvar={async dados=>{await salvar.mutateAsync(dados);}} onCancelar={()=>setAba("visao")}/>:
          <Card><CardContent className="p-5 text-sm text-muted-foreground">Seu perfil possui acesso de consulta. A edição é reservada aos perfis ACP e Administrador.</CardContent></Card>}
      </TabsContent>
    </Tabs>
  </div>;
}
