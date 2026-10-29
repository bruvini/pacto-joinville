import {useMemo,useState} from "react";
import {Link} from "@tanstack/react-router";
import {Activity,Download,FileSpreadsheet,ShieldCheck,TriangleAlert} from "lucide-react";
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {brl} from "@/lib/format";
import {apurarIndicadoresEmenda,gerarCsvIndicadores,type DadosIndicadores,type NivelAlerta} from "@/lib/emendas/indicadores";
const nivelNome:Record<NivelAlerta,string>={critico:"Crítico",atencao:"Atenção",informativo:"Informativo"};
function baixar(arquivo:string,conteudo:string) {
 const blob=new Blob([conteudo],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=arquivo;document.body.appendChild(a);
 a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function PainelIndicadoresEmenda({dados,numeroEmenda,emendaId}:{
 dados:DadosIndicadores;numeroEmenda:string;emendaId:string;
}){
 const [nivel,setNivel]=useState("todos");
 const resultado=useMemo(()=>apurarIndicadoresEmenda(dados),[dados]);
 const alertas=resultado.alertas.filter(a=>nivel==="todos"||a.nivel===nivel);
 const qtdCriticos=resultado.alertas.filter(a=>a.nivel==="critico").length;
 const qtdAtencao=resultado.alertas.filter(a=>a.nivel==="atencao").length;
 const qtdInformativos=resultado.alertas.filter(a=>a.nivel==="informativo").length;
 const metricas=[
  {label:"Lançamentos",valor:String(resultado.totais.lancamentos),apoio:resultado.totais.preparacao+" em preparação"},
  {label:"NE registradas",valor:brl(resultado.totais.ne),apoio:resultado.totais.emitidos+" lançamentos com NE"},
  {label:"Total liberado",valor:brl(resultado.totais.liberado),apoio:"Documentos internos de liberação"},
  {label:"Total pago",valor:brl(resultado.totais.pago),apoio:"Blocos de pagamento documentados"},
  {label:"Anulações",valor:brl(resultado.totais.anulado),apoio:"Anulação residual registrada"},
  {label:"Notas conciliadas",valor:String(resultado.totais.conciliados),apoio:"Conferência e encerramento"},
 ];
 function exportarResumo(){
  baixar("emenda-"+numeroEmenda.replace(/[^0-9A-Za-z_-]/g,"-")+"-lancamentos.csv",
   gerarCsvIndicadores(resultado.linhas,numeroEmenda));
 }
 function exportarAlertas(){
  const cab="sep=;\r\nEmenda;Severidade;Lançamento;Alerta;Detalhe\r\n";
  const cel=(v:string)=>'"'+(/^\s*[=+\-@]/.test(v)?"'":"")+v.replace(/"/g,'""').replace(/[\r\n]+/g," ")+'"';
  const rows=resultado.alertas.map(a=>[numeroEmenda,nivelNome[a.nivel],a.lancamentoId,a.titulo,a.detalhe].map(cel).join(";"));
  baixar("emenda-"+numeroEmenda.replace(/[^0-9A-Za-z_-]/g,"-")+"-alertas.csv",
   "\uFEFF"+cab+rows.join("\r\n")+"\r\n");
 }
 const percentual=resultado.totais.ne-resultado.totais.anulado>0?
  Math.min(100,Math.round(resultado.totais.pago/(resultado.totais.ne-resultado.totais.anulado)*100)):0;
 return <Card>
  <CardHeader className="space-y-2 pb-3">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4"/>Indicadores e integridade da emenda</CardTitle>
     <p className="mt-1 text-xs text-muted-foreground">Valores internos documentados; não são extratos bancários ou confirmação de execução na SEFAZ.</p></div>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" onClick={exportarResumo} disabled={!resultado.linhas.length}>
      <FileSpreadsheet className="mr-2 h-4 w-4"/>Relatório CSV</Button>
     <Button size="sm" variant="outline" onClick={exportarAlertas} disabled={!resultado.alertas.length}>
      <Download className="mr-2 h-4 w-4"/>Pendências CSV</Button>
    </div>
   </div>
  </CardHeader>
  <CardContent className="space-y-4">
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {metricas.map(m=><div key={m.label} className="rounded-lg border bg-muted/10 px-3 py-3">
     <p className="text-xs text-muted-foreground">{m.label}</p>
     <p className="mt-1 text-lg font-semibold tabular-nums">{m.valor}</p>
     <p className="text-[11px] text-muted-foreground">{m.apoio}</p>
    </div>)}
   </div>
   <div className="grid gap-3 lg:grid-cols-2">
    <div className="rounded-lg border p-3">
     <p className="text-xs font-semibold">Distribuição dos lançamentos por etapa</p>
     {!resultado.distribuicao.length?<p className="py-6 text-center text-xs text-muted-foreground">Abra um lançamento para iniciar os indicadores.</p>:
     <div className="mt-3 h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
       <BarChart layout="vertical" data={resultado.distribuicao} margin={{top:2,right:12,left:8,bottom:2}}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.35}/>
        <XAxis type="number" allowDecimals={false} tick={{fontSize:10}}/>
        <YAxis type="category" dataKey="fase" width={152} tick={{fontSize:10}}/>
        <Tooltip formatter={value=>[value,"Lançamentos"]}/>
        <Bar dataKey="quantidade" fill="var(--primary)" radius={[0,4,4,0]} maxBarSize={24}/>
       </BarChart>
      </ResponsiveContainer>
     </div>}
    </div>
    <div className="rounded-lg border p-3">
     <p className="text-xs font-semibold">Execução documentada das NEs</p>
     <div className="mt-3 flex items-baseline justify-between gap-2">
      <span className="text-2xl font-semibold tabular-nums">{percentual}%</span>
      <span className="text-xs text-muted-foreground">Pago / NE líquida de anulações</span>
     </div>
     <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar"
      aria-label="Pagamentos documentados em relação à NE líquida" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary" style={{width:percentual+"%"}}/>
     </div>
     <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><span className="text-muted-foreground">NE líquida</span>
       <p className="font-medium">{brl(resultado.totais.ne-resultado.totais.anulado)}</p></div>
      <div><span className="text-muted-foreground">Aguardando pagamento</span>
       <p className="font-medium">{brl(Math.max(0,resultado.totais.liberado-resultado.totais.pago))}</p></div>
      <div><span className="text-muted-foreground">Reservado em solicitações</span>
       <p className="font-medium">{brl(resultado.totais.reservado)}</p></div>
      <div><span className="text-muted-foreground">NE pendentes de conciliação</span>
       <p className="font-medium">{resultado.totais.emitidos-resultado.totais.conciliados}</p></div>
     </div>
    </div>
   </div>
   <section className="rounded-lg border">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
     <div className="flex flex-wrap items-center gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4"/>Alertas e pendências</h3>
      <Badge variant={qtdCriticos?"destructive":"outline"}>{qtdCriticos} críticos</Badge>
      <Badge variant="secondary">{qtdAtencao} atenção</Badge>
      <Badge variant="outline">{qtdInformativos} informativos</Badge>
     </div>
     <Select value={nivel} onValueChange={setNivel}>
      <SelectTrigger className="w-[180px]" aria-label="Filtrar alertas por severidade"><SelectValue/></SelectTrigger>
      <SelectContent><SelectItem value="todos">Todas as severidades</SelectItem>
       <SelectItem value="critico">Críticos</SelectItem><SelectItem value="atencao">Atenção</SelectItem>
       <SelectItem value="informativo">Informativos</SelectItem></SelectContent>
     </Select>
    </div>
    {alertas.length?<div className="max-h-80 divide-y overflow-y-auto">
     {alertas.map(a=><div key={a.chave} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1"><p className="font-semibold">{a.titulo}</p>
       <p className="mt-1 text-muted-foreground">{a.detalhe}</p></div>
      <div className="flex items-center gap-2"><Badge variant={a.nivel==="critico"?"destructive":"outline"}>{nivelNome[a.nivel]}</Badge>
       <Button size="sm" variant="ghost" asChild>
        <Link to="/emendas/$id/lancamentos/$lancamentoId"
         params={{id:emendaId,lancamentoId:a.lancamentoId}}>Ver lançamento</Link></Button>
      </div>
     </div>)}
    </div>:<p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
      <ShieldCheck className="h-4 w-4"/>Nenhuma pendência identificada para este filtro. Isso não substitui conferência documental.</p>}
   </section>
   <p className="text-[11px] text-muted-foreground">
    Alertas de 15 e 30 dias são parâmetros internos de acompanhamento, não prazos legais.
    Indicadores e relatórios refletem os lançamentos dos filtros aplicados na lista abaixo.
   </p>
  </CardContent>
 </Card>;
}
