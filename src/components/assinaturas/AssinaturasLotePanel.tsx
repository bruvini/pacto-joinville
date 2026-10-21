import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  candidatosConvenios, candidatosPiso, candidatosPvh, elegiveisParaLinha,
  resumoCandidatos, type LinhaAssinaturaLote, type ModuloAssinaturasLote,
} from "@/lib/assinaturas/lote";
import { linkValido } from "@/lib/sei";

const MAX_LOTE = 25;
type Escolha = { nome?: string; cargo?: string; dataHora?: string };
type Resultado = { key: string; descricao: string; status: "registrada" | "erro"; motivo: string };
function validar(resposta: any) { if (resposta.error) throw resposta.error; return resposta.data ?? []; }
async function carregar(modulo: ModuloAssinaturasLote, acp: boolean, aco: boolean) {
  const pool = validar(await supabase.from("assinaturas_config").select("*").eq("ativo",true));
  if (modulo==="convenios") {
    const lancs=validar(await supabase.from("lancamentos_pagamento")
      .select("*,prestadores(nome_instituicao),convenios(modelo_fluxo)").eq("concluido",false));
    const ids=lancs.map((l:any)=>l.id);
    const sig=ids.length?validar(await supabase.from("assinaturas_etapa").select("*").in("lancamento_id",ids)):[];
    return { pool, linhas:resumoCandidatos(candidatosConvenios(lancs,sig,acp,aco)) };
  }
  if (modulo==="piso") {
    const [cs,ps,ds,ms,ss] = await Promise.all([
      supabase.from("piso_competencias").select("id,competencia,status,tipo_parcela").neq("status","encerrada"),
      supabase.from("piso_participantes").select("id,competencia_id,prestadores(nome_instituicao)"),
      supabase.from("piso_documentos").select("*"),
      supabase.from("piso_assinatura_matriz").select("*"),
      supabase.from("piso_documento_assinaturas").select("*"),
    ]);
    return { pool, linhas:resumoCandidatos(candidatosPiso(
      validar(ds),validar(cs),validar(ps),validar(ms),validar(ss))) };
  }
  const [cs,ps,es,ds,ss,as,ae,ad,asu] = await Promise.all([
    supabase.from("pvh_competencias").select("id,competencia,status").neq("status","encerrada"),
    supabase.from("pvh_participantes").select("id,competencia_id,prestadores(nome_instituicao)"),
    supabase.from("pvh_empenhos").select("*,prestadores(nome_instituicao)"),
    supabase.from("pvh_documentos").select("*"),
    supabase.from("pvh_subempenhos").select("*"),
    supabase.from("pvh_empenho_alocacoes").select("id,participante_id"),
    supabase.from("pvh_empenho_solicitacao_assinaturas").select("*"),
    supabase.from("pvh_documento_assinaturas").select("*"),
    supabase.from("pvh_subempenho_assinaturas").select("*"),
  ]);
  return { pool, linhas:resumoCandidatos(candidatosPvh({
    competencias:validar(cs),participantes:validar(ps),empenhos:validar(es),
    documentos:validar(ds),subempenhos:validar(ss),alocacoes:validar(as),
    assinaturasSolicitacao:validar(ae),assinaturasDocumento:validar(ad),assinaturasSub:validar(asu),
  })) };
}

