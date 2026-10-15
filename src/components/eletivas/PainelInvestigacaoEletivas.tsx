import {useState} from "react";
import type {Tables} from "@/integrations/supabase/types";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {DossieFiscalEletivas} from "./DossieFiscalEletivas";
import {CATEGORIAS_ELETIVAS,reais,type CorrecaoEC} from "@/lib/eletivas/financeiro";
import {filtrosIniciaisEC,filtrarInvestigacaoEC,indicadoresInvestigacaoEC,
 type VistaEC} from "@/lib/eletivas/investigacao";

type Linha=Tables<"eletivas_itens">;
const dinheiro=(v:number)=>reais(v);
const situacoes:Record<string,string>={
 ok:"Compatível",info:"Informativo",div:"Divergente",
 nc:"Não contemplado",fora:"Fora do rol",pendente:"Pendente",
};
const vistas:[VistaEC,string][]=[
 ["todos","Todos"],["conciliados","Itens conciliados"],
 ["fila","Fila de auditoria"],["pendencias","Pendências"],
];
export function PainelInvestigacaoEletivas({itens,correcoes=[],irParaAuditoria}:{
 itens:Linha[];correcoes?:CorrecaoEC[];irParaAuditoria?:()=>void;
}){
 const [f,setF]=useState(filtrosIniciaisEC),[limite,setLimite]=useState(60);
 const r=indicadoresInvestigacaoEC(itens,correcoes);
 const filtrados=filtrarInvestigacaoEC(itens,f);
 const mudar=(change:Partial<typeof f>)=>{setF(x=>({...x,...change}));setLimite(60);};
 const cards:[string,number,boolean][]=[
  ["Publicado SES",r.publicado,true],["Esperado",r.esperado,true],
  ["Incontroverso conferido",r.incontroverso,true],["Admitido provisório",r.admitido,true],
  ["Correções aprovadas",r.corrigido,true],["Pendente",r.pendente,true],
  ["Em discussão",r.discussao,true],["Itens na fila",r.fila,false],
 ];
 return <div className="space-y-4">
  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
   {cards.map(([label,value,moeda])=><div key={label} className="rounded-lg border p-3">
     <p className="text-xs text-muted-foreground">{label}</p>
     <strong className="text-base sm:text-lg">{moeda?dinheiro(value):value}</strong>
   </div>)}
  </div>
  <div className="grid gap-2 md:grid-cols-3">
   {(["FAEC","MAC","SIA"] as const).map(grupo=>
     <div key={grupo} className="rounded-lg border p-3 text-xs space-y-1">
       <strong>{grupo} · {r.grupos[grupo].itens} itens</strong>
       <p>Publicado: {dinheiro(r.grupos[grupo].publicado)}</p>
       <p>Esperado: {dinheiro(r.grupos[grupo].esperado)}</p>
       <p>Provisoriamente admitido: {dinheiro(r.grupos[grupo].admitido)}</p>
     </div>)}
  </div>
  <section className="rounded-lg border p-3 space-y-3">
   <div className="flex flex-wrap justify-between gap-2">
    <div><h3 className="font-semibold">Investigação por procedimento e AIH</h3>
      <p className="text-xs text-muted-foreground">Filtre todos os itens sem abrir XLSX.
        Cada dossiê indica fontes, valores, regras e providências de conferência.</p>
    </div>
    {irParaAuditoria&&<Button size="sm" variant="outline" onClick={irParaAuditoria}>
      Abrir decisões fiscais</Button>}
   </div>
   <div className="flex flex-wrap gap-2">
     {vistas.map(([key,nome])=><Button key={key} size="sm"
       variant={f.vista===key?"default":"outline"} onClick={()=>mudar({vista:key})}>
       {nome}{key==="fila"?" ("+r.fila+")":key==="pendencias"?" ("+r.pendencias+")":""}
     </Button>)}
   </div>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
     <Input aria-label="Pesquisar item" placeholder="Buscar AIH, código ou descrição"
       value={f.busca} onChange={e=>mudar({busca:e.target.value})}/>
     <Select value={f.categoria} onValueChange={x=>mudar({categoria:x})}>
       <SelectTrigger><SelectValue placeholder="Componente"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todos os componentes</SelectItem>
        {CATEGORIAS_ELETIVAS.map(([id,nome])=>
          <SelectItem key={id} value={id}>{nome}</SelectItem>)}
       </SelectContent>
     </Select>
     <Select value={f.situacao} onValueChange={x=>mudar({situacao:x})}>
       <SelectTrigger><SelectValue placeholder="Situação"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todas as situações</SelectItem>
        {Object.entries(situacoes).map(([k,nome])=>
          <SelectItem key={k} value={k}>{nome}</SelectItem>)}
       </SelectContent>
     </Select>
     <Select value={f.decisao} onValueChange={x=>mudar({decisao:x})}>
       <SelectTrigger><SelectValue placeholder="Decisão"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todas as decisões</SelectItem>
        <SelectItem value="sem_decisao">Sem decisão</SelectItem>
        <SelectItem value="aceito">Aceito</SelectItem>
        <SelectItem value="oficio">Ofício à SES</SelectItem>
        <SelectItem value="erro">Erro confirmado</SelectItem>
        <SelectItem value="analise">Em análise</SelectItem>
       </SelectContent>
     </Select>
     <Select value={f.conferencia} onValueChange={x=>mudar({conferencia:x})}>
       <SelectTrigger><SelectValue placeholder="Conferência"/></SelectTrigger>
       <SelectContent><SelectItem value="todos">Todos os níveis de conferência</SelectItem>
        <SelectItem value="conferido">Conferidos</SelectItem>
        <SelectItem value="nao_conferido">Não conferidos</SelectItem>
       </SelectContent>
     </Select>
     <Button size="sm" variant="outline" onClick={()=>{
       setF(filtrosIniciaisEC);setLimite(60);
     }}>Limpar filtros</Button>
   </div>
   <p className="text-xs text-muted-foreground">{filtrados.length} de {itens.length} itens encontrados</p>
   <div className="space-y-2">
    {filtrados.slice(0,limite).map(item=>
      <details key={item.id} className="rounded-md border p-3">
       <summary className="cursor-pointer text-xs flex flex-wrap items-center justify-between gap-2">
         <span><strong>{item.descricao}</strong>
           <span className="ml-2 text-muted-foreground">{item.aih?"AIH "+item.aih+" · ":""}
             {item.procedimento??""} · {situacoes[item.situacao]??item.situacao}
           </span></span>
         <strong>SES {dinheiro(Math.round(item.valor_publicado*100))}</strong>
       </summary>
       <DossieFiscalEletivas item={item}/>
      </details>)}
    {filtrados.length===0&&<p className="text-xs text-muted-foreground">
      Nenhum registro neste recorte. Revise os filtros.</p>}
    {filtrados.length>limite&&<Button variant="outline" size="sm"
      onClick={()=>setLimite(n=>n+60)}>Carregar mais 60 itens</Button>}
   </div>
  </section>
  <p className="text-xs text-muted-foreground">Valores publicados e esperados são referências;
    apenas correções aprovadas entram no total. FAEC faixa MAC é controle, sem dupla soma.</p>
 </div>;
}
