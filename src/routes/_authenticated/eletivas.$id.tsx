import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ArrowLeft,FileArchive,LayoutDashboard,RefreshCcw,Calculator,SearchCheck,Mail,
  BadgeCheck,ClipboardList,ScrollText,Download,BookOpen,History,
  Search,ShieldCheck,LockKeyhole,Shield} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {FontesEletivas} from "@/components/eletivas/FontesEletivas";
import {PainelScEletivas} from "@/components/eletivas/PainelScEletivas";
import {PainelEletivas} from "@/components/eletivas/PainelEletivas";
import {AuditoriaEletivas} from "@/components/eletivas/AuditoriaEletivas";
import {AuditorFaixaEletivas} from "@/components/eletivas/AuditorFaixaEletivas";
import {DocumentosEletivas} from "@/components/eletivas/DocumentosEletivas";
import {CorrecoesRecebidasEletivas} from "@/components/eletivas/CorrecoesRecebidasEletivas";
import {FechamentoEletivas} from "@/components/eletivas/FechamentoEletivas";
import {HomologacaoEletivas} from "@/components/eletivas/HomologacaoEletivas";
import {ComunicacoesEletivas} from "@/components/eletivas/ComunicacoesEletivas";
import {ConferenciaNormativaEletivas} from "@/components/eletivas/ConferenciaNormativaEletivas";
import {ManualProcessoEletivas} from "@/components/eletivas/ManualProcessoEletivas";
import {descreverEventoEletivas} from "@/lib/eletivas/linhaDoTempo";
import {normaParaCompetencia} from "../../../supabase/functions/_shared/eletivas-normativas";
import {resumoEncontro,type ItemEC} from "@/lib/eletivas/financeiro";
import {emFilaEC} from "@/lib/eletivas/investigacao";
import {dateTime} from "@/lib/format";
import type {Tables} from "@/integrations/supabase/types";
import "@/styles/eletivas-sc.css";

