import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {FileUp,ExternalLink,ShieldCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {FONTES_ELETIVAS, fontesObrigatorias,type FonteId} from "@/lib/eletivas/fontes";
import type {Tables} from "@/integrations/supabase/types";

type Fonte=Tables<"eletivas_arquivos">;
const formato=(n:number)=>(n/1024).toFixed(0)+" KB";
const arquivoSeguro=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,100);
export function FontesEletivas({id,arquivos,podeEditar,onRefresh}:{
  id:string;arquivos:Fonte[];podeEditar:boolean;onRefresh:()=>void;
}) {
  const {user}=useAuth();
  const [categoria,setCategoria]=useState<FonteId>("dbf_faec");
  const [arquivo,setArquivo]=useState<File|null>(null);
  const presentes=new Set(arquivos.map(x=>x.categoria));
  const falta=FONTES_ELETIVAS.filter(x=>x.obrigatoria&&!presentes.has(x.id));
  const upload=useMutation({mutationFn:async()=>{
    if(!arquivo||!user?.id)throw Error("Selecione um arquivo e confirme a sessão.");
    if(arquivo.size===0||arquivo.size>50*1024*1024)throw Error("Arquivo vazio ou maior que 50 MB.");
    if(!/\.(dbf|xlsx|xls|ods|pdf)$/i.test(arquivo.name))
      throw Error("Formato não aceito: utilize DBF, XLSX, XLS, ODS ou PDF.");
    const digest=await crypto.subtle.digest("SHA-256",await arquivo.arrayBuffer());
    const sha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
    if(arquivos.some(x=>x.sha256===sha&&x.categoria===categoria))
      throw Error("Este mesmo arquivo já está cadastrado neste papel.");
    const path=`${id}/${crypto.randomUUID()}/${arquivoSeguro(arquivo.name)}`;
    const storage=await supabase.storage.from("eletivas-arquivos")
      .upload(path,arquivo,{upsert:false,contentType:arquivo.type||"application/octet-stream"});
    if(storage.error)throw storage.error;
    const {error}=await supabase.from("eletivas_arquivos").insert({
      competencia_id:id,categoria,nome_original:arquivo.name,storage_path:path,
      sha256:sha,tamanho:arquivo.size,enviado_por:user.id,
    });
    if(error)throw new Error(`Arquivo enviado, mas o registro falhou: ${error.message}.
      Solicite ao administrador a conferência do armazenamento privado.`);
  },onSuccess:()=>{setArquivo(null);toast.success("Evidência registrada com hash SHA-256");onRefresh()},
    onError:(e:Error)=>toast.error(e.message)});
  async function baixar(f:Fonte){
    const {data,error}=await supabase.storage.from("eletivas-arquivos")
      .createSignedUrl(f.storage_path,60);
    if(error||!data)toast.error(error?.message??"Não foi possível abrir o arquivo.");
    else window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      <ShieldCheck className="h-4 w-4 text-primary"/>
      <span>{fontesObrigatorias.length-falta.length}/{fontesObrigatorias.length} fontes obrigatórias cadastradas</span>
      {falta.length>0&&<span className="text-amber-800">· Faltam: {falta.map(x=>x.rotulo).join(", ")}</span>}
    </div>
    <p className="text-xs text-muted-foreground">Arquivos guardados em bucket privado, com integridade
      SHA-256. O upload não executa ainda os cruzamentos automáticos DBF/SES do HTML original.</p>
    {podeEditar&&<div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]">
      <div><label className="mb-1 block text-xs font-semibold">Tipo de fonte</label>
        <Select value={categoria} onValueChange={v=>setCategoria(v as FonteId)}>
          <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
            {FONTES_ELETIVAS.map(x=><SelectItem key={x.id} value={x.id}>
              {x.rotulo}</SelectItem>)}</SelectContent></Select></div>
      <div><label className="mb-1 block text-xs font-semibold">Arquivo</label>
        <Input type="file" accept=".dbf,.xlsx,.xls,.ods,.pdf" onChange={e=>
          setArquivo(e.currentTarget.files?.[0]??null)}/></div>
      <Button className="self-end" disabled={!arquivo||upload.isPending} onClick={()=>upload.mutate()}>
        <FileUp className="mr-1.5 h-4 w-4"/>{upload.isPending?"Enviando…":"Registrar"}</Button>
    </div>}
    {["TabWin","SES/SC · Hospitalar","SES/SC · Ambulatorial","Apoio","SEI"].map(grupo=>
      <div key={grupo} className="rounded-lg border">
        <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{grupo}</h3>
        <div className="divide-y">{FONTES_ELETIVAS.filter(x=>x.grupo===grupo).map(x=>{
          const files=arquivos.filter(a=>a.categoria===x.id);
          return <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
            <div><span className="font-semibold">{x.rotulo}</span>
              {x.obrigatoria&&<span className="ml-1 text-amber-700">· obrigatória</span>}
              {files.length>0&&<div className="mt-0.5 text-muted-foreground">
                {files.length} versão(ões) · Última: {files[0].nome_original} ({formato(files[0].tamanho)})
              </div>}</div>
            {files.length>0?<Button size="sm" variant="outline" onClick={()=>baixar(files[0])}>
              <ExternalLink className="mr-1 h-3.5 w-3.5"/>Abrir</Button>:
              <span className="text-muted-foreground">Não anexado</span>}
          </div>;
        })}</div>
      </div>)}
  </div>;
}
