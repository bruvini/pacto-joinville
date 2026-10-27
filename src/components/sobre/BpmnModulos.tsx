import { useEffect, useState } from "react";
import { Maximize2, X, Info } from "lucide-react";
import { modeloBpmn, type ConexaoBpmn, type ModeloBpmn, type ModuloBpmn, type NoBpmn, type ParcelaPisoBpmn } from "@/lib/sobre/fluxosBpmn";

function quebrar(t: string, limite = 25) {
  const saida: string[] = []; let linha = "";
  for (const p of t.split(/\s+/)) {
    if (linha && (linha + " " + p).length > limite) { saida.push(linha); linha = p; }
    else linha = linha ? linha + " " + p : p;
  }
  if (linha) saida.push(linha);
  return saida;
}

function NoVisual({ no, modelo }: { no: NoBpmn; modelo: ModeloBpmn }) {
  if (no.tipo === "atividade") {
    const titulo = quebrar(no.titulo);
    const cor = modelo.raias[no.raia ?? 0]?.cor ?? "#003866";
    return <g>
      <title>{(no.etapa ? "Etapa " + no.etapa + ": " : "") + no.titulo + " — " + (no.linhas ?? []).join(" / ")}</title>
      <rect x={no.x-97} y={no.y-45} width="194" height="90" rx="9" stroke="var(--border)" strokeWidth="1.5" fill="var(--card)"/>
      <rect x={no.x-97} y={no.y-45} width="6" height="90" rx="3" fill={cor}/>
      {no.etapa && <>
        <circle cx={no.x-77} cy={no.y-28} r="13" fill={cor}/>
        <text x={no.x-77} y={no.y-24} textAnchor="middle" fill="#fff" fontWeight="700" fontSize="12">{no.etapa}</text>
      </>}
      {titulo.map((linha,i)=><text key={i} x={no.x+7} y={no.y-(titulo.length===1?19:26)+i*15}
        textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--foreground)">{linha}</text>)}
      {(no.linhas ?? []).map((linha,i)=><text key={i} x={no.x+7} y={no.y+17+i*15}
        textAnchor="middle" fontSize="11.3" fill="var(--muted-foreground)">{linha}</text>)}
    </g>;
  }
  if (no.tipo === "inicio" || no.tipo === "fim") return <g>
    <title>{no.titulo}</title>
    <circle cx={no.x} cy={no.y} r="20" fill="var(--card)"
      stroke={no.tipo==="inicio" ? "#1f9d57" : "#b3261e"} strokeWidth={no.tipo==="inicio" ? 2 : 4}/>
    <text x={no.x} y={no.y+43} textAnchor="middle" fill="var(--foreground)" fontSize="11.5" fontWeight="600">{no.titulo}</text>
  </g>;
  if (no.tipo === "documento") return <g>
    <title>{no.titulo}</title>
    <path d={"M "+(no.x-57)+" "+(no.y-32)+" h 86 l 24 22 v 54 h -110 z"}
      fill="var(--card)" stroke="#0E7490" strokeWidth="1.5"/>
    <path d={"M "+(no.x+29)+" "+(no.y-32)+" v 22 h 24"} fill="none" stroke="#0E7490" strokeWidth="1.5"/>
    <text x={no.x} y={no.y+5} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--foreground)">{no.titulo}</text>
    {(no.linhas??[]).map((l,i)=><text key={i} x={no.x} y={no.y+19+i*13}
      textAnchor="middle" fill="var(--muted-foreground)" fontSize="10">{l}</text>)}
  </g>;
  return <g>
    <title>{no.titulo}</title>
    <polygon points={[no.x+","+(no.y-24),(no.x+24)+","+no.y,no.x+","+(no.y+24),(no.x-24)+","+no.y].join(" ")}
      stroke="#D97706" strokeWidth="2" fill="var(--card)"/>
    <text x={no.x} y={no.y+7} fill="#D97706" textAnchor="middle" fontWeight="700" fontSize="21">
      {no.tipo==="paralelo" ? "+" : "×"}
    </text>
    <text x={no.x} y={no.y+43} fill="var(--foreground)" fontSize="11" fontWeight="600"
      textAnchor="middle">{no.titulo}</text>
  </g>;
}

function Ligacao({ligacao:l}:{ligacao:ConexaoBpmn}) {
  const v=l.pontos;
  const d=v.reduce((s,n,i)=>s+(i%2===0?(i===0?"M ":"L "):"")+n+" ","");
  const x=v[v.length-2],y=v[v.length-1],px=v[v.length-4],py=v[v.length-3];
  const angle=Math.atan2(y-py,x-px);
  const pts=[x+","+y,
    (x-9*Math.cos(angle-.43))+","+(y-9*Math.sin(angle-.43)),
    (x-9*Math.cos(angle+.43))+","+(y-9*Math.sin(angle+.43))].join(" ");
  const cor=l.associacao ? "#0E7490" : "var(--muted-foreground)";
  return <g>
    <path d={d} fill="none" stroke={cor} strokeWidth={l.associacao?1.3:1.7}
      strokeDasharray={l.associacao?"5 5":undefined} strokeLinejoin="round" strokeLinecap="round"/>
    {l.associacao ? <circle cx={x} cy={y} r="4" fill="var(--card)" stroke={cor}/> : <polygon points={pts} fill={cor}/>}
    {l.rotulo && l.rotuloX !== undefined && l.rotuloY !== undefined && <text
      x={l.rotuloX} y={l.rotuloY} textAnchor="middle" fontSize="11.2" fontWeight="600"
      fill="var(--foreground)" paintOrder="stroke" stroke="var(--card)" strokeWidth="4">{l.rotulo}</text>}
  </g>;
}

