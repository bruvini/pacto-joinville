import {useQuery} from "@tanstack/react-query";
import {Link} from "@tanstack/react-router";
import {AlertTriangle,FileSearch,Download,ShieldCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {csvExcelSeguro} from "@/lib/emendas/gerencial";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";

type Item=Tables<"emenda_h_legado_conferencia">;
const LIMITE=500;
const seguro=(link:string|null|undefined)=>/^https:\/\/\S+$/i.test(link??"")?link:null;
const nomeArquivo=(numero:string)=>"emenda-"+numero.replace(/[^0-9A-Za-z_-]/g,"-")+"-conferencia-legado.csv";
export function PainelConferenciaLegadoEmenda({
 emendaId,numeroEmenda
}:{emendaId:string;numeroEmenda:string}){
 const consulta=useQuery({
  queryKey:["emendas","legado-conferencia-h",emendaId],
  queryFn:async()=>{
   const todas:Item[]=[];
   for(let n=0;n<10000;n+=LIMITE){
    const r=await supabase.from("emenda_h_legado_conferencia").select("*")
     .eq("emenda_id",emendaId).order("origem_id").range(n,n+LIMITE-1);
    if(r.error)throw r.error;
    todas.push(...(r.data??[]));
    if((r.data?.length??0)<LIMITE)return todas;
   }
   throw new Error("Mais de 10.000 registros legados. Não exportar dados incompletos.");
  }
 });
 const itens=consulta.data??[];
 const pendentes=itens.filter(r=>r.situacao_evidencia==="pendente_conferencia");
 const exportar=()=>{
  if(!consulta.data) return;
  const csv=csvExcelSeguro(
   ["Emenda","Origem","ID origem","Lançamento","Competência","Contexto",
    "Situação da evidência","Valor origem","SEI original","Link SEI original",
    "Vínculo comprovado","Orientação","Conversão automática autorizada"],
   itens.map(i=>[numeroEmenda,i.origem,i.origem_id,i.lancamento_id,i.competencia_id,
    i.contexto,i.situacao_evidencia,i.valor_referencia?.toFixed(2),
    i.numero_sei,i.link_sei,i.tem_relacao_original?"Sim":"Não",
    i.orientacao,"Não"])
  );
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=nomeArquivo(numeroEmenda);document.body.appendChild(a);
  a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="space-y-3 rounded-lg border p-4"
  aria-label="Conferência de registros financeiros anteriores">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 text-sm font-semibold">
     <FileSearch className="h-4 w-4"/>Conferência de registros do fluxo anterior
    </h3>
    <p className="mt-1 text-xs text-muted-foreground">
     Classificação documental não destrutiva. Evidência SEI presente não converte automaticamente
     liberação, documento ou bloco de pagamento em subempenho.
    </p>
   </div>
   <div className="flex flex-wrap gap-2">
    {consulta.data&&<Badge variant={pendentes.length?"destructive":"outline"}>
     {pendentes.length} pendência(s) de conferência
    </Badge>}
    <Button size="sm" variant="outline" disabled={!consulta.data}
     onClick={exportar}>
     <Download className="mr-1 h-3.5 w-3.5"/>Relatório de legado CSV
    </Button>
   </div>
  </div>
  {consulta.isPending&&<p className="text-xs text-muted-foreground">
   Conferindo referências originais e registros sem vínculo...
  </p>}
  {consulta.error&&<p className="text-xs text-destructive" role="alert">
   A conferência do legado não está disponível: {consulta.error.message}.
   Verifique a migration H1 antes de liberar esta interface.
  </p>}
  {consulta.data&&!itens.length&&<p className="flex gap-2 text-xs text-muted-foreground">
   <ShieldCheck className="h-4 w-4"/>Nenhum registro do fluxo financeiro anterior a classificar.
  </p>}
  {consulta.data&&itens.length>0&&<div className="overflow-x-auto rounded border">
   <table className="w-full min-w-[840px] text-left text-xs">
    <thead className="bg-muted/30 text-muted-foreground"><tr>
     <th className="p-3">Origem / contexto</th>
     <th className="p-3">Situação documental</th>
     <th className="p-3 text-right">Valor registrado</th>
     <th className="p-3">Evidência</th>
     <th className="p-3 text-right">Acesso</th>
    </tr></thead>
    <tbody className="divide-y">
     {itens.map(i=><tr key={i.origem+":"+i.origem_id}>
      <td className="p-3"><p className="font-semibold">{i.origem?.replaceAll("_"," ")}</p>
       <p className="mt-1 text-muted-foreground">{i.contexto}</p>
      </td>
      <td className="max-w-sm p-3">
       <Badge variant={i.situacao_evidencia==="pendente_conferencia"?"destructive":"outline"}>
        {i.situacao_evidencia==="pendente_conferencia"?"Conferência necessária":
         "Evidência SEI cadastrada"}
       </Badge>
       <p className="mt-1 text-muted-foreground">{i.orientacao}</p>
      </td>
      <td className="p-3 text-right tabular-nums">
       {i.valor_referencia===null?"Não informado":brl(Number(i.valor_referencia))}
      </td>
      <td className="p-3">
       {seguro(i.link_sei)?<a href={seguro(i.link_sei)!}
        target="_blank" rel="noopener noreferrer" className="text-primary underline">
        SEI {i.numero_sei??"abrir"}
       </a>:<span className="text-muted-foreground">Sem link SEI suficiente</span>}
      </td>
      <td className="p-3 text-right">
       {i.lancamento_id&&<Button size="sm" variant="ghost" asChild>
        <Link to="/emendas/$id/lancamentos/$lancamentoId"
         params={{id:emendaId,lancamentoId:i.lancamento_id}}>Ver lançamento</Link>
       </Button>}
      </td>
     </tr>)}
    </tbody>
   </table>
  </div>}
  {pendentes.length>0&&<p className="flex items-start gap-2 rounded-md border p-3 text-xs">
   <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
   Confira manualmente o documento SEI e sua vinculação antes de classificar a
   execução histórica. Não crie Aviso de Movimento, número de subempenho ou
   comprovante para preencher uma ausência documental.
  </p>}
 </section>;
}
