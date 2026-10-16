import {useState} from "react";
import * as XLSX from "xlsx";
import {useQuery} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {FileSpreadsheet,Copy,FileText,Mail} from "lucide-react";
import {gerarRtmaHtmlEC,gerarAnaliseHtmlEC,extrairTextoHtmlEC,
  quadroAtestoEC,conferirDocumentosEC,moedaCent,
  type ContextoFase5EC} from "@/lib/eletivas/fase5Documentos";
import {gerarEncaminhamentoHtmlEC,prepararEncaminhamentoEC} from "@/lib/eletivas/fase5Ses";
import {gerarXlsxHtmlFase7EC,gerarCsvDivergenciasFase7EC,
 type ConsolidadoSES} from "@/lib/eletivas/fase7Exportacao";
import {gerarAnaliseSeisSecoesEC} from "@/lib/eletivas/fase7Relatorios";

type Doc="rtma"|"analise"|"ses";
export function DocumentacaoFase5Eletivas({ctx,id,documentosSalvos,modo="atesto",consolidadoSES=null}:{
  ctx:ContextoFase5EC;id:string;documentosSalvos:boolean;
  modo?:"atesto"|"exportar";consolidadoSES?:ConsolidadoSES|null;
}){
 const [tipo,setTipo]=useState<Doc>("rtma");
 const fontes=useQuery({queryKey:["ec-fontes-documentos",id],queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_arquivos")
     .select("id,categoria,nome_original,sha256").eq("competencia_id",id);
   if(error)throw error;return data??[];
 }});
 const fpo=useQuery({queryKey:["ec-fpo-documentos",id],queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_fpo_programacoes")
     .select("procedimento,competencia_programacao,documento_sei,vigencia_inicio,vigencia_fim,valor_federal_unitario")
     .eq("competencia_id",id);
   if(error)throw error;return data??[];
 }});
 const comunicacoes=useQuery({queryKey:["ec-fase7-comunicacoes",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_comunicacoes").select("*")
    .eq("competencia_id",id).order("atualizado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const fluxos=useQuery({queryKey:["ec-fase7-fluxos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_fluxos").select("*")
    .eq("competencia_id",id).order("atualizado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const eventos=useQuery({queryKey:["ec-fase7-eventos",id],queryFn:async()=>{
  const lista:{id:number;comunicacao_id:string;competencia_id:string;acao:string;destino_anterior:string|null;situacao_anterior:string|null;destino_novo:string;situacao_nova:string;protocolo:string|null;assunto:string|null;conteudo_md5:string|null;justificativa:string;autor:string;registrado_em:string}[]=[];
  for(let inicio=0;inicio<10000;inicio+=500){
   const {data,error}=await supabase.from("eletivas_comunicacoes_eventos")
    .select("*").eq("competencia_id",id)
    .order("registrado_em",{ascending:true}).order("id",{ascending:true})
    .range(inicio,inicio+499);
   if(error)throw error;
   lista.push(...(data??[]));
   if((data??[]).length<500)return lista;
  }
  throw Error("Histórico excede 10 mil eventos. Solicite extração auditada.");
 }});
 const completo={...ctx,fontes:fontes.data??[],fpo:fpo.data??[],
  consolidadoSES,comunicacoes:comunicacoes.data??[],fluxos:fluxos.data??[],
  eventos:eventos.data??[]};
 const quadro=quadroAtestoEC(completo);
 const pendencias=conferirDocumentosEC(completo);
 const ses=prepararEncaminhamentoEC(completo);
 const htmls={rtma:gerarRtmaHtmlEC(completo),
   analise:gerarAnaliseSeisSecoesEC(completo),ses:gerarEncaminhamentoHtmlEC(completo)};
 const copiar=async(html:string,formato:"html"|"text"="html")=>{
   const texto=extrairTextoHtmlEC(html);
   try{
     if(formato==="html"&&typeof ClipboardItem!=="undefined"&&navigator.clipboard.write){
       await navigator.clipboard.write([new ClipboardItem({
         "text/html":new Blob(['<meta charset="utf-8">'+html],{type:"text/html"}),
         "text/plain":new Blob([texto],{type:"text/plain"}),
       })]);
     }else{
       await navigator.clipboard.writeText(texto);
     }
     toast.success("Minuta copiada. Cole no SEI e confira conteúdo, documento e assinatura.");
   }catch{
     try{
       await navigator.clipboard.writeText(texto);
       toast.success("Minuta copiada como texto simples.");
     }catch{
       toast.error("O navegador bloqueou a área de transferência.");
     }
   }
 };
 const copiarTexto=async(txt:string)=>{
   try{
     await navigator.clipboard.writeText(txt);toast.success("Texto copiado.");
   }catch{toast.error("Não foi possível copiar. Selecione o texto manualmente.");}
 };
 const exportarPronto=![fontes,fpo,comunicacoes,fluxos,eventos]
  .some(q=>q.isLoading||q.isError);
 const exportar=()=>{
   if(!exportarPronto){
     toast.error("Fontes, comunicações, FPO ou histórico indisponíveis. Exportação integral bloqueada.");
     return;
   }
   XLSX.writeFile(gerarXlsxHtmlFase7EC(completo),
     "Auditoria_EC_"+ctx.cnes+"_"+ctx.competencia.replace("/","-")+".xlsx");
   toast.success("XLSX com 10 abas do HTML gerado; revise o Checkmate SES.");
 };
 const exportarCsv=()=>{
   if(!exportarPronto){
    toast.error("Aguarde a carga das evidências institucionais.");return;
   }
   const texto=gerarCsvDivergenciasFase7EC(completo);
   const url=URL.createObjectURL(new Blob([texto],{type:"text/csv;charset=utf-8"}));
   const a=document.createElement("a");a.href=url;
   a.download="Divergencias_EC_"+ctx.cnes+"_"+ctx.competencia.replace("/","-")+".csv";
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   toast.success("CSV de divergências exportado.");
 };
 const integridadeCritica=quadro.diferenca!==0||quadro.pendencias.length>0||
  !quadro.quantidadeConfiavel;
 return <section className="space-y-4 rounded-lg border p-4">
  <div className="flex flex-wrap justify-between gap-3">
   <div>
    <h3 className="font-semibold">RTMA, Relatório de Análise (6 seções) e exportações — Fase 7</h3>
    <p className="text-xs text-muted-foreground">Modelos em HTML com tabelas copiáveis
      para o editor SEI. Sempre são minutas: não simulam assinatura ou autenticação.</p>
   </div>
   <div className="flex flex-wrap gap-2">
    <Button variant="outline" onClick={exportar} disabled={!exportarPronto}>
     <FileSpreadsheet className="mr-2 h-4 w-4"/>XLSX (10 abas do HTML)
    </Button>
    <Button variant="outline" onClick={exportarCsv} disabled={!exportarPronto}>
      CSV de divergências
    </Button>
   </div>
  </div>
  {(!documentosSalvos||pendencias.length>0)&&<div role="alert"
    className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
    <strong>MINUTA — não é atesto ou documento assinado.</strong>
    {!documentosSalvos&&<p>Salve as referências documentais antes de considerar esta versão consolidada.</p>}
    {pendencias.map((p,i)=><p key={i}>• {p}</p>)}
  </div>}
  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
   <strong>Quadro de atesto calculado (somente leitura)</strong>
   <div className="overflow-x-auto">
    <table className="w-full text-xs">
     <thead><tr className="border-b"><th className="p-2 text-left">Componente</th>
       <th className="p-2 text-right">Valor</th></tr></thead>
     <tbody>{quadro.linhas.map(l=><tr key={l.id} className="border-b">
       <td className="p-2">{l.nome}</td><td className="p-2 text-right font-semibold">{moedaCent(l.valorCentavos)}</td>
      </tr>)}
      <tr className="border-b"><td className="p-2">Correções aprovadas (não alterar por aqui)</td>
        <td className="p-2 text-right">{moedaCent(quadro.correcoesCent)}</td></tr>
      <tr className="font-semibold"><td className="p-2">Valor total calculado</td>
        <td className="p-2 text-right">{moedaCent(quadro.total)}</td></tr>
     </tbody>
    </table>
   </div>
   <p className="text-xs text-muted-foreground">Quantidade de cirurgias:
    {quadro.quantidadeConfiavel?" "+quadro.aihsIdentificadas:
     " a validar — "+quadro.aihsIdentificadas+" AIH(s) identificadas sem base integral."}
    {" "}A faixa FAEC/MAC de controle não entra duas vezes no total.</p>
  </div>
  <div className="flex flex-wrap gap-2">
   {([["rtma","RTMA"],["analise","Relatório de Análise"],["ses","Encaminhamentos SES"]] as const)
     .map(([id,label])=><Button key={id} size="sm" onClick={()=>setTipo(id)}
       variant={tipo===id?"default":"outline"}>
       {id==="ses"?<Mail className="mr-1.5 h-4 w-4"/>:
         <FileText className="mr-1.5 h-4 w-4"/>}{label}</Button>)}
  </div>
  {integridadeCritica&&tipo!=="ses"&&<p role="alert"
    className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
    Emissão bloqueada por integridade de dados: confira quantidades de AIHs,
    pendências fiscais e reconciliação centavo a centavo. A prévia permanece
    disponível para análise; não copie como documento oficial.
  </p>}
  {tipo==="ses"&&<div className="space-y-3 rounded-md border p-3">
    <h4 className="font-semibold">Encaminhamentos à Secretaria de Estado da Saúde</h4>
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded border p-2 text-xs"><p className="text-muted-foreground">Cobrança líquida apta</p>
        <strong>{moedaCent(ses.totalCent)}</strong></div>
      <div className="rounded border p-2 text-xs"><p className="text-muted-foreground">Itens em cobrança</p>
        <strong>{ses.cobrancas.length}</strong></div>
      <div className="rounded border p-2 text-xs"><p className="text-muted-foreground">Pedidos técnicos</p>
        <strong>{ses.analises.length}</strong></div>
    </div>
    {ses.valorZero&&<p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      Cobrança líquida de R$ 0,00: esta minuta não constitui pedido financeiro. Se houver
      casos, encaminhe-os apenas como análise técnica.</p>}
    {ses.alertas.length>0&&<details className="rounded-md border p-2 text-xs">
      <summary className="cursor-pointer font-semibold">{ses.alertas.length} alertas de cobrança impedida</summary>
      {ses.alertas.map((a,i)=><p key={i} className="py-1">{a}</p>)}
    </details>}
    <div className="space-y-1"><label htmlFor="ec-assunto-ses" className="text-xs font-medium">
        Assunto do e-mail (separado do corpo)</label>
      <div className="flex flex-wrap gap-2">
        <Input id="ec-assunto-ses" readOnly value={ses.assunto} className="flex-1"/>
        <Button size="sm" variant="outline" onClick={()=>copiarTexto(ses.assunto)}>
          <Copy className="mr-1 h-3 w-3"/>Copiar assunto</Button>
      </div>
    </div>
    <div className="space-y-1"><label htmlFor="ec-corpo-ses" className="text-xs font-medium">
        Corpo da mensagem (revisar antes de enviar)</label>
      <Textarea id="ec-corpo-ses" rows={14} readOnly value={ses.corpo}
        className="font-mono text-xs"/>
      <Button size="sm" variant="outline" onClick={()=>copiarTexto(ses.corpo)}>
        <Copy className="mr-1 h-3 w-3"/>Copiar corpo do e-mail</Button>
    </div>
    <p className="text-xs text-muted-foreground">Nenhum e-mail é enviado pelo sistema.
      O assunto e o corpo são gerados de forma distinta; envio/assinatura cabem à equipe.</p>
  </div>}
  <div className="space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <strong>Visualização estruturada — {tipo==="rtma"?"RTMA":tipo==="analise"?
        "Relatório de Análise":"Encaminhamento SES"}</strong>
      <div className="flex gap-2">
        <Button size="sm" disabled={tipo!=="ses"&&integridadeCritica}
          onClick={()=>copiar(htmls[tipo])}>
          <Copy className="mr-1 h-3.5 w-3.5"/>Copiar HTML formatado
        </Button>
        <Button size="sm" variant="outline"
          disabled={tipo!=="ses"&&integridadeCritica}
          onClick={()=>copiar(htmls[tipo],"text")}>
          Copiar texto</Button>
      </div>
    </div>
    <div className="max-h-[610px] overflow-auto rounded-lg border bg-white p-4 text-black"
      dangerouslySetInnerHTML={{__html:htmls[tipo]}}/>
    <p className="text-xs text-muted-foreground">A prévia é gerada somente com conteúdo
      escapado/sanitizado. Confira tabelas no editor SEI e assinaturas efetivas antes do uso.</p>
  </div>
 </section>;
}