function Diagrama({modelo,cheia}:{modelo:ModeloBpmn;cheia?:boolean}) {
  return <svg viewBox={"0 0 "+modelo.largura+" "+modelo.altura}
    className={cheia?"h-full w-full":"w-full"} style={{minWidth:cheia?1120:1250}}
    preserveAspectRatio="xMidYMid meet" role="img" aria-label={"Diagrama BPMN "+modelo.titulo}>
    <rect x="0" y="0" width={modelo.largura} height={modelo.altura} rx="10" fill="var(--background)"/>
    <text x="65" y="42" fill="var(--foreground)" fontSize="22" fontWeight="700">{modelo.titulo}</text>
    <text x="65" y="69" fill="var(--muted-foreground)" fontSize="13">{modelo.subtitulo}</text>
    {modelo.raias.map((r,i)=><g key={r.titulo}>
      <rect x="40" y={r.y} width={modelo.largura-80} height={r.altura}
        fill={r.cor} fillOpacity={i%2===0?.05:.028} stroke="var(--border)" strokeWidth="1"/>
      <rect x="40" y={r.y} width="34" height={r.altura} fill={r.cor} fillOpacity=".17"/>
      <text x="56" y={r.y+r.altura/2} fontSize="11.8" fontWeight="700" fill="var(--foreground)"
        textAnchor="middle" transform={"rotate(-90 56 "+(r.y+r.altura/2)+")"}>{r.titulo}</text>
    </g>)}
    {modelo.conexoes.map((l,i)=><Ligacao key={l.de+"-"+l.para+"-"+i} ligacao={l}/>)}
    {modelo.nos.map(n=><NoVisual key={n.id} no={n} modelo={modelo}/>)}
  </svg>;
}

function Legenda({modelo}:{modelo:ModeloBpmn}) {
  return <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
    <span>🟢 Início</span><span>🔴 Fim</span><span>◇ × Decisão exclusiva</span>
    <span>◇ + Ramificação/sincronização</span><span>▱ Documento</span>
    <span>Linha tracejada: associação/requisito documental</span>
    <span className="ml-auto">{modelo.nos.filter(n=>n.tipo==="atividade"&&n.etapa).length} etapas ilustradas</span>
  </div>;
}

export function BpmnModulos({modulo}:{modulo:ModuloBpmn}) {
  const [cheia,setCheia]=useState(false);
  const [tipoPiso,setTipoPiso]=useState<ParcelaPisoBpmn>("mensal");
  const modelo=modeloBpmn(modulo,tipoPiso);
  useEffect(()=>{
    if(!cheia)return;
    const anterior=document.body.style.overflow;
    const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setCheia(false)};
    window.addEventListener("keydown",esc);
    document.body.style.overflow="hidden";
    return ()=>{window.removeEventListener("keydown",esc);document.body.style.overflow=anterior};
  },[cheia]);
  return <div className="space-y-3">
    {modulo==="piso" && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
      <span className="px-1 text-muted-foreground">Tipo de parcela:</span>
      {(["mensal","decimo_terceiro"] as const).map(tipo=><button key={tipo}
        type="button" aria-pressed={tipoPiso===tipo} onClick={()=>setTipoPiso(tipo)}
        className={"rounded-md px-3 py-1.5 text-xs font-medium "+(tipoPiso===tipo?"bg-primary text-primary-foreground":"bg-background hover:bg-accent")}>
        {tipo==="mensal"?"Mensal":"Parcela adicional (13º)"}
      </button>)}
    </div>}
    <div className="relative overflow-hidden rounded-xl border bg-muted/15">
      <button type="button" onClick={()=>setCheia(true)} aria-label={"Ampliar fluxograma "+modelo.titulo}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent">
        <Maximize2 className="h-3.5 w-3.5"/>Tela cheia
      </button>
      <div className="overflow-x-auto p-2"><Diagrama modelo={modelo}/></div>
      <Legenda modelo={modelo}/>
    </div>
    <div className="rounded-xl border p-3 text-xs">
      <p className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide text-primary">
        <Info className="h-3.5 w-3.5"/>Condições e exceções
      </p>
      <ul className="grid gap-2 leading-relaxed text-muted-foreground md:grid-cols-2">
        {modelo.observacoes.map(obs=><li key={obs} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"/>{obs}
        </li>)}
      </ul>
      <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
        Mapa visual com símbolos BPMN para orientação, não um arquivo BPMN executável. A liberação das etapas é regulada pelas validações do módulo.
      </p>
    </div>
    {cheia && <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={"Diagrama BPMN: "+modelo.titulo}>
      <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2">
        <h3 className="text-sm font-semibold text-primary">{modelo.titulo}</h3>
        <button type="button" onClick={()=>setCheia(false)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          <X className="h-4 w-4"/>Fechar (ESC)
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="flex min-h-full min-w-[1120px] items-center justify-center">
          <Diagrama modelo={modelo} cheia/>
        </div>
      </div>
      <div className="bg-card"><Legenda modelo={modelo}/></div>
    </div>}
  </div>;
}
