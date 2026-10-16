import {useState,type DragEvent} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {ArrowUpRight,FileCheck2,FileUp,FolderOpen,ShieldCheck,UploadCloud,AlertTriangle} from "lucide-react";
import {agruparAvisosPublicacao} from "@/lib/eletivas/avisosImportacao";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {FONTES_ELETIVAS,type FonteId,ordemCompetenciaEletivas} from "@/lib/eletivas/fontes";
import {identificarFonte} from "@/lib/eletivas/autoRoteamento";
import {validarFonteAntesUpload} from "@/lib/eletivas/prepararFonte";
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

export function FontesEletivas({id,cnes,competencia,arquivos,podeEditar,onRefresh}:{
 id:string;cnes:string;competencia:string;arquivos:Fonte[];
 podeEditar:boolean;onRefresh:()=>void;
}){
 const {user}=useAuth();
 const [lote,setLote]=useState<Linha[]>([]);
 const [rejeitados,setRejeitados]=useState<string[]>([]);
 const [classificando,setClassificando]=useState(false);
 const [sobre,setSobre]=useState(false);
 const [categoria,setCategoria]=useState<FonteId>("dbf_faec");
 const [arquivo,setArquivo]=useState<File|null>(null);
 const [avisos,setAvisos]=useState<string[]>([]);
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
  setLote([]);setArquivo(null);setRejeitados([]);setAvisos(res.avisos);onRefresh();
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
 const aguarda=classificando||upload.isPending;
 const conflito=lote.some(x=>x.alerta)||!lote.every(x=>x.id)||
  new Set(lote.map(x=>x.id)).size!==lote.length;
 return <div className="space-y-5">
  <section className="rounded-xl border border-emerald-900/15 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 px-5 py-6 text-white sm:px-7">
   <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-emerald-200">
    01 · Preparação da competência</p>
   <h3 className="text-2xl font-semibold tracking-tight">Reúna as fontes. O sistema cuida do resto.</h3>
   <p className="mt-2 max-w-3xl text-sm text-emerald-50/90">
    Importe as tabulações DBF do TabWin e as planilhas da SES/SC.
    Os modelos SIH, SIA, múltiplas, AIH, FPO e consolidado são identificados pela estrutura interna,
    com validação antes do armazenamento privado.</p>
   <div className="mt-4 flex flex-wrap gap-2 text-xs">
    <span className="rounded-full bg-white/10 px-3 py-1">CNES {cnes}</span>
    <span className="rounded-full bg-white/10 px-3 py-1">Competência {competencia}</span>
    <span className="rounded-full bg-white/10 px-3 py-1">Referência HTML v2.42.2</span>
   </div>
  </section>
  <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
   <div className="space-y-3">
    <div onDragOver={e=>{e.preventDefault();if(podeEditar)setSobre(true);}}
     onDragLeave={e=>{e.preventDefault();setSobre(false);}}
     onDrop={arrasto}
     className={"relative rounded-xl border-2 border-dashed p-6 text-center transition-colors "+
      (sobre?"border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20":
       "border-emerald-700/30 bg-emerald-50/40 dark:bg-emerald-950/10")}>
     <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900 text-white">
      <UploadCloud className="h-6 w-6"/></div>
     <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
      Importação inteligente</p>
     <h4 className="mt-1 text-lg font-semibold">Solte aqui todos os arquivos do mês</h4>
     <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
      Ou selecione de uma vez. O sistema classifica pelo conteúdo;
      você confere cada papel antes de registrar.</p>
     <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[11px]">
      {["DBF · TabWin","XLSX · SES/SC","XLSX · AIH","ODS · FPO"].map(t=>
       <span key={t} className="rounded bg-background px-2 py-1">{t}</span>)}
     </div>
     {podeEditar&&<div className="mx-auto mt-4 max-w-xs">
      <Input type="file" multiple accept=".dbf,.xlsx,.xls,.ods" disabled={aguarda}
       aria-label="Selecionar arquivos do mês"
       onChange={e=>{void classificar(Array.from(e.currentTarget.files??[]));
        e.currentTarget.value="";}}/>
     </div>}
     {!podeEditar&&<p className="mt-3 text-xs text-muted-foreground">
      Somente leitura: o envio exige perfil fiscal e competência aberta.</p>}
    </div>
    <div className="flex items-start gap-2 rounded-lg border bg-card p-3 text-xs">
     <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/>
     <div><strong>{req.length-faltantes.length}/{req.length} fontes obrigatórias</strong>
      {faltantes.length>0?<p className="mt-1 text-amber-700">
       Pendentes: {faltantes.map(label).join(", ")}.</p>:
       <p className="mt-1 text-emerald-700">Fontes obrigatórias registradas; confira os layouts na conciliação.</p>}
      <p className="mt-1 text-muted-foreground">
       Upload não executa auditoria. A conciliação é separada e grava seus resultados somente após validar todas as fontes.</p>
     </div>
    </div>
   </div>
   <aside className="rounded-xl border bg-card p-4">
    <h4 className="font-semibold">O que você precisa reunir</h4>
    <div className="mt-3 space-y-4 text-xs">
     <div className="flex gap-3"><span className="font-bold text-emerald-800">01</span>
      <div><strong>TabWin</strong><p className="text-muted-foreground">SIH FAEC, SIH MAC e SIA, quando disponível.</p></div></div>
     <div className="flex gap-3"><span className="font-bold text-emerald-800">02</span>
      <div><strong>SES/SC</strong><p className="text-muted-foreground">Planilhas hospitalares e ambulatoriais da competência.</p>
       <a href="https://www.saude.sc.gov.br/index.php/pt/servicos/media-e-alta-complexidadeok/cirurgias-eletivas/encontro-de-contas-campanhas-das-cirurgias-eletivas"
        target="_blank" rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
        Página SES/SC <ArrowUpRight className="h-3 w-3"/></a></div></div>
     <div className="flex gap-3"><span className="font-bold text-emerald-800">03</span>
      <div><strong>Apoio</strong><p className="text-muted-foreground">
       Workbook de AIHs, FPO oficial, EC Deliberações e Consolidado Geral.</p></div></div>
    </div>
   </aside>
  </div>
  {podeEditar&&lote.length>0&&<section className="rounded-xl border bg-card p-4 space-y-3">
   <div className="flex items-center justify-between gap-2">
    <div><h4 className="font-semibold">Conferência do lote</h4>
     <p className="text-xs text-muted-foreground">
      {lote.length} arquivo(s). Todos devem passar pela validação estrutural antes do envio.</p></div>
    <Button type="button" size="sm" variant="ghost" onClick={()=>setLote([])}
      disabled={aguarda}>Limpar seleção</Button>
   </div>
   <div className="divide-y rounded-lg border">
    {lote.map((a,i)=><div key={i} className="grid gap-2 p-3 sm:grid-cols-[1fr_220px] sm:items-center">
     <div className="min-w-0"><p className="break-words text-xs font-medium">{a.file.name}
       <span className="ml-1 text-muted-foreground">({formato(a.file.size)})</span></p>
      <p className={"text-[11px] "+(a.alerta?"text-destructive":"text-muted-foreground")}>
       {a.alerta||a.motivo}</p></div>
     <Select value={a.id||"__nenhum"} disabled={aguarda}
      onValueChange={value=>setLote(current=>current.map((item,j)=>j!==i?item:
       {...item,id:value==="__nenhum"?"":value as FonteId,alerta:"",
        motivo:"Papel escolhido para validação estrutural"}))}>
      <SelectTrigger aria-label={"Papel de "+a.file.name}><SelectValue/></SelectTrigger>
      <SelectContent>
       <SelectItem value="__nenhum">Escolher papel</SelectItem>
       {FONTES_ELETIVAS.filter(f=>f.grupo!=="SEI"&&f.id!=="outros").map(f=>
        <SelectItem value={f.id} key={f.id}>{f.rotulo}</SelectItem>)}
      </SelectContent>
     </Select>
    </div>)}
   </div>
   <Button type="button" disabled={aguarda||conflito}
    onClick={()=>upload.mutate(lote)}>
    <FileUp className="mr-1.5 h-4 w-4"/>
    {upload.isPending?"Validando e registrando…":"Validar e registrar lote completo"}
   </Button>
   {conflito&&<p className="text-xs text-amber-700">
    Resolva arquivos não reconhecidos, ilegíveis ou papéis duplicados antes do envio.</p>}
  </section>}
  {podeEditar&&<section className="rounded-xl border p-4">
   <h4 className="text-sm font-semibold">Registro individual de fonte</h4>
   <p className="mt-1 text-xs text-muted-foreground">
    Use para uma planilha ou arquivo de apoio. Relatório Técnico e Relatório de Análise são informados pelos campos SEI na Etapa 6 — Liberação de Recurso do lançamento.</p>
   <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <div><label className="mb-1 block text-xs">Papel da fonte</label>
     <Select value={categoria} disabled={aguarda} onValueChange={v=>setCategoria(v as FonteId)}>
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent>{FONTES_ELETIVAS.map(f=>
       <SelectItem key={f.id} value={f.id}>{f.rotulo}</SelectItem>)}</SelectContent>
     </Select></div>
    <div><label className="mb-1 block text-xs">Arquivo</label>
     <Input type="file" accept=".dbf,.xlsx,.xls,.ods" disabled={aguarda}
      onChange={e=>setArquivo(e.currentTarget.files?.[0]??null)}/></div>
    <Button type="button" disabled={aguarda||!arquivo}
     onClick={()=>{if(arquivo)upload.mutate([{file:arquivo,id:categoria,
      motivo:"Registro individual",alerta:""}]);}}>
     Registrar</Button>
   </div>
  </section>}
  {rejeitados.length>0&&<section role="alert" className="rounded-xl border border-destructive/30 p-3">
   <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive">
    <AlertTriangle className="h-4 w-4"/>Falhas na importação ({rejeitados.length})</h4>
   <div className="mt-2 space-y-1 text-xs text-destructive">
    {rejeitados.map((x,i)=><p key={i}>{x}</p>)}</div>
  </section>}
  {resumoAvisos.outros.length>0&&<details className="rounded-xl border p-3">
   <summary className="cursor-pointer text-sm font-medium">
    Avisos para conferência ({resumoAvisos.outros.length})</summary>
   <div className="mt-2 space-y-1 text-xs text-amber-700">
    {resumoAvisos.outros.map((a,i)=><p key={i}>{a}</p>)}</div>
  </details>}
  {resumoAvisos.ausencias.length>0&&<details className="rounded-xl border bg-muted/15 p-3">
   <summary className="cursor-pointer text-sm text-muted-foreground">
    Informação: {resumoAvisos.ausencias.length} fonte(s) complementar(es) sem publicação para o CNES {cnes}
   </summary>
   <p className="mt-2 text-xs text-muted-foreground">
    Isso é esperado quando o HMSJ não consta nessas planilhas. Os valores de outros hospitais
    não são utilizados; a importação permanece válida.</p>
   <div className="mt-2 space-y-1 text-xs text-muted-foreground">
    {resumoAvisos.ausencias.map((x,i)=>
     <p key={i}>{x.fonte}: {x.abas.join(", ")}.</p>)}
   </div>
  </details>}
  <section className="space-y-4">
   {grupos.map((grupo,ordem)=>{
    const subset=FONTES_ELETIVAS.filter(f=>f.grupo===grupo.id);
    return <div key={grupo.id} className="overflow-hidden rounded-xl border bg-card">
     <header className="flex items-center gap-3 border-b bg-muted/25 p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-900 text-sm font-bold text-white">
       {String(ordem+1).padStart(2,"0")}</span>
      <div><h4 className="text-sm font-semibold">{grupo.titulo}</h4>
       <p className="text-xs text-muted-foreground">{grupo.descricao}</p></div>
     </header>
     <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {subset.map(f=>{
       const registro=ultimo.get(f.id),n=arquivos.filter(a=>a.categoria===f.id).length;
       const obrigatoria=req.includes(f.id);
       return <article key={f.id}
        className={"flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 "+
         (registro?"border-emerald-700/40 bg-emerald-50/40 dark:bg-emerald-950/10":"bg-background")}>
        <div className="flex items-start gap-2">
         {registro?<FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/>:
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>}
         <div className="min-w-0">
          <p className="text-xs font-semibold">{f.rotulo}
           {obrigatoria&&<span className="ml-1 text-amber-700">· obrigatório</span>}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
           {registro?n+" versão(ões) · "+registro.nome_original+" · "+formato(registro.tamanho):
            "Aguardando importação"}
          </p>
          {registro&&<p className="mt-1 font-mono text-[10px] text-muted-foreground">
           SHA-256 {registro.sha256.slice(0,16)}…</p>}
         </div>
        </div>
        {registro?<Button type="button" size="sm" variant="outline"
          className="w-fit" onClick={()=>{void baixar(registro);}}>
          <ArrowUpRight className="mr-1 h-3.5 w-3.5"/>Abrir evidência</Button>:
          <p className="text-[11px] text-muted-foreground">Sem arquivo cadastrado</p>}
       </article>;
      })}
     </div>
    </div>;
   })}
  </section>
  <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
   <strong>Próximo passo:</strong> após registrar as fontes, execute a pré-conciliação na aba
   Conciliação e decisões. Hash, estrutura, CNES e manifesto são novamente validados
   antes de qualquer escrita de itens. O consolidado SES é uma prova de conferência
   separada e não constitui crédito adicional para o atesto.
  </div>
 </div>;
}
