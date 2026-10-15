import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {ShieldCheck,Download,FileSearch} from "lucide-react";
import type {Tables} from "@/integrations/supabase/types";
import {compararGolden,montarGoldenReact,serializarGolden,validarGolden,
 type GoldenEC,type DiferencaGolden,type GoldenFonte} from "@/lib/eletivas/goldenMaster";

type Comp=Tables<"eletivas_competencias">;
type Arquivo=Tables<"eletivas_arquivos">;
type Item=Tables<"eletivas_itens">;
const baixar=(conteudo:string,arquivo:string)=>{
 const url=URL.createObjectURL(new Blob([conteudo],{type:"application/json"}));
 const a=document.createElement("a");
 a.href=url;a.download=arquivo;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const cents=(v:number)=>Math.round(v*100);
export function HomologacaoEletivas({comp,arquivos,itens}:{
 comp:Comp;arquivos:Arquivo[];itens:Item[];
}){
 const [golden,setGolden]=useState<GoldenEC|null>(null);
 const [erro,setErro]=useState("");
 const corr=useQuery({queryKey:["ec-correcoes-homologacao",comp.id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_correcoes")
   .select("valor,status").eq("competencia_id",comp.id);
  if(error)throw error;return data??[];
 }});
 const manifesto=comp.ec_fontes_snapshot;
 const fontes=useMemo(()=>{
  if(!Array.isArray(manifesto))return [] as GoldenFonte[];
  return manifesto.flatMap(raw=>{
   if(!raw||typeof raw!=="object"||Array.isArray(raw))return [];
   const f=raw as Record<string,unknown>;
   const categoria=typeof f.categoria==="string"?f.categoria:"";
   const sha256=typeof f.sha256==="string"?f.sha256:"";
   const id=typeof f.id==="string"?f.id:"";
   // Confere registro e hash da evidência congelada, nunca usa arquivo atual
   // em lugar do escolhido no processamento.
   const arquivo=arquivos.find(a=>a.id===id&&a.categoria===categoria&&a.sha256===sha256);
   return arquivo?[{categoria,sha256}]:[];
  });
 },[manifesto,arquivos]);
 const correcoesCent=(corr.data??[]).filter(r=>r.status==="aprovada")
   .reduce((a,r)=>a+cents(Number(r.valor)),0);
 const atual=useMemo(()=>montarGoldenReact({
  competencia:comp.competencia,cnes:comp.cnes,versaoMotor:comp.ec_motor_versao??"",
  versaoReferencia:"React/Supabase — auditoria congelada",
  fontes,itens,correcoesCent,
 }),[comp.competencia,comp.cnes,comp.ec_motor_versao,fontes,itens,correcoesCent]);
 let diferencias:DiferencaGolden[]=[];
 try{if(golden)diferencias=compararGolden(golden,atual);}
 catch(e){if(golden)diferencias=[{codigo:"ESTRUTURA",chave:"geral",
  campo:"json",esperado:"Contrato ec-golden-v1",obtido:"Inválido",
  responsavel:"Fiscal homologador",fonte:"Reexportar golden com evidências originais"}];}
 const sameProfile=golden?.competencia===comp.competencia&&golden?.cnes===comp.cnes;
 const preciso=comp.competencia==="04/2026"?"Modelo anterior (sem MAC MS obrigatório)":
  comp.competencia==="07/2026"?"Novo arquivo SES MAC Múltiplas/Sequenciais":
   "A partir de 08/2026: FPO efetiva e Nota Informativa 05/2026";
 const faltaFontes=!Array.isArray(manifesto)||
  fontes.length!==manifesto.length;
 // Nunca exibir "aprovado" apenas pela comparação: a homologação também
 // exige execução SQL/RLS, vigência e assinatura documental externas.
 const comparacaoOK=!!golden&&sameProfile&&diferencias.length===0&&
   !faltaFontes&&!corr.isError&&!corr.isLoading&&itens.length>0;
 async function importar(file:File|null){
  setGolden(null);setErro("");
  if(!file)return;
  if(file.size>10*1024*1024){setErro("JSON superior a 10 MB: verifique o exportador.");return;}
  try{
   const parsed=validarGolden(JSON.parse(await file.text()));
   if(parsed.origem!=="html")throw Error("Importe o arquivo produzido pelo HTML original.");
   if(parsed.competencia!==comp.competencia||parsed.cnes!==comp.cnes)
    throw Error("Golden de outra competência ou CNES. Compare fontes idênticas.");
   setGolden(parsed);
  }catch(e){setErro(e instanceof Error?e.message:"JSON inválido.");}
 }
 const fazerExport=()=>{
  if(faltaFontes||!fontes.length||corr.isError||corr.isLoading){
   toast.error("Manifesto/hash ou correções indisponíveis. Atualize as evidências.");
   return;
  }
  baixar(serializarGolden(atual),
   "EC_React_"+comp.competencia.replace("/","-")+".json");
 };
 const baixarDiagnostico=()=>{
  if(!golden)return;
  baixar(JSON.stringify({schema:"ec-homologacao-diff-v1",competencia:comp.competencia,
   master:golden.versaoReferencia,versaoReact:comp.ec_motor_versao,
   status:comparacaoOK?"conferir-implantacao":"divergente",
   diferencas:diferencias},null,2),
   "EC_diagnostico_"+comp.competencia.replace("/","-")+".json");
 };
 return <div className="space-y-4">
   <div className="rounded-lg border p-3 space-y-2">
    <h3 className="flex items-center gap-2 font-semibold">
     <FileSearch className="h-4 w-4"/>Homologação por evidências — Fase 7</h3>
    <p className="text-xs text-muted-foreground">
     Perfil de teste: <strong>{preciso}</strong>. Execute o HTML original em
     ambiente isolado com os mesmos arquivos de origem e decisões. Importe
     o JSON técnico produzido pelo exportador. Nenhum paciente é incluído
     nesta exportação.</p>
    <div className="flex flex-wrap items-center gap-2 text-xs">
     <Badge variant="outline">{itens.length} itens React</Badge>
     <Badge variant="outline">{fontes.length} fontes com SHA no manifesto</Badge>
     <Badge variant="outline">Motor {comp.ec_motor_versao??"não executado"}</Badge>
    </div>
    {faltaFontes&&<p className="text-xs text-destructive">
     O manifesto contém arquivo/hash não localizado. A comparação não pode ser aprovada.</p>}
    {corr.isError&&<p className="text-xs text-destructive">
     Não foi possível recuperar as correções; a comparação está bloqueada.</p>}
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">1. Exportar resultado React/Supabase</p>
      <p className="text-xs text-muted-foreground">
       Itens, categoria, AIH, QT, valores em centavos, decisão, subtotais
       e hashes congelados — sem campos nominativos.</p>
      <Button variant="outline" onClick={fazerExport}
       disabled={!fontes.length||faltaFontes||corr.isLoading||corr.isError}>
       <Download className="mr-2 h-4 w-4"/>Baixar JSON React</Button>
    </div>
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">2. Importar golden master do HTML</p>
      <p className="text-xs text-muted-foreground">
       Use o exportador oficial no HTML já conciliado, sem criar valores fictícios.</p>
      <Input type="file" accept=".json,application/json"
       onChange={e=>void importar(e.currentTarget.files?.[0]??null)}/>
      {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
   </div>
   {golden&&<section className="rounded-lg border p-3 space-y-3">
    <div className="flex flex-wrap gap-2 items-center">
      <ShieldCheck className="h-4 w-4"/>
      <strong>Comparação técnica: {comparacaoOK?"sem divergências no JSON":
       diferencias.length+" divergência(s)"}</strong>
      <Button size="sm" variant="outline" onClick={baixarDiagnostico}>
       <Download className="mr-1 h-3.5 w-3.5"/>Baixar diagnóstico</Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Total, composição, glosa e decisões exigem identidade exata.
      Tolerância de até R$ 0,02 é aplicada apenas por linha quando a
      regra financeira for explicitamente comprovada dos dois lados.
      Comparação sem diferenças NÃO aprova o fechamento: RLS/SQL, publicação
      oficial, documentos e responsável precisam de homologação separada.</p>
    {!!diferencias.length&&<div className="max-h-[520px] overflow-auto">
      <table className="w-full min-w-[700px] text-xs">
       <thead><tr className="border-b text-left">
        <th className="p-2">Código</th><th>Categoria/AIH</th>
        <th>Campo</th><th>HTML</th><th>React</th><th>Responsável / fonte</th>
       </tr></thead>
       <tbody>{diferencias.slice(0,150).map((d,i)=><tr key={i} className="border-b">
        <td className="p-2">{d.codigo}</td><td>{d.chave}</td><td>{d.campo}</td>
        <td>{d.esperado}</td><td>{d.obtido}</td><td>{d.responsavel} · {d.fonte}</td>
       </tr>)}</tbody>
      </table>
      {diferencias.length>150&&<p className="text-xs">
       Exibidas 150 de {diferencias.length} divergências. Baixe o JSON completo.</p>}
    </div>}
   </section>}
   <div className="rounded-md border p-3 text-xs text-muted-foreground">
    <strong>Estado da homologação:</strong> {comparacaoOK?
     "Cotejo técnico sem divergências — requer evidência SQL/RLS/SEI e aprovação fiscal.":
     "Pendente de evidências, golden master ou correção das divergências."}
   </div>
 </div>;
}
