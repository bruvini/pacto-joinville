import {useState} from "react";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {classificacaoCIB,normaNotaFpo,normaParaCompetencia} from
 "../../../supabase/functions/_shared/eletivas-normativas";

/** Consulta normativa independente da produção: não grava, não abre crédito. */
export function ConferenciaNormativaEletivas({competencia}:{
 competencia:string;
}){
 const [codigo,setCodigo]=useState("");
 const norma=normaParaCompetencia(competencia);
 const nota=normaNotaFpo(competencia);
 const c=codigo.replace(/\D/g,"");
 const valido=c.length===9||c.length===10;
 const atual=valido?classificacaoCIB(c,competencia):null;
 const jul=valido?classificacaoCIB(c,"07/2026"):null;
 const ago=valido?classificacaoCIB(c,"08/2026"):null;
 return <section className="rounded-lg border p-4 space-y-3" aria-label="Conferência normativa da competência">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="text-sm font-semibold">Normativa vigente · {competencia}</h2>
   <span className="text-xs text-muted-foreground">Consulta informativa · sem alteração financeira</span>
  </div>
  {norma?<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
   <div className="rounded-md bg-muted/25 border p-2">
    <p className="text-muted-foreground">Deliberação</p>
    <strong className="text-sm">{norma.rotulo}</strong></div>
   <div className="rounded-md bg-muted/25 border p-2">
    <p className="text-muted-foreground">Vigência da matriz</p>
    <strong>{String(norma.inicio).slice(4)}/{String(norma.inicio).slice(0,4)}
      {" a "}{String(norma.fim).slice(4)}/{String(norma.fim).slice(0,4)}</strong></div>
   <div className="rounded-md bg-muted/25 border p-2">
    <p className="text-muted-foreground">Anexos I / II</p>
    <strong>{norma.anexoI.size} federais / {norma.anexoII.size} estaduais</strong></div>
   <div className="rounded-md bg-muted/25 border p-2">
    <p className="text-muted-foreground">Retificação / FPO</p>
    <strong>{norma.retificacao} · {norma.artigoFPO}</strong></div>
  </div>:<p role="alert" className="text-xs text-amber-700">
   Competência fora das matrizes congeladas. A norma deve ser verificada antes da auditoria.
  </p>}
  <p className="text-xs text-muted-foreground">
   A classificação por Anexo I (Federal) e Anexo II (Estadual) é usada no
   auditor de faixa e múltiplas por AIH. A categoria “Ambos” requer investigação;
   a presença no rol não comprova pagamento.
   {nota?" A Nota Informativa 05/2026 está associada a esta competência, mas não comprova a programação FPO do prestador.":""}
  </p>
  <details className="rounded-md border p-3">
   <summary className="cursor-pointer text-xs font-semibold">
    Conferir procedimento nos anexos · comparar julho e agosto de 2026
   </summary>
   <div className="mt-3 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
     <Input className="max-w-56" aria-label="Código SIGTAP para consulta normativa"
       value={codigo} onChange={e=>setCodigo(e.target.value)}
       placeholder="Código SIGTAP (9 ou 10 dígitos)" inputMode="numeric"/>
     <Button size="sm" variant="outline" onClick={()=>setCodigo("030907001")}>
       Exemplo: 030907001</Button>
     <Button size="sm" variant="outline" onClick={()=>setCodigo("040905008")}>
       Exemplo: 040905008</Button>
     <Button size="sm" variant="outline" onClick={()=>setCodigo("040701003")}>
       Exemplo: 040701003</Button>
    </div>
    {codigo&&!valido&&<p className="text-xs text-amber-700">
      Informe um código SIGTAP com 9 ou 10 dígitos.</p>}
    {atual&&<div className="grid gap-2 sm:grid-cols-3 text-xs">
     <div className="rounded-md border p-2"><p className="text-muted-foreground">
      {competencia} · {norma?.rotulo}</p><strong>{atual.classificacao}</strong></div>
     <div className="rounded-md border p-2"><p className="text-muted-foreground">
      07/2026 · 727/CIB/2025</p><strong>{jul?.classificacao}</strong></div>
     <div className="rounded-md border p-2"><p className="text-muted-foreground">
      08/2026 · 399/CIB/2026</p><strong>{ago?.classificacao}</strong></div>
    </div>}
    <p className="text-xs text-muted-foreground">
     É um verificador da matriz congelada, mesmo quando o código não aparece nos arquivos
     importados. “Não localizado” significa ausência nos anexos carregados daquela vigência,
     não inexistência do procedimento no SIGTAP. Não gera nova linha nem crédito no atesto.
    </p>
   </div>
  </details>
 </section>;
}
