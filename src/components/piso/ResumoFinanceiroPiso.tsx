import { brl } from "@/lib/format";
import type { resumoEmpenhoPiso } from "@/lib/piso/resumo-empenho";

type Quadro = ReturnType<typeof resumoEmpenhoPiso>;

export function ConciliacaoEmpenhoPiso({quadro}:{quadro:Quadro}){
  return <div className={`rounded-md border p-3 text-xs ${quadro.totalConfere
    ? "border-success/40 bg-success/5" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
    <p className="font-semibold">{quadro.totalConfere
      ? "Distribuição conciliada com a Portaria homologada"
      : "Distribuição do InvestSUS — prévia sujeita à homologação"}</p>
    <p className="mt-1">Instituições: {quadro.totalInvestsus==null?"a apurar":brl(quadro.totalInvestsus)}
      {" · "}Portaria homologada: {quadro.valorHomologado==null
        ? "aguardando registro na Etapa 2" : brl(quadro.valorHomologado)}.</p>
    {!quadro.totalConfere && <p className="mt-1">
      Os valores por instituição vêm da planilha processada do InvestSUS.
      A anulação só será confirmada quando a soma corresponder ao homologado.
      Qualquer saldo indicado abaixo é prévio, não uma anulação executada.
    </p>}
  </div>;
}

export function ValoresEmpenhoPiso({quadro,participanteId}:{
  quadro:Quadro;participanteId:string;
}){
  const r=quadro.porInstituicao.find(x=>x.participanteId===participanteId);
  const cards=[
    [quadro.totalConfere?"Valor a empenhar · homologado por instituição":
      "Valor por instituição · InvestSUS (prévia)",r?.valorNecessario],
    ["Valor empenhado · Solicitação de NE",r?.valorEmpenhado],
    [quadro.totalConfere?"Saldo previsto a anular":
      "Saldo estimado a anular · sujeito à Portaria",r?.excedentePrevisto],
  ] as const;
  return <div className="grid gap-2 sm:grid-cols-3">
    {cards.map(([titulo,valor])=><div key={titulo} className="rounded-md border bg-background p-3">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <b className="block text-base">{valor==null?"A apurar":brl(valor)}</b>
    </div>)}
  </div>;
}
