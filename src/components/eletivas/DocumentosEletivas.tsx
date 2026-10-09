import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {resumoEncontro,reais,type ItemEC,type CorrecaoEC} from "@/lib/eletivas/financeiro";
import type {Tables,Json} from "@/integrations/supabase/types";

type Comp=Tables<"eletivas_competencias">;
type Itens=Tables<"eletivas_itens">[];
const campos=[
  ["rtma_numero","Nº SEI · Relatório Técnico de Monitoramento"],
  ["rtma_link","Link SEI · Relatório Técnico"],
  ["analise_numero","Nº SEI · Relatório de Análise"],
  ["analise_link","Link SEI · Relatório de Análise"],
] as const;
export function DocumentosEletivas({comp,itens,podeEditar,onRefresh}:{
  comp:Comp;itens:Itens;podeEditar:boolean;onRefresh:()=>void;
}){
  const orig=(comp.documentos??{}) as Record<string,any>;
  const [draft,setDraft]=useState<Record<string,string>>({
    ...Object.fromEntries(campos.map(([k])=>[k,String(orig[k]??"")])),
    fiscais_rtma:Array.isArray(orig.fiscais_rtma)?orig.fiscais_rtma.join("\n"):"",
    fiscais_analise:Array.isArray(orig.fiscais_analise)?orig.fiscais_analise.join("\n"):"",
  });
  const [correcao,setCorrecao]=useState({competencia_origem:"",valor:"",documento_sei:"",motivo:""});
  const correcoes=Array.isArray(comp.correcoes)?comp.correcoes as unknown as CorrecaoEC[]:[];
  const resumo=resumoEncontro(itens as unknown as ItemEC[],correcoes);
  const atualizar=useMutation({mutationFn:async()=>{
    const nomes=(s:string)=>s.split(/\n/).map(x=>x.trim()).filter(Boolean);
    const doc={...orig,...Object.fromEntries(campos.map(([k])=>[k,draft[k]?.trim()??""])),
      fiscais_rtma:nomes(draft.fiscais_rtma??""),
      fiscais_analise:nomes(draft.fiscais_analise??"")};
    const {error}=await supabase.from("eletivas_competencias")
      .update({documentos:doc as unknown as Json,status:"pendente_validacao"})
      .eq("id",comp.id).neq("status","encerrada");
    if(error)throw error;
  },onSuccess:()=>{toast.success("Referências SEI registradas");onRefresh()},
    onError:(e:Error)=>toast.error(e.message)});
  const incluir=useMutation({mutationFn:async()=>{
    const txt=correcao.valor.trim();
    const normalizado=txt.includes(",")?txt.replace(/\./g,"").replace(",","."):txt;
    const valor=Number(normalizado);
    if(!/^\d{2}\/\d{4}$/.test(correcao.competencia_origem)||
      !Number.isFinite(valor)||!correcao.documento_sei.trim()||
      correcao.motivo.trim().length<10)throw Error("Informe competência de origem, valor, documento e justificativa.");
    const proxima=[...correcoes,{...correcao,valor:Math.round(valor*100)/100}];
    const {error}=await supabase.from("eletivas_competencias")
      .update({correcoes:proxima as unknown as Json}).eq("id",comp.id).neq("status","encerrada");
    if(error)throw error;
  },onSuccess:()=>{toast.success("Correção registrada na competência");onRefresh();
    setCorrecao({competencia_origem:"",valor:"",documento_sei:"",motivo:""});},
    onError:(e:Error)=>toast.error(e.message)});
  const fechar=useMutation({mutationFn:async()=>{
    const {data,error}=await supabase.rpc("ec_encerrar",{p_comp:comp.id});
    if(error)throw error;return data;
  },onSuccess:v=>{toast.success("Encontro encerrado com valor de "+reais(Math.round(Number(v)*100)));
    onRefresh();},onError:(e:Error)=>toast.error("Encerramento impedido: "+e.message)});
  return <div className="space-y-5">
    <div className="rounded-lg border bg-muted/30 p-3">
      <h3 className="font-semibold">Memória do valor a atestar</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        {[["FAEC",resumo.faec],["MAC",resumo.mac],["SIA",resumo.sia],
          ["Correções",resumo.correcoes]].map(([titulo,v])=>
          <div className="rounded-md border bg-background p-2" key={titulo}>
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <strong>{reais(Number(v))}</strong></div>)}
      </div>
      <p className="mt-3 font-semibold">Total prévio: {reais(resumo.total)}</p>
      <p className="text-xs text-muted-foreground">A memória considera somente itens registrados.
        {resumo.pendencias.length>0&&` Há ${resumo.pendencias.length} pendência(s) sem decisão.`}</p>
    </div>
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Documentos do processo SEI</h3>
      <p className="text-xs text-muted-foreground">Números e links comprovam o registro documental;
        os nomes abaixo são uma declaração dos signatários informados, não assinaturas digitais.</p>
      <div className="grid gap-3 sm:grid-cols-2">{campos.map(([k,t])=>
        <label key={k} className="text-xs">{t}<Input className="mt-1" value={draft[k]??""}
          disabled={!podeEditar} onChange={e=>setDraft(x=>({...x,[k]:e.target.value}))}/></label>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Fiscais signatários do Relatório Técnico (mínimo 2, terceiro opcional)
          <Textarea className="mt-1" rows={3} value={draft.fiscais_rtma??""} disabled={!podeEditar}
            placeholder="Um fiscal por linha" onChange={e=>setDraft(x=>({...x,fiscais_rtma:e.target.value}))}/></label>
        <label className="text-xs">Fiscal signatário do Relatório de Análise (mínimo 1)
          <Textarea className="mt-1" rows={3} value={draft.fiscais_analise??""} disabled={!podeEditar}
            placeholder="Um fiscal por linha" onChange={e=>setDraft(x=>({...x,fiscais_analise:e.target.value}))}/></label>
      </div>
      {podeEditar&&<Button disabled={atualizar.isPending} onClick={()=>atualizar.mutate()}>
        Salvar referências documentais</Button>}
    </div>
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Correções recebidas de competências anteriores</h3>
      <p className="text-xs text-muted-foreground">Somar uma única vez ao encontro atual,
        com competência de origem e documento SEI. Não repetir a produção do mês.</p>
      {correcoes.map((x,i)=><div key={i} className="flex justify-between border-b pb-2 text-sm">
        <span>{x.competencia_origem} · {x.documento_sei} · {x.motivo}</span>
        <strong>{reais(Math.round(x.valor*100))}</strong></div>)}
      {podeEditar&&<div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Competência origem MM/AAAA" value={correcao.competencia_origem}
          onChange={e=>setCorrecao(x=>({...x,competencia_origem:e.target.value}))}/>
        <Input placeholder="Valor da correção R$" value={correcao.valor}
          onChange={e=>setCorrecao(x=>({...x,valor:e.target.value}))}/>
        <Input placeholder="Documento SEI da correção" value={correcao.documento_sei}
          onChange={e=>setCorrecao(x=>({...x,documento_sei:e.target.value}))}/>
        <Input placeholder="Justificativa (mínimo 10 caracteres)" value={correcao.motivo}
          onChange={e=>setCorrecao(x=>({...x,motivo:e.target.value}))}/>
        <Button variant="outline" disabled={incluir.isPending} onClick={()=>incluir.mutate()}>
          Registrar correção</Button>
      </div>}
    </div>
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">Encerramento auditável</h3>
      <p className="mb-3 text-xs text-muted-foreground">O servidor verificará fontes obrigatórias,
        decisões fiscais, documentos SEI e signatários declarados, e recalculará o valor
        antes do encerramento. Não altera automaticamente o lançamento do convênio.</p>
      {comp.status==="encerrada"?
        <strong className="text-primary">Encerrado · valor fechado {reais(Math.round(Number(comp.valor_fechado)*100))}</strong>:
        podeEditar&&<Button disabled={fechar.isPending} onClick={()=>{
          if(window.confirm("Confirma que os relatórios e decisões foram conferidos no SEI?"))
            fechar.mutate();
        }}>{fechar.isPending?"Validando…":"Conferir e encerrar encontro"}</Button>}
    </div>
  </div>;
}
