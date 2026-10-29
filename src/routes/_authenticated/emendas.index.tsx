import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Landmark, Plus, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useCatalogosEmendas, useListaEmendas, invalidarEmendas } from "@/hooks/useEmendas";
import { FormularioEmenda } from "@/components/emendas/FormularioEmenda";
import { type CadastroEmenda, nomeSituacao } from "@/lib/emendas/cadastro";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/emendas/")({
 head:()=>({meta:[{title:"Emendas Parlamentares | PACTO Joinville"}]}),component:EmendasIndex,
});
function Filtro({value,onChange,all,options,label}:{
 value:string;onChange:(s:string)=>void;all:string;options:{value:string;label:string}[];label:string;
}){
 return <Select value={value} onValueChange={onChange}>
  <SelectTrigger aria-label={label}><SelectValue/></SelectTrigger>
  <SelectContent><SelectItem value="todos">{all}</SelectItem>
   {options.map(x=><SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
  </SelectContent>
 </Select>;
}
function EmendasIndex(){
 const {roles}=useAuth();
 const podeEditar=hasRole(roles,"acp");
 const [dialog,setDialog]=useState(false);
 const [busca,setBusca]=useState("");
 const [situacao,setSituacao]=useState("todos");
 const [instituicao,setInstituicao]=useState("todos");
 const [modalidade,setModalidade]=useState("todos");
 const [origem,setOrigem]=useState("todos");
 const [ano,setAno]=useState("todos");
 const qc=useQueryClient();
 const navigate=useNavigate();
 const catalogos=useCatalogosEmendas();
 const lista=useListaEmendas();
 const cadastro=lista.data?.cadastro??[];
 const resumo=lista.data?.resumo??[];
 const vigente=new Map(resumo.map(x=>[x.id,Number(x.valor_autorizado_vigente??x.valor_autorizado_inicial??0)]));
 const disponivel=new Map(resumo.map(x=>[x.id,Number(x.saldo_disponivel??x.valor_autorizado_vigente??0)]));
 const instituicoes=new Map(catalogos.prestadores.map(x=>[x.id,x.nome_instituicao]));
 const convenios=new Map(catalogos.convenios.map(x=>[x.id,x.objeto]));
 const opcoes=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=>({value:v,label:v}));
 const anos=opcoes(cadastro.map(x=>String(x.exercicio))).sort((a,b)=>Number(b.value)-Number(a.value));
 const limpar=()=>{setBusca("");setSituacao("todos");setInstituicao("todos");setModalidade("todos");setOrigem("todos");setAno("todos");};
 const filtrados=useMemo(()=>cadastro.filter(e=>{
  if(situacao!=="todos"&&e.situacao!==situacao)return false;
  if(instituicao!=="todos"&&e.prestador_id!==instituicao)return false;
  if(modalidade!=="todos"&&e.modalidade!==modalidade)return false;
  if(origem!=="todos"&&e.origem_recurso!==origem)return false;
  if(ano!=="todos"&&String(e.exercicio)!==ano)return false;
  const texto=[e.numero,e.objeto,e.autoria_parlamentar,e.numero_proposta,e.processo_sei_numero,
   e.numero_portaria_municipal,instituicoes.get(e.prestador_id)].join(" ").toLocaleLowerCase("pt-BR");
  return texto.includes(busca.trim().toLocaleLowerCase("pt-BR"));
 }),[cadastro,busca,situacao,instituicao,modalidade,origem,ano,catalogos.prestadores]);
 const soma=(field:"valor_autorizado_vigente"|"valor_reservado"|"valor_empenhado"|"saldo_disponivel")=>
  filtrados.reduce((total,e)=>{
   const item=resumo.find(r=>r.id===e.id);
   return total+Number(item?.[field]??(field==="valor_autorizado_vigente"?e.valor_autorizado_inicial:0));
  },0);
 const exportarCadastro=()=>{
  const campos=["Número","Instituição","Convênio","Situação","Origem","Modalidade",
   "Limite vigente","Reservado","Empenhado líquido","Saldo disponível"];
  const cel=(valor:string|number)=>{
   const s=String(valor);
   return '"'+(/^\s*[=+\-@]/.test(s)?"'":"")+s.replace(/"/g,'""').replace(/[\r\n]+/g," ")+'"';
  };
  const linhas=filtrados.map(e=>{
   const r=resumo.find(x=>x.id===e.id);
   return [e.numero,instituicoes.get(e.prestador_id)??"",convenios.get(e.convenio_id??"")??"",
    nomeSituacao(e.situacao),e.origem_recurso,e.modalidade,
    r?.valor_autorizado_vigente??e.valor_autorizado_inicial,r?.valor_reservado??0,
    r?.valor_empenhado??0,r?.saldo_disponivel??0].map(cel).join(";");
  });
  const csv="\uFEFF"+[campos.map(cel).join(";"),...linhas].join("\r\n")+"\r\n";
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="emendas-pacto-resumo.csv";
  document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const criar=useMutation({
  mutationFn:async(form:CadastroEmenda)=>{
   const r=await supabase.from("emendas").insert(form).select("id").single();
   if(r.error)throw r.error;
   return r.data.id;
  },
  onSuccess:async id=>{
   await invalidarEmendas(qc);setDialog(false);
   toast.success("Emenda cadastrada.");
   await navigate({to:"/emendas/$id",params:{id}});
  },
 });
 return <div className="space-y-5">
  <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 md:p-7">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="max-w-3xl space-y-2">
     <Badge variant="outline">Emendas · Gestão por lançamentos</Badge>
     <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
      <Landmark className="h-6 w-6"/>Execução de Emendas Parlamentares</h1>
     <p className="text-sm leading-relaxed text-muted-foreground">
      Cadastro, competências, parcelas e documentação dos empenhos em um só lugar.
      Os lançamentos são preparados antes da formalização da solicitação.</p>
    </div>
    <div className="flex flex-wrap gap-2">
     <Button variant="outline" disabled={!filtrados.length} onClick={exportarCadastro}>
      <Download className="mr-2 h-4 w-4"/>Exportar resumo CSV</Button>
     {podeEditar&&<Button onClick={()=>setDialog(true)}><Plus className="mr-2 h-4 w-4"/>Nova emenda</Button>}
    </div>
   </div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    {[
     ["Emendas filtradas",String(filtrados.length)],
     ["Emendas ativas",String(filtrados.filter(x=>x.situacao==="ativa").length)],
     ["Limite vigente",brl(soma("valor_autorizado_vigente"))],
     ["NE líquida registrada",brl(soma("valor_empenhado"))],
     ["Saldo disponível",brl(soma("saldo_disponivel"))],
    ].map(([titulo,valor])=><div className="rounded-lg border bg-card/75 p-3" key={titulo}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <b className="mt-1 block text-lg tabular-nums">{valor}</b>
    </div>)}
   </div>
  </section>
  <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
   <ShieldCheck className="h-4 w-4 shrink-0 text-primary"/>
   <span>Abertura de lançamento não reserva saldo. A reserva ocorre após conferência documental e das assinaturas; a NE é registrada apenas quando emitida.</span>
  </div>
  <Card>
   <CardHeader><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4"/>Emendas cadastradas</CardTitle>
    <CardDescription>Listagem em tabela, filtros combináveis e acesso ao detalhamento individual.</CardDescription></CardHeader>
   <CardContent className="space-y-3">
    <div className="grid gap-2 lg:grid-cols-[minmax(200px,2fr)_repeat(3,minmax(120px,1fr))]">
     <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
      <Input className="pl-9" value={busca} onChange={e=>setBusca(e.target.value)}
       placeholder="Número, objeto, autoria, portaria, processo SEI..."/></div>
     <Filtro label="Situação" value={situacao} onChange={setSituacao} all="Todas as situações"
      options={["cadastrada","ativa","suspensa","encerrada"].map(v=>({value:v,label:nomeSituacao(v)}))}/>
     <Filtro label="Instituição" value={instituicao} onChange={setInstituicao} all="Todas as instituições"
      options={catalogos.prestadores.map(x=>({value:x.id,label:x.nome_instituicao}))}/>
     <Filtro label="Exercício" value={ano} onChange={setAno} all="Todos os exercícios" options={anos}/>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
     <Filtro label="Modalidade" value={modalidade} onChange={setModalidade} all="Todas as modalidades"
      options={opcoes(cadastro.map(x=>x.modalidade))}/>
     <Filtro label="Origem do recurso" value={origem} onChange={setOrigem} all="Todas as origens"
      options={opcoes(cadastro.map(x=>x.origem_recurso))}/>
     <Button variant="outline" onClick={limpar}>Limpar filtros</Button>
    </div>
    <p className="text-xs text-muted-foreground">{filtrados.length} de {cadastro.length} emenda(s) exibida(s)</p>
    {lista.isPending||catalogos.loading?<p className="p-4 text-sm text-muted-foreground">Carregando...</p>:
     lista.error||catalogos.error?<p role="alert" className="p-4 text-sm text-destructive">
      Falha de consulta: {String((lista.error||catalogos.error)?.message??"")}</p>:
     <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[1050px] text-left text-sm">
       <thead className="bg-muted/40 text-xs text-muted-foreground">
        <tr><th className="p-3">Emenda</th><th className="p-3">Instituição / Convênio</th>
         <th className="p-3">Objeto e autoria</th><th className="p-3">Origem / modalidade</th>
         <th className="p-3">Situação</th><th className="p-3 text-right">Limite vigente</th>
         <th className="p-3 text-right">Disponível</th></tr>
       </thead>
       <tbody className="divide-y">
        {!filtrados.length&&<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma emenda encontrada.</td></tr>}
        {filtrados.map(e=><tr key={e.id} tabIndex={0} role="link"
          aria-label={"Abrir emenda "+e.numero}
          onClick={()=>navigate({to:"/emendas/$id",params:{id:e.id}})}
          onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();navigate({to:"/emendas/$id",params:{id:e.id}});}}}
          className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
         <td className="p-3 font-semibold text-primary">{e.numero}</td>
         <td className="p-3"><span className="block font-medium">{instituicoes.get(e.prestador_id)??"Instituição não localizada"}</span>
           {e.convenio_id&&<span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{convenios.get(e.convenio_id)??"Convênio vinculado"}</span>}</td>
         <td className="max-w-[310px] p-3"><span className="line-clamp-2 font-medium">{e.objeto}</span>
          <span className="text-xs text-muted-foreground">{e.autoria_parlamentar}</span></td>
         <td className="p-3 text-xs">{e.origem_recurso}<br/>{e.modalidade}</td>
         <td className="p-3"><Badge variant="secondary">{nomeSituacao(e.situacao)}</Badge></td>
         <td className="whitespace-nowrap p-3 text-right tabular-nums">{brl(vigente.get(e.id)??Number(e.valor_autorizado_inicial))}</td>
         <td className="whitespace-nowrap p-3 text-right tabular-nums">{brl(disponivel.get(e.id)??0)}</td>
        </tr>)}
       </tbody>
      </table>
     </div>}
   </CardContent>
  </Card>
  <Dialog open={dialog} onOpenChange={setDialog}>
   <DialogContent className="max-h-[95vh] w-[min(98vw,1000px)] max-w-5xl overflow-y-auto">
    <DialogHeader><DialogTitle>Nova Emenda Parlamentar</DialogTitle>
     <DialogDescription>Informe os dados cadastrais; as etapas documentais serão criadas por lançamento.</DialogDescription>
    </DialogHeader>
    <FormularioEmenda {...catalogos} onCancelar={()=>setDialog(false)} onSalvar={async dados=>{await criar.mutateAsync(dados);}}/>
   </DialogContent>
  </Dialog>
 </div>;
}
