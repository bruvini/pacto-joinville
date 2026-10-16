import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ArrowLeft,FileStack,ShieldCheck,History,ClipboardCheck,LayoutDashboard,Calculator,LockKeyhole,ClipboardList,Mail} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {FontesEletivas} from "@/components/eletivas/FontesEletivas";
import {PainelEletivas} from "@/components/eletivas/PainelEletivas";
import {AuditoriaEletivas} from "@/components/eletivas/AuditoriaEletivas";
import {DocumentosEletivas} from "@/components/eletivas/DocumentosEletivas";
import {FechamentoEletivas} from "@/components/eletivas/FechamentoEletivas";
import {HomologacaoEletivas} from "@/components/eletivas/HomologacaoEletivas";
import {ComunicacoesEletivas} from "@/components/eletivas/ComunicacoesEletivas";
import {ConferenciaNormativaEletivas} from "@/components/eletivas/ConferenciaNormativaEletivas";
import {descreverEventoEletivas} from "@/lib/eletivas/linhaDoTempo";
import {resumoEncontro,type ItemEC} from "@/lib/eletivas/financeiro";
import {dateTime} from "@/lib/format";
import type {Tables} from "@/integrations/supabase/types";

export const Route=createFileRoute("/_authenticated/eletivas/$id")({
  head:()=>({meta:[{title:"Encontro de Contas · Eletivas HMSJ"}]}),
  component:EletivasDetalhe,
});
const abas=[
  ["painel","Painel financeiro",LayoutDashboard],
  ["fontes","Fontes e importações",FileStack],
  ["auditoria","Conciliação e decisões",ShieldCheck],
  ["fpo","FPO · Art. 19",Calculator],
  ["comunicacoes","Comunicações e FPO",Mail],
  ["documentos","Relatórios e atesto",ClipboardCheck],
  ["fechamento","Fechamento e convênio",LockKeyhole],
  ["homologacao","Homologação (Fase 7)",ClipboardList],
  ["historico","Linha do tempo",History],
] as const;
function EletivasDetalhe(){
  const {id}=Route.useParams();
  const {roles}=useAuth();
  const qc=useQueryClient();
  const [aba,setAba]=useState<string>("painel");
  const [limiteEventos,setLimiteEventos]=useState(100);
  const comp=useQuery({queryKey:["ec-competencia",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_competencias")
      .select("*,prestadores(nome_instituicao)").eq("id",id).single();
    if(error)throw error;return data;
  }});
  const origem=useQuery({queryKey:["ec-origem-lancamento",id,comp.data?.lancamento_id],
    enabled:!!comp.data?.lancamento_id,
    queryFn:async()=>{
      if(!comp.data?.lancamento_id)throw Error("Competência sem lançamento associado.");
      const {data,error}=await supabase.from("lancamentos_pagamento")
       .select("id,competencia,prestador_id,parcela,descricao")
       .eq("id",comp.data.lancamento_id).single();
      if(error)throw error;return data;
    },
  });
  const arquivos=useQuery({queryKey:["ec-arquivos",id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_arquivos")
      .select("*").eq("competencia_id",id).order("enviado_em",{ascending:false});
    if(error)throw error;return data??[];
  }});
  const itens=useQuery({queryKey:["ec-itens",id],queryFn:async()=>{
    // Páginas explícitas: não deixar o limite padrão do PostgREST omitir itens.
    const todos:Tables<"eletivas_itens">[]=[];
    const tamanho=500;
    for(let inicio=0;inicio<10000;inicio+=tamanho){
      const {data,error}=await supabase.from("eletivas_itens")
        .select("*").eq("competencia_id",id)
        .order("atualizado_em",{ascending:false}).order("id",{ascending:false})
        .range(inicio,inicio+tamanho-1);
      if(error)throw error;
      todos.push(...(data??[]));
      if((data??[]).length<tamanho)return todos;
    }
    throw Error("Limite de 10.000 itens: solicite auditoria técnica.");
  }});
  const eventos=useQuery({queryKey:["ec-eventos",id,limiteEventos],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_eventos")
      .select("*").eq("competencia_id",id).order("ocorrido_em",{ascending:false})
        .order("id",{ascending:false}).limit(limiteEventos);
    if(error)throw error;return data??[];
  }});
  const refresh=()=>{
    for(const k of ["ec-competencia","ec-origem-lancamento","ec-arquivos","ec-itens","ec-eventos","ec-financeiro-sql","ec-correcoes-resumo","ec-fpo-fluxos","ec-comunicacoes"])
      qc.invalidateQueries({queryKey:[k,id]});
    qc.invalidateQueries({queryKey:["ec-competencias"]});
  };
  if(comp.isLoading)return <p className="p-8 text-sm">Carregando competência…</p>;
  if(comp.isError||!comp.data)return <div role="alert" className="p-8 text-destructive">
    Erro ao abrir competência. Confirme a migração e suas permissões.</div>;
  const c=comp.data;
  const podeEditar=(hasRole(roles,"acp")||hasRole(roles,"admin"))&&c.status!=="encerrada"&&!c.arquivada_em;
  const resumo=resumoEncontro((itens.data??[]) as unknown as ItemEC[]);
  return <div className="space-y-5">
    <Link to="/eletivas" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
      <ArrowLeft className="h-3.5 w-3.5"/>Competências</Link>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-medium uppercase text-muted-foreground">Atesto de Produção</p>
        <h1 className="text-2xl font-bold">Encontro de Contas · {c.competencia}</h1>
        <p className="text-sm text-muted-foreground">
          {c.prestadores?.nome_instituicao??"Hospital Municipal São José"} · CNES {c.cnes}</p></div>
      <Badge variant="outline">{c.arquivada_em?"Arquivada":c.status==="encerrada"?"Encerrado":c.status==="preparacao"?
        "Preparação":"Auditoria em andamento"}</Badge>
    </div>
    {c.arquivada_em&&<p role="status" className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-200">
      Encontro arquivado em {dateTime(c.arquivada_em)}. Fontes, decisões e trilha fiscal continuam preservadas.
      Para retomar, volte à lista, marque "Mostrar arquivadas" e use "Restaurar competência".
    </p>}
    <Card><CardContent className="space-y-2 pt-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>Arquivos: <b>{arquivos.data?.length??0}</b></span>
        <span>Itens carregados: <b>{itens.data?.length??0}</b></span>
        <span>Pendências sem decisão: <b>{resumo.pendencias.length}</b></span>
        <span>Vínculo ao convênio: <b>{c.lancamento_id?"Cadastrado":"Ainda não vinculado"}</b></span>
        <span>Execução do motor: <b>{c.ec_execucao_id?c.ec_execucao_id.slice(0,8):"Não executado"}</b></span>
        <span>Origem: <b>{c.ec_origem_execucao==="navegador"?"Pré-conciliação local":c.ec_origem_execucao??"—"}</b></span>
      </div>
      {c.lancamento_id?origem.isError?
       <p role="alert" className="text-xs text-destructive">
        Não foi possível recuperar o lançamento de origem.</p>:
       origem.data&&<p className="text-xs text-muted-foreground">
        Origem: <strong>{origem.data.competencia} · Parcela {origem.data.parcela??"não numerada"}</strong>
        {" "}· {origem.data.descricao??"Lançamento"}
        {(origem.data.competencia!==c.competencia||
          origem.data.prestador_id!==c.prestador_id)&&
          <span className="text-destructive"> · Divergência institucional: solicite revisão.</span>}
       </p>:
       <p className="text-xs text-amber-700">
        Encontro legado ainda sem vínculo com o lançamento.</p>}
      <p className="text-xs text-muted-foreground">
        O fechamento é independente e não lança valores automaticamente no convênio.
        A conciliação inicial DBF/SES está disponível na aba Auditoria.
        Múltiplas, sequenciais e recortes especiais requerem memória detalhada antes do atesto.
      </p>
    </CardContent></Card>
    <ConferenciaNormativaEletivas competencia={c.competencia}/>
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
        {(aba==="painel"||aba==="fpo")&&<PainelEletivas itens={itens.data??[]} id={id}
          competencia={c.competencia} modo={aba==="fpo"?"fpo":"painel"}
          podeEditar={podeEditar} onAbrirAuditoria={()=>setAba("auditoria")}/>}
        {aba==="fontes"&&<FontesEletivas id={id} cnes={c.cnes} competencia={c.competencia} arquivos={arquivos.data??[]}
          podeEditar={podeEditar} onRefresh={refresh}/>}
        {aba==="auditoria"&&<AuditoriaEletivas id={id} itens={itens.data??[]}
          arquivos={arquivos.data??[]} cnes={c.cnes} competencia={c.competencia}
          podeEditar={podeEditar}
          fontesCompletas={[...["dbf_faec","dbf_mac","s_faec","s_mac"],
            ...(Number(c.competencia.split("/")[1])*100+
              Number(c.competencia.split("/")[0])>=202607?["s_mac_ms"]:[])].every(cat=>
            (arquivos.data??[]).some(a=>a.categoria===cat))}
          onRefresh={refresh}/>}
        {aba==="comunicacoes"&&<ComunicacoesEletivas id={id}
          competencia={c.competencia} cnes={c.cnes} prestadorId={c.prestador_id}
          itens={itens.data??[]}
          podeFiscal={(hasRole(roles,"admin")||hasRole(roles,"acp"))&&!c.arquivada_em}
          onRefresh={refresh}/>}
        {aba==="documentos"&&<DocumentosEletivas key={c.atualizado_em} comp={c}
          itens={itens.data??[]} podeEditar={podeEditar} onRefresh={refresh}/>}
        {aba==="fechamento"&&<FechamentoEletivas key={c.id} comp={c}
          podeFiscal={hasRole(roles,"acp")||hasRole(roles,"admin")}
          podeAdmin={hasRole(roles,"admin")} onRefresh={refresh}/>}
        {aba==="homologacao"&&(hasRole(roles,"acp")||hasRole(roles,"admin"))&&
          <HomologacaoEletivas comp={c} arquivos={arquivos.data??[]}
            itens={itens.data??[]}/>}
        {aba==="homologacao"&&!(hasRole(roles,"acp")||hasRole(roles,"admin"))&&
          <p className="text-sm text-muted-foreground">
            A homologação fiscal requer perfil ACP/Admin.</p>}
        {aba==="historico"&&<div className="space-y-2">
          <p className="text-xs text-muted-foreground">Histórico cronológico de ações e alterações.
            Os dados técnicos originais ficam disponíveis sob consulta, sem ocupar a tela inteira.
            Nada foi excluído ou reescrito.</p>
          {(eventos.data??[]).map(evento=>{
            const info=descreverEventoEletivas(evento.tipo,evento.dados);
            return <article key={evento.id} className="rounded-lg border p-3 text-sm space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">{info.titulo}</h3>
                <time className="text-xs text-muted-foreground">{dateTime(evento.ocorrido_em)}</time>
              </div>
              <p className="text-xs text-muted-foreground">{info.resumo}</p>
              {info.campos.length>0&&<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {info.campos.map((campo,i)=><div key={i} className="rounded-md bg-muted/20 p-2">
                  <dt className="text-xs text-muted-foreground">{campo.rotulo}</dt>
                  <dd className="text-xs font-medium break-words">{campo.valor}</dd>
                </div>)}
              </dl>}
              <details className="border-t pt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver registro técnico completo</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/25 p-2">
                  {JSON.stringify(info.detalhes,null,2)}</pre>
              </details>
            </article>;
          })}
          {!(eventos.data??[]).length&&<p className="text-sm text-muted-foreground">
            Nenhum evento registrado.</p>}
          {(eventos.data??[]).length===limiteEventos&&limiteEventos<10000&&
           <Button type="button" variant="outline" size="sm"
             onClick={()=>setLimiteEventos(n=>Math.min(10000,n+100))}>
             Carregar mais eventos anteriores</Button>}
          {(eventos.data??[]).length===10000&&
           <p className="text-xs text-amber-700">
             Histórico extenso: solicite extração técnica para consultar além de 10.000 eventos.</p>}
        </div>}
      </CardContent>
    </Card>
  </div>;
}
