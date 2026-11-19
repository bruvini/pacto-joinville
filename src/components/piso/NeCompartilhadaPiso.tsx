import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { brl } from "@/lib/format";
import { adicionarCompetenciaNe, competenciaNeValida, formatarCompetenciaNe, ordenarCompetenciasNe, removerCompetenciaNe } from "@/lib/piso/competencias-ne";

const periodo = (chave: string) => chave.startsWith("13/") ? "13º/" + chave.slice(3) : chave;

export function CompetenciasNePiso({selecionadas, atual, disabled, somenteLeitura, onChange}: {
  selecionadas?: string[] | null; atual: string; disabled: boolean; somenteLeitura: boolean;
  onChange: (chaves: string[]) => Promise<boolean | void> | boolean | void;
}) {
  const persistidas = ordenarCompetenciasNe([...(selecionadas ?? []), atual]).join(",");
  const [marcadas, setMarcadas] = useState(() => persistidas.split(","));
  const [entrada, setEntrada] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { setMarcadas(persistidas.split(",")); }, [persistidas]);
  const bloqueado = disabled || somenteLeitura || salvando;
  async function salvar(proximas: string[]) {
    if (bloqueado) return false;
    const anteriores = marcadas;
    setMarcadas(proximas);
    setSalvando(true);
    setErro("");
    try {
      if (await onChange(proximas) === false) throw new Error();
      return true;
    } catch {
      setMarcadas(anteriores);
      setErro("Não foi possível salvar as competências. Tente novamente.");
      return false;
    } finally { setSalvando(false); }
  }
  async function adicionar() {
    if (bloqueado) return;
    if (!competenciaNeValida(entrada)) { setErro("Informe MM/AAAA válido (01 a 12) ou 13/AAAA para o 13º salário."); return; }
    if (marcadas.includes(entrada)) { setErro("Essa competência já foi incluída."); return; }
    const proximas = adicionarCompetenciaNe(marcadas, entrada, atual);
    if (proximas && await salvar(proximas)) setEntrada("");
  }
  return <div className="rounded border p-3 space-y-2">
    <p className="font-semibold text-sm">Competências abrangidas pela NE</p>
    <p className="text-xs text-muted-foreground">Inclua os períodos previstos na solicitação, inclusive de anos diferentes. A competência atual é obrigatória. Para o 13º salário, use 13/AAAA.</p>
    <div className="flex flex-wrap gap-2" aria-label="Competências selecionadas">
      {marcadas.map(chave => <span key={chave} className="inline-flex items-center gap-1 rounded border bg-muted/30 px-2 py-1 text-xs">
        {periodo(chave)}
        {chave === atual ? <span className="text-muted-foreground">· atual</span> : !somenteLeitura &&
          <button type="button" disabled={bloqueado} className="rounded p-0.5 hover:bg-muted disabled:opacity-50"
            aria-label={`Remover competência ${periodo(chave)}`} onClick={() => void salvar(removerCompetenciaNe(marcadas,chave,atual))}><X className="h-3 w-3" /></button>}
      </span>)}
    </div>
    {!somenteLeitura && <div className="flex flex-wrap items-center gap-2">
      <Input className="w-32 h-8 text-xs" aria-label="Nova competência" placeholder="MM/AAAA"
        inputMode="numeric" value={entrada} disabled={bloqueado} aria-invalid={!!erro}
        onChange={e=>{setEntrada(formatarCompetenciaNe(e.target.value));setErro("");}}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();void adicionar();}}}/>
      <Button type="button" size="sm" variant="outline" disabled={bloqueado || !entrada} onClick={()=>void adicionar()}>
        <Plus className="mr-1 h-3.5 w-3.5"/>Adicionar
      </Button>
    </div>}
    {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
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
        <p className="text-xs text-muted-foreground">Saldo global registrado: {brl(Number(ne.saldo_disponivel))} · {ordenarCompetenciasNe(ne.competencias).map(periodo).join(", ")}</p></div>
      {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={()=>onVincular(ne.origem_id)}>Reutilizar nesta competência</Button>}
    </div>)}</>;
}
