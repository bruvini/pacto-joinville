import {useState} from "react";
import {DocumentacaoFase5Eletivas} from "./DocumentacaoFase5Eletivas";
import {consolidadoDoManifestoEC} from "@/lib/eletivas/fase7Exportacao";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import type {ContextoFase5EC} from "@/lib/eletivas/fase5Documentos";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
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
  ["parceria","Instrumento da parceria (nº e SEI)"],
  ["parcela","Parcela/atesto complementar"],
  ["objeto","Objeto pactuado e aditivos"],
  ["amparo","Amparo normativo, documentos SEI"],
  ["deliberacao","Deliberação aplicável à competência"],
  ["portaria_comissao","Portaria de designação dos fiscais"],
  ["oferta","Oferta de serviço pactuada"],
  ["informacoes_pertinentes","Informações adicionais pertinentes"],
] as const;
export function DocumentosEletivas({comp,itens,podeEditar,onRefresh,modo="atesto"}:{
  comp:Comp;itens:Itens;podeEditar:boolean;onRefresh:()=>void;
  modo?:"atesto"|"correcoes"|"exportar";
}){
  const orig=(comp.documentos??{}) as Record<string,any>;
  const [draft,setDraft]=useState<Record<string,string>>({
    ...Object.fromEntries(campos.map(([k])=>[k,String(orig[k]??"")])),
    fiscais_rtma:Array.isArray(orig.fiscais_rtma)?orig.fiscais_rtma.join("\n"):"",
    fiscais_analise:Array.isArray(orig.fiscais_analise)?orig.fiscais_analise.join("\n"):"",
    parecer:String(orig.parecer??""),
    parecer_texto:String(orig.parecer_texto??""),
  });
  const qc=useQueryClient();
  const [correcao,setCorrecao]=useState({
    competencia_origem:"",aihs:"",valor:"",fonte_origem:"SES/SC",
    referencia_origem:"",documento_sei:"",motivo:""});
  const [revision,setRevision]=useState<Record<string,string>>({});
  const historicoCorrecoes=useQuery({queryKey:["ec-correcoes",comp.id],queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_correcoes")
      .select("*").eq("competencia_id",comp.id).order("criado_em",{ascending:false});
    if(error)throw error;
    return data??[];
  }});
  const todasCorrecoes=historicoCorrecoes.data??[];
  const correcoes:CorrecaoEC[]=todasCorrecoes.map(x=>({
    competencia_origem:x.competencia_origem,valor:x.valor,
    documento_sei:x.documento_sei,motivo:x.motivo,status:x.status,
    aihs:x.aihs,fonte_origem:x.fonte_origem,referencia_origem:x.referencia_origem,
  }));
  const correcoesPendentes=todasCorrecoes.filter(x=>
    x.status==="em_analise"||x.status==="duplicada").length;
  const resumo=resumoEncontro(itens as unknown as ItemEC[],correcoes);
  const ctxFase5:ContextoFase5EC={
    competencia:comp.competencia,cnes:comp.cnes,prestador:"Hospital Municipal São José",
    documentos:{...orig,...draft,
      fiscais_rtma:(draft.fiscais_rtma??"").split("\n").map(x=>x.trim()).filter(Boolean),
      fiscais_analise:(draft.fiscais_analise??"").split("\n").map(x=>x.trim()).filter(Boolean),
    },correcoes,itens,
  };
  const docsSalvos=campos.every(([k])=>draft[k]?.trim()===String(orig[k]??"").trim())&&
    draft.parecer===String(orig.parecer??"")&&
    draft.parecer_texto===String(orig.parecer_texto??"")&&
    draft.fiscais_rtma===(Array.isArray(orig.fiscais_rtma)?orig.fiscais_rtma.join("\n"):"")&&
    draft.fiscais_analise===(Array.isArray(orig.fiscais_analise)?orig.fiscais_analise.join("\n"):"");
  const naoConferidos=itens.filter(i=>!i.conferido_em).length;
  const atualizar=useMutation({mutationFn:async()=>{
    if(draft.parecer==="validacao_total"&&(
       itens.some(i=>!i.conferido_em||i.decisao==="analise"||
         ["div","nc","fora","pendente"].includes(i.situacao)&&!i.decisao)
       ||correcoesPendentes>0)){
      throw Error("Validação total não pode ser proposta com conferência, decisão ou correção pendente.");
    }
    const nomes=(s:string)=>s.split(/\n/).map(x=>x.trim()).filter(Boolean);
    const doc={...orig,...Object.fromEntries(campos.map(([k])=>[k,draft[k]?.trim()??""])),
      parecer:draft.parecer??"",parecer_texto:draft.parecer_texto?.trim()??"",
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
    const aihs=correcao.aihs.split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean);
    if(!/^\d{2}\/\d{4}$/.test(correcao.competencia_origem)||
      !Number.isFinite(valor)||!correcao.documento_sei.trim()||
      correcao.motivo.trim().length<10||correcao.fonte_origem.trim().length<3||
      correcao.referencia_origem.trim().length<5||
      aihs.some(x=>!/^\d{13}$/.test(x)))
      throw Error("Informe competência, valor, origem, referência única, SEI, motivo e AIHs válidas.");
    const {error}=await supabase.rpc("ec_incluir_correcao",{
      p_comp:comp.id,p_origem:correcao.competencia_origem,p_aihs:aihs,
      p_valor:Math.round(valor*100)/100,p_fonte:correcao.fonte_origem,
      p_referencia:correcao.referencia_origem,p_sei:correcao.documento_sei,
      p_motivo:correcao.motivo,
    });
    if(error)throw error;
  },onSuccess:()=>{
    toast.success("Correção registrada para revisão fiscal — ainda não soma no atesto.");
    qc.invalidateQueries({queryKey:["ec-correcoes",comp.id]});onRefresh();
    setCorrecao({competencia_origem:"",aihs:"",valor:"",fonte_origem:"SES/SC",
      referencia_origem:"",documento_sei:"",motivo:""});
  },onError:(e:Error)=>toast.error(e.message)});
  const revisarCorrecao=useMutation({mutationFn:async(
    dados:{id:string;status:"aprovada"|"rejeitada"})=>{
    const just=(revision[dados.id]??"").trim();
    if(just.length<15)throw Error("A revisão exige justificativa com no mínimo 15 caracteres.");
    const {error}=await supabase.rpc("ec_revisar_correcao",{
      p_id:dados.id,p_status:dados.status,p_justificativa:just,
    });
    if(error)throw error;
  },onSuccess:()=>{
    toast.success("Revisão fiscal da correção registrada.");
    qc.invalidateQueries({queryKey:["ec-correcoes",comp.id]});onRefresh();
  },onError:(e:Error)=>toast.error(e.message)});
  const validarLocal=useMutation({mutationFn:async()=>{
    const {error}=await supabase.rpc("ec_validar_execucao_local",{p_comp:comp.id});
    if(error)throw error;
  },onSuccess:()=>{toast.success("Revisão fiscal da pré-conciliação registrada");onRefresh();},
     onError:(e:Error)=>toast.error(e.message)});
  return <div className="space-y-5 ec-sections">
    {modo==="atesto"&&<>    <div className="rounded-lg border bg-muted/30 p-3">
      <h3 className="font-semibold">Memória do valor a atestar</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        {[["FAEC",resumo.faec],["MAC",resumo.mac],["SIA",resumo.sia],
          ["Correções",resumo.correcoes]].map(([titulo,v])=>
          <div className="rounded-md border bg-background p-2" key={titulo}>
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <strong>{reais(Number(v))}</strong></div>)}
      </div>
      <p className="mt-3 font-semibold">Total prévio: {historicoCorrecoes.isLoading?
        "Consultando correções…":reais(resumo.total)}</p>
      <p className="text-xs text-muted-foreground">A memória considera somente itens registrados.
        {resumo.pendencias.length>0&&` Há ${resumo.pendencias.length} pendência(s) sem decisão.`}</p>
    </div>
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Documentos do processo SEI</h3>
      <p className="text-xs text-muted-foreground">Números e links são referências declaradas.
        Verifique os documentos autenticados no SEI: a lista de fiscais não equivale a assinatura digital.</p>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Parecer proposto da Comissão (não equivale a assinatura)
          <Select value={draft.parecer||"nao_informado"} disabled={!podeEditar}
            onValueChange={v=>setDraft(x=>({...x,parecer:v==="nao_informado"?"":v}))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Parecer"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="nao_informado">Não informado</SelectItem>
              <SelectItem value="validacao_total">Validação total (proposta)</SelectItem>
              <SelectItem value="validacao_parcial">Validação parcial (proposta)</SelectItem>
              <SelectItem value="nao_validado">Não validado</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-xs">Fundamentação do parecer da Comissão
          <Textarea rows={3} className="mt-1" value={draft.parecer_texto??""}
            disabled={!podeEditar} onChange={e=>setDraft(x=>({...x,parecer_texto:e.target.value}))}
            placeholder="Fundamente o parecer e indique os pontos sujeitos a conferência"/></label>
      </div>
      {podeEditar&&<Button disabled={atualizar.isPending} onClick={()=>atualizar.mutate()}>
        Salvar referências documentais</Button>}
    </div>
    </>}
    {(modo==="atesto"||modo==="exportar")&&<>    <DocumentacaoFase5Eletivas ctx={ctxFase5} id={comp.id}
      documentosSalvos={docsSalvos} modo={modo==="exportar"?"exportar":"atesto"}
      consolidadoSES={consolidadoDoManifestoEC(comp.ec_fontes_snapshot,comp.cnes,comp.competencia)}/>
    </>}
    {modo==="correcoes"&&<>    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Correções anteriores — registro individual e sem duplicação</h3>
      <p className="text-xs text-muted-foreground">A correção aponta sua competência de origem,
        AIHs, referência financeira e documento SEI. O banco procura a mesma origem nas outras
        competências do prestador. Apenas correções <strong>aprovadas</strong> entram no total,
        uma única vez.</p>
      {historicoCorrecoes.isError&&<p role="alert" className="text-sm text-destructive">
        Não foi possível consultar as correções. Confira a migration da Fase 4.</p>}
      {historicoCorrecoes.isLoading&&<p className="text-xs">Consultando correções anteriores…</p>}
      {todasCorrecoes.map(x=><div key={x.id} className="rounded-md border p-3 space-y-2 text-xs">
        <div className="flex flex-wrap justify-between gap-2">
          <strong>{x.competencia_origem} · {x.fonte_origem} · {x.referencia_origem}</strong>
          <strong>{reais(Math.round(x.valor*100))} · {x.status.replace("_"," ")}</strong>
        </div>
        <p>SEI {x.documento_sei} · {x.motivo}</p>
        <p>AIHs: {x.aihs.length?x.aihs.join(", "):"Não individualizadas na origem"}</p>
        {x.justificativa_revisao&&<p className="text-muted-foreground">
          Revisão: {x.justificativa_revisao}</p>}
        {podeEditar&&(x.status==="em_analise"||x.status==="duplicada")&&
          <div className="space-y-2 border-t pt-2">
            <Textarea rows={2} placeholder="Fundamente a aprovação/rejeição (mín. 15 caracteres)"
              value={revision[x.id]??""}
              onChange={e=>setRevision(y=>({...y,[x.id]:e.target.value}))}/>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={revisarCorrecao.isPending}
                onClick={()=>revisarCorrecao.mutate({id:x.id,status:"aprovada"})}>
                Aprovar correção</Button>
              <Button size="sm" variant="outline" disabled={revisarCorrecao.isPending}
                onClick={()=>revisarCorrecao.mutate({id:x.id,status:"rejeitada"})}>
                Rejeitar / reconhecer duplicidade</Button>
            </div>
          </div>}
      </div>)}
      {todasCorrecoes.length===0&&!historicoCorrecoes.isLoading&&
        <p className="text-xs text-muted-foreground">Nenhuma correção histórica registrada.</p>}
      {podeEditar&&<div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
        <Input aria-label="Competência de origem" placeholder="Competência origem MM/AAAA"
          value={correcao.competencia_origem} onChange={e=>setCorrecao(x=>({...x,competencia_origem:e.target.value}))}/>
        <Input aria-label="Valor da correção" placeholder="Valor da correção R$"
          value={correcao.valor} onChange={e=>setCorrecao(x=>({...x,valor:e.target.value}))}/>
        <Input aria-label="Fonte de origem" placeholder="Fonte da correção (ex.: SES/SC)"
          value={correcao.fonte_origem} onChange={e=>setCorrecao(x=>({...x,fonte_origem:e.target.value}))}/>
        <Input aria-label="Referência única" placeholder="Referência única do ajuste na origem"
          value={correcao.referencia_origem}
          onChange={e=>setCorrecao(x=>({...x,referencia_origem:e.target.value}))}/>
        <Input aria-label="Documento SEI" placeholder="Documento SEI"
          value={correcao.documento_sei} onChange={e=>setCorrecao(x=>({...x,documento_sei:e.target.value}))}/>
        <Input aria-label="AIHs de origem" placeholder="AIHs (13 dígitos; separadas por vírgula)"
          value={correcao.aihs} onChange={e=>setCorrecao(x=>({...x,aihs:e.target.value}))}/>
        <label className="text-xs sm:col-span-2">Motivo da correção
          <Textarea className="mt-1" rows={2} value={correcao.motivo}
            onChange={e=>setCorrecao(x=>({...x,motivo:e.target.value}))}/></label>
        <Button variant="outline" disabled={incluir.isPending||historicoCorrecoes.isError}
          onClick={()=>incluir.mutate()}>Registrar correção para análise</Button>
      </div>}
      {correcoesPendentes>0&&<p className="text-xs text-amber-800">
        {correcoesPendentes} correção(ões) aguardando revisão; o encerramento ficará bloqueado.</p>}
    </div>
    </>}
    {modo==="atesto"&&<>    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">Encerramento auditável</h3>
      {comp.ec_origem_execucao==="navegador"&&<div className="mb-3 space-y-2 rounded-lg border p-3">
        <p className="text-xs">Pré-conciliação calculada no navegador. A validação abaixo é uma
          declaração fiscal expressa, não uma certificação automática dos valores pelo servidor.</p>
        {comp.ec_validado_em?<p className="text-xs font-semibold text-primary">
          Revisão fiscal registrada em {new Date(comp.ec_validado_em).toLocaleString("pt-BR")}</p>:
          podeEditar&&<Button size="sm" variant="outline" disabled={validarLocal.isPending||naoConferidos>0||resumo.pendencias.length>0||
              correcoesPendentes>0||itens.some(i=>i.decisao==="analise")}
            onClick={()=>{if(window.confirm("Confirmo que conferi todas as linhas, memórias e decisões da pré-conciliação local. Registrar minha validação fiscal?"))
              validarLocal.mutate();}}>
            {validarLocal.isPending?"Validando…":"Registrar validação fiscal do cálculo local"}
          </Button>}
      </div>}
      <p className="mb-3 text-xs text-muted-foreground">O servidor verificará fontes obrigatórias,
        decisões fiscais, documentos SEI e signatários declarados, e recalculará o valor
        antes do encerramento. Não altera automaticamente o lançamento do convênio.</p>
      {comp.status==="encerrada"?
        <strong className="text-primary">Encerrado · valor fechado {reais(Math.round(Number(comp.valor_fechado)*100))}</strong>:
        <p className="text-xs font-semibold">O encerramento agora exige checklist, confirmação
          documental expressa e snapshot imutável. Acesse a aba
          <strong> Fechamento e convênio</strong> para concluir, sem lançar valores automaticamente.</p>}
    </div>
    </>}
  </div>;
}
