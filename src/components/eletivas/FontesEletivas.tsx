import {useState,useRef,type DragEvent, type KeyboardEvent} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {ArrowUpRight,FileUp,AlertTriangle} from "lucide-react";
import {agruparAvisosPublicacao} from "@/lib/eletivas/avisosImportacao";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/hooks/useAuth";
import {FONTES_ELETIVAS,type FonteId,ordemCompetenciaEletivas} from "@/lib/eletivas/fontes";
import {identificarFonte} from "@/lib/eletivas/autoRoteamento";
import {validarFonteAntesUpload} from "@/lib/eletivas/prepararFonte";
import {executarPreConciliacaoLocal,ErroPreConciliacao} from "@/lib/eletivas/processarLocal";
import {TabwinGuiaEletivas} from "./TabwinGuiaEletivas";
import "@/styles/eletivas-reference-fontes.css";
import type {Tables} from "@/integrations/supabase/types";

type Fonte=Tables<"eletivas_arquivos">;
type Papel=FonteId|"";
type Linha={file:File;id:Papel;motivo:string;alerta:string};
const LIMITE_ARQUIVO=50*1024*1024;
const LIMITE_LOTE=240*1024*1024;
const grupos=[
 {id:"TabWin",titulo:"Tabulações locais",descricao:"DBF do TabWin"},
 {id:"SES/SC · Hospitalar",titulo:"Retorno SES · hospitalar",descricao:"Planilhas SIH por financiamento"},
 {id:"SES/SC · Ambulatorial",titulo:"Retorno SES · ambulatorial",descricao:"Planilhas SIA"},
 {id:"Apoio",titulo:"Fontes de apoio",descricao:"FPO, AIH, deliberações e Consolidado SES"},
] as const;
const formato=(n:number)=>n>=1024*1024?(n/(1024*1024)).toFixed(1)+" MB":Math.ceil(n/1024)+" KB";
const arquivoSeguro=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,100);
async function sha256(buffer:ArrayBuffer){
 const hash=await crypto.subtle.digest("SHA-256",buffer);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const label=(id:Papel)=>FONTES_ELETIVAS.find(x=>x.id===id)?.rotulo??"Não reconhecido";

export function FontesEletivas({id,cnes,competencia,arquivos,podeEditar,onRefresh,onAnalisado}:{
 id:string;cnes:string;competencia:string;arquivos:Fonte[];
 podeEditar:boolean;onRefresh:()=>void|Promise<void>;onAnalisado:()=>void;
}){
 const {user}=useAuth();
 const [lote,setLote]=useState<Linha[]>([]);
 const [rejeitados,setRejeitados]=useState<string[]>([]);
 const [classificando,setClassificando]=useState(false);
 const [sobre,setSobre]=useState(false);
 const [avisos,setAvisos]=useState<string[]>([]);
 const [guia,setGuia]=useState(false);
 const loteInput=useRef<HTMLInputElement>(null);
 const slotInput=useRef<HTMLInputElement>(null);
 const papelSlot=useRef<FonteId|null>(null);
 const [progresso,setProgresso]=useState("");
 const [erroProcesso,setErroProcesso]=useState("");

 const resumoAvisos=agruparAvisosPublicacao(avisos);
 const req=["dbf_faec","dbf_mac","s_faec","s_mac",
  ...(ordemCompetenciaEletivas(competencia)>=202607?["s_mac_ms"]:[])];
 const presentes=new Set(arquivos.map(a=>a.categoria));
 const faltantes=req.filter(cat=>!presentes.has(cat));
 const ultimo=FONTES_ELETIVAS.reduce((acc,cat)=>{
  const fontes=arquivos.filter(a=>a.categoria===cat.id)
   .sort((a,b)=>b.enviado_em.localeCompare(a.enviado_em)||b.id.localeCompare(a.id));
  if(fontes.length)acc.set(cat.id,fonteS(fontes[0]));
  return acc;
 },new Map<string,Fonte>());
 function fonteS(f:Fonte){return f;}
 async function classificar(files:File[]){
  setClassificando(true);setAvisos([]);setRejeitados([]);
  try{
   const vistos:Linha[]=[];
   for(const file of files){
    try{
     if(file.size<=0||file.size>LIMITE_ARQUIVO)
      throw Error("Vazio ou superior a 50 MB");
     const a=await identificarFonte(file);
     vistos.push({file,id:a?.id??"",motivo:a?.motivo??"Não identificada: escolha o papel e valide",alerta:""});
    }catch(e){
     vistos.push({file,id:"",motivo:"Leitura não concluída",
      alerta:e instanceof Error?e.message:"Arquivo ilegível"});
    }
   }
   setLote(vistos);
   if(vistos.some(x=>x.alerta))setRejeitados(["Há arquivos inválidos ou ilegíveis. O lote está bloqueado até a correção."]);
  }finally{setClassificando(false);}
 }
 const upload=useMutation({mutationFn:async(selecao:Linha[])=>{
  if(!podeEditar||!user?.id)throw Error("Autenticação e permissão ACP/Admin necessárias.");
  if(!/^\d{7}$/.test(cnes))throw Error("CNES institucional inválido.");
  if(!selecao.length||selecao.length>18)throw Error("Escolha de 1 a 18 fontes por lote.");
  if(selecao.some(x=>!x.id))throw Error("Classifique todos os arquivos antes de enviar.");
  if(selecao.reduce((sum,x)=>sum+x.file.size,0)>LIMITE_LOTE)
   throw Error("Lote maior que 240 MB. Envie conjuntos menores.");
  const categorias=selecao.map(x=>x.id);
  if(new Set(categorias).size!==categorias.length)
   throw Error("Dois arquivos ocupam o mesmo papel. Escolha uma única versão por categoria.");
  // Pré-verifica TODO o lote antes de gravar qualquer arquivo no Storage.
  const hashes=new Set(arquivos.map(x=>x.categoria+"|"+x.sha256));
  const hashesLote=new Set<string>();
  const preparados:Array<{file:File;papel:FonteId;sha:string;avisos:string[]}>=[];
  for(const x of selecao){
   if(!x.id)throw Error("Categoria ausente.");
   try{
    const bytes=await x.file.arrayBuffer();
    const validado=validarFonteAntesUpload({nome:x.file.name,bytes,papel:x.id,cnes});
    const sha=await sha256(bytes);
    const key=x.id+"|"+sha;
    if(hashes.has(key)||hashesLote.has(key))
     throw Error("A mesma evidência já foi registrada neste papel.");
    // Não cadastrar os mesmos bytes sob duas categorias diferentes.
    if(arquivos.some(a=>a.sha256===sha)||preparados.some(p=>p.sha===sha))
     throw Error("O mesmo conteúdo já foi associado a outro papel; revise a classificação.");
    hashesLote.add(key);
    preparados.push({file:x.file,papel:x.id,sha,avisos:validado.avisos});
   }catch(e){throw Error("Pré-validação reprovada: "+x.file.name+" — "+
    (e instanceof Error?e.message:"estrutura inválida")+
    ". Nenhum arquivo deste lote foi enviado.");}
  }
  // Storage não tem transação multiarquivo: todos os uploads precedem
  // uma única inserção SQL, com limpeza compensatória em caso de falha.
  const caminhos:string[]=[];
  try{
   const registros=[];
   for(const p of preparados){
    const path=id+"/"+crypto.randomUUID()+"/"+arquivoSeguro(p.file.name);
    const {error}=await supabase.storage.from("eletivas-arquivos")
     .upload(path,p.file,{upsert:false,contentType:p.file.type||"application/octet-stream"});
    if(error)throw error;
    caminhos.push(path);
    registros.push({competencia_id:id,categoria:p.papel,nome_original:p.file.name,
     storage_path:path,sha256:p.sha,tamanho:p.file.size,enviado_por:user.id});
   }
   // Inserção de todo o lote em UMA requisição/ transação PostgREST.
   const {error}=await supabase.from("eletivas_arquivos").insert(registros);
   if(error)throw error;
  }catch(e){
   if(caminhos.length){
    const {error:limpeza}=await supabase.storage.from("eletivas-arquivos").remove(caminhos);
    if(limpeza)throw Error("Falha ao registrar lote e ao limpar arquivos temporários. "+
     "Avise o administrador para conferir objetos órfãos no bucket privado. "+
     (e instanceof Error?e.message:""));
   }
   throw Error("Lote não registrado: "+(e instanceof Error?e.message:"falha técnica")+
    ". Os arquivos temporários foram removidos quando possível.");
  }
  return {qtd:preparados.length,avisos:preparados.flatMap(p=>
   p.avisos.map(aviso=>label(p.papel)+": "+aviso))};
 },onSuccess:res=>{
  setLote([]);setRejeitados([]);setAvisos(res.avisos);onRefresh();
  toast.success(res.qtd+" evidência(s) armazenada(s) com SHA-256.");
 },onError:(e:Error)=>{toast.error(e.message);setRejeitados([e.message]);}});
 async function baixar(f:Fonte){
  const {data,error}=await supabase.storage.from("eletivas-arquivos")
   .createSignedUrl(f.storage_path,60);
  if(error||!data){toast.error(error?.message??"Arquivo não disponível.");return;}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 }
 const arrasto=(e:DragEvent<HTMLDivElement>)=>{
  e.preventDefault();setSobre(false);
  if(!podeEditar||classificando||upload.isPending)return;
  void classificar(Array.from(e.dataTransfer.files));
 };
 const conciliar=useMutation({mutationFn:()=>executarPreConciliacaoLocal({
  id,cnes,competencia,arquivos,progresso:setProgresso
 }),onSuccess:async r=>{
  setProgresso("");setErroProcesso("");setAvisos(r.avisos);
  await onRefresh();
  toast.success(r.itens+" itens processados. Abrindo o painel da conciliação.");
  onAnalisado();
 },onError:(e:Error)=>{
   setProgresso("");
   setErroProcesso(e instanceof ErroPreConciliacao?
    [e.etapa,e.arquivo,e.detalhe,e.orientacao].filter(Boolean).join(" · "):e.message);
   toast.error("Conciliação não concluída. Consulte os diagnósticos.");}});
 const escolherArquivo=(f:FonteId)=>{
  if(!podeEditar||classificando||upload.isPending)return;
  papelSlot.current=f;slotInput.current?.click();
 };
 const classificarSlot=async(file:File)=>{
  await classificar([file]);
  // O papel indicado pelo slot é apenas sugestão para revisão; a
  // pré-validação estrutural do lote continua obrigatória antes do Storage.
  const escolhido=papelSlot.current;
  if(escolhido)setLote(v=>v.map(a=>({...a,id:escolhido,
    motivo:"Escolhido pelo slot. Confirme a compatibilidade estrutural antes de registrar."})));
 };
 const aguarda=classificando||upload.isPending||conciliar.isPending;
 const conflito=lote.some(x=>x.alerta)||!lote.every(x=>x.id)||
  new Set(lote.map(x=>x.id)).size!==lote.length;
 return <div className="ec-fontes-ref">
  <section className="view on" id="v-arquivos">
   <div className="files-hero">
    <div className="files-hero-copy">
     <div className="stage-pill"><span>01</span> Preparação da competência</div>
     <h1>Reúna as fontes. O sistema cuida do resto.</h1>
     <p>Importe os DBFs do TabWin, os arquivos publicados pela SES/SC e, se disponível,
      o workbook de AIH. A identificação é feita principalmente pela <b>estrutura interna</b>,
      permitindo conviver com modelos antigos e novos do Encontro de Contas.</p>
     <div className="hero-actions">
      <button type="button" className="btn btn-secondary btn-sm" id="tabwinHelp"
       onClick={()=>setGuia(true)}><span className="btn-icon">?</span>
       Como gerar as tabulações no TabWin</button>
      <span className="hero-note">Compatível com os modelos observados até 08/2026</span>
     </div>
    </div>
   </div>
   <div className="intake-layout">
    <div className={"bigdrop"+(sobre?" over":"")} id="bigdrop"
     role={podeEditar?"button":undefined} tabIndex={podeEditar?0:-1}
     aria-label="Selecionar ou arrastar todos os arquivos da competência"
     onClick={()=>podeEditar&&!aguarda&&loteInput.current?.click()}
     onKeyDown={(e:KeyboardEvent<HTMLDivElement>)=>{
      if((e.key==="Enter"||e.key===" ")&&podeEditar&&!aguarda){
       e.preventDefault();loteInput.current?.click();
      }
     }}
     onDragOver={e=>{e.preventDefault();if(podeEditar&&!aguarda)setSobre(true);}}
     onDragLeave={e=>{e.preventDefault();setSobre(false);}}
     onDrop={arrasto}>
     <div className="upload-orbit" aria-hidden="true"><span>＋</span></div>
     <div className="bd-kicker">IMPORTAÇÃO INTELIGENTE</div>
     <div className="bd-t">Solte aqui todos os arquivos do mês</div>
     <div className="bd-s">Ou clique para selecionar. Pode mandar tudo junto:
      o sistema classifica DBF e XLSX pelo conteúdo e distribui cada arquivo no lugar certo.</div>
     <div className="bd-types"><span>DBF · TabWin</span><span>XLSX · SES/SC</span>
      <span>XLSX · AIH</span><span>ODS · FPO</span></div>
     <input type="file" ref={loteInput} multiple accept=".dbf,.xlsx,.xls,.ods"
      className="sr-only" disabled={!podeEditar||aguarda}
      aria-label="Selecionar arquivos do mês"
      onClick={e=>e.stopPropagation()}
      onChange={e=>{void classificar(Array.from(e.currentTarget.files??[]));
       e.currentTarget.value="";}}/>
     {!podeEditar&&<span className="ec-file-status">Acesso de leitura: importação exige ACP/Admin.</span>}
    </div>
    <div className="intake-side">
     <div className="intake-side-title">O que você precisa reunir</div>
     <div className="intake-check"><span className="ic-num">1</span>
      <div><b>TabWin</b><small>SIH FAEC, SIH MAC e SIA</small></div></div>
     <div className="intake-check"><span className="ic-num">2</span>
      <div><b>SES/SC</b><small>Todos os XLSX hospitalares e ambulatoriais da competência</small>
       <a className="intake-link" href="https://www.saude.sc.gov.br/index.php/pt/servicos/media-e-alta-complexidadeok/cirurgias-eletivas/encontro-de-contas-campanhas-das-cirurgias-eletivas"
        target="_blank" rel="noopener noreferrer">Abrir Encontro de Contas <span>↗</span></a></div></div>
     <div className="intake-check"><span className="ic-num">3</span>
      <div><b>Apoio</b><small>Workbook de AIH, FPO oficial, EC Deliberações e Consolidado geral SES/SC, quando houver</small></div></div>
     <div className="intake-auto"><span/> Reconhecimento automático por estrutura</div>
    </div>
   </div>
   {lote.length>0&&<section className="ec-upload-review" aria-label="Conferência dos arquivos reconhecidos">
    <div className="flex justify-between items-start gap-3">
     <div><strong className="text-sm">Conferência do lote · {lote.length} arquivos</strong>
      <p className="text-xs text-muted-foreground mt-1">
       Revise as categorias reconhecidas. O lote inteiro será validado antes de qualquer gravação.</p></div>
     <button className="btn btn-tertiary" type="button" onClick={()=>setLote([])} disabled={aguarda}>Limpar</button>
    </div>
    <div className="mt-3 grid gap-2">
     {lote.map((a,i)=><div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)] sm:items-center">
      <div className="min-w-0"><p className="break-all text-xs font-semibold">{a.file.name} · {formato(a.file.size)}</p>
       <p className={"text-[11px] mt-1 "+(a.alerta?"text-red-600":"text-muted-foreground")}>
        {a.alerta||a.motivo}</p></div>
      <select value={a.id} aria-label={"Classificação de "+a.file.name}
       disabled={aguarda}
       onChange={e=>setLote(v=>v.map((f,j)=>j!==i?f:{
        ...f,id:e.target.value as Papel,alerta:"",
        motivo:"Classificação escolhida pelo fiscal; validação estrutural no registro"}))}>
       <option value="">Não reconhecido</option>
       {FONTES_ELETIVAS.filter(f=>f.id!=="outros").map(f=><option key={f.id} value={f.id}>{f.rotulo}</option>)}
      </select>
     </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 mt-3">
     <button className="btn btn-primary" type="button"
      disabled={!podeEditar||aguarda||conflito||!lote.length}
      onClick={()=>upload.mutate(lote)}>
      <FileUp className="h-4 w-4"/> {upload.isPending?"Validando e registrando…":"Validar e registrar lote completo"}
     </button>
     {conflito&&<p className="text-xs text-amber-800">
      Confira classificação, arquivos inválidos e papéis duplicados antes de registrar.</p>}
    </div>
   </section>}
   {rejeitados.length>0&&<div className="ec-file-status text-red-800" role="alert">
    <AlertTriangle className="h-4 w-4 inline mr-2"/>{rejeitados.join(" · ")}</div>}
   {resumoAvisos.ausencias.length>0&&<div className="ec-file-status">
    <strong>{resumoAvisos.ausencias.length} grupo(s) consultado(s) sem publicação para o CNES {cnes}</strong>
    <p>Os arquivos seguem rastreados; nenhum valor de outro hospital entra no cálculo.</p>
   </div>}
   <input ref={slotInput} type="file" accept=".dbf,.xlsx,.xls,.ods"
    className="sr-only" disabled={!podeEditar||aguarda}
    aria-label="Arquivo para slot de fonte"
    onChange={e=>{const f=e.currentTarget.files?.[0];if(f)void classificarSlot(f);e.currentTarget.value="";}}/>
   <div className="sources-board">
    {grupos.map((grupo,i)=><div className={"slotgroup source-section"+(i===3?" source-section-optional":"")} key={grupo.id}>
     <div className="source-head">
      <span className="source-step">{String(i+1).padStart(2,"0")}</span>
      <div><h4>{grupo.titulo}</h4><p>{[
       "Arquivos DBF gerados no TabWin",
       "Arquivos SIH publicados no Encontro de Contas",
       "Arquivos SIA publicados no Encontro de Contas",
       "Enriquecem a auditoria e ajudam na rastreabilidade"][i]}</p></div>
      {i===3&&<span className="optional-pill">opcional</span>}
     </div>
     <div className="slots" id={["slotsTab","slotsSih","slotsSia","slotsApoio"][i]}>
      {FONTES_ELETIVAS.filter(f=>f.grupo===grupo.id&&f.id!=="outros").map(f=>{
       const registro=ultimo.get(f.id),n=arquivos.filter(a=>a.categoria===f.id).length;
       const obrigatoria=req.includes(f.id);
       return <div className={"slot"+(registro?" filled":"")+(obrigatoria?" required":"")} key={f.id}>
        <span className="slot-format">{f.id.startsWith("dbf_")?"DBF":"XLSX"}</span>
        <div className="slot-copy">
         <div className="sl">{f.rotulo}
          {obrigatoria&&!registro&&<span className="req">OBRIGATÓRIO</span>}</div>
         <div className="st">{registro?n+" versão(ões) registrada(s)":"Aguardando importação"}</div>
         {registro&&<div className="sf" title={registro.nome_original}>
          <button type="button" onClick={()=>void baixar(registro)}>
           {registro.nome_original}</button><span> · SHA {registro.sha256.slice(0,12)}…</span>
         </div>}
        </div>
        {podeEditar?<button type="button" className="slot-cta source-action"
          disabled={aguarda} aria-label={"Selecionar "+f.rotulo}
          onClick={()=>escolherArquivo(f.id)}>
          {registro?"trocar":"selecionar"}</button>:
         <span className="slot-cta">{registro?"registrado":"pendente"}</span>}
       </div>;
      })}
     </div>
    </div>)}
   </div>
   <div className="run-dock" role="region" aria-label="Executar conciliação">
    <div className={"run-status"+(faltantes.length===0?" ready":"")}>
     <span className="run-status-dot"/>
     <div><b><span id="readyNum">{presentes.size}</span> arquivos reconhecidos</b>
      <small>{faltantes.length? "faltam os obrigatórios: "+faltantes.map(label).join(", "):
       "Fontes essenciais disponíveis · pronto para análise"}</small></div>
    </div>
    <button className="btn btn-primary" type="button" id="runBtn"
     disabled={!podeEditar||aguarda||faltantes.length>0||lote.length>0}
     onClick={()=>conciliar.mutate()}>
     <span>{conciliar.isPending?"Analisando competência…":"Analisar competência"}</span>
     <span className="run-arrow">→</span>
    </button>
   </div>
   <details className="techlog">
    <summary>Detalhes técnicos da importação <span>logs e diagnósticos</span></summary>
    <div className="log" role={erroProcesso?"alert":"status"}>
     <span>{erroProcesso||progresso||rejeitados.join(" · ")||
      (resumoAvisos.outros.length?resumoAvisos.outros.join("\n"):
       "Nenhum erro de importação registrado.")}</span>

    </div>
   </details>
  </section>
  <TabwinGuiaEletivas open={guia} onOpenChange={setGuia}/>
 </div>;
}
