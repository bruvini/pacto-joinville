import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ArrowLeft,FileStack,ShieldCheck,History,ClipboardCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {FontesEletivas} from "@/components/eletivas/FontesEletivas";
import {AuditoriaEletivas} from "@/components/eletivas/AuditoriaEletivas";
import {DocumentosEletivas} from "@/components/eletivas/DocumentosEletivas";
import {resumoEncontro,type ItemEC} from "@/lib/eletivas/financeiro";
import {dateTime} from "@/lib/format";

export const Route=createFileRoute("/_authenticated/eletivas/$id")({
  head:()=>({meta:[{title:"Encontro de Contas · Eletivas HMSJ"}]}),
  component:EletivasDetalhe,
});
const abas=[
  ["fontes","Fontes e importações",FileStack],
  ["auditoria","Conciliação e decisões",ShieldCheck],
  ["documentos","Relatórios e atesto",ClipboardCheck],
  ["historico","Linha do tempo",History],
] as const;
function EletivasDetalhe(){
  const {id}=Route.useParams();
  const {roles}=useAuth();
  const qc=useQueryClient();
  const [aba,setAba]=useState<string>("fontes");
  const comp=useQuery({queryKey:["ec-competencia",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_competencias")
      .select("*,prestadores(nome_instituicao)").eq("id",id).single();
    if(error)throw error;return data;
  }});
  const arquivos=useQuery({queryKey:["ec-arquivos",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_arquivos")
      .select("*").eq("competencia_id",id).order("enviado_em",{ascending:false});
    if(error)throw error;return data??[];
  }});
  const itens=useQuery({queryKey:["ec-itens",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_itens")
      .select("*").eq("competencia_id",id).order("atualizado_em",{ascending:false});
    if(error)throw error;return data??[];
  }});
  const eventos=useQuery({queryKey:["ec-eventos",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_eventos")
      .select("*").eq("competencia_id",id).order("ocorrido_em",{ascending:false}).limit(300);
    if(error)throw error;return data??[];
  }});
  const refresh=()=>{
    for(const k of ["ec-competencia","ec-arquivos","ec-itens","ec-eventos"])
      qc.invalidateQueries({queryKey:[k,id]});
    qc.invalidateQueries({queryKey:["ec-competencias"]});
  };
  if(comp.isLoading)return <p className="p-8 text-sm">Carregando competência…</p>;
  if(comp.isError||!comp.data)return <div role="alert" className="p-8 text-destructive">
    Erro ao abrir competência. Confirme a migração e suas permissões.</div>;
  const c=comp.data;
  const podeEditar=(hasRole(roles,"acp")||hasRole(roles,"admin"))&&c.status!=="encerrada";
  const resumo=resumoEncontro((itens.data??[]) as unknown as ItemEC[]);
  return <div className="space-y-5">
    <Link to="/eletivas" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
      <ArrowLeft className="h-3.5 w-3.5"/>Competências</Link>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-medium uppercase text-muted-foreground">Atesto de Produção</p>
        <h1 className="text-2xl font-bold">Encontro de Contas · {c.competencia}</h1>
        <p className="text-sm text-muted-foreground">
          {c.prestadores?.nome_instituicao??"Hospital Municipal São José"} · CNES {c.cnes}</p></div>
      <Badge variant="outline">{c.status==="encerrada"?"Encerrado":c.status==="preparacao"?
        "Preparação":"Auditoria em andamento"}</Badge>
    </div>
    <Card><CardContent className="space-y-2 pt-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>Arquivos: <b>{arquivos.data?.length??0}</b></span>
        <span>Itens: <b>{itens.data?.length??0}</b></span>
        <span>Pendências sem decisão: <b>{resumo.pendencias.length}</b></span>
        <span>Vínculo ao convênio: <b>{c.lancamento_id?"Cadastrado":"Ainda não vinculado"}</b></span>
      </div>
      <p className="text-xs text-muted-foreground">
        O fechamento é independente e não lança valores automaticamente no convênio.
        A conciliação inicial DBF/SES está disponível na aba Auditoria.
        Múltiplas, sequenciais e recortes especiais requerem memória detalhada antes do atesto.
      </p>
    </CardContent></Card>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Etapas do Encontro de Contas">
      {abas.map(([chave,label,Icon])=><Button key={chave} size="sm" type="button"
        role="tab" aria-selected={aba===chave}
        variant={aba===chave?"default":"outline"} onClick={()=>setAba(chave)}>
        <Icon className="mr-1.5 h-4 w-4"/>{label}</Button>)}
    </div>
    <Card><CardHeader><CardTitle className="text-base">
      {abas.find(a=>a[0]===aba)?.[1]}</CardTitle></CardHeader>
      <CardContent>
        {(arquivos.isError||itens.isError||eventos.isError)&&
          <p role="alert" className="mb-4 text-sm text-destructive">Falha ao carregar
            alguns dados: confira as permissões e atualize a página.</p>}
        {aba==="fontes"&&<FontesEletivas id={id} arquivos={arquivos.data??[]}
          podeEditar={podeEditar} onRefresh={refresh}/>}
        {aba==="auditoria"&&<AuditoriaEletivas id={id} itens={itens.data??[]}
          podeEditar={podeEditar}
          fontesCompletas={["dbf_faec","dbf_mac","s_faec","s_mac"].every(cat=>
            (arquivos.data??[]).some(a=>a.categoria===cat))}
          onRefresh={refresh}/>}
        {aba==="documentos"&&<DocumentosEletivas key={c.atualizado_em} comp={c}
          itens={itens.data??[]} podeEditar={podeEditar} onRefresh={refresh}/>}
        {aba==="historico"&&<div className="space-y-2">
          {(eventos.data??[]).map(evento=><div key={evento.id}
            className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
            <span className="font-medium">{evento.tipo.replace(/_/g," ")}</span>
            <span className="text-xs text-muted-foreground">{dateTime(evento.ocorrido_em)}</span>
            <pre className="w-full overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {JSON.stringify(evento.dados,null,2)}</pre>
          </div>)}
          {!(eventos.data??[]).length&&<p className="text-sm text-muted-foreground">
            Nenhum evento registrado.</p>}
        </div>}
      </CardContent>
    </Card>
  </div>;
}
