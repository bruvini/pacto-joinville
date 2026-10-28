import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Landmark, ShieldCheck, Scale, Clock, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useCatalogosEmendas, useDetalheEmenda, invalidarEmendas } from "@/hooks/useEmendas";
import { FormularioEmenda } from "@/components/emendas/FormularioEmenda";
import { DocumentosEmenda } from "@/components/emendas/DocumentosEmenda";
import { FontesEmenda } from "@/components/emendas/FontesEmenda";
import { AjustesEHistoricoEmenda } from "@/components/emendas/AjustesEHistoricoEmenda";
import { type CadastroEmenda, saldoCadastro, nomeSituacao } from "@/lib/emendas/cadastro";
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
  const documentos=detalhe.data?.documentos??[];
  const fontes=detalhe.data?.fontes??[];
  const ajustes=detalhe.data?.ajustes??[];
  const historico=detalhe.data?.historico??[];
  const valorVigente=e?saldoCadastro(Number(e.valor_autorizado_inicial),ajustes):0;
  const instituicao=catalogos.prestadores.find(p=>p.id===e?.prestador_id)?.nome_instituicao;
  const convenio=catalogos.convenios.find(c=>c.id===e?.convenio_id);
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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary"><Landmark className="h-6 w-6"/>Emenda {e.numero} / {e.exercicio}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{instituicao??"Instituição não localizada"} · {e.autoria_parlamentar}</p>
          <p className="mt-1 max-w-4xl text-sm">{e.objeto}</p>
        </div>
        <Badge variant="secondary" className="text-sm">{nomeSituacao(e.situacao)}</Badge>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Resumo titulo="Limite autorizado vigente" valor={brl(valorVigente)} detalhe="Valor de cadastro + ajustes formais"/>
      <Resumo titulo="Documentos vinculados" valor={String(documentos.length)} detalhe="Normativos, administrativos e SEI"/>
      <Resumo titulo="Dotações / fontes" valor={String(fontes.filter(x=>x.ativa).length)} detalhe="Classificações ativas"/>
      <Resumo titulo="Movimentações do limite" valor={String(ajustes.length)} detalhe="Alterações formais auditadas"/>
    </div>
    <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
      <p><b className="text-foreground">Fase 1 — Cadastro e fundação.</b> A interface não cria reservas, empenhos, liberações, pagamentos ou anulações. A execução financeira será habilitada somente depois de implementar as regras transacionais específicas. O limite vigente não é saldo financeiro comprovado.</p>
    </div>
    <Tabs value={aba} onValueChange={setAba} className="space-y-4">
      <TabsList className="h-auto flex flex-wrap justify-start gap-1">
        <TabsTrigger value="visao">Visão geral</TabsTrigger>
        <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
        <TabsTrigger value="documentos">Documentos SEI</TabsTrigger>
        <TabsTrigger value="fontes">Dotação e fonte</TabsTrigger>
        <TabsTrigger value="ajustes">Ajustes e histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="visao" className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Vinculação e proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Instituição:</span> {instituicao}</p>
              <p><span className="text-muted-foreground">Convênio:</span> {convenio?.objeto??"Não vinculado"}</p>
              <p><span className="text-muted-foreground">Termo aditivo:</span> {e.termo_aditivo_id?"Vinculado":"Não aplicável"}</p>
              <p><span className="text-muted-foreground">Proposta:</span> {e.numero_proposta??"Não informada"}</p>
              <p><span className="text-muted-foreground">Modalidade:</span> {e.modalidade}</p>
              <p><span className="text-muted-foreground">Origem do recurso:</span> {e.origem_recurso}</p>
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Regras de referência</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Periodicidade padrão:</span> {e.periodicidade_padrao}</p>
              <p><span className="text-muted-foreground">Competência inicial:</span> {e.competencia_inicial??"Não definida"}</p>
              <p><span className="text-muted-foreground">Prazo de execução:</span> {e.prazo_execucao_dias?e.prazo_execucao_dias+" dias":"Não informado"}</p>
              <p><span className="text-muted-foreground">Atesto documental:</span> {e.exige_atesto?"Exigido":"Não exigido"}</p>
              <p><span className="text-muted-foreground">Processo principal:</span> {e.processo_sei_numero??"Não informado"}</p>
              {e.processo_sei_link&&<SeiButton href={e.processo_sei_link} label="Abrir processo SEI"/>}
            </CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4"/>Etapas futuras de execução</CardTitle>
          <CardDescription>Prévia informativa do planejamento, sem ações financeiras habilitadas.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {["1. Dotação e fonte","2. Autorização financeira","3. Solicitação e assinaturas","4. Nota de empenho","5. Liberação + pagamento"].map(x=><div key={x} className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs text-muted-foreground">{x}<p className="mt-1 text-[10px]">Próxima fase</p></div>)}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="cadastro">
        {podeEditar?<FormularioEmenda key={e.updated_at} inicial={e} editando {...catalogos}
          onSalvar={async dados=>{await salvar.mutateAsync(dados);}} onCancelar={()=>setAba("visao")}/>:
          <Card><CardContent className="p-5 text-sm text-muted-foreground">Seu perfil possui acesso de consulta. A edição é reservada aos perfis ACP e Administrador.</CardContent></Card>}
      </TabsContent>
      <TabsContent value="documentos"><DocumentosEmenda emendaId={id} documentos={documentos} podeEditar={podeEditar}/></TabsContent>
      <TabsContent value="fontes"><FontesEmenda emendaId={id} exercicio={e.exercicio} fontes={fontes} podeEditar={podeEditar}/></TabsContent>
      <TabsContent value="ajustes"><AjustesEHistoricoEmenda emendaId={id} valorInicial={Number(e.valor_autorizado_inicial)} ajustes={ajustes} historico={historico} podeEditar={podeEditar} encerrada={e.situacao==="encerrada"}/></TabsContent>
    </Tabs>
  </div>;
}
