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
      O saldo disponível de cada NE deve ser conferido com a área financeira. A utilização será definida no e-Pública.
    </p>}
  </div>;
}

export function ValoresEmpenhoPiso({quadro,participanteId}:{
  quadro:Quadro;participanteId:string;
}){
  const r=quadro.porInstituicao.find(x=>x.participanteId===participanteId);
  const cards=[
    ["Valor devido após homologação",quadro.totalConfere ? r?.valorConfirmado : null],
    ["Valor nominal das NEs vinculadas",r?.valorEmpenhado],
    ["Total das solicitações de subempenho",r?.totalAplicado],
    ["Valor ainda a subempenhar",r?.saldoAEmpenhar],
    ["Saldo a anular · a conferir no e-Pública",r?.excedentePrevisto],
  ] as const;
  return <div className="space-y-2">
  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
    {cards.map(([titulo,valor])=><div key={titulo} className="flex min-w-0 flex-col justify-between rounded-md border bg-background p-3">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <b className="block text-base">{valor==null?"A apurar":brl(valor)}</b>
    </div>)}
  </div>
  <p className="text-xs text-muted-foreground">Total nominal das NEs vinculadas não equivale ao saldo disponível nem representa novos empenhos; pode haver utilização anterior ou compensação. Não é necessário distribuir o devido entre as notas nesta etapa.</p>
  </div>;
}
