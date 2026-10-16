import {useMemo,useState} from "react";
import {Search,Layers,Eye} from "lucide-react";
import type {Tables} from "@/integrations/supabase/types";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {DossieFiscalEletivas} from "./DossieFiscalEletivas";
import {normaParaCompetencia} from "../../../supabase/functions/_shared/eletivas-normativas";
type Linha=Tables<"eletivas_itens">;
const record=(o:unknown):Record<string,unknown>=>o&&typeof o==="object"&&!Array.isArray(o)?
 o as Record<string,unknown>:{};
const estados:Record<string,{nome:string,tom:"neutral"|"warning"|"danger"}>={
 ok:{nome:"Compatível",tom:"neutral"},bad:{nome:"Incompatível",tom:"danger"},
 review:{nome:"Revisão necessária",tom:"warning"},fpo:{nome:"Depende de FPO",tom:"warning"}
};
type Caso={id:string;aih:string;estado:string;faixa:string;principal:string;item:Linha};
export function AuditorFaixaEletivas({itens,competencia,busca="",onAbrirFila}:{
 itens:Linha[];competencia:string;busca?:string;onAbrirFila:()=>void;
}){
 const [selecionado,setSelecionado]=useState<string|null>(null);
 const [filtro,setFiltro]=useState("");
 const [estado,setEstado]=useState("todos");
 const norma=normaParaCompetencia(competencia);
 const casos=useMemo(()=>itens.flatMap(i=>{
  if(!["faec_mult","mac_mult"].includes(i.categoria))return [];
  const d=record(i.detalhe),perfil=record(d.perfil);
  const linhas=Array.isArray(d.aihs)?d.aihs.map(record):[perfil];
  return linhas.map((p,idx):Caso=>({
   id:i.id+":"+idx,aih:String(p.aih??i.aih??""),
   estado:String(p.estado??d.classificacao_auditor??"review"),
   faixa:String(p.faixa??""),
   principal:String(p.principal??d.principal??""),
   item:i
  })).filter(c=>!!c.aih);
 }),[itens]);
 const filtroTxt=(busca+" "+filtro).toLocaleLowerCase("pt-BR").trim();
 const apresentados=casos.filter(c=>(estado==="todos"||c.estado===estado)&&
  (!filtroTxt||[c.aih,c.item.procedimento,c.item.descricao,c.principal,c.estado]
   .join(" ").toLocaleLowerCase("pt-BR").includes(filtroTxt)));
 const escolhido=casos.find(c=>c.id===selecionado);
 return <div className="ec-sections space-y-4">
  <section className="ec-paper">
   <div className="ec-actions justify-between">
    <div><h3 className="text-lg font-semibold">Auditor de faixa e composição individual</h3>
     <p className="ec-footnote">Confronto entre a faixa distribuída à AIH e os
      procedimentos-filhos dos Anexos I e II. A classificação do workbook não substitui a matriz.</p>
    </div><span className="ec-stamp" data-variant="neutral">
     {norma?.rotulo??"Norma a conferir"}</span>
   </div>
   <div className="ec-kpis mt-4">
    {(["ok","bad","review","fpo"] as const).map(k=><div key={k}
     className="ec-kpi" data-tone={k==="bad"?"red":k==="ok"?"green":"gold"}>
      <div className="ec-k-label">{estados[k].nome}</div>
      <div className="ec-k-value">{casos.filter(c=>c.estado===k).length}</div>
     </div>)}
   </div>
  </section>
  <section className="ec-ledger">
   <div className="ec-ledger-head"><div>
    <h3><Layers className="mr-2 inline h-4 w-4"/>Investigação por AIH</h3>
    <p>Abra o dossiê para conferir procedimentos, fontes e justificativas.</p></div>
    <button type="button" className="ec-action alt" onClick={onAbrirFila}>Abrir fila de auditoria</button>
   </div>
   <div className="flex flex-wrap gap-2 p-4">
    <label className="ec-search flex-1"><Search className="h-4 w-4" aria-hidden="true"/>
      <Input aria-label="Buscar AIH na auditoria de faixa" className="border-none shadow-none"
       value={filtro} onChange={e=>setFiltro(e.target.value)}
       placeholder="Pesquisar AIH, procedimento ou principal"/></label>
    <select aria-label="Filtrar enquadramento" value={estado}
     onChange={e=>setEstado(e.target.value)}
     className="rounded-lg border bg-white px-3 py-2 text-xs">
      <option value="todos">Todos os enquadramentos</option>
      {Object.entries(estados).map(([k,v])=><option key={k} value={k}>{v.nome}</option>)}
    </select>
   </div>
   <div className="ec-table-scroll"><table>
    <thead><tr><th>AIH</th><th>Componente / principal</th><th>Faixa</th><th>Enquadramento</th><th>Dossiê</th></tr></thead>
    <tbody>
     {apresentados.map(c=><tr key={c.id}>
      <td className="font-mono">{c.aih}</td>
      <td><b>{c.item.categoria}</b><div className="ec-footnote">{c.principal||c.item.descricao}</div></td>
      <td>{c.faixa||"Conferir origem"}</td>
      <td><span className="ec-stamp" data-variant={estados[c.estado]?.tom??"warning"}>
        {estados[c.estado]?.nome??"Não classificado"}</span></td>
      <td><Button size="sm" variant="outline" onClick={()=>setSelecionado(c.id)}>
       <Eye className="mr-1 h-3.5 w-3.5"/> Abrir</Button></td>
     </tr>)}
     {!apresentados.length&&<tr><td colSpan={5}>
      Nenhuma AIH corresponde à pesquisa ou às fontes desta competência.
      Isso não comprova inexistência do procedimento na CIB.</td></tr>}
    </tbody></table></div>
   <p className="ec-footnote p-4">{apresentados.length} de {casos.length}
    registros individuais. Valores esperados e publicados permanecem nos
    itens financeiros de origem, sem repartição fictícia entre AIHs.</p>
  </section>
  <Dialog open={!!escolhido} onOpenChange={aberto=>!aberto&&setSelecionado(null)}>
   <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
    <DialogHeader><DialogTitle className="font-serif">Dossiê fiscal · AIH {escolhido?.aih}</DialogTitle></DialogHeader>
    {escolhido&&<DossieFiscalEletivas item={escolhido.item}/>}
    <div className="flex justify-end">
     <Button variant="outline" onClick={()=>setSelecionado(null)}>Fechar dossiê</Button>
    </div>
   </DialogContent>
  </Dialog>
 </div>;
}
