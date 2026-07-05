import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

/**
 * Fluxograma BPMN 2.0 do processo completo (estilo Bizagi):
 * Pool 1 — Processo de Empenho (raias UFI / ACP; a coordenação da UFI faz
 *          tanto a análise de orçamento quanto a revisão da solicitação)
 * Pool 2 — Prestação de Contas (raias APC / Prestador)
 * SVG puro, temático, com modo tela cheia (clique; fecha no X ou ESC).
 */

const COR = {
  ufi: "#1C9CD8",
  acp: "#003866",
  apc: "#7C3AED",
  prestador: "#64748B",
  anul: "#D97706",
};

function Lane({ x, y, w, h, cor, nome }: { x: number; y: number; w: number; h: number; cor: string; nome: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={cor} opacity={0.055} stroke="var(--border)" strokeWidth={1} />
      <rect x={x} y={y} width={24} height={h} fill={cor} opacity={0.16} stroke="var(--border)" strokeWidth={1} />
      <text x={x + 12} y={y + h / 2} transform={`rotate(-90 ${x + 12} ${y + h / 2})`} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--foreground)">{nome}</text>
    </g>
  );
}

function PoolTitulo({ x, y, h, nome }: { x: number; y: number; h: number; nome: string }) {
  return (
    <g>
      <rect x={x} y={y} width={26} height={h} fill="var(--primary)" opacity={0.92} />
      <text x={x + 13} y={y + h / 2} transform={`rotate(-90 ${x + 13} ${y + h / 2})`} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#fff" letterSpacing={0.6}>{nome}</text>
    </g>
  );
}

function Task({ x, cy, cor, lines, w = 128 }: { x: number; cy: number; cor: string; lines: string[]; w?: number }) {
  const h = 56;
  const y = cy - h / 2;
  const startY = cy - ((lines.length - 1) * 11) / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={9} fill="var(--card)" stroke={cor} strokeWidth={1.8} />
      <rect x={x} y={y} width={4} height={h} rx={2} fill={cor} />
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2 + 2} y={startY + i * 11 + 3.5} textAnchor="middle" fontSize={i === 0 ? 9.8 : 8.8} fontWeight={i === 0 ? 700 : 400} fill={i === 0 ? "var(--foreground)" : "var(--muted-foreground)"}>{l}</text>
      ))}
    </g>
  );
}

function Gateway({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  const r = 20;
  return (
    <g>
      <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} fill="var(--card)" stroke="var(--warning, #D97706)" strokeWidth={1.8} />
      <path d={`M ${cx - 6.5} ${cy - 6.5} L ${cx + 6.5} ${cy + 6.5} M ${cx + 6.5} ${cy - 6.5} L ${cx - 6.5} ${cy + 6.5}`} stroke="var(--warning, #D97706)" strokeWidth={2.4} strokeLinecap="round" />
      <text x={cx} y={cy + r + 12} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--foreground)">{label}</text>
    </g>
  );
}

function EventoInicio({ cx, cy, label, mensagem }: { cx: number; cy: number; label: string; mensagem?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="var(--card)" stroke="var(--success, #1f9d57)" strokeWidth={1.8} />
      {mensagem && (
        <g stroke="var(--success, #1f9d57)" strokeWidth={1.1} fill="none">
          <rect x={cx - 6} y={cy - 4.5} width={12} height={9} rx={1} />
          <path d={`M ${cx - 6} ${cy - 4.5} L ${cx} ${cy + 1} L ${cx + 6} ${cy - 4.5}`} />
        </g>
      )}
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize={8.8} fill="var(--muted-foreground)">{label}</text>
    </g>
  );
}

function EventoFim({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="var(--card)" stroke="var(--destructive, #b3261e)" strokeWidth={3.4} />
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize={8.8} fontWeight={600} fill="var(--foreground)">{label}</text>
    </g>
  );
}

function EventoTimer({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="var(--card)" stroke={COR.apc} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={10} fill="none" stroke={COR.apc} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={6.5} fill="none" stroke={COR.apc} strokeWidth={1} />
      <path d={`M ${cx} ${cy} L ${cx} ${cy - 4.5} M ${cx} ${cy} L ${cx + 3.5} ${cy + 1.5}`} stroke={COR.apc} strokeWidth={1.3} strokeLinecap="round" />
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize={8.8} fontWeight={600} fill="var(--foreground)">{label}</text>
    </g>
  );
}

