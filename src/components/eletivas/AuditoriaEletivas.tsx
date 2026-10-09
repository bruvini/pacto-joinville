import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {CATEGORIAS_ELETIVAS,resumoEncontro,reais,type ItemEC} from "@/lib/eletivas/financeiro";
type Linha=Tables<"eletivas_itens">;
const parseMoeda=(v:string)=>{
  const cleaned=v.replace(/\s|R\$/g,"").trim();
  const normalized=cleaned.includes(",")?cleaned.replace(/\./g,"").replace(",","."):cleaned;
  return Number(normalized);
};
const STATUS=["ok","info","div","nc","fora","pendente"];
const DECISOES=["aceito","oficio","erro","analise"];
const nomeDecisao:Record<string,string>={
  aceito:"Aceito",oficio:"Ofício à SES",erro:"Erro confirmado",analise:"Em análise",
};
export function AuditoriaEletivas({id,itens,podeEditar,onRefresh,fontesCompletas}:{
  id:string;itens:Linha[];podeEditar:boolean;onRefresh:()=>void;
  fontesCompletas:boolean;
}){
  const [form,setForm]=useState({categoria:"faec_compl",descricao:"",aih:"",
    valor_publicado:"",valor_esperado:"",situacao:"pendente"});
  const [notas,setNotas]=useState<Record<string,string>>({});
  const [decisoes,setDecisoes]=useState<Record<string,string>>({});
  const resumo=resumoEncontro(itens as unknown as ItemEC[]);
  const processar=useMutation({
    mutationFn:async()=>{
      const {data,error}=await supabase.functions.invoke("eletivas-processar",{
        body:{competencia_id:id},
      });
      if(error){
        let detail=error.message;
        try{
          const json=await error.context?.json?.();
          if(json?.error) detail=String(json.error)+
            (Array.isArray(json.impedimentos)? " — "+json.impedimentos.join(" · "):"");
        }catch{ /* preserva erro de transporte */ }
        throw Error(detail);
      }
      return data as {itens:number;totais:{publicado:number}};
    },
    onSuccess:(r)=>{toast.success(`${r.itens} itens processados. Conferência humana pendente.`);onRefresh()},
    onError:(e:Error)=>toast.error("Conciliação não executada",{description:e.message}),
  });
  const conferir=useMutation({
    mutationFn:async(linha:Linha)=>{
      const {error}=await supabase.from("eletivas_itens")
        .update({situacao:linha.situacao}).eq("id",linha.id).eq("competencia_id",id)
        .is("conferido_em",null);
      if(error)throw error;
    },
    onSuccess:()=>{toast.success("Conferência fiscal registrada");onRefresh()},
    onError:(e:Error)=>toast.error(e.message),
  });
  const criar=useMutation({mutationFn:async()=>{
    if(!form.descricao.trim())throw Error("Descreva o procedimento ou linha de conciliação.");
    const publicado=parseMoeda(form.valor_publicado);
    const esperado=parseMoeda(form.valor_esperado);
    if(!Number.isFinite(publicado)||!Number.isFinite(esperado)||publicado<0||esperado<0)
      throw Error("Informe os dois valores financeiros válidos.");
    const {error}=await supabase.from("eletivas_itens").insert({
      competencia_id:id,chave:crypto.randomUUID(),
      categoria:form.categoria,descricao:form.descricao.trim(),
      aih:form.aih.trim()||null,
      valor_publicado:Math.round(publicado*100)/100,
      valor_esperado:Math.round(esperado*100)/100,
      situacao:form.situacao,origem:"manual",
    });
    if(error)throw error;
  },onSuccess:()=>{toast.success("Linha manual registrada e auditada");onRefresh();
    setForm(x=>({...x,descricao:"",aih:"",valor_publicado:"",valor_esperado:""}));},
    onError:(e:Error)=>toast.error(e.message)});
  const decidir=useMutation({mutationFn:async(idLinha:string)=>{
    const decisao=decisoes[idLinha];
    const justificativa=(notas[idLinha]??"").trim();
    if(!decisao)throw Error("Selecione a decisão fiscal.");
    if(justificativa.length<10)throw Error("Informe uma justificativa de pelo menos 10 caracteres.");
    const {error}=await supabase.from("eletivas_itens")
      .update({decisao,justificativa}).eq("id",idLinha).eq("competencia_id",id);
    if(error)throw error;
  },onSuccess:()=>{toast.success("Decisão registrada na trilha de auditoria");onRefresh();},
    onError:(e:Error)=>toast.error(e.message)});
  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/30 p-3">
      <h3 className="font-semibold">Memória financeira e decisões por item</h3>
      <p className="text-xs text-muted-foreground">O HTML original separa produção, complemento,
        múltiplas/sequenciais, correções e recortes somente informativos. O valor abaixo
        reflete as linhas processadas no servidor ou lançadas manualmente. O cálculo do atesto depende da conferência fiscal.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {([["FAEC",resumo.faec],["MAC",resumo.mac],["SIA",resumo.sia],
          ["Sem decisão",resumo.pendencias.length]] as const).map(([label,v])=>
          <div className="rounded-md border bg-background p-2" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <strong>{label==="Sem decisão"?v:reais(v)}</strong></div>)}
      </div>
      <p className="mt-2 text-xs">Recorte FAEC faixa MAC: controle de auditoria, não soma novamente.</p>
    </div>
    {podeEditar&&<div className="rounded-lg border border-primary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Processar arquivos DBF e SES/SC</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            O servidor confere SHA-256, interpreta tabulações e matrizes do Estado
            e registra os itens como pendentes de conferência fiscal.
            Divergências de múltiplas e sequenciais sem memória por AIH bloqueiam a importação.
          </p>
        </div>
        <Button variant="outline" disabled={!fontesCompletas||processar.isPending}
          onClick={()=>processar.mutate()}>
          <RefreshCw className="mr-1.5 h-4 w-4"/>
          {processar.isPending?"Processando fontes…":"Executar conciliação"}
        </Button>
      </div>
      {!fontesCompletas&&<p className="mt-2 text-xs text-amber-800">
        Importar primeiro DBF FAEC/MAC e SES FAEC/MAC na aba Fontes.
      </p>}
    </div>}
    {podeEditar&&<div className="rounded-lg border p-3">
      <h3 className="mb-3 text-sm font-semibold">Adicionar item conferido manualmente</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Categoria
          <Select value={form.categoria} onValueChange={v=>setForm(x=>({...x,categoria:v}))}>
            <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>
              {CATEGORIAS_ELETIVAS.map(([v,label])=><SelectItem key={v} value={v}>{label}</SelectItem>)}
            </SelectContent></Select></label>
        <label className="text-xs">Situação da auditoria
          <Select value={form.situacao} onValueChange={v=>setForm(x=>({...x,situacao:v}))}>
            <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>
              {STATUS.map(v=><SelectItem value={v} key={v}>{v}</SelectItem>)}
            </SelectContent></Select></label>
        <label className="text-xs">Descrição do procedimento
          <Input className="mt-1" value={form.descricao} onChange={e=>setForm(x=>({...x,descricao:e.target.value}))}/></label>
        <label className="text-xs">AIH, se houver
          <Input className="mt-1" value={form.aih} onChange={e=>setForm(x=>({...x,aih:e.target.value}))}/></label>
        <label className="text-xs">Valor publicado pela SES (R$)
          <Input className="mt-1" inputMode="decimal" placeholder="0,00" value={form.valor_publicado}
            onChange={e=>setForm(x=>({...x,valor_publicado:e.target.value}))}/></label>
        <label className="text-xs">Valor esperado da tabulação (R$)
          <Input className="mt-1" inputMode="decimal" placeholder="0,00" value={form.valor_esperado}
            onChange={e=>setForm(x=>({...x,valor_esperado:e.target.value}))}/></label>
      </div>
      <Button className="mt-3" disabled={criar.isPending} onClick={()=>criar.mutate()}>
        {criar.isPending?"Registrando…":"Registrar item manual"}</Button>
    </div>}
    {itens.length===0?<p className="p-4 text-sm text-muted-foreground">
      Nenhum item registrado. O mecanismo automático de leitura DBF/SES será integrado separadamente.</p>:
    <div className="space-y-3">{itens.map(item=><div key={item.id} className="rounded-lg border p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div><strong className="text-sm">{item.descricao}</strong>
          <p className="text-xs text-muted-foreground">{item.categoria} · {item.situacao}
            {item.aih?" · AIH "+item.aih:""} · Origem: {item.origem}</p></div>
        <strong className="text-sm">SES {reais(Math.round(item.valor_publicado*100))}</strong>
      </div>
      <div className="mt-2 text-xs">Esperado: {reais(Math.round(item.valor_esperado*100))}
        {item.decisao&&<span className="ml-2 font-medium text-primary">· {nomeDecisao[item.decisao]}</span>}
        <span className="ml-2 text-muted-foreground">· {item.conferido_em?"Conferido":"Pendente de conferência"}</span>
      </div>
      {podeEditar&&!item.conferido_em&&(
        <Button size="sm" variant="outline" className="mt-2"
          disabled={conferir.isPending} onClick={()=>conferir.mutate(item)}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Confirmar conferência deste item
        </Button>
      )}
      {podeEditar&&item.situacao!=="ok"&&item.situacao!=="info"&&
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <Select value={decisoes[item.id]??item.decisao??""} onValueChange={v=>
            setDecisoes(x=>({...x,[item.id]:v}))}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Decisão fiscal"/></SelectTrigger>
            <SelectContent>{DECISOES.map(v=><SelectItem key={v} value={v}>{nomeDecisao[v]}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea className="min-w-[220px] flex-1" rows={2} placeholder="Justificativa fiscal (obrigatória)"
            value={notas[item.id]??item.justificativa??""}
            onChange={e=>setNotas(x=>({...x,[item.id]:e.target.value}))}/>
          <Button variant="outline" disabled={decidir.isPending} onClick={()=>
            decidir.mutate(item.id)}>Salvar decisão</Button>
        </div>}
    </div>)}</div>}
  </div>;
}
