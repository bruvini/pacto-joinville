import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ClipboardCopy, CopyCheck, Download, FileSpreadsheet, ExternalLink, RefreshCw,
  Search, Info, Layers3,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkValido } from "@/lib/sei";
import { useCentralPlanilha } from "@/hooks/useCentralPlanilha";
import {
  COLUNAS_PLANILHA, celulaPlanilha, csvPlanilha, tsvPlanilha,
  type ColunaPlanilha, type LinhaPlanilha, type ModuloPlanilha,
} from "@/lib/financeiro/planilha-atualizacao";

export const Route = createFileRoute("/_authenticated/planilha-atualizacao")({
  head:()=>({meta:[{title:"Central de Atualização da Planilha · SMS Joinville"}]}),
  component: CentralPlanilhaPage,
});

const ROTULOS:Record<ModuloPlanilha,string>={
  convenios:"Convênios / Empenhos",piso:"Piso da Enfermagem",pvh:"PVH",
};
const descricoes:Partial<Record<keyof LinhaPlanilha,string>>={
  contrato:"Identificação do instrumento, usando o objeto do convênio quando disponível. O banco não possui número de contrato específico; não é inventado.",
  valorPrevisto:"Convênios: solicitado; Piso: valor necessário conciliado; PVH: valor alocado à competência ou valor previsto.",
  valorEmpenhado:"Convênios: valor de empenho líquido registrado; Piso: empenhado original da NE; PVH: total da NE, que pode cobrir várias competências.",
  valorAtestado:"Convênios: atestado; Piso: devido conciliado; PVH: indisponível (não confundir com pago).",
  valorAnulado:"Somente valor efetivamente registrado. Uma previsão de saldo a anular não equivale a uma anulação concluída.",
};
function rotuloModulo(modulo:ModuloPlanilha){return ROTULOS[modulo];}
function padronizar(x:string){return x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function copiar(conteudo:string,descricao:string){
  void navigator.clipboard.writeText(conteudo).then(
    ()=>toast.success(descricao+" copiado para a área de transferência."),
    ()=>toast.error("Não foi possível copiar. Permita o acesso à área de transferência do navegador."),
  );
}
function CopiarValor({linha,coluna}:{linha:LinhaPlanilha;coluna:ColunaPlanilha}){
  const valor=celulaPlanilha(linha,coluna);
  if(coluna.tipo==="link"){
    return valor && linkValido(valor) ?
      <SeiButton href={valor} label="Abrir" /> :
      <span className="text-muted-foreground/60" title={valor?"Link incompleto ou inválido":"Sem documento cadastrado"}>—</span>;
  }
  if(valor==="")return <span className="text-muted-foreground/50" title="Não cadastrado ou não se aplica">—</span>;
  return <button type="button" onClick={()=>copiar(valor,coluna.titulo)}
    aria-label={"Copiar "+coluna.titulo+" de "+linha.instituicao+": "+valor}
    title={"Clique para copiar: "+valor}
    className="group flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <span className={"max-w-[260px] truncate "+(coluna.tipo==="moeda"?"tabular-nums font-medium":"")}>{valor}</span>
    <ClipboardCopy className="h-3.5 w-3.5 shrink-0 text-primary opacity-35 group-hover:opacity-100 group-focus-visible:opacity-100"/>
  </button>;
}
function baixarCsv(linhas:LinhaPlanilha[]){
  const blob=new Blob([csvPlanilha(linhas)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="atualizacao-planilha-sms.csv";anchor.click();
  URL.revokeObjectURL(url);
  toast.success("CSV gerado com os registros filtrados.");
}
function CentralPlanilhaPage(){
  const consulta=useCentralPlanilha();
  const [modulo,setModulo]=useState("todos");
  const [competencia,setCompetencia]=useState("todas");
  const [busca,setBusca]=useState("");
  const [ultimoCopiado,setUltimoCopiado]=useState<string|null>(null);
  const registros=consulta.data??[];
  const competencias=useMemo(()=>
    [...new Set(registros.flatMap(r=>String(r.competencia??"").split(",").map(x=>x.trim()).filter(Boolean)))]
      .sort((a,b)=>b.localeCompare(a,"pt-BR")),
    [registros]);
  const filtrados=useMemo(()=>{
    const q=padronizar(busca.trim());
    return registros.filter(r=>
      (modulo==="todos"||r.modulo===modulo) &&
      (competencia==="todas"||String(r.competencia??"").split(",").map(v=>v.trim()).includes(competencia)) &&
      (!q||padronizar([r.instituicao,r.contrato,r.parcela,r.competencia,r.numeroEmpenho,r.dotacao,r.fonte]
        .filter(Boolean).join(" ")).includes(q)));
  },[registros,modulo,competencia,busca]);
  // Totais por módulo permanecem visíveis ao trocar cartões (sem zerar as outras categorias).
  const modulosVisiveis=useMemo(()=>({
    convenios:registros.filter(r=>r.modulo==="convenios").length,
    piso:registros.filter(r=>r.modulo==="piso").length,
    pvh:registros.filter(r=>r.modulo==="pvh").length,
  }),[registros]);
  const copiarTabela=()=>filtrados.length&&copiar(tsvPlanilha(filtrados),"Tabela filtrada");
  const copiarLinha=(r:LinhaPlanilha)=>{
    copiar(tsvPlanilha([r]),"Linha com cabeçalhos");
    setUltimoCopiado(r.id);
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4" /> Execução financeira · Consulta integrada
        </div>
        <h1 className="text-2xl font-bold text-primary">Central de Atualização da Planilha</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Informações dos Convênios, Piso e PVH reunidas para atualização da planilha de outro setor.
          Clique nos valores para copiá-los; os links abrem diretamente o documento cadastrado no SEI.
          Consulta somente leitura: nenhuma etapa ou documento é alterado.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={()=>void consulta.refetch()} disabled={consulta.isFetching}>
        <RefreshCw className={"mr-2 h-4 w-4 "+(consulta.isFetching?"animate-spin":"")}/>
        Atualizar dados
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      {([
        ["Registros no recorte",filtrados.length,"todos"],
        ["Convênios",modulosVisiveis.convenios,"convenios"],
        ["Piso da Enfermagem",modulosVisiveis.piso,"piso"],
        ["PVH",modulosVisiveis.pvh,"pvh"],
      ] as const).map(([titulo,total,key])=>
        <button type="button" key={key} onClick={()=>setModulo(key)}
          className={"rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 "+
            (modulo===key?"border-primary ring-1 ring-primary/20":"")}
          aria-label={"Filtrar "+titulo}>
          <span className="block text-xs text-muted-foreground">{titulo}</span>
          <span className="text-xl font-bold tabular-nums">{total}</span>
        </button>)}
    </div>
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Layers3 className="h-4 w-4"/> Registros para a planilha</CardTitle>
          <Badge variant="outline">{filtrados.length} linha(s)</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_190px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
            <Input aria-label="Buscar instituição, contrato, competência, empenho ou dotação"
              className="pl-9" value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar instituição, contrato, NE, fonte..."/>
          </div>
          <Select value={modulo} onValueChange={setModulo}>
            <SelectTrigger aria-label="Filtrar módulo"><SelectValue placeholder="Todos os módulos"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os módulos</SelectItem>
              <SelectItem value="convenios">Convênios</SelectItem>
              <SelectItem value="piso">Piso da Enfermagem</SelectItem>
              <SelectItem value="pvh">PVH</SelectItem>
            </SelectContent>
          </Select>
          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger aria-label="Filtrar competência"><SelectValue placeholder="Todas as competências"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as competências</SelectItem>
              {competencias.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
            <span>Uma linha por empenho ou obrigação. Valores não cadastrados aparecem como travessão;
              no PVH, a NE original pode abranger mais de uma competência.</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!filtrados.length} onClick={copiarTabela}>
              <ClipboardCopy className="mr-1.5 h-4 w-4"/> Copiar tabela
            </Button>
            <Button size="sm" disabled={!filtrados.length} onClick={()=>baixarCsv(filtrados)}>
              <Download className="mr-1.5 h-4 w-4"/> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {consulta.isLoading?<div className="p-10 text-center text-sm text-muted-foreground">
          Consultando os módulos financeiros…</div>:
        consulta.isError?<div role="alert" className="space-y-2 p-8 text-sm text-destructive">
          <p className="font-medium">Não foi possível carregar os registros. Nenhum resultado parcial foi exibido.</p>
          <p>{consulta.error?.message}</p>
          <Button variant="outline" onClick={()=>void consulta.refetch()}>Tentar novamente</Button>
        </div>:
        <div className="max-h-[68vh] overflow-auto" role="region"
          aria-label="Tabela de atualização de planilha, com rolagem horizontal" tabIndex={0}>
          <table className="min-w-max w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 min-w-28 border-b border-r bg-muted px-3 py-3 text-left font-semibold">Módulo / Ações</th>
                {COLUNAS_PLANILHA.map(col=>
                  <th key={col.chave} className={"border-b px-3 py-3 text-left font-semibold "+
                    (col.tipo==="moeda"?"min-w-40":"min-w-36")}
                    title={descricoes[col.chave]??col.titulo}>
                    <span className="inline-flex items-center gap-1">{col.titulo}
                      {descricoes[col.chave]&&<Info className="h-3 w-3 shrink-0"/>}
                    </span>
                  </th>)}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(r=><tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/30">
                <td className="sticky left-0 z-[1] border-r bg-card px-3 py-2 align-top">
                  <div className="flex flex-col items-start gap-1.5">
                    <Badge variant="outline" className="max-w-36 truncate">{rotuloModulo(r.modulo)}</Badge>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-1.5"
                        onClick={()=>copiarLinha(r)} title="Copiar linha completa com cabeçalhos">
                        {ultimoCopiado===r.id?<CopyCheck className="h-3.5 w-3.5"/>:
                          <ClipboardCopy className="h-3.5 w-3.5"/>}
                        <span className="ml-1 text-[10px]">Linha</span>
                      </Button>
                      <a href={r.rota} target="_blank" rel="noopener noreferrer"
                        title="Abrir competência ou lançamento no sistema"
                        className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-primary hover:bg-primary/10">
                        <ExternalLink className="h-3.5 w-3.5"/><span className="text-[10px]">Processo</span>
                      </a>
                    </div>
                  </div>
                </td>
                {COLUNAS_PLANILHA.map(col=>
                  <td key={col.chave} className="border-r border-border/40 px-1 py-2 align-middle last:border-r-0"
                    title={col.chave==="valorEmpenhado"?r.nota:undefined}>
                    <CopiarValor linha={r} coluna={col}/>
                  </td>)}
              </tr>)}
              {!filtrados.length&&<tr><td colSpan={COLUNAS_PLANILHA.length+1}
                className="px-6 py-12 text-center text-muted-foreground">
                Nenhum registro para os filtros selecionados.
              </td></tr>}
            </tbody>
          </table>
        </div>}
      </CardContent>
    </Card>
    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
      <strong className="text-foreground">Como interpretar os valores:</strong>
      <p className="mt-1">Convênios: o primeiro valor é o solicitado e o segundo é o empenho líquido registrado.
        Piso: o primeiro é o valor conciliado e o segundo é a NE original.
        PVH: o primeiro é a alocação da competência e o segundo é o valor total da NE,
        que pode ser reutilizada. “Atestado” não é preenchido no PVH porque o dado não existe nesse fluxo.</p>
      <p className="mt-1">Use “Copiar tabela” para colar no Excel/Sheets em colunas, ou “CSV” para obter as
        mesmas colunas com separador de ponto e vírgula. Os links aparecem como URLs na cópia em lote.</p>
    </div>
  </div>;
}
