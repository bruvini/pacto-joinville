import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {DossieFiscalEletivas} from "./DossieFiscalEletivas";
import {reais,type ItemEC} from "@/lib/eletivas/financeiro";
import {ETAPAS_FPO,CORREIOS_EC,destinosPermitidosEC,sugestaoDestinoEC,
 aptosGemasEC,perfilAuditoriaEC,gerarMinutaEC,
 type ComunicacaoEC,type DestinoEC,type FluxoEC} from "@/lib/eletivas/comunicacoes";
import {dateTime} from "@/lib/format";

type Item=Tables<"eletivas_itens">;
type Painel="casos"|"fpo"|"fila"|"historico";
const CENT=(n:unknown)=>Math.round(Number(n??0)*100);
const msg=(e:Error)=>toast.error(e.message);
export function ComunicacoesEletivas({id,competencia,cnes,prestadorId,itens,podeFiscal,onRefresh}:{
 id:string;competencia:string;cnes:string;prestadorId:string;
 itens:Item[];podeFiscal:boolean;onRefresh:()=>void;
}){
 const qc=useQueryClient();
 const [tela,setTela]=useState<Painel>("casos");
 const [anotacoes,setAnotacoes]=useState<Record<string,string>>({});
 const [destinos,setDestinos]=useState<Record<string,DestinoEC>>({});
 const [fpoItem,setFpoItem]=useState("");
 const [fpoAih,setFpoAih]=useState("");
 const [fpoValor,setFpoValor]=useState("0,00");
 const [fpoJust,setFpoJust]=useState("");
 const [etapa,setEtapa]=useState<Record<string,string>>({});
 const [documento,setDocumento]=useState<Record<string,string>>({});
 const [correcaoId,setCorrecaoId]=useState<Record<string,string>>({});
 const [selecionados,setSelecionados]=useState<string[]>([]);
 const [protocolo,setProtocolo]=useState("");
 const [minuta,setMinuta]=useState<ReturnType<typeof gerarMinutaEC>|null>(null);

 const fluxosQ=useQuery({queryKey:["ec-fpo-fluxos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_fluxos").select("*")
   .eq("competencia_id",id).order("atualizado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const comunicacoesQ=useQuery({queryKey:["ec-comunicacoes",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_comunicacoes").select("*")
   .eq("competencia_id",id).order("atualizado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const logQ=useQuery({queryKey:["ec-comunicacoes-eventos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_comunicacoes_eventos")
   .select("*").eq("competencia_id",id).order("registrado_em",{ascending:false}).limit(250);
  if(error)throw error;return data??[];
 }});
 const fpoLog=useQuery({queryKey:["ec-fpo-eventos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_fluxos_eventos")
   .select("*").eq("competencia_id",id).order("criado_em",{ascending:false}).limit(250);
  if(error)throw error;return data??[];
 }});
 const correcoesQ=useQuery({queryKey:["ec-correcao-fluxos",prestadorId,competencia],
  queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_correcoes")
    .select("id,competencia_origem,valor,documento_sei,motivo,referencia_origem,aihs,competencia_id")
    .eq("prestador_id",prestadorId).eq("competencia_origem",competencia)
    .eq("status","aprovada").order("criado_em",{ascending:false});
   if(error)throw error;return data??[];
  }});
 const vinculosQ=useQuery({queryKey:["ec-fpo-vinculos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_vinculos").select("*")
   .eq("competencia_id",id);
  if(error)throw error;return data??[];
 }});
 const todasCom=comunicacoesQ.data??[];
 const fluxos=fluxosQ.data??[];
 const candidatos=itens.filter(i=>["faec_mult","mac_mult"].includes(i.categoria)&&
  ["bad","review","fpo"].includes(perfilAuditoriaEC(i as unknown as ItemEC).estado));
 const pendentes=todasCom.filter(x=>x.situacao==="fila");
 const enviados=todasCom.filter(x=>x.situacao==="enviada");
 const internos=todasCom.filter(x=>x.situacao==="interno");
 const ativos=fluxos.filter(f=>f.situacao==="ativo");
 const atualizar=()=>{
  for(const k of ["ec-fpo-fluxos","ec-comunicacoes","ec-comunicacoes-eventos",
   "ec-fpo-eventos","ec-fpo-vinculos"])qc.invalidateQueries({queryKey:[k,id]});
  qc.invalidateQueries({queryKey:["ec-correcao-fluxos",prestadorId,competencia]});
  onRefresh();
  setMinuta(null);setSelecionados([]);
 };
 const roteamento=useMutation({mutationFn:async(p:{tipo:string;ref:string;destino:DestinoEC})=>{
  const nota=(anotacoes[p.ref]??"").trim();
  if(nota.length<10)throw Error("Informe justificativa do encaminhamento (10 caracteres).");
  const {error}=await supabase.rpc("ec_com_rotear",{p_comp:id,
   p_tipo:p.tipo,p_ref:p.ref,p_destino:p.destino,p_motivo:nota});
  if(error)throw error;
 },onSuccess:()=>{toast.success("Encaminhamento salvo e rastreado.");atualizar();},onError:msg});
 const iniciar=useMutation({mutationFn:async()=>{
  const valor=Number(fpoValor.replace(/\./g,"").replace(",","."));
  if(!fpoItem||!/^[0-9]{13}$/.test(fpoAih)||!Number.isFinite(valor)||valor<0||
     fpoJust.trim().length<15)
   throw Error("Escolha o item, informe AIH, valor estimado e justificativa (15 caracteres).");
  const {error}=await supabase.rpc("ec_fpo_iniciar",{
    p_item:fpoItem,p_aih:fpoAih,p_valor:Math.round(valor*100)/100,
    p_justificativa:fpoJust.trim(),
  });
  if(error)throw error;
 },onSuccess:()=>{
  toast.success("Fluxo FPO iniciado; nenhuma receita foi reconhecida.");
  setFpoItem("");setFpoAih("");setFpoValor("0,00");setFpoJust("");atualizar();
 },onError:msg});
 const mudar=useMutation({mutationFn:async(f:FluxoEC)=>{
  const proxima=Number(etapa[f.id]??(f.etapa+1));
  const {error}=await supabase.rpc("ec_fpo_mudar_etapa",{
   p_fluxo:f.id,p_etapa:proxima,p_versao:f.versao,
   p_documento_sei:documento[f.id]??"",p_justificativa:anotacoes[f.id]??"",
  });if(error)throw error;
 },onSuccess:()=>{toast.success("Etapa atualizada com histórico.");atualizar();},onError:msg});
 const vincular=useMutation({mutationFn:async(f:FluxoEC)=>{
  const cid=correcaoId[f.id],nota=anotacoes[f.id]??"";
  if(!cid||nota.trim().length<15)throw Error("Selecione a correção aprovada e informe justificativa (15 caracteres).");
  const {error}=await supabase.rpc("ec_fpo_vincular_correcao",{
   p_fluxo:f.id,p_correcao:cid,p_justificativa:nota.trim(),
  });if(error)throw error;
 },onSuccess:()=>{
  toast.success("Correção aprovada vinculada à competência de origem, sem dupla contabilização.");
  atualizar();
 },onError:msg});
 const envio=useMutation({mutationFn:async()=>{
  if(!minuta||protocolo.trim().length<5)
   throw Error("Gere a minuta e informe o protocolo ou documento SEI do envio real.");
  if(!window.confirm("Confirma que o e-mail institucional foi efetivamente enviado? Esta ação registra o envio, não dispara mensagens."))
   throw Error("Envio não confirmado; nenhum registro foi alterado.");
  const {error}=await supabase.rpc("ec_com_marcar_envio",{
   p_ids:minuta.ids,p_assunto:minuta.assunto,p_corpo:minuta.corpo,
   p_protocolo:protocolo.trim(),
  });if(error)throw error;
 },onSuccess:()=>{
  toast.success("Envio institucional registrado. Reenvio duplicado bloqueado.");
  setProtocolo("");atualizar();
 },onError:msg});
 const reabrir=useMutation({mutationFn:async(c:ComunicacaoEC)=>{
  const just=(anotacoes[c.id]??"").trim();
  if(just.length<15)throw Error("A reabertura exige motivo formal com 15 caracteres.");
  if(!window.confirm("Reabrir esta comunicação para novo encaminhamento? O envio anterior continuará no histórico."))
   throw Error("Reabertura cancelada.");
  const {error}=await supabase.rpc("ec_com_reabrir",{
   p_id:c.id,p_motivo:just,
  });if(error)throw error;
 },onSuccess:()=>{toast.success("Comunicação reaberta; histórico anterior mantido.");atualizar();},onError:msg});
 const escolher=(com:ComunicacaoEC,ativo:boolean)=>{setMinuta(null);
  setSelecionados(v=>ativo?[...new Set([...v,com.id])]:v.filter(x=>x!==com.id));
 };
 const construir=(destino:"regulacao"|"gemas")=>{
  try{
   const rows=pendentes.filter(p=>p.destino===destino&&selecionados.includes(p.id));
   setMinuta(gerarMinutaEC(destino,competencia,cnes,
    rows as ComunicacaoEC[],itens as unknown as ItemEC[],fluxos as FluxoEC[]));
   setTela("fila");
  }catch(e){toast.error((e as Error).message)}
 };
 const copiar=async(texto:string)=>{try{
  await navigator.clipboard.writeText(texto);
  toast.success("Copiado. Encaminhe pelo e-mail institucional antes de marcar como enviado.");
 }catch(e){toast.error("Não foi possível copiar: confira as permissões de área de transferência.");}};
 const reloadError=fluxosQ.isError||comunicacoesQ.isError||logQ.isError||
   fpoLog.isError||correcoesQ.isError||vinculosQ.isError;

 return <div className="space-y-4">
  <section className="rounded-lg border p-3 space-y-2">
   <div><h3 className="font-semibold">Auditoria e comunicações institucionais</h3>
    <p className="text-xs text-muted-foreground">
     Um registro por caso. Minutas consolidadas por destinatário e competência;
     envio apenas pelo correio institucional, com confirmação manual e histórico.
     Tratamento FPO interno não gera e-mail externo antes da produção aprovada.</p>
   </div>
   <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
    {([["Central · na fila",pendentes.filter(x=>x.destino==="regulacao").length],
     ["GEMAS · na fila",pendentes.filter(x=>x.destino==="gemas").length],
     ["Tratamento interno",internos.length],["Envios registrados",enviados.length]] as const)
     .map(([n,v])=><div key={n} className="rounded-md border p-2">
       <p className="text-muted-foreground">{n}</p><strong>{v}</strong>
     </div>)}
   </div>
   <div className="flex flex-wrap gap-2">
    {([["casos","Casos de faixa / AIH"],["fpo","Regularização FPO"],
      ["fila","Fila e minutas"],["historico","Histórico de envios"]] as const)
      .map(([k,t])=><Button key={k} type="button" size="sm"
        variant={tela===k?"default":"outline"} onClick={()=>setTela(k)}>{t}</Button>)}
   </div>
   {reloadError&&<p role="alert" className="text-xs text-destructive">
    Falha ao consultar a trilha operacional. Confira a migration Fase 5 no banco.</p>}
  </section>

  {tela==="casos"&&<section className="space-y-3">
   <h4 className="text-sm font-semibold">Casos que exigem investigação de faixa/composição</h4>
   <p className="text-xs text-muted-foreground">A fila de itens conciliados e de auditoria continua
    na aba Conciliação e decisões. Aqui aparecem apenas ocorrências classificadas
    como incompatíveis, em revisão ou com FPO pendente.</p>
   {candidatos.length===0&&<p className="rounded-lg border p-3 text-xs">
    Nenhuma múltipla/sequencial exige encaminhamento de faixa com as evidências atuais.</p>}
   {candidatos.map(i=>{
    const perfil=perfilAuditoriaEC(i as unknown as ItemEC);
    const opcoes=destinosPermitidosEC(i as unknown as ItemEC,fluxos as FluxoEC[]);
    const dest=destinos[i.id]??sugestaoDestinoEC(i as unknown as ItemEC);
    const atual=todasCom.find(c=>c.tipo==="aih"&&c.referencia===i.id);
    return <article key={i.id} className="rounded-lg border p-3 space-y-2">
     <p className="text-sm font-semibold">{i.descricao} · AIH {perfil.aih||"identificar no dossiê"}</p>
     <p className="text-xs">Componente: {i.categoria} · Auditor: <b>{perfil.estado}</b>
      {" "}· Financeiro publicado {reais(CENT(i.valor_publicado))}</p>
     <DossieFiscalEletivas item={i}/>
     <p className="text-xs text-muted-foreground">Comunicação: {atual?.situacao??"ainda não classificada"}.
      A Central trata a distribuição das faixas. FPO sem prova segue internamente.</p>
     {podeFiscal&&atual?.situacao!=="enviada"&&<div className="space-y-2">
      <Select value={dest} onValueChange={v=>setDestinos(x=>({...x,[i.id]:v as DestinoEC}))}>
       <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
        {opcoes.map(o=><SelectItem key={o} value={o}>{CORREIOS_EC[o].label}</SelectItem>)}
       </SelectContent>
      </Select>
      <Textarea rows={2} placeholder="Justificativa da classificação e do destino"
       value={anotacoes[i.id]??""} onChange={e=>setAnotacoes(v=>({...v,[i.id]:e.target.value}))}/>
      <Button size="sm" disabled={roteamento.isPending}
       onClick={()=>roteamento.mutate({tipo:"aih",ref:i.id,destino:dest})}>
       Salvar destino / incluir na comunicação</Button>
     </div>}
    </article>;
   })}
  </section>}

  {tela==="fpo"&&<section className="space-y-3">
   <h4 className="text-sm font-semibold">Regularizações FPO e reprocessamento · 8 etapas</h4>
   <p className="text-xs text-muted-foreground">Etapas 1–4: correção e aprovação de produção.
    A GEMAS só entra após produção aprovada (etapas 5–7).
    O encerramento exige uma correção efetivamente aprovada e vinculada, não uma estimativa.</p>
   {podeFiscal&&<div className="rounded-lg border p-3 space-y-2">
    <strong className="text-sm">Iniciar regularização de AIH da competência</strong>
    <Select value={fpoItem} onValueChange={v=>{
      setFpoItem(v);setFpoAih(itens.find(i=>i.id===v)?.aih??"");
    }}>
      <SelectTrigger><SelectValue placeholder="Selecione uma linha de múltiplas ou faixa"/></SelectTrigger>
      <SelectContent>{itens.filter(i=>["faec_mult","mac_mult","mac_fxfed","mac_fxfaec"].includes(i.categoria))
       .map(i=><SelectItem key={i.id} value={i.id}>{i.categoria} · {i.aih??i.descricao}</SelectItem>)}</SelectContent>
    </Select>
    <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="AIH (13 dígitos)" value={fpoAih}
       onChange={e=>setFpoAih(e.target.value)}/>
      <Input placeholder="Valor estimado (R$), não reconhecido" value={fpoValor}
       onChange={e=>setFpoValor(e.target.value)}/>
    </div>
    <Textarea rows={2} placeholder="Justificativa de abertura e evidências pendentes"
      value={fpoJust} onChange={e=>setFpoJust(e.target.value)}/>
    <Button size="sm" disabled={iniciar.isPending} onClick={()=>iniciar.mutate()}>
      Iniciar fluxo FPO</Button>
   </div>}
   {ativos.length===0&&<p className="rounded-lg border p-3 text-xs">
    Nenhum fluxo FPO iniciado. Isso não significa programação comprovada.</p>}
   {fluxos.map(f=>{
    const credito=(vinculosQ.data??[]).filter(v=>v.fluxo_id===f.id)
     .map(v=>correcoesQ.data?.find(x=>x.id===v.correcao_id))
     .reduce((n,c)=>n+(c?.valor??0),0);
    return <article key={f.id} className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
       <strong>AIH {f.aih} · {ETAPAS_FPO[f.etapa-1]}</strong>
       <span className="text-xs">{f.situacao==="ativo"?"Em andamento":"Cancelado"}</span>
      </div>
      <p className="text-xs">Competência de origem: {competencia} ·
       Estimativa (não reconhecida) {reais(CENT(f.valor_estimado))} ·
       Correções aprovadas vinculadas: {reais(CENT(credito))}</p>
      <p className="text-xs text-muted-foreground">
       Versão {f.versao}. Apenas documento efetivo comprova programação/reprocessamento;
       a tabela FPO oficial não basta.</p>
      {podeFiscal&&f.situacao==="ativo"&&f.etapa<8&&<div className="space-y-2">
       <Select value={etapa[f.id]??String(Math.min(7,f.etapa+1))}
        onValueChange={v=>setEtapa(x=>({...x,[f.id]:v}))}>
        <SelectTrigger><SelectValue/></SelectTrigger>
        <SelectContent>{ETAPAS_FPO.slice(0,7).map((n,j)=>
         <SelectItem key={n} value={String(j+1)} disabled={j+1===f.etapa||j+1>f.etapa+1}>
          {j+1}. {n}</SelectItem>)}</SelectContent>
       </Select>
       <Input placeholder="Documento/protocolo SEI que comprova a etapa"
        value={documento[f.id]??""} onChange={e=>setDocumento(x=>({...x,[f.id]:e.target.value}))}/>
       <Textarea rows={2} placeholder="Justificativa da etapa/reabertura (15 caracteres)"
        value={anotacoes[f.id]??""} onChange={e=>setAnotacoes(x=>({...x,[f.id]:e.target.value}))}/>
       <Button size="sm" variant="outline" disabled={mudar.isPending}
        onClick={()=>mudar.mutate(f as FluxoEC)}>Registrar etapa / reabertura</Button>
       {f.etapa>=5&&f.etapa<8&&<Button size="sm" variant="outline"
        onClick={()=>roteamento.mutate({tipo:"regflow",ref:f.id,destino:"gemas"})}
        disabled={roteamento.isPending}>Incluir revisão na fila GEMAS</Button>}
       {f.etapa>=5&&<div className="space-y-2 rounded-md bg-muted/20 p-2">
        <p className="text-xs font-semibold">Vincular correção recebida em competência posterior</p>
        <Select value={correcaoId[f.id]??""}
         onValueChange={v=>setCorrecaoId(x=>({...x,[f.id]:v}))}>
         <SelectTrigger><SelectValue placeholder="Correções aprovadas da origem"/></SelectTrigger>
         <SelectContent>{(correcoesQ.data??[]).map(c=><SelectItem key={c.id} value={c.id}>
          SEI {c.documento_sei} · {reais(CENT(c.valor))}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
         Somente correções aprovadas vinculadas à competência {competencia}.
         O vínculo não adiciona um segundo crédito ao atesto.</p>
        <Button size="sm" disabled={vincular.isPending||!correcaoId[f.id]}
         onClick={()=>vincular.mutate(f as FluxoEC)}>Vincular correção aprovada</Button>
       </div>}
      </div>}
     </article>;
   })}
   <details className="rounded-lg border p-3 text-xs">
    <summary className="cursor-pointer font-semibold">Histórico das etapas FPO ({fpoLog.data?.length??0})</summary>
    <div className="mt-2 space-y-2">{fpoLog.data?.map(e=><p key={e.id} className="border-b pb-2">
      {dateTime(e.criado_em)} · {e.acao} · Etapa {e.etapa_anterior??0} → {e.etapa_nova}
      {e.documento_sei?" · SEI "+e.documento_sei:""} · {e.justificativa}
    </p>)}</div>
   </details>
  </section>}

  {tela==="fila"&&<section className="space-y-3">
   <h4 className="text-sm font-semibold">Fila de comunicações consolidadas</h4>
   <p className="text-xs text-muted-foreground">Agrupamento por destinatário e competência.
    O sistema não envia e-mail. Copie a minuta e encaminhe por sua conta institucional;
    confirme o envio com o protocolo apenas depois.</p>
   {podeFiscal&&itens.some(i=>i.decisao==="oficio"||i.decisao==="analise")&&
    <div className="rounded-lg border p-3 space-y-2">
     <strong className="text-xs">GEMAS · Encontro de Contas da competência</strong>
     <p className="text-xs">Decisões de ofício e análise são consolidadas em uma única
      referência. Alterações após envio exigirão reabertura registrada.</p>
     <Textarea rows={2} placeholder="Motivo do encaminhamento consolidado"
      value={anotacoes.consolidado??""}
      onChange={e=>setAnotacoes(v=>({...v,consolidado:e.target.value}))}/>
     <Button size="sm" variant="outline" disabled={roteamento.isPending}
      onClick={()=>roteamento.mutate({tipo:"ec_gemas",ref:"consolidado",destino:"gemas"})}>
       Preparar comunicação consolidada GEMAS</Button>
    </div>}
   {(["regulacao","gemas"] as const).map(destino=><article key={destino}
    className="rounded-lg border p-3 space-y-2">
     <strong>{CORREIOS_EC[destino].label} · {competencia}</strong>
     <p className="text-xs text-muted-foreground">Destinatário sugerido: {CORREIOS_EC[destino].email}</p>
     {pendentes.filter(x=>x.destino===destino).length===0&&
      <p className="text-xs">Nenhum caso pendente neste destinatário.</p>}
     {pendentes.filter(x=>x.destino===destino).map(c=><label key={c.id}
      className="flex items-center gap-2 rounded-md border p-2 text-xs">
      <input type="checkbox" checked={selecionados.includes(c.id)}
       onChange={e=>escolher(c as ComunicacaoEC,e.target.checked)}/>
      <span>{c.tipo==="ec_gemas"?"Encontro de Contas consolidado":
       c.tipo==="regflow"?"Regularização FPO":"Auditoria de AIH"}
       {" "}· {c.referencia.slice(0,18)}</span>
     </label>)}
     {podeFiscal&&<Button size="sm" variant="outline" onClick={()=>construir(destino)}>
       Gerar minuta com os selecionados</Button>}
    </article>)}
   {minuta&&<div className="rounded-lg border p-3 space-y-2">
    <strong>Minuta consolidada · {CORREIOS_EC[minuta.destino].label}</strong>
    <p className="text-xs">Para: {minuta.para} · {minuta.ids.length} ocorrência(s)</p>
    <div className="rounded bg-muted/25 p-2 text-xs whitespace-pre-wrap">{minuta.assunto}</div>
    <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded border p-3 text-xs">
     {minuta.corpo}</div>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" onClick={()=>copiar(minuta.assunto)}>Copiar assunto</Button>
     <Button size="sm" variant="outline" onClick={()=>copiar(minuta.corpo)}>Copiar corpo</Button>
    </div>
    {podeFiscal&&<div className="space-y-2 border-t pt-3">
     <Input value={protocolo} placeholder="Nº do ofício, e-mail registrado ou protocolo SEI"
      onChange={e=>setProtocolo(e.target.value)}/>
     <Button size="sm" disabled={envio.isPending||protocolo.trim().length<5}
      onClick={()=>envio.mutate()}>Confirmar envio institucional realizado</Button>
     <p className="text-xs text-muted-foreground">Esta ação NÃO envia e-mail:
      só registra a confirmação e impede remessa duplicada do mesmo conteúdo.</p>
    </div>}
   </div>}
   {internos.length>0&&<div className="rounded-lg border p-3">
    <strong className="text-sm">Tratamento interno/FPO ({internos.length})</strong>
    <p className="text-xs text-muted-foreground">Estes casos não geram e-mail externo neste estágio.</p>
    {internos.map(c=><p key={c.id} className="text-xs mt-2">Caso {c.referencia} · em acompanhamento</p>)}
   </div>}
  </section>}

  {tela==="historico"&&<section className="space-y-3">
   <h4 className="text-sm font-semibold">Envios realizados e reaberturas</h4>
   {enviados.length===0&&<p className="text-xs">Nenhum envio institucional confirmado nesta competência.</p>}
   {enviados.map(c=><article key={c.id} className="rounded-lg border p-3 space-y-2">
    <strong>{CORREIOS_EC[c.destino as "gemas"|"regulacao"].label} · {c.tipo}</strong>
    <p className="text-xs">Registrado: {c.enviada_em?dateTime(c.enviada_em):"não informado"}
     {" "}· Protocolo: {c.protocolo}</p>
    <p className="text-xs">{c.assunto}</p>
    {podeFiscal&&<>
      <Textarea rows={2} placeholder="Motivo formal da reabertura (15 caracteres)"
       value={anotacoes[c.id]??""}
       onChange={e=>setAnotacoes(v=>({...v,[c.id]:e.target.value}))}/>
      <Button size="sm" variant="outline" disabled={reabrir.isPending}
       onClick={()=>reabrir.mutate(c as ComunicacaoEC)}>
        Reabrir para novo encaminhamento</Button>
    </>}
   </article>)}
   <details className="rounded-lg border p-3" open>
    <summary className="text-sm font-semibold cursor-pointer">
     Linha de envio e alterações ({logQ.data?.length??0} eventos)</summary>
    <div className="mt-2 space-y-2">{logQ.data?.map(e=><div key={e.id}
     className="border-b pb-2 text-xs">
      <strong>{e.acao==="enviar"?"Enviado":e.acao==="reabrir"?"Reaberto":e.acao==="rotear"?"Encaminhado para fila":"Retirado da fila"}</strong>
      {" "}· {dateTime(e.registrado_em)} · {e.destino_novo}
      {e.protocolo?" · Protocolo "+e.protocolo:""}
      <p className="text-muted-foreground">{e.justificativa}</p>
     </div>)}</div>
   </details>
  </section>}
 </div>;
}
