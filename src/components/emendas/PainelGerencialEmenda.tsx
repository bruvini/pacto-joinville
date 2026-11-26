import {useMemo,useState} from "react";
import {Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {AlertTriangle,ArrowUpRight,Download,FileSpreadsheet,Landmark,Search,RefreshCw,WalletCards} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {PainelConferenciaLegadoEmenda} from "@/components/emendas/PainelConferenciaLegadoEmenda";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {
 indicadoresFinanceirosEmenda,pendenciasFinanceirasEmenda,
 csvPendenciasGerenciais,csvNesGerenciais,csvCompetenciasGerenciais,csvPagamentosGerenciais,
 competenciaISO,type TipoPendenciaGerencial,type PendenciaGerencial,
} from "@/lib/emendas/gerencial";

const PAGINA_CONSULTA=500;
const LIMITE_SEGURANCA=10000;
/** A API normalmente pagina em até 1.000 itens: nunca apresentar relatório truncado como completo. */
async function carregarTudo<T>(
 obter:(inicio:number,fim:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>
):Promise<T[]>{
 const todas:T[]=[];
 for(let inicio=0;inicio<LIMITE_SEGURANCA;inicio+=PAGINA_CONSULTA){
  const r=await obter(inicio,inicio+PAGINA_CONSULTA-1);
  if(r.error)throw new Error(r.error.message);
  todas.push(...(r.data??[]));
  if((r.data?.length??0)<PAGINA_CONSULTA)return todas;
 }
 throw new Error("O relatório excedeu o limite de "+LIMITE_SEGURANCA+
  " registros. Refine o período ou solicite uma exportação paginada no servidor.");
}
type Ne=Tables<"emenda_f_ne_painel">;
type Competencia=Tables<"emenda_f_competencias_painel">;
type Sub=Tables<"emenda_subempenhos">;
type Pag=Tables<"emenda_pagamento_subempenhos_painel">;
type Parcela=Tables<"emenda_pagamento_parcelas_painel">;
type Documento=Tables<"emenda_subempenho_documentos_painel">;
type Solicitacao=Tables<"emenda_solicitacoes">;
const TIPOS:{id:TipoPendenciaGerencial;rotulo:string}[]=[
 {id:"ne_sem_utilizacao",rotulo:"NEs sem utilização"},
 {id:"solicitacao_sem_aviso",rotulo:"Solicitações sem Aviso"},
 {id:"aguardando_pagamento",rotulo:"Aguardando pagamento"},
 {id:"pagamento_parcial",rotulo:"Pagamentos parciais"},
 {id:"aguardando_conciliacao",rotulo:"Aguardando conciliação"},
 {id:"saldo_anulavel",rotulo:"Valores passíveis de anulação"},
 {id:"distribuicao_a_rever",rotulo:"Distribuições a rever"},
 {id:"competencia_pendente",rotulo:"Competências sem execução"},
 {id:"documentacao_pendente",rotulo:"Documentos pendentes"},
 {id:"modelo_conflitante",rotulo:"Conflito de modelos"},
];
const ROTULOS_SEVERIDADE={critico:"Crítico",atencao:"Atenção",informativo:"Informativo"};
function baixarCsv(nome:string,conteudo:string){
 const blob=new Blob([conteudo],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function nomeArquivo(numero:string,sufixo:string){
 return "emenda-"+numero.replace(/[^0-9A-Za-z_-]/g,"-")+"-"+sufixo+".csv";
}
const dinheiro=(n:number|null|undefined)=>n===null||n===undefined?"—":brl(Number(n));
export function PainelGerencialEmenda({emendaId,numeroEmenda}:{emendaId:string;numeroEmenda:string}){
 const qc=useQueryClient();
 const [tipo,setTipo]=useState("todos");
 const [severidade,setSeveridade]=useState("todos");
 const [busca,setBusca]=useState("");
 const [pagina,setPagina]=useState(1);
 const [aba,setAba]=useState<"pendencias"|"nes">("pendencias");
 const consulta=useQuery({
  queryKey:["emendas","gerencial",emendaId],
  staleTime:30000,
  queryFn:async()=>{
   const [resumo,nes,competencias,subs,pagamentos,parcelas,documentos,solicitacoes]=await Promise.all([
    supabase.from("emendas_resumo").select("*").eq("id",emendaId).maybeSingle(),
    carregarTudo<Ne>((i,f)=>supabase.from("emenda_f_ne_painel").select("*")
     .eq("emenda_id",emendaId).order("lancamento_id").range(i,f)),
    carregarTudo<Competencia>((i,f)=>supabase.from("emenda_f_competencias_painel").select("*")
     .eq("emenda_id",emendaId).order("lancamento_id").order("competencia_id").range(i,f)),
    carregarTudo<Sub>((i,f)=>supabase.from("emenda_subempenhos").select("*")
     .eq("emenda_id",emendaId).order("id").range(i,f)),
    carregarTudo<Pag>((i,f)=>supabase.from("emenda_pagamento_subempenhos_painel").select("*")
     .eq("emenda_id",emendaId).order("subempenho_id").range(i,f)),
    carregarTudo<Parcela>((i,f)=>supabase.from("emenda_pagamento_parcelas_painel").select("*")
     .eq("emenda_id",emendaId).order("id").range(i,f)),
    carregarTudo<Documento>((i,f)=>supabase.from("emenda_subempenho_documentos_painel").select("*")
     .eq("emenda_id",emendaId).order("subempenho_id").order("tipo").range(i,f)),
    carregarTudo<Solicitacao>((i,f)=>supabase.from("emenda_solicitacoes").select("*")
     .eq("emenda_id",emendaId).order("id").range(i,f)),
   ]);
   if(resumo.error)throw resumo.error;
   if(!resumo.data)throw new Error("Resumo financeiro da emenda não disponível.");
   return {resumo:resumo.data,nes,competencias,subs,pagamentos,parcelas,documentos,solicitacoes};
  }
 });
 const dados=consulta.data;
 const metricas=useMemo(()=>dados?indicadoresFinanceirosEmenda({
  resumo:dados.resumo,nes:dados.nes,pagamentos:dados.pagamentos
 }):null,[dados]);
 const pendencias=useMemo(()=>dados?pendenciasFinanceirasEmenda({
  nes:dados.nes,competencias:dados.competencias,subempenhos:dados.subs,
  pagamentos:dados.pagamentos,parcelas:dados.parcelas,documentos:dados.documentos,
  solicitacoes:dados.solicitacoes
 }):[],[dados]);
 const filtradas=useMemo(()=>{
  const q=busca.trim().toLocaleLowerCase("pt-BR");
  return pendencias.filter(p=>(tipo==="todos"||p.tipo===tipo)&&
   (severidade==="todos"||p.severidade===severidade)&&
   (!q||[p.titulo,p.descricao,p.competencia,p.numeroNe,p.numeroSei??""]
    .some(v=>v.toLocaleLowerCase("pt-BR").includes(q))));
 },[pendencias,tipo,severidade,busca]);
 const nesFiltradas=useMemo(()=>dados?.nes.filter(n=>
  !busca.trim()||[n.numero_ne??"",String(n.exercicio_ne??""),n.modelo_financeiro??""]
   .some(x=>x.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))))??[],
 [dados,busca]);
 const total=aba==="pendencias"?filtradas.length:nesFiltradas.length;
 const tamanho=20;
 const maxPagina=Math.max(1,Math.ceil(total/tamanho));
 const pAtual=Math.min(pagina,maxPagina);
 const visibles=filtradas.slice((pAtual-1)*tamanho,pAtual*tamanho);
 const nesVisiveis=nesFiltradas.slice((pAtual-1)*tamanho,pAtual*tamanho);
 const limparFiltros=()=>{setBusca("");setTipo("todos");setSeveridade("todos");setPagina(1);};
 const enviar=(sufixo:string,conteudo:string)=>baixarCsv(nomeArquivo(numeroEmenda,sufixo),conteudo);
 const defs=[
  {nome:"Autorizado vigente",valor:metricas?.autorizadoVigente,
   dica:"Limite vigente da emenda, incluindo ajustes e rendimentos reconhecidos no cadastro."},
  {nome:"Reservado",valor:metricas?.reservadoEmSolicitacoes,
   dica:"Reservas de solicitações de NE; não são subempenhos nem pagamentos."},
  {nome:"Empenhado",valor:metricas?.empenhado,
   dica:"Valor contabilizado como empenhado no resumo da emenda."},
  {nome:"Subempenhado",valor:metricas?.subempenhado,
   dica:"Avisos efetivamente confirmados no modelo novo. Não inclui liberações legadas."},
  {nome:"Programado",valor:metricas?.programado,
   dica:"Soma das últimas programações vigentes das parcelas do modelo novo, não de versões antigas."},
  {nome:"Pago líquido",valor:metricas?.pagoLiquido,
   dica:"Comprovantes efetivos líquidos de estornos/devoluções (modelo novo), mais pagamentos legados quando aplicável."},
 ];
 return <Card id="painel-gerencial-emendas" className="scroll-mt-24">
  <CardHeader className="pb-3">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-1">
     <CardTitle className="flex items-center gap-2 text-base">
      <Landmark className="h-4 w-4"/>Execução financeira e pendências
     </CardTitle>
     <p className="text-xs text-muted-foreground">
      Dados por NE, competência e subempenho. Cada valor representa uma etapa distinta;
      programação não é pagamento e distribuição não é comprometimento.
     </p>
    </div>
    <Button size="sm" variant="outline" disabled={consulta.isFetching}
     onClick={()=>qc.invalidateQueries({queryKey:["emendas","gerencial",emendaId]})}>
     <RefreshCw className="mr-1 h-3.5 w-3.5"/>Atualizar conferência
    </Button>
   </div>
  </CardHeader>
  <CardContent className="space-y-4">
   {consulta.isPending&&<p className="text-xs text-muted-foreground">
    Consolidando lançamentos, subempenhos, comprovantes e conciliações...
   </p>}
   {consulta.error&&<p role="alert" className="rounded border border-destructive/50 p-3 text-xs text-destructive">
    Não foi possível conferir integralmente os dados da emenda. As exportações estão indisponíveis:
    {" "}{consulta.error.message}
   </p>}
   {metricas&&<div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
    {defs.map(m=><div key={m.nome} className="rounded-md border bg-muted/10 p-3">
     <p className="text-[11px] font-medium text-muted-foreground">{m.nome}</p>
     <p className="mt-1 text-base font-semibold tabular-nums">{dinheiro(m.valor)}</p>
     <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{m.dica}</p>
    </div>)}
   </div>}
   {dados&&<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
     <Badge variant={pendencias.some(p=>p.severidade==="critico")?"destructive":"outline"}>
      {pendencias.filter(p=>p.severidade==="critico").length} críticas
     </Badge>
     <Badge variant="outline">{pendencias.filter(p=>p.severidade==="atencao").length} atenção</Badge>
     <span className="text-muted-foreground">{dados.nes.length} NEs acompanhadas</span>
    </div>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" disabled={!filtradas.length}
      onClick={()=>enviar("pendencias-filtradas",csvPendenciasGerenciais(filtradas,numeroEmenda))}>
      <Download className="mr-1 h-3.5 w-3.5"/>Pendências CSV
     </Button>
     <Button size="sm" variant="outline" disabled={!dados.nes.length}
      onClick={()=>enviar("nes",csvNesGerenciais(dados.nes,numeroEmenda))}>
      <FileSpreadsheet className="mr-1 h-3.5 w-3.5"/>NEs CSV
     </Button>
     <Button size="sm" variant="outline" disabled={!dados.competencias.length}
      onClick={()=>enviar("competencias",csvCompetenciasGerenciais(dados.competencias,numeroEmenda))}>
      Competências CSV
     </Button>
     <Button size="sm" variant="outline" disabled={!dados.parcelas.length}
      onClick={()=>enviar("pagamentos",csvPagamentosGerenciais(dados.pagamentos,dados.parcelas,numeroEmenda))}>
      Pagamentos CSV
     </Button>
    </div>
   </div>}
   {dados&&<div className="space-y-3">
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant={aba==="pendencias"?"default":"outline"}
      onClick={()=>{setAba("pendencias");setPagina(1);}}>Alertas operacionais ({pendencias.length})</Button>
     <Button size="sm" variant={aba==="nes"?"default":"outline"}
      onClick={()=>{setAba("nes");setPagina(1);}}>Notas de Empenho ({dados.nes.length})</Button>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
     <div className="relative sm:col-span-2">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
      <Input value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}}
       className="pl-9" placeholder="Buscar NE, competência, documento ou ocorrência..."
       aria-label="Buscar no painel gerencial"/>
     </div>
     {aba==="pendencias"&&<>
      <Select value={tipo} onValueChange={v=>{setTipo(v);setPagina(1);}}>
       <SelectTrigger aria-label="Filtrar tipo de pendência"><SelectValue placeholder="Tipo"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>
        {TIPOS.map(t=><SelectItem key={t.id} value={t.id}>{t.rotulo}</SelectItem>)}
       </SelectContent>
      </Select>
      <Select value={severidade} onValueChange={v=>{setSeveridade(v);setPagina(1);}}>
       <SelectTrigger aria-label="Filtrar severidade"><SelectValue placeholder="Severidade"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todas as prioridades</SelectItem>
        <SelectItem value="critico">Crítico</SelectItem><SelectItem value="atencao">Atenção</SelectItem>
        <SelectItem value="informativo">Informativo</SelectItem>
       </SelectContent>
      </Select>
     </>}
    </div>
    {aba==="pendencias"?<div className="overflow-x-auto rounded-md border">
     <table className="w-full min-w-[930px] text-left text-xs">
      <thead className="bg-muted/30 text-muted-foreground"><tr>
       <th className="p-3">Ocorrência</th><th className="p-3">NE / Competência</th>
       <th className="p-3 text-right">Valor pendente / anulável</th>
       <th className="p-3">Evidência SEI</th><th className="p-3 text-right">Acesso</th>
      </tr></thead>
      <tbody className="divide-y">
       {visibles.map(p=><LinhaPendencia key={p.id} p={p} emendaId={emendaId}/>)}
       {!visibles.length&&<tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
        Nenhuma ocorrência encontrada neste filtro. Isso não substitui a conferência documental.
       </td></tr>}
      </tbody>
     </table>
    </div>:<div className="overflow-x-auto rounded-md border">
     <table className="w-full min-w-[850px] text-left text-xs">
      <thead className="bg-muted/30 text-muted-foreground"><tr>
       <th className="p-3">NE</th><th className="p-3 text-right">Valor emitido</th>
       <th className="p-3 text-right">Comprometido</th>
       <th className="p-3 text-right">Pago líquido</th>
       <th className="p-3 text-right">Saldo a anular</th>
       <th className="p-3">Conciliação</th><th className="p-3 text-right">Acesso</th>
      </tr></thead><tbody className="divide-y">
       {nesVisiveis.map(n=><tr key={n.lancamento_id}>
        <td className="p-3 font-medium">NE {n.numero_ne??"—"}{n.exercicio_ne?"/"+n.exercicio_ne:""}</td>
        <td className="p-3 text-right tabular-nums">{dinheiro(n.valor_ne_emitida)}</td>
        <td className="p-3 text-right tabular-nums">{dinheiro(
         Number(n.liberacoes_legadas??0)>0?n.liberacoes_legadas:n.compromissos_novos)}</td>
        <td className="p-3 text-right tabular-nums">{dinheiro(
         Number(n.liberacoes_legadas??0)>0?n.pago_legado:n.pago_liquido_novo)}</td>
        <td className="p-3 text-right tabular-nums">{dinheiro(n.saldo_disponivel_anular)}</td>
        <td className="p-3"><Badge variant={n.conciliada?"default":"outline"}>
         {n.conciliada?"Conciliada":n.pronta_conciliar?"Apta a conciliar":"Pendente"}
        </Badge></td>
        <td className="p-3 text-right"><Button asChild size="sm" variant="ghost">
         <Link to="/emendas/$id/lancamentos/$lancamentoId"
          params={{id:emendaId,lancamentoId:n.lancamento_id!}}>Abrir NE</Link>
        </Button></td>
       </tr>)}
       {!nesVisiveis.length&&<tr><td colSpan={7} className="p-4 text-center text-muted-foreground">
        Nenhuma NE encontrada neste filtro.
       </td></tr>}
      </tbody>
     </table>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
     <span>{total} registro(s) · página {pAtual} de {maxPagina}. Exportação sem paginação visual.</span>
     <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={pAtual===1}
       onClick={()=>setPagina(Math.max(1,pAtual-1))}>Anterior</Button>
      <Button variant="outline" size="sm" disabled={pAtual===maxPagina}
       onClick={()=>setPagina(Math.min(maxPagina,pAtual+1))}>Próxima</Button>
     </div>
    </div>
   </div>}
   <details className="rounded-md border">
    <summary className="cursor-pointer px-3 py-3 text-xs font-semibold">
     Conferência do legado e documentos sem vínculo financeiro
    </summary>
    <div className="border-t p-2">
     <PainelConferenciaLegadoEmenda emendaId={emendaId} numeroEmenda={numeroEmenda}/>
    </div>
   </details>
   <p className="text-[11px] text-muted-foreground">
    Valores são registros administrativos do PACTO, não extratos bancários.
    Alertas são classificações operacionais, não determinação automática de irregularidade.
    A soma dos seis indicadores não representa o gasto da emenda.
   </p>
  </CardContent>
 </Card>;
}
function LinhaPendencia({p,emendaId}:{p:PendenciaGerencial;emendaId:string}){
 return <tr className={p.severidade==="critico"?"bg-destructive/5":""}>
  <td className="max-w-[350px] p-3">
   <div className="flex items-center gap-2">
    {p.severidade==="critico"&&<AlertTriangle className="h-3.5 w-3.5 text-destructive"/>}
    <span className="font-semibold">{p.titulo}</span>
   </div>
   <p className="mt-1 text-[11px] text-muted-foreground">{p.descricao}</p>
   <Badge className="mt-1" variant={p.severidade==="critico"?"destructive":"outline"}>
    {ROTULOS_SEVERIDADE[p.severidade]}
   </Badge>
  </td>
  <td className="p-3">
   <p className="font-semibold">{p.numeroNe}</p>
   <p className="text-muted-foreground">{competenciaISO(p.competencia)}</p>
  </td>
  <td className="p-3 text-right font-medium tabular-nums">
   {p.valorPendente===null?"—":dinheiro(p.valorPendente)}
  </td>
  <td className="p-3">
   {p.linkSei?<a href={p.linkSei} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-primary underline">
    {p.numeroSei??"Abrir documento"}<ArrowUpRight className="h-3 w-3"/>
   </a>:<span className="text-muted-foreground">Sem evidência vinculada</span>}
  </td>
  <td className="p-3 text-right"><Button size="sm" variant="ghost" asChild>
   <Link to="/emendas/$id/lancamentos/$lancamentoId"
    params={{id:emendaId,lancamentoId:p.lancamentoId}}>Abrir NE</Link>
  </Button></td>
 </tr>;
}
