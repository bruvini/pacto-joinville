import {CATEGORIAS_ELETIVAS,resumoEncontro,valorConciliadoCentavos,
  reais,type ItemEC} from "@/lib/eletivas/financeiro";
import type {Tables} from "@/integrations/supabase/types";
type Linha=Tables<"eletivas_itens">;
const cent=(v:unknown)=>Math.round((Number(v)||0)*100);
const num=(v:number)=>v.toLocaleString("pt-BR");
const situacoes=["ok","info","div","nc","fora","pendente"] as const;
const dt=(i:Linha):Record<string,unknown>=>{
  const d=i.detalhe;
  return d&&typeof d==="object"&&!Array.isArray(d)?d as Record<string,unknown>:{};
};
export function PainelEletivas({itens,modo="painel",competencia}:{itens:Linha[];
  modo?:"painel"|"fpo";competencia:string}){
  const r=resumoEncontro(itens as unknown as ItemEC[]);
  const recebidos=itens.filter(i=>i.categoria!=="faec_fxmac");
  const publicado=recebidos.reduce((sum,i)=>sum+cent(i.valor_publicado),0);
  const esperado=recebidos.reduce((sum,i)=>sum+cent(i.valor_esperado),0);
  const semConferencia=itens.filter(i=>!i.conferido_em).length;
  const divergentes=itens.filter(i=>["div","nc","fora"].includes(i.situacao));
  if(modo==="fpo"){
    const regs=itens.filter(i=>dt(i).fpo_oficial);
    const distintos=new Map(regs.map(i=>[i.procedimento,i]));
    return <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="font-semibold">FPO oficial e artigo 19 — {competencia}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Valores extraídos do arquivo oficial
          da SES e vinculados aos procedimentos do encontro. O valor federal informado
          é o valor a programar; não comprova que a FPO do prestador esteja efetivamente
          programada. Conferir vigência, Nota Informativa nº 05/2026 e a programação
          registrada antes de concluir eventual diferença.</p>
      </div>
      {distintos.size===0?<p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Nenhuma referência de FPO identificada nos itens. Importe o arquivo FPO
        oficial e reprocesse a conciliação antes da conferência fiscal.
      </p>:<div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/40"><tr>
            {["Procedimento","Descrição FPO","SIGTAP hospitalar","Federal a programar",
              "Eletiva","Nota 05/2026"].map(c=><th className="p-3" key={c}>{c}</th>)}
          </tr></thead>
          <tbody>{[...distintos.values()].map(i=>{
            const f=dt(i).fpo_oficial as Record<string,unknown>;
            return <tr key={i.procedimento??i.id} className="border-b">
              <td className="p-3 font-mono">{i.procedimento}</td>
              <td className="p-3">{String(f.nome??"")}</td>
              <td className="p-3 text-right">{reais(cent(f.sigtap))}</td>
              <td className="p-3 text-right">{reais(cent(f.federal))}</td>
              <td className="p-3">{String(f.eletiva??"—")}</td>
              <td className="p-3">{f.nota5?"Revisar nota":"Sem destaque"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      <p className="text-xs text-muted-foreground">O módulo não gera cobrança,
        glosa ou atesto FPO automaticamente, pois não dispõe de confirmação da
        programação vigente do prestador.</p>
    </div>;
  }
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ["Publicado SES",publicado],
        ["Esperado (memória)",esperado],
        ["Parcela provisória",r.encontro],
        ["Correções anteriores",r.correcoes],
      ].map(([label,v])=><div key={String(label)}
        className="rounded-lg border bg-background p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <strong className="text-lg">{reais(Number(v))}</strong></div>)}
    </div>
    <div className="rounded-lg border bg-muted/20 p-4">
      <h3 className="font-semibold">Situação fiscal do encontro</h3>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <span>{num(itens.length)} itens</span>
        <span>{num(divergentes.length)} divergências/não contemplados</span>
        <span>{num(r.pendencias.length)} sem decisão</span>
        <span>{num(semConferencia)} sem conferência</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{situacoes.map(st=>{
        const qtd=itens.filter(i=>i.situacao===st).length;
        return <span key={st} className="rounded-md border bg-background px-2 py-1 text-xs">
          {st}: {qtd}</span>;
      })}</div>
      <p className="mt-3 text-xs text-muted-foreground">A memória provisória pode
        conservar parcelas incontroversas de divergências. Isso não significa
        aceitação da diferença ou encerramento fiscal.</p>
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40"><tr>
          {["Componente","Itens","Publicado SES","Esperado","Conciliado provisório"]
            .map(k=><th key={k} className="border-b p-3 text-left">{k}</th>)}
        </tr></thead>
        <tbody>{CATEGORIAS_ELETIVAS.map(([cat,label])=>{
          const group=itens.filter(i=>i.categoria===cat);
          const pub=group.reduce((s,i)=>s+cent(i.valor_publicado),0);
          const exp=group.reduce((s,i)=>s+cent(i.valor_esperado),0);
          const liq=group.reduce((s,i)=>s+valorConciliadoCentavos(i as ItemEC),0);
          return <tr key={cat} className="border-b">
            <td className="p-3">{label}{cat==="faec_fxmac"&&
              <span className="ml-1 text-muted-foreground">(controle)</span>}</td>
            <td className="p-3">{group.length}</td>
            <td className="p-3 text-right">{reais(pub)}</td>
            <td className="p-3 text-right">{reais(exp)}</td>
            <td className="p-3 text-right">{reais(liq)}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="font-semibold"><td className="p-3">Total sem duplicar controle</td>
          <td className="p-3">{recebidos.length}</td><td className="p-3 text-right">{reais(publicado)}</td>
          <td className="p-3 text-right">{reais(esperado)}</td>
          <td className="p-3 text-right">{reais(r.encontro)}</td></tr></tfoot>
      </table>
    </div>
  </div>;
}