export const Route=createFileRoute("/_authenticated/eletivas/$id")({
  head:()=>({
    meta:[{title:"Cirurgias Eletivas · Encontro de Contas HMSJ"}],
    links:[
      {rel:"preconnect",href:"https://fonts.googleapis.com"},
      {rel:"preconnect",href:"https://fonts.gstatic.com",crossOrigin:"anonymous"},
      {rel:"stylesheet",href:"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,800;9..144,900&family=Public+Sans:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600;700&display=swap"},
    ],
  }),
  component:EletivasDetalhe,
});
const abas=[
  ["arquivos","Fontes da competência",FileArchive,
    "Importe e valide as fontes oficiais e seus SHA-256."],
  ["painel","Painel",LayoutDashboard,
    "Produção publicada, complemento, correções e consolidação financeira."],
  ["correcoes","Correções recebidas",RefreshCcw,
    "Origem, aprovação fiscal e prevenção de cobrança em duplicidade."],
  ["fpo","FPO · Art. 19",Calculator,
    "Programação oficial versus comprovantes efetivos e memória federal."],
  ["faixas","Auditor de faixa",SearchCheck,
    "Faixa, composição individual de AIHs, filhos e Anexos CIB."],
  ["comunicacoes","Comunicações",Mail,
    "Central, GEMAS e tratamento interno, envios e reaberturas."],
  ["pagos","Itens conciliados",BadgeCheck,
    "Valores e procedimentos efetivamente conciliados e conferidos."],
  ["fila","Fila de auditoria",ClipboardList,
    "Itens que exigem investigação, providências e decisão fiscal."],
  ["atesto","Atesto (SEI)",ScrollText,
    "Minutas, referências SEI, validação e fechamento institucional."],
  ["exportar","Exportar",Download,
    "Memórias, relatórios, planilhas e homologação analítica."],
  ["manual","Manual do processo",BookOpen,
    "Roteiro de trabalho e trilhas de auditoria do encontro."]
] as const;
type Aba=typeof abas[number][0];
function EletivasDetalhe(){
  const {id}=Route.useParams();
  const {roles}=useAuth();
  const qc=useQueryClient();
  const [aba,setAba]=useState<Aba>("arquivos");
  const [busca,setBusca]=useState("");
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
  const refresh=async()=>{
    const keys=["ec-competencia","ec-origem-lancamento","ec-arquivos","ec-itens",
      "ec-eventos","ec-financeiro-sql","ec-correcoes-resumo","ec-fpo-fluxos",
      "ec-comunicacoes"];
    await Promise.all([
      ...keys.map(k=>qc.invalidateQueries({queryKey:[k,id]})),
      qc.invalidateQueries({queryKey:["ec-competencias"]}),
    ]);
  };
  if(comp.isLoading)return <p className="p-8 text-sm">Carregando competência…</p>;
  if(comp.isError||!comp.data)return <div role="alert" className="p-8 text-destructive">
    Erro ao abrir competência. Confirme a migração e suas permissões.</div>;
  const c=comp.data;
  const podeEditar=(hasRole(roles,"acp")||hasRole(roles,"admin"))&&c.status!=="encerrada"&&!c.arquivada_em;
  const resumo=resumoEncontro((itens.data??[]) as unknown as ItemEC[]);
  const norma=normaParaCompetencia(c.competencia);
  const linhas=itens.data??[];
  const filas=linhas.filter(x=>emFilaEC(x as ItemEC)).length;
  const conciliados=linhas.filter(x=>x.situacao==="ok"&&!!x.conferido_em&&
    x.decisao!=="erro"&&x.decisao!=="analise").length;
  const fontesCompletas=[...["dbf_faec","dbf_mac","s_faec","s_mac"],
    ...(Number(c.competencia.split("/")[1])*100+
      Number(c.competencia.split("/")[0])>=202607?["s_mac_ms"]:[])].every(cat=>
      (arquivos.data??[]).some(a=>a.categoria===cat));
  const nome=abas.find(a=>a[0]===aba)!;
  const contagens:Partial<Record<Aba,number>>={
    arquivos:arquivos.data?.length??0,correcoes:undefined,
    pagos:conciliados,fila:filas,faixas:linhas.filter(x=>["faec_mult","mac_mult"].includes(x.categoria)).length
  };
  const ir=(v:Aba)=>{setAba(v);setBusca("");};
  const status=c.arquivada_em?"Arquivada":c.status==="encerrada"?"Encerrado":
   c.status==="preparacao"?"Em preparação":"Em auditoria";
  const searchable=aba==="pagos"||aba==="fila"||aba==="faixas";
  return <div className="ec-sc" data-testid="eletivas-fase6-shell">
    <aside className="ec-side" aria-label="Navegação interna de Cirurgias Eletivas">
      <div className="ec-brand">
        <div className="ec-brand-flag" aria-hidden="true">
          <img src="/eletivas/referencia/bandeira-sc.webp" alt="" width="64" height="47"/>
        </div>
        <div><div className="ec-eyebrow">AUDITORIA · SES/SC</div>
          <h2>Hospital São José</h2><p>Cirurgias Eletivas</p></div>
      </div>
      <div className="ec-context">
        <div className="ec-context-cap">Contexto da análise</div>
        <label>CNES do hospital<span className="ec-value">{c.cnes}</span></label>
        <label>Competência<span className="ec-value">{c.competencia}</span></label>
        <div className="ec-norm"><b>Norma:</b> {norma?.rotulo??"Verificação necessária"}</div>
        {origem.data&&<p className="ec-footnote">
          Parcela de origem: {origem.data.parcela??"não numerada"}
        </p>}
      </div>
      <nav className="ec-navigation" aria-label="Onze seções do Encontro de Contas">
        {abas.map(([chave,label,Icon],index)=><div key={chave}
          className={index===10?"ec-manual-item":""}>
          {index===10&&<div className="ec-sep" aria-hidden="true"/>}
          <button className="ec-nav w-full" type="button" data-active={aba===chave}
            aria-current={aba===chave?"page":undefined}
            onClick={()=>ir(chave)}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>
            <span>{label}</span>
            {contagens[chave]!==undefined&&<small className="ec-count">
              {contagens[chave]}</small>}
          </button>
        </div>)}
      </nav>
      <div className="ec-foot"><span className="text-[#ba252d] font-bold">v2.42.2</span>
        {" "}· Motor institucional
        <div>SMS Joinville · Trilha auditável</div>
        <Link to="/eletivas" className="underline inline-flex items-center gap-1 mt-1">
          <ArrowLeft className="h-3 w-3"/> Todas as competências
        </Link>
      </div>
    </aside>
    <main className="ec-main" id="eletivas-conteudo">
      <header className="ec-topbar">
        <div className="min-w-0"><div className="ec-kicker">
          GESTÃO DE CONVÊNIOS · CIRURGIAS ELETIVAS</div>
          <h1>{nome[1]}</h1>
        </div>
        <div className="ec-tools">
          {searchable?<label className="ec-search">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true"/>
            <input type="search" aria-label="Busca contextual por AIH e procedimento"
              placeholder="Buscar AIH ou procedimento…" value={busca}
              onChange={e=>setBusca(e.target.value)}/>
          </label>:<span className="ec-chip">Dados institucionais protegidos</span>}
        </div>
      </header>
      <div className="ec-content">
        <div className="ec-view-head">
          <div><p className="ec-eyebrow mb-2">
            Etapa {String(abas.findIndex(a=>a[0]===aba)+1).padStart(2,"0")} / 11
          </p>
            <h2><span className="ec-number">
              {String(abas.findIndex(a=>a[0]===aba)+1).padStart(2,"0")}
              </span>{nome[1]}</h2>
            <p>{nome[3]}</p></div>
          <span className="ec-stamp" data-variant={c.arquivada_em?"warning":
            c.status==="encerrada"?"neutral":resumo.pendencias.length?"warning":"ok"}>
            {status}</span>
        </div>
        {c.arquivada_em&&<div className="ec-paper text-sm" role="status">
          Este encontro está arquivado desde {dateTime(c.arquivada_em)}.
          Consulte fontes e evidências; para retomar edições, restaure-o na lista de competências.
        </div>}
        {origem.isError&&<p role="alert" className="ec-paper text-red-700 text-sm">
          Não foi possível recuperar o lançamento de origem. Verifique o vínculo institucional.
        </p>}
        {origem.data&&(origem.data.competencia!==c.competencia||
          origem.data.prestador_id!==c.prestador_id)&&<p role="alert"
          className="ec-paper text-red-700 text-sm">
          Divergência entre instituição/competência do Encontro e o lançamento original.
          Solicite revisão administrativa.</p>}
        {(arquivos.isLoading||itens.isLoading)&&<div className="ec-loading" role="status">
          <span className="ec-spin"/>Carregando fontes, itens e memórias financeiras…
        </div>}
        {(arquivos.isError||itens.isError)&&<div role="alert" className="ec-paper text-red-700 text-sm">
          Não foi possível carregar todos os dados desta competência.
          Confira as permissões e tente atualizar o aplicativo.
        </div>}
        {!(arquivos.isLoading||itens.isLoading)&&<div className="ec-sections">
          {aba==="arquivos"&&<FontesEletivas id={id} cnes={c.cnes}
            competencia={c.competencia} arquivos={arquivos.data??[]}
            podeEditar={podeEditar} onRefresh={refresh}
            onAnalisado={()=>ir("painel")}/>}
          {aba==="painel"&&<PainelScEletivas id={id} itens={linhas}
            competencia={c.competencia} cnes={c.cnes}
            fontesSnapshot={c.ec_fontes_snapshot} onNavigate={ir}/>}
          {aba==="correcoes"&&<CorrecoesRecebidasEletivas comp={c}
            itens={linhas} podeEditar={podeEditar} onRefresh={refresh}
            onNavigate={v=>ir(v)}/>} 
          {aba==="fpo"&&<PainelEletivas id={id} itens={linhas}
            competencia={c.competencia} modo="fpo" podeEditar={podeEditar}
            onAbrirAuditoria={()=>ir("faixas")}/>}
          {aba==="faixas"&&<>
            <ConferenciaNormativaEletivas competencia={c.competencia}/>
            <AuditorFaixaEletivas itens={linhas} competencia={c.competencia}
              busca={busca} onAbrirFila={()=>ir("fila")}/>
          </>}
          {aba==="comunicacoes"&&<ComunicacoesEletivas id={id}
            competencia={c.competencia} cnes={c.cnes} prestadorId={c.prestador_id}
            itens={linhas} podeFiscal={podeEditar} onRefresh={refresh}/>}
          {(aba==="pagos"||aba==="fila")&&<AuditoriaEletivas
            key={aba} id={id} itens={linhas} arquivos={arquivos.data??[]}
            cnes={c.cnes} competencia={c.competencia} podeEditar={podeEditar}
            fontesCompletas={fontesCompletas}
            onRefresh={refresh} modoTela={aba==="pagos"?"conciliados":"fila"}
            buscaContextual={busca}/>}
          {aba==="atesto"&&<>
            <div className="ec-paper text-sm">
              <strong>Atesto institucional e documentos SEI</strong>
              <p className="ec-footnote">O Relatório Técnico de Monitoramento e o
                Relatório de Análise são formalizados nos campos da
                <b> Etapa 6 — Liberação de Recurso do lançamento no Fluxo 1</b>.
                As referências e as minutas abaixo são suporte fiscal;
                não substituem os links e as assinaturas do lançamento.</p>
            </div>
            <DocumentosEletivas key={c.atualizado_em} comp={c}
              itens={linhas} podeEditar={podeEditar} onRefresh={refresh}
              modo="atesto"/>
            <details className="ec-paper ec-aux"><summary>
              <LockKeyhole className="mr-2 inline h-4 w-4"/>
              Fechamento e vínculo ao convênio · acesso administrativo
            </summary>
              <div className="mt-4"><FechamentoEletivas key={c.id} comp={c}
                podeFiscal={podeEditar} podeAdmin={hasRole(roles,"admin")}
                onRefresh={refresh}/></div>
            </details>
          </>}
          {aba==="exportar"&&<>
            <div className="ec-paper"><h3>Exportação do Encontro de Contas</h3>
              <p className="ec-footnote">Os relatórios e a planilha analítica são
                produzidos a partir das fontes e decisões existentes.
                As exportações não autorizam pagamento e não alteram o atesto.</p>
            </div>
            <DocumentosEletivas key={c.atualizado_em} comp={c}
              itens={linhas} podeEditar={false} onRefresh={refresh}
              modo="exportar"/>
            <details className="ec-paper ec-aux" open>
              <summary><ShieldCheck className="mr-2 inline h-4 w-4"/>
                Homologação técnica · Fases 7 e 8 · comparar com o HTML</summary>
              <div className="mt-4">
                {(hasRole(roles,"acp")||hasRole(roles,"admin"))?
                  <HomologacaoEletivas comp={c} arquivos={arquivos.data??[]}
                    itens={linhas}/>:
                  <p className="text-sm">A homologação requer perfil ACP/Admin.</p>}
              </div>
            </details>
          </>}
          {aba==="manual"&&<ManualProcessoEletivas/>}
        </div>}
        {aba==="exportar"&&<div className="ec-admin-tools" aria-label="Ferramentas institucionais do Encontro de Contas">
          <details className="ec-paper ec-aux">
            <summary className="cursor-pointer text-sm font-semibold">
              <History className="mr-2 inline h-4 w-4"/>
              Ferramentas institucionais · Linha do tempo ({eventos.data?.length??0} eventos)
            </summary>
              <div className="mt-4 space-y-2">
                {eventos.isError&&<p role="alert">Erro ao consultar histórico.</p>}
                {(eventos.data??[]).map(evento=>{
                  const info=descreverEventoEletivas(evento.tipo,evento.dados);
                  return <article key={evento.id} className="rounded-xl border p-3 text-sm space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold">{info.titulo}</h3>
                      <time className="text-xs text-muted-foreground">
                        {dateTime(evento.ocorrido_em)}</time>
                    </div>
                    <p className="text-xs text-muted-foreground">{info.resumo}</p>
                    {info.campos.length>0&&<dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {info.campos.map((campo,i)=><div key={i} className="rounded-lg bg-[#f5f8f5] p-2">
                        <dt className="text-xs text-muted-foreground">{campo.rotulo}</dt>
                        <dd className="text-xs font-medium break-words">{campo.valor}</dd>
                      </div>)}
                    </dl>}
                    <details className="border-t pt-2 text-xs">
                      <summary>Ver registro técnico completo</summary>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/25 p-2">
                        {JSON.stringify(info.detalhes,null,2)}</pre>
                    </details>
                  </article>;
                })}
                {eventos.data?.length===limiteEventos&&limiteEventos<10000&&
                  <Button type="button" variant="outline" size="sm"
                    onClick={()=>setLimiteEventos(n=>Math.min(10000,n+100))}>
                    Carregar mais eventos anteriores</Button>}
              </div>
          </details>
        </div>}
        {aba!=="manual"&&aba!=="arquivos"&&aba!=="painel"&&<p className="ec-footnote mt-6">HMSJ · CNES {c.cnes} · {c.competencia}.
          O cálculo financeiro, as decisões e o histórico institucional
          permanecem separados da apresentação visual.</p>}
      </div>
    </main>
  </div>;
}
