import {Archive,FileText,ShieldCheck} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {brl} from "@/lib/format";
import {documentoValor,type DocumentoFluxo} from "@/components/emendas/FluxoCampoEmenda";
import type {Tables} from "@/integrations/supabase/types";

type Liberacao=Tables<"emenda_liberacoes">;
type PagamentoLegado=Tables<"emenda_blocos_pagamento">;

const CAMPOS_DOCUMENTAIS=[
 ["comprovante","Documento comprobatório do fluxo anterior"],
 ["solicitacao","Solicitação do fluxo anterior"],
 ["aviso","Aviso de Movimento registrado no fluxo anterior"],
 ["programacao","Programação documental anterior"],
 ["pagamento","Comprovante documental anterior"],
] as const;

function ReferenciaSei({numero,link}:{numero:string;link:string}){
 const url=/^https:\/\/\S+$/i.test(link)?link:null;
 return <span className="flex flex-wrap items-center gap-1">
  <FileText className="h-3.5 w-3.5 shrink-0"/>
  <span>{numero||"Documento sem número SEI"}</span>
  {url?<a href={url} target="_blank" rel="noopener noreferrer"
   className="ml-1 text-primary underline">Abrir no SEI</a>:
   <span className="text-amber-800">· Link SEI não informado</span>}
 </span>;
}

/**
 * Consulta de evidências existentes. Nunca cria ou conclui liberação,
 * subempenho, programação nem pagamento. As Fases D/E são a única
 * interface operacional para novas Emendas.
 */
export function ConsultaLegadoEmenda({
 documentos,liberacoes,pagamentos
}:{
 documentos:DocumentoFluxo[];
 liberacoes:Liberacao[];
 pagamentos:PagamentoLegado[];
}){
 const antigos=documentos.filter(d=>d.contexto.startsWith("lib:")||d.contexto.startsWith("pag:"));
 if(!antigos.length&&!liberacoes.length&&!pagamentos.length)return null;

 return <details className="rounded-lg border border-dashed bg-muted/10">
  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-xs font-semibold">
   <Archive className="h-4 w-4"/>
   Registros do fluxo anterior · somente consulta
   <Badge variant="outline">{antigos.length} documento(s) · {liberacoes.length} liberação(ões) histórica(s)</Badge>
  </summary>
  <div className="space-y-3 border-t p-4">
   <p className="text-xs text-muted-foreground">
    Estes registros foram preservados para conferência histórica. A liberação de recursos
    pertence ao modelo de Convênios e não faz parte da execução atual de Emendas.
    Nenhuma informação abaixo pode ser completada, convertida ou enviada por este painel.
    Para novos atos, utilize a distribuição da NE, as solicitações de subempenho e o
    fluxo do e-Pública acima.
   </p>
   {antigos.map(d=><section key={d.id} className="space-y-2 rounded-md border bg-background p-3">
    <p className="text-xs font-semibold">
     Documento original · {d.contexto}
    </p>
    <Badge variant={d.liberacao_id||d.pagamento_id?"outline":"secondary"}>
     {d.liberacao_id||d.pagamento_id?
      "Vinculação histórica existente":"Sem liberação ou pagamento vinculado"}
    </Badge>
    {CAMPOS_DOCUMENTAIS.map(([campo,rotulo])=>{
     const numero=documentoValor(d,campo+"_numero");
     const link=documentoValor(d,campo+"_link");
     return numero||link?<div key={campo} className="text-xs">
      <span className="block text-muted-foreground">{rotulo}</span>
      <ReferenciaSei numero={numero} link={link}/>
     </div>:null;
    })}
   </section>)}
   {liberacoes.map(l=><section key={l.id} className="space-y-1 rounded-md border bg-background p-3">
    <p className="text-xs font-semibold">Liberação histórica registrada · {brl(Number(l.valor))}</p>
    <ReferenciaSei numero={l.numero_sei??""} link={l.link_sei??""}/>
   </section>)}
   {pagamentos.map(p=><section key={p.id} className="space-y-1 rounded-md border bg-background p-3">
    <p className="text-xs font-semibold">Pagamento do livro anterior · {brl(Number(p.valor))}</p>
    <ReferenciaSei numero={p.numero_sei??""} link={p.link_sei??""}/>
   </section>)}
   <p className="flex items-center gap-2 text-xs text-muted-foreground">
    <ShieldCheck className="h-3.5 w-3.5"/>
    Visão somente leitura, sem RPC financeira e sem criação automática de documentos.
   </p>
  </div>
 </details>;
}