function escapeCsv(v:unknown) {
  const text=String(v??"");
  const safe=/^\s*[=+@\-]/.test(text)?"'"+text:text;
  return '"' + safe.replace(/"/g,'""') + '"';
}
function baixarRelatorio(resultados:Resultado[]) {
  const content="\uFEFF"+[
    ["registro","resultado","detalhe"].map(escapeCsv).join(";"),
    ...resultados.map(x=>[x.descricao,x.status,x.motivo].map(escapeCsv).join(";")),
  ].join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="assinaturas-lote-resultado.csv";
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function AssinaturasLotePanel({
  modulo, podeEditar, acp=false, aco=false, onChanged,
}: {
  modulo:ModuloAssinaturasLote; podeEditar:boolean; acp?:boolean; aco?:boolean;
  onChanged?:()=>void;
}) {
  const qc=useQueryClient();
  const consulta=useQuery({
    queryKey:["assinaturas-lote-candidatos",modulo],
    queryFn:()=>carregar(modulo,acp,aco),
    enabled:podeEditar,staleTime:0,refetchOnMount:"always",
  });
  const dados=consulta.data;
  const linhas=dados?.linhas??[];
  const pool=dados?.pool??[];
  const [selecionados,setSelecionados]=useState<string[]>([]);
  const [escolhas,setEscolhas]=useState<Record<string,Escolha>>({});
  const [busca,setBusca]=useState("");
  const [filtroDoc,setFiltroDoc]=useState("todos");
  const [confirmar,setConfirmar]=useState(false);
  const [confirmado,setConfirmado]=useState(false);
  const [salvando,setSalvando]=useState(false);
  const [resultados,setResultados]=useState<Resultado[]>([]);
  const existentes=new Map(linhas.map(l=>[l.key,l]));
  const documentos=[...new Set(linhas.map(l=>l.documento))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const filtrados=linhas.filter(l=>
    (filtroDoc==="todos"||l.documento===filtroDoc) &&
    [l.instituicao,l.competencia,l.documento,l.label].join(" ").toLocaleLowerCase("pt-BR")
      .includes(busca.toLocaleLowerCase("pt-BR").trim()));
  const escolhidos=selecionados.map(k=>existentes.get(k)).filter((l):l is LinhaAssinaturaLote=>!!l);
  const motivos=useMemo(()=>{
    const saida=new Map<string,string>();
    const vistos=new Set<string>();
    for(const l of escolhidos){
      const e=escolhas[l.key];
      if(l.tipo==="convenios"&&l.bloco==="etapa1"){
        const pendente=(slot:string)=>linhas.some(x=>x.tipo===l.tipo && x.registroId===l.registroId &&
          x.bloco===l.bloco && x.slot===slot);
        const selecionado=(slot:string)=>escolhidos.some(x=>x.registroId===l.registroId &&
          x.bloco===l.bloco && x.slot===slot);
        if(l.slot!=="coord_orc"&&pendente("coord_orc")&&!selecionado("coord_orc")){
          saida.set(l.key,"Selecione também Coordenador de Orçamentos (primeira assinatura).");continue;
        }
        if(!["coord_orc","fiscal"].includes(l.slot)&&pendente("fiscal")&&!selecionado("fiscal")){
          saida.set(l.key,"Selecione também Fiscal (segunda assinatura).");continue;
        }
      }
      if(!linkValido(l.linkSei)) {saida.set(l.key,"Documento sem link SEI válido.");continue;}
      if(!e?.nome?.trim()) {saida.set(l.key,"Selecione/informe o signatário.");continue;}
      if(l.manual) {
        if(e.nome.trim().length<3){saida.set(l.key,"Nome muito curto.");continue;}
      } else if(!elegiveisParaLinha(l,pool).some(p=>p.nome_servidor===e.nome&&p.cargo===e.cargo)){
        saida.set(l.key,"Cargo não habilitado para o slot.");continue;
      }
      if(!e.dataHora || !Number.isFinite(Date.parse(e.dataHora)) || new Date(e.dataHora)>new Date()) {
        saida.set(l.key,"Informe a data/hora real da assinatura no SEI.");continue;
      }
      const referencia=[l.tipo,l.registroId,l.bloco,e.nome.toLocaleLowerCase("pt-BR")].join("|");
      if(vistos.has(referencia)){saida.set(l.key,"Assinante repetido no mesmo documento/bloco.");continue;}
      vistos.add(referencia);
    }
    return saida;
  },[escolhidos,escolhas,pool]);
  const erros=escolhidos.filter(l=>motivos.has(l.key));
  const validos=escolhidos.filter(l=>!motivos.has(l.key));
  const marcar=(key:string,checked:boolean)=>setSelecionados(atuais=>checked
    ? atuais.includes(key)?atuais:atuais.length>=MAX_LOTE?atuais:[...atuais,key]
    : atuais.filter(k=>k!==key));
  const alterar=(key:string,v:Escolha)=>setEscolhas(old=>({...old,[key]:{...old[key],...v}}));
  const salvar=async()=>{
    if(!confirmado||salvando||!validos.length||erros.length)return;
    setConfirmar(false);setSalvando(true);
    const report:Resultado[]=[];
    try {
      for(const l of validos){
        const escolha=escolhas[l.key];
        const descricao=[l.competencia,l.instituicao,l.documento,l.label,escolha.nome,escolha.dataHora].join(" · ");
        const {data,error}=await supabase.rpc("registrar_assinatura_lote" as any,{
          p_tipo:l.tipo,p_registro:l.registroId,p_bloco:l.bloco,p_slot:l.slot,
          p_nome:escolha.nome.trim(),p_cargo:escolha.cargo.trim(),
          p_link_sei:l.linkSei,p_confirmado:true,
          p_assinado_em:new Date(escolha.dataHora!).toISOString(),
        } as any);
        report.push({key:l.key,descricao,status:error?"erro":"registrada",
          motivo:error?.message??String((data as any)?.status??"Gravado")});
      }
      setResultados(report);
      const ok=report.filter(x=>x.status==="registrada").length;
      if(ok){
        toast.success(`${ok} assinatura(s) registrada(s) com evidência SEI.`);
        await Promise.all([
          qc.invalidateQueries({queryKey:["assinaturas-lote-candidatos",modulo]}),
          qc.invalidateQueries({queryKey:["assinaturas_etapa"]}),
          qc.invalidateQueries({queryKey:["piso_documento_assinaturas"]}),
          qc.invalidateQueries({queryKey:["pvh_empenho_solicitacao_assinaturas"]}),
          qc.invalidateQueries({queryKey:["pvh_documento_assinaturas"]}),
          qc.invalidateQueries({queryKey:["pvh_subempenho_assinaturas"]}),
          qc.invalidateQueries({queryKey:["assinaturas-historico-manual"]}),
        ]);
        onChanged?.();
        setSelecionados(atuais=>atuais.filter(k=>report.some(r=>r.key===k&&r.status==="erro")));
      }
      if(ok!==report.length)toast.warning("Algumas linhas falharam; confira o relatório individual.");
    }finally{setSalvando(false);setConfirmado(false);}
  };

  return <div className="space-y-3 text-sm">
    <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
      Esta operação registra <strong>assinaturas que já constam nos documentos do SEI</strong>.
      Não assina eletronicamente, não cria documentos e não conclui etapas.
      O nome indicado é o signatário do documento, enquanto seu usuário ficará
      registrado como responsável pelo lançamento. Conferir a evidência é obrigatório.
    </div>
    <div className="flex flex-wrap gap-2">
      <Input className="min-w-44 flex-1" value={busca} onChange={e=>setBusca(e.target.value)}
        placeholder="Filtrar competência, instituição, documento ou slot" />
      <Select value={filtroDoc} onValueChange={setFiltroDoc}>
        <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de documento"/></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todos os documentos</SelectItem>
          {documentos.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={()=>void consulta.refetch()} disabled={salvando}>
        Atualizar lista
      </Button>
    </div>
    {consulta.isLoading&&<p className="text-muted-foreground">Localizando documentos e matrizes…</p>}
    {consulta.isError&&<p className="text-destructive">Falha ao localizar documentos: {(consulta.error as Error).message}</p>}
    {consulta.isSuccess&&!linhas.length&&<p className="rounded-md border border-dashed p-4 text-muted-foreground">Não há assinaturas pendentes com documento SEI vinculado.</p>}
    {!!linhas.length&&<div className="max-h-[48vh] overflow-auto rounded-md border">
      <table className="w-full min-w-[940px] text-xs">
        <thead className="sticky top-0 z-10 bg-muted"><tr>
          <th className="p-2">Selecionar</th><th className="p-2 text-left">Competência / Instituição</th>
          <th className="p-2 text-left">Documento / assinatura</th>
          <th className="p-2 text-left">Signatário existente no SEI</th><th className="p-2 text-left">Prévia</th>
        </tr></thead>
        <tbody>{filtrados.map(l=>{
          const on=selecionados.includes(l.key);
          const escolha=escolhas[l.key];
          const pessoas=elegiveisParaLinha(l,pool);
          return <tr key={l.key} className="border-t align-top">
            <td className="p-2"><Checkbox checked={on} onCheckedChange={v=>marcar(l.key,v===true)}
              disabled={salvando||(!on&&selecionados.length>=MAX_LOTE)} aria-label={`Selecionar ${l.documento} ${l.label}`}/></td>
            <td className="p-2"><div className="font-semibold">{l.competencia}</div><div>{l.instituicao}</div></td>
            <td className="p-2"><div>{l.documento}</div>
              <div className="text-muted-foreground">{l.label}{l.posicao>1?` · assinatura ${l.posicao}`:""}</div>
              {l.opcional&&<Badge variant="outline" className="mt-1 text-[10px]">Opcional</Badge>}
              <a className="mt-1 block max-w-48 truncate text-primary underline" href={l.linkSei}
                target="_blank" rel="noopener noreferrer" title={l.linkSei}>Conferir documento no SEI ↗</a>
            </td>
            <td className="p-2 space-y-2">{l.manual
              ? <Input className="h-8 min-w-48" placeholder="Nome conforme SEI" value={escolha?.nome??""}
                onChange={e=>alterar(l.key,{nome:e.target.value,cargo:l.cargoManual??"SEFAZ"})}
                disabled={!on||salvando}/>
              : <Select disabled={!on||salvando} value={pessoas.find(p=>p.nome_servidor===escolha?.nome&&p.cargo===escolha?.cargo)?.id??""}
                  onValueChange={v=>{
                    const pessoa=pessoas.find(p=>p.id===v);
                    if(pessoa)alterar(l.key,{nome:pessoa.nome_servidor,cargo:pessoa.cargo});
                  }}>
                  <SelectTrigger className="h-8 min-w-48"><SelectValue placeholder="Selecionar servidor"/></SelectTrigger>
                  <SelectContent>{pessoas.map(p=><SelectItem key={p.id} value={p.id}>{p.nome_servidor} · {p.cargo}</SelectItem>)}</SelectContent>
                </Select>}
              <Input type="datetime-local" aria-label={`Data e hora SEI ${l.documento}`}
                className="h-8 min-w-48" value={escolha?.dataHora??""}
                onChange={e=>alterar(l.key,{dataHora:e.target.value})}
                disabled={!on||salvando} />
              <p className="text-[10px] text-muted-foreground">Data e hora efetiva da assinatura, conforme SEI</p>
            </td>
            <td className="p-2">{on?(motivos.get(l.key)
                ? <span className="text-destructive">{motivos.get(l.key)}</span>
                : <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3"/>Pronta</span>
              ):<span className="text-muted-foreground">Não selecionada</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        {linhas.length} posição(ões) pendente(s) · {selecionados.length}/{MAX_LOTE} selecionada(s)
        · {validos.length} pronta(s) · {erros.length} bloqueada(s)
      </span>
      <Button disabled={!validos.length||!!erros.length||salvando} onClick={()=>setConfirmar(true)}>
        {salvando?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}
        Conferir e registrar lote
      </Button>
    </div>
    {resultados.length>0&&<div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <strong>Resultado do último lote</strong>
        <Button variant="outline" size="sm" onClick={()=>baixarRelatorio(resultados)}>
          <Download className="mr-1.5 h-4 w-4"/>Exportar resultado CSV
        </Button>
      </div>
      {resultados.map(r=><p key={r.key} className={r.status==="erro"?"text-destructive":"text-success"}>
        {r.status==="registrada"?<CheckCircle2 className="mr-1 inline h-3 w-3"/>:<AlertTriangle className="mr-1 inline h-3 w-3"/>}
        {r.descricao} — {r.motivo}
      </p>)}
    </div>}
    <AlertDialog open={confirmar} onOpenChange={v=>{if(!salvando)setConfirmar(v);}}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Confirmar registro de {validos.length} assinaturas?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação registrará evidências já assinadas no SEI.
          Seu usuário aparecerá como responsável pelo cadastro, não como signatário.
          As assinaturas não serão produzidas pelo sistema. Falhas serão reportadas individualmente.</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmado} onCheckedChange={v=>setConfirmado(v===true)}/>
          Conferi pessoalmente cada documento no SEI e confirmo que os signatários selecionados
          realmente assinaram os documentos indicados.
        </label>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={!confirmado||salvando} onClick={()=>void salvar()}>
            Registrar assinaturas comprovadas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
