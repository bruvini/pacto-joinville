import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, AlertCircle, Info } from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {CATEGORIAS_ELETIVAS,resumoEncontro,reais,type ItemEC} from "@/lib/eletivas/financeiro";
import {executarPreConciliacaoLocal, ErroPreConciliacao, type FonteEscolhida} from "@/lib/eletivas/processarLocal";
import {DossieFiscalEletivas,requerRevisaoDocumental} from "./DossieFiscalEletivas";
import {filtrarInvestigacaoEC,filtrosIniciaisEC,type VistaEC} from "@/lib/eletivas/investigacao";
type Linha=Tables<"eletivas_itens">;
const parseMoeda=(v:string)=>{
  const cleaned=v.replace(/\s|R\$/g,"").trim();
  const normalized=cleaned.includes(",")?cleaned.replace(/\./g,"").replace(",","."):cleaned;
  return Number(normalized);
};
const STATUS=["ok","info","div","nc","fora","pendente"];
const DECISOES=["aceito","oficio","erro","analise"];
const nomeDecisao:Record<string,string>={
  aceito:"Aceitar valor publicado",oficio:"Solicitar à SES por ofício",
  erro:"Erro confirmado — desconsiderar",analise:"Manter em análise",
};
const explicacaoDecisao:Record<string,string>={
  aceito:"Admite o valor efetivamente publicado; use somente após comprovação.",
  oficio:"Encaminha divergência fundamentada à SES; não lança valor não recebido automaticamente.",
  erro:"Erro interno/externo confirmado: este valor deixa de compor o atesto.",
  analise:"Aguardando documento, FPO ou enquadramento. Não equivale a aceite.",
};
export function AuditoriaEletivas({id,itens,podeEditar,onRefresh,fontesCompletas,arquivos,cnes,competencia}:{
  id:string;itens:Linha[];podeEditar:boolean;onRefresh:()=>void;
  fontesCompletas:boolean;arquivos:FonteEscolhida[];
  cnes:string;competencia:string;
}){
  const [progresso,setProgresso]=useState("");
  const [erroConcilia,setErroConcilia]=useState<{
    etapa:string;arquivo?:string;detalhe:string;orientacao:string}|null>(null);
  const [avisosFontes,setAvisosFontes]=useState<string[]>([]);
  const [form,setForm]=useState({categoria:"faec_compl",descricao:"",aih:"",
    valor_publicado:"",valor_esperado:"",situacao:"pendente"});
  const qc=useQueryClient();
  const [notas,setNotas]=useState<Record<string,string>>({});
  const [decisoes,setDecisoes]=useState<Record<string,string>>({});
  const [motivosRevisao,setMotivosRevisao]=useState<Record<string,string>>({});
  const [historicoId,setHistoricoId]=useState<string|null>(null);
  const [busca,setBusca]=useState("");
  const [vista,setVista]=useState<VistaEC>("fila");
  const [categoriaFiltro,setCategoriaFiltro]=useState("todos");
  const [situacaoFiltro,setSituacaoFiltro]=useState("todos");
  const [decisaoFiltro,setDecisaoFiltro]=useState("todos");
  const [conferenciaFiltro,setConferenciaFiltro]=useState<"todos"|"conferido"|"nao_conferido">("todos");
  const [limite,setLimite]=useState(80);
  const filtrados=filtrarInvestigacaoEC(itens,{...filtrosIniciaisEC,
    busca,vista,categoria:categoriaFiltro,situacao:situacaoFiltro,
    decisao:decisaoFiltro,conferencia:conferenciaFiltro});
  const historico=useQuery({queryKey:["ec-revisoes",historicoId],
    enabled:!!historicoId,queryFn:async()=>{
      const {data,error}=await supabase.from("eletivas_decisoes_revisoes")
        .select("*").eq("item_id",historicoId!)
        .order("versao",{ascending:false});
      if(error)throw error;return data??[];
    }});
  const correcoesFinanceiras=useQuery({
    queryKey:["ec-correcoes-resumo",id],
    queryFn:async()=>{
      const {data,error}=await supabase.from("eletivas_correcoes")
       .select("competencia_origem,valor,documento_sei,motivo,status")
       .eq("competencia_id",id);
      if(error)throw error;
      return data??[];
    },
  });
  const resumoSql=useQuery({
    queryKey:["ec-financeiro-sql",id],
    queryFn:async()=>{
      const {data,error}=await supabase.rpc("ec_resumo_financeiro",{p_comp:id});
      if(error)throw error;
      if(!data||typeof data!=="object"||Array.isArray(data))
       throw Error("Resumo financeiro retornou um documento inválido.");
      return data as Record<string,unknown>;
    },
  });
  const resumo=resumoEncontro(itens as unknown as ItemEC[],correcoesFinanceiras.data??[]);
  const sqlCent=(campo:string)=>{
    const v=resumoSql.data?.[campo];
    return typeof v==="number"||typeof v==="string"?
     Math.round(Number(v)*100):NaN;
  };
  const pronto=resumoSql.isSuccess&&correcoesFinanceiras.isSuccess;
  const divergente=pronto&&(
   sqlCent("fiscalmente_admitido")!==resumo.encontro||
   sqlCent("correcoes")!==resumo.correcoes||
   sqlCent("total_com_correcoes")!==resumo.total);
  const processar=useMutation({
    mutationFn:()=>executarPreConciliacaoLocal({
      id,cnes,competencia,arquivos,progresso:setProgresso,
    }),
    onSuccess:(r)=>{
      setProgresso("");setErroConcilia(null);setAvisosFontes(r.avisos);
      toast.success(r.itens+" itens pré-conciliados no navegador. Conferência fiscal obrigatória.");
      onRefresh();
    },
    onError:(e:Error)=>{
      setProgresso("");
      setErroConcilia(e instanceof ErroPreConciliacao?{
        etapa:e.etapa,arquivo:e.arquivo,detalhe:e.detalhe,orientacao:e.orientacao
      }:{etapa:"Pré-conciliação",detalhe:e.message,
        orientacao:"Confira a mensagem e os documentos importados."});
      toast.error("Não foi possível pré-conciliar. Veja o diagnóstico na tela.");
    },
  });
  const conferir=useMutation({
    mutationFn:async(linha:Linha)=>{
      const {error}=await supabase.rpc("ec_conferir_item",{p_item:linha.id});
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
    const atual=itens.find(x=>x.id===idLinha);
    if(!atual)throw Error("Item alterado ou não encontrado. Atualize a página.");
    const decisao=decisoes[idLinha]??atual.decisao??"";
    const justificativa=(notas[idLinha]??atual.justificativa??"").trim();
    if(!decisao)throw Error("Selecione a decisão fiscal.");
    if(decisao==="aceito"&&requerRevisaoDocumental(atual))
      throw Error("Não é possível aceitar sem evidências independentes da múltipla/FPO.");
    if(justificativa.length<10)throw Error("Informe justificativa de pelo menos 10 caracteres.");
    const motivo=(motivosRevisao[idLinha]??"").trim();
    if(atual.decisao&&motivo.length<15)
      throw Error("Revisão de decisão anterior exige motivo formal de pelo menos 15 caracteres.");
    const {error}=await supabase.rpc("ec_decidir_item",{
      p_item:idLinha,p_decisao:decisao,p_justificativa:justificativa,
      p_versao:atual.decisao_versao,p_motivo_revisao:motivo||null,
    });
    if(error)throw error;
  },onSuccess:()=>{
    toast.success("Decisão fiscal registrada com versão e trilha de revisão.");
    qc.invalidateQueries({queryKey:["ec-revisoes"]});onRefresh();
  },onError:(e:Error)=>toast.error(e.message)});
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
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        {([["Publicado pela SES",resumo.publicado],["Esperado pela memória",resumo.esperado],
           ["Incontroverso · EC-base",resumo.encontro],
           ["Correções aprovadas",resumo.correcoes],["Diferenças por ofício",resumo.oficio],
           ["Atesto preliminar",resumo.total]] as const).map(([rotulo,valor])=>
          <div key={rotulo} className="rounded-md border bg-background p-2">
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <strong>{reais(valor)}</strong>
          </div>)}
      </div>
      <p className="mt-2 text-xs">
        FAEC faixa MAC: {reais(resumo.controleFaecFxMac)} de controle, excluídos da soma.
        O valor a cobrar não integra o atesto enquanto não houver pagamento comprovado.</p>
      {(resumoSql.isError||correcoesFinanceiras.isError)&&
        <p role="alert" className="mt-2 text-xs text-destructive">
          Não foi possível verificar o resumo fiscal no banco. Confira SQL Fase 3
          e permissões antes de encaminhar o atesto.</p>}
      {divergente&&<p role="alert" className="mt-2 rounded border border-destructive p-2 text-xs text-destructive">
        Divergência React × banco em centavos: encontro local {reais(resumo.encontro)}
        {" "}× banco {reais(sqlCent("fiscalmente_admitido"))};
        correções {reais(resumo.correcoes)} × {reais(sqlCent("correcoes"))};
        total preliminar {reais(resumo.total)} × {reais(sqlCent("total_com_correcoes"))}.
        Não homologue antes de conciliar as origens e aplicar a migration da Fase 3.</p>}
      {pronto&&!divergente&&<p className="mt-2 text-xs text-emerald-700">
        Conferência local × banco: subtotal, correções e atesto preliminar coincidem em centavos.
        Isto não substitui o confronto com o HTML e os arquivos oficiais.</p>}
    </div>
    {podeEditar&&<div className="rounded-lg border border-primary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Pré-conciliar arquivos no navegador (sem Edge Function)</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            O navegador identifica os arquivos já enviados, confere o SHA-256,
            interpreta TabWin/SES e envia a pré-conciliação por RPC autenticada.
            O banco registra a origem local e o manifesto, SEM certificar o cálculo.
            É obrigatória conferência fiscal item a item. Impedimentos bloqueiam toda a gravação.
          </p>
        </div>
        <Button variant="outline" disabled={!fontesCompletas||processar.isPending}
          onClick={()=>processar.mutate()}>
          <RefreshCw className="mr-1.5 h-4 w-4"/>
          {processar.isPending?"Analisando no navegador…":"Pré-conciliar arquivos da competência"}
        </Button>
      </div>
      {progresso&&<p aria-live="polite" className="mt-2 text-xs text-primary">{progresso}</p>}
      {erroConcilia&&<div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0"/> Não foi possível concluir: {erroConcilia.etapa}
        </div>
        {erroConcilia.arquivo&&<p className="text-xs">
          <strong>Arquivo:</strong> {erroConcilia.arquivo}</p>}
        <p className="whitespace-pre-line break-words text-xs">{erroConcilia.detalhe}</p>
        <p className="text-xs text-muted-foreground"><strong>O que fazer:</strong> {erroConcilia.orientacao}</p>
        <p className="text-xs font-medium">Nenhum cálculo incompleto foi gravado.</p>
      </div>}
      {avisosFontes.length>0&&<div className="mt-3 rounded-lg border p-3 space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold"><Info className="h-4 w-4"/>
          Fontes consultadas sem publicação para o HMSJ</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {avisosFontes.map((a,i)=><li key={i}>{a}</li>)}
        </ul>
        <p className="text-xs">Esses arquivos continuam arquivados e rastreados; valores de outros
          hospitais não entram nos totais.</p>
      </div>}
      {!fontesCompletas&&<p className="mt-2 text-xs text-amber-800">
        Importe primeiro DBF FAEC/MAC e SES FAEC/MAC na aba Fontes.
      </p>}
    </div>}
    {podeEditar&&<div className="rounded-lg border p-3">
      <h3 className="mb-3 text-sm font-semibold">Adicionar item manual (exige conferência posterior)</h3>
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
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap gap-2">
        {([["todos","Todos os itens"],["conciliados","Itens conciliados"],
           ["fila","Fila de auditoria"],["pendencias","Pendências"]] as const)
          .map(([key,label])=><Button key={key} size="sm"
            variant={vista===key?"default":"outline"}
            onClick={()=>{setVista(key);setLimite(80);}}>{label}</Button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input value={busca} placeholder="Pesquisar AIH, procedimento ou descrição"
          onChange={e=>{setBusca(e.target.value);setLimite(80);}}/>
        <Select value={categoriaFiltro} onValueChange={v=>{
          setCategoriaFiltro(v);setLimite(80);}}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os componentes</SelectItem>
            {CATEGORIAS_ELETIVAS.map(([id,label])=>
              <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={situacaoFiltro} onValueChange={v=>{setSituacaoFiltro(v);setLimite(80);}}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todas as situações</SelectItem>
            {STATUS.map(v=><SelectItem value={v} key={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={decisaoFiltro} onValueChange={v=>{setDecisaoFiltro(v);setLimite(80);}}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todas as decisões</SelectItem>
            <SelectItem value="sem_decisao">Sem decisão</SelectItem>
            {DECISOES.map(v=><SelectItem value={v} key={v}>{nomeDecisao[v]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={conferenciaFiltro} onValueChange={v=>{
          setConferenciaFiltro(v as typeof conferenciaFiltro);setLimite(80);}}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="todos">Qualquer conferência</SelectItem>
            <SelectItem value="conferido">Conferidos</SelectItem>
            <SelectItem value="nao_conferido">Não conferidos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{filtrados.length} de {itens.length} itens
        · Conferência e decisão são atos separados, com trilhas próprias.</p>
    </div>
    {itens.length===0?<p className="p-4 text-sm text-muted-foreground">
      Nenhum item registrado. Anexe as fontes em Fontes e execute a conciliação.</p>:
    <div className="space-y-3">{filtrados.slice(0,limite).map(item=><div key={item.id} className="rounded-lg border p-3">
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
      <details className="mt-3 rounded-md border bg-muted/10 p-2">
        <summary className="cursor-pointer text-xs font-semibold">
          Abrir dossiê fiscal e memória de cálculo · AIH / procedimento</summary>
        <DossieFiscalEletivas item={item}/>
      </details>
      {podeEditar&&
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <Select value={decisoes[item.id]??item.decisao??""} onValueChange={v=>
            setDecisoes(x=>({...x,[item.id]:v}))}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Decisão fiscal"/></SelectTrigger>
            <SelectContent>{DECISOES.map(v=><SelectItem key={v} value={v}
              disabled={v==="aceito"&&requerRevisaoDocumental(item)}>
              {nomeDecisao[v]}</SelectItem>)}</SelectContent>
          </Select>
          <p className="w-full text-xs text-muted-foreground">
            {explicacaoDecisao[decisoes[item.id]??item.decisao??""]??
              "Escolha a decisão apenas após conferir a memória e os documentos."}
            {requerRevisaoDocumental(item)?
              " Falta comprovação independente: não é permitido aceitar por aqui.":""}
          </p>
          {item.decisao&&<div className="w-full space-y-1">
            <p className="text-xs font-medium">Revisão formal de decisão anterior
              (motivo obrigatório; mantém todas as versões)</p>
            <Textarea rows={2} placeholder="O que mudou na evidência ou na decisão?"
              value={motivosRevisao[item.id]??""}
              onChange={e=>setMotivosRevisao(x=>({...x,[item.id]:e.target.value}))}/>
          </div>}
          <Textarea className="min-w-[220px] flex-1" rows={2} placeholder="Justificativa fiscal (obrigatória)"
            value={notas[item.id]??item.justificativa??""}
            onChange={e=>setNotas(x=>({...x,[item.id]:e.target.value}))}/>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={decidir.isPending} onClick={()=>
              decidir.mutate(item.id)}>
              {item.decisao?"Revisar decisão com auditoria":"Registrar decisão fiscal"}
            </Button>
            {item.decisao&&<Button variant="ghost" size="sm"
              onClick={()=>setHistoricoId(historicoId===item.id?null:item.id)}>
              {historicoId===item.id?"Ocultar histórico":"Histórico de decisões"}
            </Button>}
          </div>
          {historicoId===item.id&&<div className="w-full rounded-md border p-3 text-xs">
            <strong>Trilha de revisão do item</strong>
            {historico.isLoading&&<p>Consultando histórico…</p>}
            {historico.isError&&<p className="text-destructive">Não foi possível ler revisões.</p>}
            {historico.data?.map(x=><div key={x.id} className="border-t py-2">
              <p>Versão {x.versao} · {x.decisao_anterior??"Sem decisão"} → {x.decisao_nova}</p>
              <p>{x.justificativa_nova}</p>
              {x.motivo_revisao&&<p>Motivo da revisão: {x.motivo_revisao}</p>}
              <p className="text-muted-foreground">{new Date(x.registrado_em).toLocaleString("pt-BR")}</p>
            </div>)}
            {historico.data?.length===0&&<p>Decisão importada de etapa anterior; sem revisões da Fase 4.</p>}
          </div>}
        </div>}
    </div>)}
    {filtrados.length>limite&&<Button type="button" variant="outline"
      onClick={()=>setLimite(x=>x+80)}>Carregar mais 80 itens
      ({filtrados.length-limite} restantes)</Button>}
    {filtrados.length===0&&<p className="p-3 text-xs text-muted-foreground">
      Nenhum item corresponde ao filtro selecionado.</p>}
    </div>}
  </div>;
}
