/**
 * Fluxograma BPMN 2.0 do processo completo (estilo Bizagi):
 * Pool 1 — Processo de Empenho (raias ACO / ACP / Coordenação)
 * Pool 2 — Prestação de Contas (raias APC / Prestador)
 * SVG puro, temático (usa as variáveis de cor do app) e com scroll horizontal.
 */

const COR = {
  aco: "#1C9CD8",
  acp: "#003866",
  coord: "#8FC23E",
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

export function BpmnFluxo() {
  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
      <svg viewBox="0 0 1500 668" style={{ minWidth: 1180 }} className="w-full" role="img" aria-label="Fluxograma BPMN do processo de empenho e prestação de contas">
        <defs>
          <marker id="seta" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
            <path d="M 0 0 L 9 4.5 L 0 9 Z" fill="var(--muted-foreground)" />
          </marker>
          <marker id="seta-aberta" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.3" />
          </marker>
        </defs>

        {/* ================= POOL 1 — PROCESSO DE EMPENHO ================= */}
        <PoolTitulo x={10} y={10} h={360} nome="PROCESSO DE EMPENHO" />
        <Lane x={36} y={10} w={1454} h={120} cor={COR.aco} nome="ACO — Orçamento" />
        <Lane x={36} y={130} w={1454} h={120} cor={COR.acp} nome="ACP — Convênios" />
        <Lane x={36} y={250} w={1454} h={120} cor={COR.coord} nome="Coordenação" />

        {/* Fluxos (desenhados antes, para ficarem sob os elementos) */}
        <Flow pts={[84, 177, 84, 70, 118, 70]} />
        <Flow pts={[248, 70, 344, 70, 344, 160]} />
        <Flow pts={[344, 218, 344, 310, 438, 310]} />
        <Flow pts={[568, 310, 588, 310]} />
        <Flow pts={[610, 290, 610, 240, 375, 240, 375, 220]} label="não (corrigir)" lx={455} ly={236} />
        <Flow pts={[630, 310, 734, 310, 734, 220]} label="sim" lx={638} ly={302} />
        <Flow pts={[798, 190, 894, 190, 894, 100]} />
        <Flow pts={[958, 70, 1054, 70, 1054, 160]} />
        <Flow pts={[1118, 190, 1148, 190]} />
        <Flow pts={[1190, 190, 1228, 190]} label="sim" lx={1194} ly={182} />
        <Flow pts={[1358, 190, 1405, 190]} />
        <Flow pts={[1170, 210, 1170, 240, 1420, 240, 1420, 205]} label="não" lx={1178} ly={236} />
        {/* Fluxo de mensagem: a DATA DO PAGAMENTO dispara a prestação de contas */}
        <Flow pts={[1054, 218, 1054, 385, 90, 385, 90, 444]} dashed label="data do pagamento inicia o prazo de prestação de contas" lx={480} ly={380} />

        {/* Elementos */}
        <EventoInicio cx={84} cy={190} label="Lançamento criado" />
        <Task x={120} cy={70} cor={COR.aco} lines={["1. Análise de Orçamento", "dotação orçamentária", "+ fonte de pagamento"]} />
        <Task x={280} cy={190} cor={COR.acp} lines={["2. Solicitação de Empenho", "valor, link SEI,", "bloco p/ revisão"]} />
        <Task x={440} cy={310} cor={COR.coord} lines={["3. Revisão do Coordenador", "parecer registrado", "no histórico"]} />
        <Gateway cx={610} cy={310} label="Aprovada?" />
        <Task x={670} cy={190} cor={COR.acp} lines={["4. Assinaturas + SEFAZ", "5 assinaturas", "envio à UCG.AEO"]} />
        <Task x={830} cy={70} cor={COR.aco} lines={["5. Liberação de Orçamento", "nº + link da", "Nota de Empenho"]} />
        <Task x={990} cy={190} cor={COR.acp} lines={["6. Liberação de Recurso", "relatórios, atesto, UAF.ADE,", "pagamento + DATA"]} />
        <Gateway cx={1170} cy={190} label="Saldo a anular?" />
        <Task x={1230} cy={190} cor={COR.anul} lines={["7. Anulação de Empenho", "saldo devolvido", "ao orçamento"]} />
        <EventoFim cx={1420} cy={190} label="Processo concluído" />

        {/* ================= POOL 2 — PRESTAÇÃO DE CONTAS ================= */}
        <PoolTitulo x={10} y={400} h={240} nome="PRESTAÇÃO DE CONTAS" />
        <Lane x={36} y={400} w={1454} h={120} cor={COR.apc} nome="APC" />
        <Lane x={36} y={520} w={1454} h={120} cor={COR.prestador} nome="Prestador" />

        {/* Fluxos */}
        <Flow pts={[103, 460, 170, 460]} />
        <Flow pts={[185, 473, 185, 580, 248, 580]} />
        <Flow pts={[378, 580, 504, 580, 504, 490]} />
        <Flow pts={[568, 460, 628, 460]} />
        <Flow pts={[758, 460, 793, 460]} />
        <Flow pts={[835, 460, 878, 460]} label="não (pendências)" lx={826} ly={448} />
        <Flow pts={[815, 440, 815, 420, 1290, 420, 1290, 445]} label="sim" lx={823} ly={432} />
        <Flow pts={[1008, 460, 1134, 460, 1134, 550]} />
        <Flow pts={[1070, 580, 694, 580, 694, 490]} label="resposta reanalisada" lx={780} ly={575} />

        {/* Elementos */}
        <EventoInicio cx={90} cy={460} label="Pagamento efetuado" mensagem />
        <EventoTimer cx={185} cy={460} label="Alertas D-7 · D-3 · D-0" />
        <text x={185} y={497} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">(sino + e-mail p/ setor APC)</text>
        <Task x={250} cy={580} cor={COR.prestador} lines={["Entregar prestação", "de contas", "(documentos no SEI)"]} />
        <Task x={440} cy={460} cor={COR.apc} lines={["Registrar recebimento", "data + link SEI"]} />
        <Task x={630} cy={460} cor={COR.apc} lines={["Analisar a prestação", "valor aprovado", "× valor glosado"]} />
        <Gateway cx={815} cy={460} label="Aprovada?" />
        <Task x={880} cy={460} cor={COR.apc} lines={["Emitir ofício", "de diligência", "(link SEI)"]} />
        <Task x={1070} cy={580} cor={COR.prestador} lines={["Responder /", "regularizar pendências"]} />
        <EventoFim cx={1290} cy={460} label="Contas aprovadas" />
      </svg>

      {/* Legenda BPMN */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-2 text-xs text-muted-foreground border-t mt-1">
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#1f9d57" strokeWidth="1.8" /></svg>Evento de início</span>
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#7C3AED" strokeWidth="1.2" /><circle cx="9" cy="9" r="4.5" fill="none" stroke="#7C3AED" strokeWidth="1" /></svg>Evento de tempo (prazos)</span>
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#b3261e" strokeWidth="3" /></svg>Evento de fim</span>
        <span className="inline-flex items-center gap-1.5"><svg width="20" height="18"><rect x="2" y="4" width="16" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>Tarefa</span>
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><path d="M 9 2 L 16 9 L 9 16 L 2 9 Z" fill="none" stroke="#D97706" strokeWidth="1.4" /></svg>Gateway exclusivo (decisão)</span>
        <span className="inline-flex items-center gap-1.5"><svg width="26" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="1.4" /><path d="M 20 1.5 L 25 5 L 20 8.5 Z" fill="currentColor" /></svg>Fluxo de sequência</span>
        <span className="inline-flex items-center gap-1.5"><svg width="26" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" /><path d="M 20 1.5 L 25 5 L 20 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>Fluxo de mensagem (entre processos)</span>
      </div>
    </div>
  );
}
