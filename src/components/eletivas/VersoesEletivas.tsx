import type {Tables} from "@/integrations/supabase/types";
import {FONTES_ELETIVAS,type FonteId} from "@/lib/eletivas/fontes";
import type {SelecaoFonteEC} from "@/lib/eletivas/processarLocal";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
type Fonte=Tables<"eletivas_arquivos">;
const data=(v:string)=>new Date(v).toLocaleString("pt-BR");
export function VersoesEletivas({arquivos,selecao,onSelecionar}:{
 arquivos:Fonte[];selecao:SelecaoFonteEC;
 onSelecionar:(categoria:FonteId,id:string|undefined)=>void;
}){
 const grupos=FONTES_ELETIVAS.filter(x=>x.grupo!=="SEI"&&x.id!=="outros")
   .filter(x=>arquivos.some(a=>a.categoria===x.id));
 return <section className="rounded-lg border bg-muted/20 p-3 space-y-3">
   <div><h3 className="text-sm font-semibold">Versões de fontes para esta execução</h3>
   <p className="text-xs text-muted-foreground">Selecione expressamente a versão por papel.
     Fontes opcionais deixadas em “Não incluir” não entram no cálculo. O manifesto final
     congela os IDs e hashes escolhidos, mesmo que existam uploads mais recentes.</p></div>
   {!grupos.length?<p className="text-xs">Nenhuma fonte cadastrada.</p>:
   <div className="grid gap-3 sm:grid-cols-2">{grupos.map(papel=>{
     const opcoes=arquivos.filter(a=>a.categoria===papel.id)
       .sort((a,b)=>b.enviado_em.localeCompare(a.enviado_em)||b.id.localeCompare(a.id));
     const obrigatoria=papel.obrigatoria;
     return <label className="text-xs" key={papel.id}>
       <span className="mb-1 block font-semibold">{papel.rotulo}
       {obrigatoria?<span className="ml-1 text-amber-800">Obrigatória</span>:null}</span>
       <Select value={selecao[papel.id]??"__nao_incluir"}
         onValueChange={v=>onSelecionar(papel.id,v==="__nao_incluir"?undefined:v)}>
         <SelectTrigger className="bg-background text-xs"><SelectValue/></SelectTrigger>
         <SelectContent>
           <SelectItem value="__nao_incluir">Não incluir nesta execução</SelectItem>
           {opcoes.map((a,i)=><SelectItem key={a.id} value={a.id}>
             {a.nome_original} · {data(a.enviado_em)} · SHA {a.sha256.slice(0,10)}
             {i===0?" · mais recente":""}
           </SelectItem>)}
         </SelectContent>
       </Select>
     </label>;
   })}</div>}
 </section>;
}
