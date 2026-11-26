import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {CheckCircle2,FileText,LockKeyhole,Plus,Send} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {valorMoedaDistribuicao} from "@/lib/emendas/distribuicao-ne";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import {PainelPagamentosEmenda} from "@/components/emendas/PainelPagamentosEmenda";
import {MatrizSubempenhosEmenda,TIPOS_SUBEMENDA,type TipoDocumentoEmenda}
 from "@/components/emendas/MatrizSubempenhosEmenda";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";


type Sub=Tables<"emenda_subempenhos">;
type Doc=Tables<"emenda_subempenho_documentos_painel">;
type Ass=Tables<"emenda_subempenho_assinaturas">;
type Aloc=Tables<"emenda_ne_competencias_painel">;
type Politica=Tables<"emenda_subempenho_matrizes">;
const hoje=()=>{
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
};
const rotulosStatus:Record<string,string>={
 rascunho:"Rascunho",solicitado:"Solicitação concluída",
 em_liquidacao:"Empenho em liquidação",subempenhado:"Subempenho confirmado",cancelado:"Cancelado",
};
const avancos:Record<TipoDocumentoEmenda,{antes:string;depois:string}>={
 solicitacao_liquidacao:{antes:"rascunho",depois:"solicitado"},
 movimento_liquidacao:{antes:"solicitado",depois:"em_liquidacao"},
 aviso_subempenho:{antes:"em_liquidacao",depois:"subempenhado"},
};
export function FluxoSubempenhosEmenda({emendaId,lancamentoId,numeroNe,podeEditar,podeAdministrar,onAtualizar}:{
 emendaId:string;lancamentoId:string;numeroNe:string;podeEditar:boolean;
 podeAdministrar:boolean;onAtualizar:()=>Promise<void>;
}){
 const qc=useQueryClient();
 const [competencia,setCompetencia]=useState("");
 const [valor,setValor]=useState("");
 const [chave,setChave]=useState(()=>crypto.randomUUID());
 const dados=useQuery({queryKey:["emendas","cadeias-subempenho",emendaId,lancamentoId],
  queryFn:async()=>{
   const [aloc,sub,docs,ass,pol]=await Promise.all([
    supabase.from("emenda_ne_competencias_painel").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_subempenhos").select("*").eq("lancamento_id",lancamentoId).order("sequencia"),
    supabase.from("emenda_subempenho_documentos_painel").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_subempenho_assinaturas").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_subempenho_matrizes").select("*").eq("emenda_id",emendaId),
   ]);
   for(const r of [aloc,sub,docs,ass,pol])if(r.error)throw r.error;
   return {aloc:aloc.data??[],sub:sub.data??[],docs:docs.data??[],
    ass:ass.data??[],pol:pol.data??[]};
  },
 });
 const atualizar=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","cadeias-subempenho",emendaId,lancamentoId]});
  await qc.invalidateQueries({queryKey:["emendas","fase-c-ne-distribuicao",emendaId]});
  await onAtualizar();
 };
 const alocacoes=(dados.data?.aloc??[]).filter(a=>a.status==="ativa");
 const criar=useMutation({mutationFn:async()=>{
  const quantia=valorMoedaDistribuicao(valor);
  if(!competencia||quantia===null)throw Error("Escolha uma competência e informe o valor solicitado.");
  const r=await supabase.rpc("emenda_subempenho_criar",{
   p_lancamento:lancamentoId,p_competencia:competencia,p_valor_solicitado:quantia,p_chave:chave,
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{
  setValor("");setCompetencia("");setChave(crypto.randomUUID());await atualizar();
  toast.success("Solicitação individual criada como rascunho.");
 },onError:(e:Error)=>toast.error(e.message)});
 const matrizPronta=TIPOS_SUBEMENDA.every(([t])=>dados.data?.pol.some(p=>p.tipo===t&&p.ativa));
 return <section className="space-y-4 rounded-lg border p-4" aria-label="Cadeias de subempenho da emenda">
  <header>
   <h2 className="text-sm font-semibold">Subempenhos e liquidação · NE {numeroNe}</h2>
   <p className="text-xs text-muted-foreground">
    Uma mesma NE e competência podem ter várias solicitações parciais independentes.
    Cada solicitação terá seus próprios documentos, assinaturas, encaminhamento e valor efetivo.
    O PACTO registra evidências; não envia automaticamente ao SEI nem ao e-Pública.
   </p>
  </header>
  {dados.isPending&&<p className="text-xs">Carregando subempenhos e matrizes de assinaturas...</p>}
  {dados.error&&<p role="alert" className="text-xs text-destructive">
   Falha na leitura da cadeia. Confirme a implantação de D1, D2 e D3: {dados.error.message}
  </p>}
  {dados.data&&<>
   <MatrizSubempenhosEmenda emendaId={emendaId} matrizes={dados.data.pol}
    podeAdministrar={podeAdministrar} onAtualizar={atualizar}/>
   {!matrizPronta&&<p role="note" className="rounded border border-amber-400/40 p-3 text-xs text-amber-800">
    Cadastre e homologue a matriz documental das três subetapas antes de iniciar o processamento.
    A referência SEI deve confirmar quem assina e quando há encaminhamento obrigatório.
   </p>}
   <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
    <h3 className="text-xs font-semibold">Nova solicitação parcial de subempenho</h3>
    <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_180px_auto] sm:items-end">
     <div className="space-y-1">
      <Label htmlFor="subem-competencia" className="text-xs">Competência com distribuição ativa</Label>
      <select id="subem-competencia" value={competencia} onChange={e=>setCompetencia(e.target.value)}
       className="h-9 w-full rounded-md border bg-background px-2 text-xs" disabled={!podeEditar||!matrizPronta}>
       <option value="">Selecione</option>
       {alocacoes.map(a=><option key={a.id} value={a.competencia_id??""}>
        {exibirCompetenciaISO(a.competencia??"")} · disponível {brl(Number(a.saldo_competencia??0))}
       </option>)}
      </select>
     </div>
     <div className="space-y-1">
      <Label htmlFor="subem-valor" className="text-xs">Valor solicitado (R$)</Label>
      <Input id="subem-valor" value={valor} onChange={e=>setValor(e.target.value)}
       disabled={!podeEditar||!matrizPronta} placeholder="0,00" inputMode="decimal"/>
     </div>
     <Button size="sm" disabled={!podeEditar||!matrizPronta||!competencia||criar.isPending}
      onClick={()=>criar.mutate()}><Plus className="mr-1 h-4 w-4"/>Nova solicitação</Button>
    </div>
    {!alocacoes.length&&<p className="text-xs text-muted-foreground">
     Primeiro distribua a NE entre as competências no painel financeiro acima.
    </p>}
   </div>
   {!dados.data.sub.length&&<p className="rounded border border-dashed p-4 text-xs text-muted-foreground">
    Ainda não há solicitações de subempenho nesta NE.
   </p>}
   <div className="space-y-3">
    {dados.data.sub.map(sub=><SubempenhoCard key={sub.id} sub={sub}
     aloc={alocacoes.find(a=>a.competencia_id===sub.competencia_id)}
     docs={dados.data.docs.filter(d=>d.subempenho_id===sub.id)}
     assinaturas={dados.data.ass.filter(a=>a.subempenho_id===sub.id)}
     podeEditar={podeEditar} onAtualizar={atualizar}/>)}
   </div>
  </>}
 </section>;
}

function SubempenhoCard({sub,aloc,docs,assinaturas,podeEditar,onAtualizar}:{
 sub:Sub;aloc?:Aloc;docs:Doc[];assinaturas:Ass[];podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [motivo,setMotivo]=useState("");
 const cancelar=useMutation({mutationFn:async()=>{
  if(motivo.trim().length<10)throw Error("Informe justificativa de pelo menos 10 caracteres.");
  const r=await supabase.rpc("emenda_subempenho_cancelar_rascunho",{
   p_subempenho:sub.id,p_motivo:motivo.trim()});
  if(r.error)throw r.error;
 },onSuccess:async()=>{setMotivo("");await onAtualizar();toast.success("Rascunho cancelado com histórico.");},
 onError:(e:Error)=>toast.error(e.message)});
 return <article className="space-y-3 rounded-lg border bg-card p-3">
  <header className="flex flex-wrap items-start justify-between gap-2">
   <div>
    <h3 className="text-sm font-semibold">
     Solicitação #{sub.sequencia} · {exibirCompetenciaISO(aloc?.competencia??"")}
    </h3>
    <p className="text-xs text-muted-foreground">
     Solicitado: {brl(Number(sub.valor_solicitado))} ·
     Aviso efetivo: {sub.valor_subempenhado===null?"pendente":brl(Number(sub.valor_subempenhado))}
    </p>
   </div>
   <Badge variant={sub.status==="subempenhado"?"default":"outline"}>
    {rotulosStatus[sub.status]??sub.status}
   </Badge>
  </header>
  {sub.status==="cancelado"?<p className="text-xs text-muted-foreground">
   Cancelamento registrado: {sub.motivo_cancelamento}
  </p>:<>
   {TIPOS_SUBEMENDA.map(([tipo,titulo])=><SubetapaEmenda
    key={tipo} sub={sub} tipo={tipo} titulo={titulo}
    documento={docs.find(d=>d.tipo===tipo)}
    assinaturas={assinaturas.filter(a=>a.documento_id===docs.find(d=>d.tipo===tipo)?.id)}
    podeEditar={podeEditar} onAtualizar={onAtualizar}/>)}
   {sub.status==="subempenhado"&&<PainelPagamentosEmenda
    subempenhoId={sub.id} emendaId={sub.emenda_id}
    podeEditar={podeEditar} onAtualizar={onAtualizar}/>}
   {sub.status==="rascunho"&&!docs.length&&podeEditar&&<div className="flex flex-wrap items-end gap-2 border-t pt-3">
    <div className="min-w-[250px] flex-1 space-y-1">
     <Label className="text-xs" htmlFor={"canc-sub-"+sub.id}>Motivo para cancelar rascunho</Label>
     <Input id={"canc-sub-"+sub.id} value={motivo} onChange={e=>setMotivo(e.target.value)}/>
    </div>
    <Button size="sm" variant="outline" disabled={cancelar.isPending}
     onClick={()=>cancelar.mutate()}>Cancelar rascunho</Button>
   </div>}
  </>}
 </article>;
}

function SubetapaEmenda({sub,tipo,titulo,documento,assinaturas,podeEditar,onAtualizar}:{
 sub:Sub;tipo:TipoDocumentoEmenda;titulo:string;documento?:Doc;
 assinaturas:Ass[];podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [data,setData]=useState(hoje);
 const [valorAviso,setValorAviso]=useState("");
 const [envNumero,setEnvNumero]=useState("");
 const [envLink,setEnvLink]=useState("");
 const [envData,setEnvData]=useState(hoje);
 const exigeValor=tipo==="aviso_subempenho";
 const habilitada=sub.status===avancos[tipo].antes;
 const concluida=!!documento?.conclusao_id;
 const podeRegistrar=podeEditar&&habilitada&&!documento;
 const registrar=useMutation({mutationFn:async()=>{
  if(!numero.trim()||!/^https:\/\/\S+$/i.test(link.trim())||!data)
   throw Error("Informe número, link HTTPS e data do documento.");
  const quantia=exigeValor?valorMoedaDistribuicao(valorAviso):null;
  if(exigeValor&&quantia===null)throw Error("Informe o valor efetivo do Aviso de Subempenho.");
  const r=await supabase.rpc("emenda_subempenho_documentar",{
   p_subempenho:sub.id,p_tipo:tipo,p_numero:numero.trim(),p_link:link.trim(),
   p_data:data,p_valor_aviso:quantia,
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Documento registrado. Assinaturas e encaminhamento continuam pendentes.");},
 onError:(e:Error)=>toast.error(e.message)});
 const encaminhar=useMutation({mutationFn:async()=>{
  if(!documento?.id)throw Error("Registre primeiro o documento.");
  if(!envNumero.trim()||!/^https:\/\/\S+$/i.test(envLink.trim())||!envData)
   throw Error("Informe a evidência SEI do encaminhamento.");
  const r=await supabase.rpc("emenda_subempenho_encaminhar",{
   p_documento:documento.id,p_numero_sei:envNumero.trim(),
   p_link_sei:envLink.trim(),p_data:envData,
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Encaminhamento real confirmado no PACTO.");},
 onError:(e:Error)=>toast.error(e.message)});
 const concluir=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_subempenho_concluir_etapa",{
   p_subempenho:sub.id,p_tipo:tipo});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Subetapa concluída com evidências conferidas.");},
 onError:(e:Error)=>toast.error(e.message)});
 return <section className="space-y-3 rounded-md border p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h4 className="flex items-center gap-2 text-xs font-semibold">
    {concluida?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:
     habilitada?<FileText className="h-4 w-4"/>:<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
    {titulo}
   </h4>
   <Badge variant={concluida?"default":"outline"}>
    {concluida?"Concluída":documento?.status_documental==="pronto_concluir"?"Pronta para concluir":
      documento?.status_documental==="aguardando_encaminhamento"?"Aguardando encaminhamento":
      documento?.status_documental==="aguardando_assinaturas"?"Assinaturas pendentes":
      habilitada?"Aguardando documento":"Bloqueada"}
   </Badge>
  </div>
  {!habilitada&&!documento&&<p className="text-xs text-muted-foreground">
   Liberação após a conclusão documental da subetapa anterior.
  </p>}
  {documento?<div className="space-y-1 text-xs">
   <p>Documento SEI: <a className="text-primary underline" href={documento.link_sei??"#"}
    target="_blank" rel="noopener noreferrer">{documento.numero_sei}</a>
    {" · "}{documento.data_documento}
    {exigeValor&&documento.valor_documentado!=null&&<> · {brl(Number(documento.valor_documentado))}</>}
   </p>
   <p className="text-muted-foreground">Matriz versão {documento.matriz_versao??"—"} ·
    registrado em {documento.registrado_em?new Date(documento.registrado_em).toLocaleString("pt-BR"):"—"}</p>
  </div>:podeRegistrar?<div className="grid gap-2 sm:grid-cols-3">
   <div className="space-y-1"><Label className="text-xs">Número SEI</Label>
    <Input value={numero} onChange={e=>setNumero(e.target.value)}/></div>
   <div className="space-y-1"><Label className="text-xs">Link SEI</Label>
    <Input value={link} onChange={e=>setLink(e.target.value)}/></div>
   <div className="space-y-1"><Label className="text-xs">Data do documento</Label>
    <Input type="date" value={data} onChange={e=>setData(e.target.value)}/></div>
   {exigeValor&&<div className="space-y-1">
    <Label className="text-xs">Valor do Aviso (R$)</Label>
    <Input value={valorAviso} onChange={e=>setValorAviso(e.target.value)} inputMode="decimal" placeholder="0,00"/></div>}
   <div className="sm:col-span-3"><Button size="sm" onClick={()=>registrar.mutate()}
    disabled={registrar.isPending}>Registrar documento</Button></div>
  </div>:null}
  {documento&&<div className="space-y-2 border-t pt-3">
   <h5 className="text-xs font-semibold">Assinaturas conferidas</h5>
   {!documento.grupos_obrigatorios?.length&&<p className="text-xs text-muted-foreground">
    A matriz homologada expressamente não exige assinaturas nesta subetapa.
   </p>}
   {(documento.grupos_obrigatorios??[]).map(grupo=><GrupoAssinaturaEmenda
    key={grupo} grupo={grupo} doc={documento}
    assinatura={assinaturas.find(a=>a.grupo===grupo)}
    podeEditar={podeEditar&&habilitada&&!concluida} onAtualizar={onAtualizar}/>)}
   {documento.exige_encaminhamento&&<div className="space-y-2 rounded border bg-muted/10 p-3">
    <h5 className="flex items-center gap-2 text-xs font-semibold">
     <Send className="h-3.5 w-3.5"/>Confirmação de encaminhamento · {documento.destino_encaminhamento}
    </h5>
    {documento.encaminhamento_id?<p className="text-xs">
     Encaminhamento documentado em {documento.data_encaminhamento} ·
     <a className="ml-1 text-primary underline" href={documento.encaminhamento_link_sei??"#"}
      target="_blank" rel="noopener noreferrer">SEI {documento.encaminhamento_numero_sei}</a>
    </p>:podeEditar&&habilitada&&!(documento.grupos_pendentes??[]).length?
     <div className="grid gap-2 sm:grid-cols-3">
      <Input aria-label="Número SEI do encaminhamento" placeholder="Número SEI" value={envNumero}
       onChange={e=>setEnvNumero(e.target.value)}/>
      <Input aria-label="Link SEI do encaminhamento" placeholder="Link SEI" value={envLink}
       onChange={e=>setEnvLink(e.target.value)}/>
      <Input aria-label="Data do encaminhamento" type="date" value={envData}
       onChange={e=>setEnvData(e.target.value)}/>
      <div className="sm:col-span-3"><Button size="sm" variant="outline" disabled={encaminhar.isPending}
       onClick={()=>encaminhar.mutate()}>Confirmar encaminhamento realizado</Button></div>
     </div>:<p className="text-xs text-muted-foreground">
      O encaminhamento só pode ser confirmado após todas as assinaturas exigíveis.
     </p>}
   </div>}
   {concluida?<p className="text-xs text-emerald-700">
    Conclusão registrada em {documento.concluido_em?new Date(documento.concluido_em).toLocaleString("pt-BR"):"—"}.
   </p>:habilitada&&podeEditar&&<Button size="sm" disabled={concluir.isPending||
    documento.status_documental!=="pronto_concluir"}
    onClick={()=>concluir.mutate()}>Concluir subetapa</Button>}
  </div>}
 </section>;
}

function GrupoAssinaturaEmenda({grupo,doc,assinatura,podeEditar,onAtualizar}:{
 grupo:string;doc:Doc;assinatura?:Ass;podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [nome,setNome]=useState("");
 const [cargo,setCargo]=useState("");
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [data,setData]=useState(hoje);
 const assinar=useMutation({mutationFn:async()=>{
  if(!doc.id)throw Error("Documento inexistente.");
  if(nome.trim().length<3||cargo.trim().length<3||!numero.trim()||
   !/^https:\/\/\S+$/i.test(link.trim())||!data)
   throw Error("Informe signatário, cargo, número, link SEI e data da assinatura.");
  const r=await supabase.rpc("emenda_subempenho_assinar",{
   p_documento:doc.id,p_grupo:grupo,p_signatario:nome.trim(),p_cargo:cargo.trim(),
   p_numero_sei:numero.trim(),p_link_sei:link.trim(),p_data:data,
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Conferência de assinatura registrada.");},
 onError:(e:Error)=>toast.error(e.message)});
 return <div className="rounded border p-2">
  <p className="text-xs font-medium">{grupo} · {assinatura?"Conferida":"Pendente"}</p>
  {assinatura?<p className="text-xs text-muted-foreground">
   {assinatura.signatario_nome} · {assinatura.cargo_signatario} · {assinatura.data_assinatura} ·
   <a className="ml-1 text-primary underline" href={assinatura.link_sei}
    target="_blank" rel="noopener noreferrer">SEI {assinatura.numero_sei}</a>
  </p>:podeEditar?<div className="mt-2 grid gap-2 md:grid-cols-5">
   <Input aria-label={"Signatário "+grupo} placeholder="Nome do signatário" value={nome}
    onChange={e=>setNome(e.target.value)}/>
   <Input aria-label={"Cargo "+grupo} placeholder="Cargo" value={cargo}
    onChange={e=>setCargo(e.target.value)}/>
   <Input aria-label={"Número SEI da assinatura "+grupo} placeholder="Nº SEI" value={numero}
    onChange={e=>setNumero(e.target.value)}/>
   <Input aria-label={"Link SEI da assinatura "+grupo} placeholder="Link SEI" value={link}
    onChange={e=>setLink(e.target.value)}/>
   <Input aria-label={"Data da assinatura "+grupo} type="date" value={data}
    onChange={e=>setData(e.target.value)}/>
   <div className="md:col-span-5"><Button size="sm" variant="outline" disabled={assinar.isPending}
    onClick={()=>assinar.mutate()}>Conferir assinatura</Button></div>
  </div>:<p className="text-xs text-muted-foreground">Conferência não registrada.</p>}
 </div>;
}