/** Fluxo de sequência: polilinha com seta cheia. pts = [x1,y1, x2,y2, ...] */
function Flow({ pts, label, lx, ly, dashed }: { pts: number[]; label?: string; lx?: number; ly?: number; dashed?: boolean }) {
  const d = pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${i === 0 ? "M" : "L"} ${v} ` : `${v} `), "");
  return (
    <g>
      <path d={d} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.4} strokeDasharray={dashed ? "5 4" : undefined} markerEnd={dashed ? "url(#seta-aberta)" : "url(#seta)"} />
      {label && <text x={lx} y={ly} fontSize={8.8} fontWeight={700} fill="var(--foreground)">{label}</text>}
    </g>
  );
}

function DiagramaSvg({ fill }: { fill?: boolean }) {
  return (
    <svg viewBox="0 0 1500 560" style={fill ? undefined : { minWidth: 1180 }} className={fill ? "w-full h-full" : "w-full"} role="img" aria-label="Fluxograma BPMN do processo de empenho e prestação de contas">
      <defs>
        <marker id="seta" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
          <path d="M 0 0 L 9 4.5 L 0 9 Z" fill="var(--muted-foreground)" />
        </marker>
        <marker id="seta-aberta" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.3" />
        </marker>
      </defs>

      {/* ================= POOL 1 — PROCESSO DE EMPENHO ================= */}
      <PoolTitulo x={10} y={10} h={260} nome="PROCESSO DE EMPENHO" />
      <Lane x={36} y={10} w={1454} h={130} cor={COR.ufi} nome="UFI — Gestão Financeira" />
      <Lane x={36} y={140} w={1454} h={130} cor={COR.acp} nome="ACP — Convênios" />

      {/* Fluxos (sob os elementos) */}
      <Flow pts={[84, 192, 84, 75, 118, 75]} />
      <Flow pts={[248, 75, 344, 75, 344, 175]} />
      <Flow pts={[408, 205, 504, 205, 504, 105]} />
      <Flow pts={[568, 75, 593, 75]} />
      <Flow pts={[615, 95, 615, 150, 375, 150, 375, 175]} label="não (corrigir)" lx={452} ly={146} />
      <Flow pts={[635, 75, 734, 75, 734, 175]} label="sim" lx={642} ly={68} />
      <Flow pts={[798, 205, 894, 205, 894, 105]} />
      <Flow pts={[958, 75, 1054, 75, 1054, 175]} />
      <Flow pts={[1118, 205, 1148, 205]} />
      <Flow pts={[1190, 205, 1228, 205]} label="sim" lx={1194} ly={197} />
      <Flow pts={[1358, 205, 1405, 205]} />
      <Flow pts={[1170, 225, 1170, 252, 1420, 252, 1420, 220]} label="não" lx={1178} ly={248} />
      {/* Fluxo de mensagem: a DATA DO PAGAMENTO dispara a prestação de contas */}
      <Flow pts={[1054, 233, 1054, 287, 90, 287, 90, 344]} dashed label="data do pagamento inicia o prazo de prestação de contas" lx={480} ly={282} />

      {/* Elementos */}
      <EventoInicio cx={84} cy={205} label="Lançamento criado" />
      <Task x={120} cy={75} cor={COR.ufi} lines={["1. Análise de Orçamento", "dotação orçamentária", "+ fonte de pagamento"]} />
      <Task x={280} cy={205} cor={COR.acp} lines={["2. Solicitação de Empenho", "valor, link SEI,", "bloco p/ revisão"]} />
      <Task x={440} cy={75} cor={COR.ufi} lines={["3. Revisão da Coordenação", "coordenação da UFI", "aprova ou nega"]} />
      <Gateway cx={615} cy={75} label="Aprovada?" />
      <Task x={670} cy={205} cor={COR.acp} lines={["4. Assinaturas + SEFAZ", "5 assinaturas", "envio à UCG.AEO"]} />
      <Task x={830} cy={75} cor={COR.ufi} lines={["5. Liberação de Orçamento", "nº + link da", "Nota de Empenho"]} />
      <Task x={990} cy={205} cor={COR.acp} lines={["6. Liberação de Recurso", "relatórios, atesto, UAF.ADE,", "pagamento + DATA"]} />
      <Gateway cx={1170} cy={205} label="Saldo a anular?" />
      <Task x={1230} cy={205} cor={COR.anul} lines={["7. Anulação de Empenho", "saldo devolvido", "ao orçamento"]} />
      <EventoFim cx={1420} cy={205} label="Processo concluído" />

      {/* ================= POOL 2 — PRESTAÇÃO DE CONTAS ================= */}
      <PoolTitulo x={10} y={300} h={240} nome="PRESTAÇÃO DE CONTAS" />
      <Lane x={36} y={300} w={1454} h={120} cor={COR.apc} nome="APC" />
      <Lane x={36} y={420} w={1454} h={120} cor={COR.prestador} nome="Prestador" />

      {/* Fluxos */}
      <Flow pts={[103, 360, 170, 360]} />
      <Flow pts={[185, 373, 185, 480, 248, 480]} />
      <Flow pts={[378, 480, 504, 480, 504, 390]} />
      <Flow pts={[568, 360, 628, 360]} />
      <Flow pts={[758, 360, 793, 360]} />
      <Flow pts={[835, 360, 878, 360]} label="não (pendências)" lx={826} ly={348} />
      <Flow pts={[815, 340, 815, 320, 1290, 320, 1290, 345]} label="sim" lx={823} ly={332} />
      <Flow pts={[1008, 360, 1134, 360, 1134, 450]} />
      <Flow pts={[1070, 480, 694, 480, 694, 390]} label="resposta reanalisada" lx={780} ly={475} />

      {/* Elementos */}
      <EventoInicio cx={90} cy={360} label="Pagamento efetuado" mensagem />
      <EventoTimer cx={185} cy={360} label="Alertas D-7 · D-3 · D-0" />
      <text x={185} y={397} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">(sino + e-mail p/ setor APC)</text>
      <Task x={250} cy={480} cor={COR.prestador} lines={["Entregar prestação", "de contas", "(documentos no SEI)"]} />
      <Task x={440} cy={360} cor={COR.apc} lines={["Registrar recebimento", "data + link SEI"]} />
      <Task x={630} cy={360} cor={COR.apc} lines={["Analisar a prestação", "valor aprovado", "× valor glosado"]} />
      <Gateway cx={815} cy={360} label="Aprovada?" />
      <Task x={880} cy={360} cor={COR.apc} lines={["Emitir ofício", "de diligência", "(link SEI)"]} />
      <Task x={1070} cy={480} cor={COR.prestador} lines={["Responder /", "regularizar pendências"]} />
      <EventoFim cx={1290} cy={360} label="Contas aprovadas" />
    </svg>
  );
}

function LegendaBpmn() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-2 text-xs text-muted-foreground border-t mt-1">
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#1f9d57" strokeWidth="1.8" /></svg>Evento de início</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#7C3AED" strokeWidth="1.2" /><circle cx="9" cy="9" r="4.5" fill="none" stroke="#7C3AED" strokeWidth="1" /></svg>Evento de tempo (prazos)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#b3261e" strokeWidth="3" /></svg>Evento de fim</span>
      <span className="inline-flex items-center gap-1.5"><svg width="20" height="18"><rect x="2" y="4" width="16" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>Tarefa</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><path d="M 9 2 L 16 9 L 9 16 L 2 9 Z" fill="none" stroke="#D97706" strokeWidth="1.4" /></svg>Gateway exclusivo (decisão)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="26" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="1.4" /><path d="M 20 1.5 L 25 5 L 20 8.5 Z" fill="currentColor" /></svg>Fluxo de sequência</span>
      <span className="inline-flex items-center gap-1.5"><svg width="26" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" /><path d="M 20 1.5 L 25 5 L 20 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>Fluxo de mensagem (entre processos)</span>
    </div>
  );
}

export function BpmnFluxo() {
  const [cheia, setCheia] = useState(false);

  // ESC fecha a tela cheia
  useEffect(() => {
    if (!cheia) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCheia(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [cheia]);

  return (
    <>
      <div className="relative overflow-x-auto rounded-xl border bg-muted/20 p-2 cursor-zoom-in group" onClick={() => setCheia(true)} title="Clique para ver em tela cheia">
        <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm opacity-80 group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />Tela cheia
        </div>
        <DiagramaSvg />
        <LegendaBpmn />
      </div>

      {cheia && (
        <div className="fixed inset-0 z-50 bg-background/97 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true" aria-label="Fluxograma BPMN em tela cheia">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card">
            <div className="text-sm font-semibold text-primary">Mapa do processo (BPMN 2.0) — Empenho e Prestação de Contas</div>
            <button onClick={() => setCheia(false)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent" aria-label="Fechar (ESC)">
              <X className="h-4 w-4" />Fechar <span className="text-xs text-muted-foreground">(ESC)</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
            <DiagramaSvg fill />
          </div>
          <div className="border-t bg-card px-4"><LegendaBpmn /></div>
        </div>
      )}
    </>
  );
}
