import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";

const periodo = (chave: string) => chave.startsWith("13/") ? "13º/" + chave.slice(3) : chave;

export function CompetenciasNePiso({selecionadas, atual, disabled, somenteLeitura, onChange}: {
  selecionadas?: string[] | null; atual: string; disabled: boolean; somenteLeitura: boolean;
  onChange: (chaves: string[]) => void;
}) {
  const marcadas = selecionadas?.length ? selecionadas : [atual];
  return <div className="rounded border p-3 space-y-2">
    <p className="font-semibold text-sm">Competências abrangidas pela NE</p>
    <p className="text-xs text-muted-foreground">Selecione todos os períodos previstos na solicitação. A competência atual é obrigatória. O 13º salário é um período separado.</p>
    <div className="flex flex-wrap gap-2">
      {Array.from({length:13},(_,i)=>`${String(i+1).padStart(2,"0")}/${atual.slice(3)}`).map(chave =>
        <label key={chave} className="flex gap-1 items-center rounded border px-2 py-1 text-xs">
          <input type="checkbox" checked={marcadas.includes(chave)} disabled={disabled || chave===atual}
            onChange={e=>onChange(e.target.checked?[...new Set([...marcadas,chave])].sort():marcadas.filter(x=>x!==chave))}/>
          {periodo(chave)}
        </label>)}
    </div>
    {somenteLeitura && <p className="text-xs text-muted-foreground">A documentação original está vinculada a outras competências; os dados da NE são somente leitura.</p>}
  </div>;
}

export function NesDisponiveisPiso({notas, prestador, obrigacoes, chave, canEdit, busy, onVincular}: {
  notas:any[]; prestador:string; obrigacoes:any[]; chave:string; canEdit:boolean; busy:boolean;
  onVincular:(origem:string)=>void;
}) {
  return <>{notas.filter(ne => ne.prestador_id===prestador && ne.competencias?.includes(chave) &&
    !obrigacoes.some(o=>(o.ne_origem_id??o.id)===ne.origem_id)).map(ne =>
    <div key={ne.origem_id} className="flex flex-wrap items-center gap-2 rounded border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mr-auto"><b>NE compartilhada {ne.numero}</b>
        <p className="text-xs text-muted-foreground">Saldo global registrado: {brl(Number(ne.saldo_disponivel))} · {ne.competencias.map(periodo).join(", ")}</p></div>
      {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={()=>onVincular(ne.origem_id)}>Reutilizar nesta competência</Button>}
    </div>)}</>;
}
