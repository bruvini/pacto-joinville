import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

/**
 * Fluxograma BPMN 2.0 do processo completo (estilo Bizagi/Camunda), em SVG puro.
 *
 * Pool 1 — Processo de Empenho (raias UFI — Gestão Financeira / ACP — Convênios)
 * Pool 2 — Prestação de Contas (raias APC — Prestação de Contas / Prestador)
 *
 * Artefatos técnicos: Objetos de Dados (documento SEI), Repositório de Dados
 * (Supabase/PostgreSQL), Eventos de Tempo (Cronômetros A e B desacoplados),
 * Gateways exclusivo/inclusivo/complexo e Anotações de Texto. Modo tela cheia.
 *
 * Cores funcionais BPMN: início = verde · intermediários/gateways = âmbar · fim = vermelho.
 */

const COR = {
  ufi: "#1C9CD8",
  acp: "#003866",
  apc: "#7C3AED",
  prestador: "#64748B",
  start: "#1f9d57",
  amber: "#D97706",
  end: "#b3261e",
  data: "#0E7490",
};

// ------------------------------- Raias / Pools -------------------------------
function Lane({ x, y, w, h, cor, nome }: { x: number; y: number; w: number; h: number; cor: string; nome: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={cor} opacity={0.05} stroke="var(--border)" strokeWidth={1} />
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

// ------------------------------- Tarefas -------------------------------
function Task({ x, cy, cor, lines, w = 150, badge }: { x: number; cy: number; cor: string; lines: string[]; w?: number; badge?: string }) {
  const h = 62;
  const y = cy - h / 2;
  const startY = cy - ((lines.length - 1) * 11) / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={9} fill="var(--card)" stroke={cor} strokeWidth={1.8} />
      <rect x={x} y={y} width={4} height={h} rx={2} fill={cor} />
      {badge && (
        <g>
          <circle cx={x + 15} cy={y + 13} r={9} fill={cor} />
          <text x={x + 15} y={y + 16.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#fff">{badge}</text>
        </g>
      )}
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2 + (badge ? 6 : 2)} y={startY + i * 11 + 3.5} textAnchor="middle" fontSize={i === 0 ? 9.6 : 8.6} fontWeight={i === 0 ? 700 : 400} fill={i === 0 ? "var(--foreground)" : "var(--muted-foreground)"}>{l}</text>
      ))}
    </g>
  );
}

// ------------------------------- Gateways -------------------------------
function GatewayX({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  const r = 21;
  return (
    <g>
      <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} fill="var(--card)" stroke={COR.amber} strokeWidth={1.8} />
      <path d={`M ${cx - 6.5} ${cy - 6.5} L ${cx + 6.5} ${cy + 6.5} M ${cx + 6.5} ${cy - 6.5} L ${cx - 6.5} ${cy + 6.5}`} stroke={COR.amber} strokeWidth={2.4} strokeLinecap="round" />
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--foreground)">{label}</text>
    </g>
  );
}

function GatewayInclusivo({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  const r = 21;
  return (
    <g>
      <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} fill="var(--card)" stroke={COR.amber} strokeWidth={1.8} />
      <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={COR.amber} strokeWidth={2.2} />
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--foreground)">{label}</text>
    </g>
  );
}

function GatewayComplexo({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  const r = 21;
  const s = 7.5;
  return (
    <g>
      <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} fill="var(--card)" stroke={COR.amber} strokeWidth={1.8} />
      <g stroke={COR.amber} strokeWidth={2.2} strokeLinecap="round">
        <path d={`M ${cx} ${cy - s} L ${cx} ${cy + s}`} />
        <path d={`M ${cx - s} ${cy} L ${cx + s} ${cy}`} />
        <path d={`M ${cx - s * 0.7} ${cy - s * 0.7} L ${cx + s * 0.7} ${cy + s * 0.7}`} />
        <path d={`M ${cx + s * 0.7} ${cy - s * 0.7} L ${cx - s * 0.7} ${cy + s * 0.7}`} />
      </g>
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--foreground)">{label}</text>
    </g>
  );
}

// ------------------------------- Eventos -------------------------------
function EventoInicio({ cx, cy, label, mensagem, timer }: { cx: number; cy: number; label: string; mensagem?: boolean; timer?: boolean }) {
  const cor = timer ? COR.amber : COR.start;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="var(--card)" stroke={cor} strokeWidth={1.8} />
      {mensagem && (
        <g stroke={cor} strokeWidth={1.1} fill="none">
          <rect x={cx - 6} y={cy - 4.5} width={12} height={9} rx={1} />
          <path d={`M ${cx - 6} ${cy - 4.5} L ${cx} ${cy + 1} L ${cx + 6} ${cy - 4.5}`} />
        </g>
      )}
      {timer && (
        <g stroke={cor} strokeWidth={1.1} fill="none">
          <circle cx={cx} cy={cy} r={7} />
          <path d={`M ${cx} ${cy} L ${cx} ${cy - 4.5} M ${cx} ${cy} L ${cx + 3.5} ${cy + 1.5}`} strokeWidth={1.3} strokeLinecap="round" />
        </g>
      )}
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize={8.8} fill="var(--muted-foreground)">{label}</text>
    </g>
  );
}

function EventoFim({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="var(--card)" stroke={COR.end} strokeWidth={3.4} />
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize={8.8} fontWeight={600} fill="var(--foreground)">{label}</text>
    </g>
  );
}

/** Evento de tempo intermediário (borda dupla + relógio) — âmbar. */
function TimerIntermediario({ cx, cy, label, sub }: { cx: number; cy: number; label: string; sub?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="var(--card)" stroke={COR.amber} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={10.5} fill="none" stroke={COR.amber} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={6.5} fill="none" stroke={COR.amber} strokeWidth={1} />
      <path d={`M ${cx} ${cy} L ${cx} ${cy - 4.5} M ${cx} ${cy} L ${cx + 3.5} ${cy + 1.5}`} stroke={COR.amber} strokeWidth={1.3} strokeLinecap="round" />
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize={8.8} fontWeight={700} fill="var(--foreground)">{label}</text>
      {sub && <text x={cx} y={cy + 28} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">{sub}</text>}
    </g>
  );
}

// ------------------------------- Artefatos de dados -------------------------------
/** Objeto de Dados / Documento (folha com dobra). */
function DataObject({ x, y, lines, w = 68, h = 50 }: { x: number; y: number; lines: string[]; w?: number; h?: number }) {
  const dobra = 13;
  return (
    <g>
      <path d={`M ${x} ${y} H ${x + w - dobra} L ${x + w} ${y + dobra} V ${y + h} H ${x} Z`} fill="var(--card)" stroke={COR.data} strokeWidth={1.3} />
      <path d={`M ${x + w - dobra} ${y} V ${y + dobra} H ${x + w}`} fill="none" stroke={COR.data} strokeWidth={1.3} />
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={y + 22 + i * 9.5} textAnchor="middle" fontSize={i === 0 ? 7.6 : 7} fontWeight={i === 0 ? 700 : 400} fill={i === 0 ? COR.data : "var(--muted-foreground)"}>{l}</text>
      ))}
    </g>
  );
}

/** Repositório de Dados / Banco (cilindro). */
function DataStore({ x, y, w, h, lines }: { x: number; y: number; w: number; h: number; lines: string[] }) {
  const ry = 8;
  return (
    <g>
      <path d={`M ${x} ${y + ry} V ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} V ${y + ry}`} fill="var(--card)" stroke={COR.data} strokeWidth={1.4} />
      <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} fill="var(--card)" stroke={COR.data} strokeWidth={1.4} />
      <path d={`M ${x} ${y + ry + 5} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry + 5}`} fill="none" stroke={COR.data} strokeWidth={0.8} opacity={0.6} />
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={y + h / 2 + i * 10} textAnchor="middle" fontSize={i === 0 ? 8.6 : 7.6} fontWeight={i === 0 ? 700 : 400} fill={i === 0 ? COR.data : "var(--muted-foreground)"}>{l}</text>
      ))}
    </g>
  );
}

/** Anotação de Texto (colchete grande à esquerda). */
function Anotacao({ x, y, lines, color = "var(--muted-foreground)" }: { x: number; y: number; lines: string[]; color?: string }) {
  const h = 8 + lines.length * 12;
  return (
    <g>
      <path d={`M ${x + 7} ${y} L ${x} ${y} L ${x} ${y + h} L ${x + 7} ${y + h}`} fill="none" stroke={color} strokeWidth={1.2} />
      {lines.map((l, i) => (
        <text key={i} x={x + 12} y={y + 14 + i * 12} fontSize={8.8} fill={color} fontWeight={i === 0 ? 700 : 400}>{l}</text>
      ))}
    </g>
  );
}

// ------------------------------- Conectores -------------------------------
/** Fluxo de sequência: polilinha com seta cheia. pts = [x1,y1, x2,y2, ...] */
function Flow({ pts, label, lx, ly, dashed, color }: { pts: number[]; label?: string; lx?: number; ly?: number; dashed?: boolean; color?: string }) {
  const d = pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${i === 0 ? "M" : "L"} ${v} ` : `${v} `), "");
  return (
    <g>
      <path d={d} fill="none" stroke={color ?? "var(--muted-foreground)"} strokeWidth={1.4} strokeDasharray={dashed ? "6 4" : undefined} markerEnd={dashed ? "url(#seta-aberta)" : "url(#seta)"} />
      {label && <text x={lx} y={ly} fontSize={8.6} fontWeight={700} fill="var(--foreground)">{label}</text>}
    </g>
  );
}

/** Associação de dados: linha pontilhada fina (artefato ↔ tarefa). */
function Assoc({ pts }: { pts: number[] }) {
  const d = pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${i === 0 ? "M" : "L"} ${v} ` : `${v} `), "");
  return <path d={d} fill="none" stroke={COR.data} strokeWidth={1.1} strokeDasharray="2 3" markerEnd="url(#seta-assoc)" />;
}

function DiagramaSvg({ fill }: { fill?: boolean }) {
  return (
    <svg viewBox="0 0 1900 980" style={fill ? undefined : { minWidth: 1480 }} className={fill ? "w-full h-full" : "w-full"} role="img" aria-label="Fluxograma BPMN do processo de empenho e prestação de contas">
      <defs>
        <marker id="seta" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="var(--muted-foreground)" /></marker>
        <marker id="seta-aberta" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.3" /></marker>
        <marker id="seta-assoc" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M 1 1 L 8 4.5 L 1 8" fill="none" stroke={COR.data} strokeWidth="1.1" /></marker>
      </defs>

      {/* ===== Artefatos globais: Banco de Dados + Autenticação ===== */}
      <DataStore x={40} y={16} w={210} h={64} lines={["Supabase / PostgreSQL", "lancamentos_pagamento, prestacoes_contas,", "historico_logs (trilha imutável)"]} />
      <Assoc pts={[145, 80, 145, 132]} />
      <Anotacao x={300} y={20} lines={["Autenticação: login institucional restrito", "(e-mail/senha · domínio @joinville.sc.gov.br)", "Acesso por papel — RLS no banco (fonte da verdade)"]} color={COR.start} />
      <Assoc pts={[300, 40, 118, 150]} />

      {/* ===== Cronômetro A — anotação sobre as Etapas 1–5 ===== */}
      <Anotacao x={560} y={18} lines={["Cronômetro A (Orçamentário) — Etapas 1 a 5", "Inicia em M-1 (‘Início do prazo (dia)’ do convênio).", "Ideal: concluir o empenho DENTRO do mês da competência (M).", "Crítico se virar M+1 sem o empenho gerado."]} color={COR.amber} />

      {/* ================= POOL 1 — PROCESSO DE EMPENHO ================= */}
      <PoolTitulo x={10} y={132} h={352} nome="PROCESSO DE EMPENHO" />
      <Lane x={36} y={132} w={1854} h={176} cor={COR.ufi} nome="UFI — Gestão Financeira" />
      <Lane x={36} y={308} w={1854} h={176} cor={COR.acp} nome="ACP — Convênios" />

      {/* Fluxos de sequência (sob os elementos) */}
      <Flow pts={[95, 388, 112, 388, 112, 220, 130, 220]} />
      <Flow pts={[280, 220, 292, 220, 292, 388, 305, 388]} />
      <Flow pts={[455, 388, 480, 388, 480, 220, 505, 220]} />
      <Flow pts={[655, 220, 699, 220]} />
      <Flow pts={[741, 220, 766, 220, 766, 388, 790, 388]} label="sim" lx={748} ly={214} />
      {/* Etapa 3: reprovação volta para a Solicitação (Etapa 2) */}
      <Flow pts={[720, 241, 720, 272, 380, 272, 380, 357]} label="não (corrigir e reenviar)" lx={470} ly={268} />
      {/* Etapa 3: Reverter Aprovação reabre a revisão (loop) */}
      <Flow pts={[720, 199, 720, 150, 580, 150, 580, 189]} label="Reverter Aprovação → reabre Etapa 3" lx={430} ly={146} dashed color={COR.amber} />
      <Flow pts={[940, 388, 966, 388, 966, 220, 990, 220]} />
      <Flow pts={[1140, 220, 1166, 220, 1166, 388, 1172, 388]} />
      <Flow pts={[1198, 388, 1250, 388]} />
      <Flow pts={[1400, 388, 1449, 388]} />
      <Flow pts={[1491, 388, 1540, 388]} label="sim" lx={1498} ly={382} />
      <Flow pts={[1690, 388, 1766, 388]} />
      <Flow pts={[1470, 409, 1470, 446, 1802, 446, 1802, 402]} label="não" lx={1478} ly={442} />

      {/* Elementos do fluxo */}
      <EventoInicio cx={80} cy={388} label="Lançamento criado" />
      <Task x={130} cy={220} cor={COR.ufi} badge="1" lines={["Análise de Orçamento", "dotação orçamentária", "+ fonte de pagamento"]} />
      <Task x={305} cy={388} cor={COR.acp} badge="2" lines={["Solicitação de Empenho", "valor + link SEI", "+ bloco de revisão"]} />
      <Task x={505} cy={220} cor={COR.ufi} badge="3" lines={["Revisão da Coordenação", "coordenação da UFI", "aprova ou nega"]} />
      <GatewayX cx={720} cy={220} label="Aprovada?" />
      <Task x={790} cy={388} cor={COR.acp} badge="4" lines={["Assinaturas + SEFAZ", "5 assinaturas", "envio à UCG.AEO"]} />
      <Task x={990} cy={220} cor={COR.ufi} badge="5" lines={["Liberação de Orçamento", "nº + link da", "Nota de Empenho"]} />
      <TimerIntermediario cx={1185} cy={388} label="Aguardar 1º de M+1" />
      <Task x={1250} cy={388} cor={COR.acp} badge="6" lines={["Liberação de Recurso", "relatórios, atesto,", "pagamento + DATA"]} />
      <GatewayX cx={1470} cy={388} label="Possui valor a anular?" />
      <Task x={1540} cy={388} cor={COR.amber} badge="7" lines={["Anulação de Empenho", "Solic.→Assin.→SEFAZ", "→ Aviso de Movimento"]} />
      <EventoFim cx={1780} cy={388} label="Processo concluído" />

      {/* Gateway inclusivo (assinaturas por par — regra OU) + anotação enxuta */}
      <GatewayInclusivo cx={865} cy={458} label="" />
      <Assoc pts={[865, 419, 865, 442]} />
      <Anotacao x={545} y={446} lines={["Assinaturas (Etapas 4 e 5) — regra OU por par:", "basta 1 de cada par (Gerente/Coord. ACP; Dir. Fin./Secretária)."]} color={COR.amber} />

      {/* Objetos de dados — Link SEI / Nº do Processo (Etapas 2, 4, 6, 7) */}
      <DataObject x={340} y={118} lines={["Link SEI", "Solicitação"]} />
      <Assoc pts={[374, 357, 374, 168]} />
      <DataObject x={835} y={118} lines={["Link SEI /", "Nº Processo"]} />
      <Assoc pts={[869, 357, 869, 168]} />
      <DataObject x={1585} y={450} lines={["Link SEI", "Anulação"]} w={70} />
      <Assoc pts={[1620, 419, 1620, 450]} />

      {/* Etapa 6 — Objeto de dados + gateway complexo do Relatório Técnico */}
      <DataObject x={1305} y={448} lines={["Link SEI (rel. téc.,", "certidões, comprov.)"]} w={92} />
      <Assoc pts={[1345, 419, 1351, 448]} />
      <GatewayComplexo cx={1215} cy={460} label="" />
      <Assoc pts={[1228, 450, 1250, 422]} />
      <Anotacao x={965} y={448} lines={["Relatório Técnico (Etapa 6): 2 Fiscais", "+ 1 assinatura opcional (Nome + Cargo)."]} color={COR.amber} />

      {/* Cronômetro B — anotação financeira/técnica + prazo fatal */}
      <Anotacao x={1250} y={175} lines={["Cronômetro B (Financeiro/Técnico) — Etapa 6", "NÃO cobra em M-1/M (produção aberta).", "Cobrança abre em 01/M+1.", "Prazo fatal: 5º dia útil de M+2 (dinheiro na conta)."]} color={COR.amber} />
      <EventoFim cx={1620} cy={220} label="Prazo fatal: 5º dia útil M+2" />
      <Assoc pts={[1360, 357, 1606, 232]} />

      {/* Fluxo de mensagem: DATA DO PAGAMENTO dispara a Prestação de Contas */}
      <Flow pts={[1280, 419, 1280, 512, 90, 512, 90, 566]} dashed label="a Data do Pagamento inicia o prazo de prestação de contas" lx={470} ly={507} />

      {/* ================= POOL 2 — PRESTAÇÃO DE CONTAS ================= */}
      <PoolTitulo x={10} y={560} h={330} nome="PRESTAÇÃO DE CONTAS" />
      <Lane x={36} y={560} w={1854} h={165} cor={COR.apc} nome="APC — Prestação de Contas" />
      <Lane x={36} y={725} w={1854} h={165} cor={COR.prestador} nome="Prestador" />

      {/* Fluxos */}
      <Flow pts={[104, 620, 168, 620]} />
      <Flow pts={[196, 620, 236, 620]} />
      <Flow pts={[250, 640, 250, 800, 300, 800]} />
      <Flow pts={[450, 800, 520, 800, 520, 650]} />
      <Flow pts={[610, 620, 660, 620]} />
      <Flow pts={[810, 620, 860, 620]} />
      <Flow pts={[940, 620, 990, 620]} label="não (diligências)" lx={930} ly={612} />
      <Flow pts={[888, 590, 888, 566, 1420, 566, 1420, 604]} label="sim (aprovada)" lx={896} ly={560} />
      <Flow pts={[1140, 620, 1190, 620, 1190, 760]} />
      <Flow pts={[1190, 800, 700, 800, 700, 650]} label="resposta reanalisada" lx={840} ly={795} />

      {/* Elementos */}
      <EventoInicio cx={90} cy={620} label="Pagamento efetuado" mensagem />
      <EventoInicio cx={182} cy={620} label="Alertas D-7 · D-3 · D-0" timer />
      <text x={182} y={660} textAnchor="middle" fontSize={7.6} fill="var(--muted-foreground)">(sino + e-mail p/ setor APC)</text>
      <Task x={300} cy={800} cor={COR.prestador} lines={["Entregar prestação", "de contas", "(documentos no SEI)"]} />
      <DataObject x={470} y={835} lines={["Docs SEI", "da prestação"]} w={74} />
      <Assoc pts={[420, 831, 490, 835]} />
      <Task x={460} cy={620} cor={COR.apc} lines={["Registrar recebimento", "data + link SEI"]} />
      <Task x={660} cy={620} cor={COR.apc} lines={["Analisar a prestação", "esteira: SES → CGM →", "baixa contábil"]} />
      <GatewayX cx={890} cy={620} label="Aprovada?" />
      <Task x={990} cy={620} cor={COR.apc} lines={["Emitir ofício", "de diligência", "(link SEI)"]} />
      <Task x={1090} cy={800} cor={COR.prestador} lines={["Responder /", "regularizar pendências"]} />
      <EventoFim cx={1420} cy={620} label="Contas encerradas" />

      {/* ===== Anotação: Modo Retroativo (comportamento dinâmico) ===== */}
      <Anotacao x={40} y={906} lines={["Modo Retroativo (admin): quando ativo, o status do processo SALTA para a última etapa preenchida, liberando o preenchimento fora de ordem (sem as travas de sequência).", "Uso temporário para migração de dados históricos — desligar ao terminar restaura a disciplina do fluxo."]} color={COR.acp} />
    </svg>
  );
}

/**
 * BPMN 2.0 do Fluxo 2 — Liquidação Direta / Complementar (refatorado).
 *
 * Correções desta versão:
 *  - Removida a raia da "Comissão de Gestão e Controle de Despesa" (assinatura
 *    é campo texto livre e passa a constar apenas como anotação nas Etapas 4 e 6).
 *  - Adicionada a Pool 2 (Prestação de Contas), conectada por mensagem tracejada
 *    ao final do fluxo — mesmo padrão do Fluxo 1.
 *  - Layout estritamente horizontal com ≥180px de folga entre retângulos;
 *    setas ortogonais entrando/saindo pelas laterais dos blocos.
 *  - Objetos de dados (links SEI) posicionados imediatamente acima/abaixo das
 *    tarefas correspondentes, ligados por associação vertical curta.
 *  - Timer intermediário centralizado em linha reta entre Etapa 5 e Etapa 6.
 *  - Gateways de assinatura isolados abaixo das tarefas, com anotações roxas
 *    perfeitamente alinhadas — sem colisão com o eixo principal do processo.
 */
function DiagramaFluxo2Svg({ fill }: { fill?: boolean }) {
  // ---- Coordenadas horizontais (centro de cada tarefa/evento) ----
  // Espaçamento mínimo entre retângulos ≥ 180px. Tarefas w=150 (Etapa 6 w=170).
  const Y_UFI = 210;   // faixa superior — UFI Gestão Financeira
  const Y_ACP = 470;   // faixa inferior — ACP Convênios
  const Y_MID = (Y_UFI + Y_ACP) / 2; // 340 — eixo de troca de raia
  const T = { // x = canto esquerdo de cada tarefa (w=150)
    t1: 120,  // Etapa 1 — UFI
    t2: 460,  // Etapa 2 — ACP
    t3: 800,  // Etapa 3 — UFI
    t4: 1160, // Etapa 4 — ACP (após gateway "Aprovada?")
    t5: 1500, // Etapa 5 — UFI
    t6: 1840, // Etapa 6 — ACP (w=170)
  };
  const GW_APROV_X = 1080;     // gateway "Aprovada?"
  const TIMER_X = 1770;        // relógio entre Etapa 5 e Etapa 6
  const END_X = 2080;          // evento de fim

  return (
    <svg
      viewBox="0 0 2200 1080"
      style={fill ? undefined : { minWidth: 1720 }}
      className={fill ? "w-full h-full" : "w-full"}
      role="img"
      aria-label="Fluxograma BPMN do Fluxo 2 — Liquidação Direta e Prestação de Contas"
    >
      <defs>
        <marker id="seta2" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="var(--muted-foreground)" /></marker>
        <marker id="seta2-assoc" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M 1 1 L 8 4.5 L 1 8" fill="none" stroke={COR.data} strokeWidth="1.1" /></marker>
      </defs>

      {/* ===== Artefatos globais ===== */}
      <DataStore x={40} y={12} w={250} h={60} lines={["Supabase / PostgreSQL", "lancamentos_pagamento (Fluxo 2),", "assinaturas_etapa · lancamento_marco_tempo"]} />
      <Assoc pts={[165, 72, 165, 108]} />
      <Anotacao x={320} y={14} lines={[
        "Fluxo 2 — Liquidação Direta / Complementar.",
        "Sem Etapa 7 (anulação). Convênios de Pagamentos Complementares ignoram teto e auto-incrementam a parcela.",
      ]} color={COR.acp} />

      {/* ================= POOL 1 — LIQUIDAÇÃO DIRETA ================= */}
      <PoolTitulo x={10} y={110} h={560} nome="PROCESSO DE LIQUIDAÇÃO DIRETA (FLUXO 2)" />
      <Lane x={36} y={110} w={2154} h={230} cor={COR.ufi} nome="UFI — Gestão Financeira" />
      <Lane x={36} y={340} w={2154} h={330} cor={COR.acp} nome="ACP — Convênios" />

      {/* ---- Fluxos de sequência (ortogonais, pelas laterais dos blocos) ---- */}
      <Flow pts={[94, Y_UFI, T.t1, Y_UFI]} />
      <Flow pts={[T.t1 + 150, Y_UFI, T.t2 - 30, Y_UFI, T.t2 - 30, Y_ACP, T.t2, Y_ACP]} />
      <Flow pts={[T.t2 + 150, Y_ACP, T.t3 - 30, Y_ACP, T.t3 - 30, Y_UFI, T.t3, Y_UFI]} />
      <Flow pts={[T.t3 + 150, Y_UFI, GW_APROV_X - 21, Y_UFI]} />
      <Flow pts={[GW_APROV_X + 21, Y_UFI, T.t4 - 30, Y_UFI, T.t4 - 30, Y_ACP, T.t4, Y_ACP]} label="sim" lx={GW_APROV_X + 30} ly={Y_UFI - 6} />
      <Flow pts={[GW_APROV_X, Y_UFI + 21, GW_APROV_X, 290, T.t2 + 75, 290, T.t2 + 75, Y_ACP - 31]} label="não (corrigir e reenviar)" lx={GW_APROV_X - 320} ly={286} />
      <Flow pts={[T.t4 + 150, Y_ACP, T.t5 - 30, Y_ACP, T.t5 - 30, Y_UFI, T.t5, Y_UFI]} />
      <Flow pts={[T.t5 + 150, Y_UFI, TIMER_X - 20, Y_UFI, TIMER_X - 20, Y_MID]} />
      <Flow pts={[TIMER_X + 20, Y_MID, TIMER_X + 20, Y_ACP, T.t6, Y_ACP]} />
      <Flow pts={[T.t6 + 170, Y_ACP, END_X - 14, Y_ACP]} />

      {/* ---- Elementos principais do fluxo ---- */}
      <EventoInicio cx={80} cy={Y_UFI} label="Lançamento criado" />
      <Task x={T.t1} cy={Y_UFI} cor={COR.ufi} badge="1" lines={["Análise de Orçamento", "dotação +", "fonte de pagamento"]} />
      <Task x={T.t2} cy={Y_ACP} cor={COR.acp} badge="2" lines={["Solicitação de Empenho", "valor + link SEI", "+ bloco de revisão"]} />
      <Task x={T.t3} cy={Y_UFI} cor={COR.ufi} badge="3" lines={["Revisão da Coordenação", "coordenação da UFI", "aprova ou nega"]} />
      <GatewayX cx={GW_APROV_X} cy={Y_UFI} label="Aprovada?" />
      <Task x={T.t4} cy={Y_ACP} cor={COR.acp} badge="4" lines={["Assinaturas + SEFAZ", "Coord.Orç · Fiscal ·", "Fin./Saúde"]} />
      <Task x={T.t5} cy={Y_UFI} cor={COR.ufi} badge="5" lines={["Liberação de Orçamento", "nº + link Nota", "de Empenho"]} />
      <TimerIntermediario cx={TIMER_X} cy={Y_MID} label="Aguardar" sub="fechamento do mês (M+1)" />
      <Task x={T.t6} cy={Y_ACP} cor={COR.acp} badge="6" w={170} lines={["Liquidação de Despesa", "8 subpassos: minuta →", "comprovante + DATA"]} />
      <EventoFim cx={END_X} cy={Y_ACP} label="Concluído (sem Etapa 7)" />

      {/* ---- Objetos de dados (links SEI): imediatamente ACIMA/ABAIXO das tarefas ---- */}
      <DataObject x={T.t2 + 75 - 34} y={Y_ACP - 130} lines={["Link SEI", "Solicitação"]} />
      <Assoc pts={[T.t2 + 75, Y_ACP - 80, T.t2 + 75, Y_ACP - 31]} />
      <DataObject x={T.t5 + 75 - 34} y={Y_UFI + 40} lines={["Link SEI", "Nota Empenho"]} />
      <Assoc pts={[T.t5 + 75, Y_UFI + 31, T.t5 + 75, Y_UFI + 40]} />
      <DataObject x={T.t6 + 6} y={Y_ACP + 40} lines={["Minuta · Memorando", "· Portaria (SEI)"]} w={112} />
      <Assoc pts={[T.t6 + 62, Y_ACP + 31, T.t6 + 62, Y_ACP + 40]} />
      <DataObject x={T.t6 + 122} y={Y_ACP + 40} lines={["Solic. Liq. · Aviso Mov.", "· Comprovante (SEI)"]} w={140} />
      <Assoc pts={[T.t6 + 192, Y_ACP + 31, T.t6 + 192, Y_ACP + 40]} />

      {/* ---- Gateways de assinatura + anotações roxas (isolados, abaixo do eixo principal) ---- */}
      <GatewayInclusivo cx={T.t4 + 75} cy={600} label="" />
      <Assoc pts={[T.t4 + 75, Y_ACP + 31, T.t4 + 75, 579]} />
      <Anotacao
        x={T.t4 + 75 - 210}
        y={630}
        lines={[
          "Etapa 4 — Assinaturas (regra OU por par):",
          "Coord. de Orçamentos · Fiscal · Diretoria Financeira E/OU",
          "Secretária de Saúde. Switch: envio à SEFAZ.UCG.AEO.",
          "Comissão de Gestão e Controle de Despesa: assinatura em campo texto livre.",
        ]}
        color={COR.apc}
      />

      <GatewayInclusivo cx={T.t6 + 85} cy={600} label="" />
      <Assoc pts={[T.t6 + 85, Y_ACP + 31, T.t6 + 85, 579]} />
      <Anotacao
        x={T.t6 + 85 - 230}
        y={630}
        lines={[
          "Etapa 6 — Gateways de assinatura por subpasso:",
          "Minuta (Gerente ACP + Diretor de Serviços Compl.);",
          "Memorando (Fiscal + Gerente/Coord. ACP);",
          "Solic. Liquidação e Aviso Mov. (Fiscal + Comissão · texto livre).",
          "Switches: Minuta → SES.UPA / SES.UPA.APA · Aviso → SEFAZ.UAF.ADE.",
        ]}
        color={COR.apc}
      />

      {/* ===== Fluxo de mensagem: fim da liquidação → Pool 2 (Prestação de Contas) ===== */}
      <Flow
        pts={[END_X, Y_ACP + 14, END_X, 745, 90, 745, 90, 810]}
        dashed
        label="Data do Pagamento → inicia prazo da Prestação de Contas (quando exigida pelo convênio)"
        lx={520}
        ly={740}
      />

      {/* ================= POOL 2 — PRESTAÇÃO DE CONTAS ================= */}
      <PoolTitulo x={10} y={790} h={250} nome="PRESTAÇÃO DE CONTAS" />
      <Lane x={36} y={790} w={2154} h={125} cor={COR.apc} nome="APC — Prestação de Contas" />
      <Lane x={36} y={915} w={2154} h={125} cor={COR.prestador} nome="Prestador" />

      {/* Fluxos Pool 2 */}
      <Flow pts={[104, 850, 250, 850]} />
      <Flow pts={[278, 850, 340, 850]} />
      <Flow pts={[370, 870, 370, 977, 460, 977]} />
      <Flow pts={[610, 977, 700, 977, 700, 870]} />
      <Flow pts={[780, 850, 900, 850]} />
      <Flow pts={[1050, 850, 1170, 850]} />
      <Flow pts={[1260, 850, 1360, 850]} label="não (diligências)" lx={1240} ly={842} />
      <Flow pts={[1215, 820, 1215, 795, 1780, 795, 1780, 836]} label="sim (aprovada)" lx={1230} ly={790} />
      <Flow pts={[1510, 850, 1580, 850, 1580, 977, 1090, 977, 1090, 890]} label="resposta reanalisada" lx={1180} ly={972} />

      {/* Elementos Pool 2 */}
      <EventoInicio cx={90} cy={850} label="Pagamento efetuado" mensagem />
      <EventoInicio cx={264} cy={850} label="Alertas D-7 · D-3 · D-0" timer />
      <Task x={460} cy={977} cor={COR.prestador} lines={["Entregar prestação", "de contas", "(documentos no SEI)"]} />
      <DataObject x={620} y={1005} lines={["Docs SEI", "prestação"]} w={80} />
      <Assoc pts={[610, 990, 620, 1010]} />
      <Task x={630} cy={850} cor={COR.apc} lines={["Registrar recebimento", "data + link SEI"]} />
      <Task x={900} cy={850} cor={COR.apc} lines={["Analisar a prestação", "esteira: SES → CGM →", "baixa contábil"]} />
      <GatewayX cx={1215} cy={850} label="Aprovada?" />
      <Task x={1360} cy={850} cor={COR.apc} lines={["Emitir ofício", "de diligência", "(link SEI)"]} />
      <Task x={940} cy={977} cor={COR.prestador} lines={["Responder /", "regularizar pendências"]} />
      <EventoFim cx={1830} cy={850} label="Contas encerradas" />

      <Anotacao x={40} y={1050} lines={[
        "Pool 2 só é exigida quando o convênio tem 'Exige prestação de contas' ativo.",
        "Fluxo 2 usa a mesma esteira APC do Fluxo 1 — reaproveitando alertas D-7/D-3/D-0 e diligências.",
      ]} color={COR.acp} />
    </svg>
  );
}

function LegendaBpmn() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-2 text-xs text-muted-foreground border-t mt-1">
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#1f9d57" strokeWidth="1.8" /></svg>Início (verde)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#D97706" strokeWidth="1.3" /><circle cx="9" cy="9" r="4.5" fill="none" stroke="#D97706" strokeWidth="1.1" /></svg>Tempo intermediário (âmbar)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="#b3261e" strokeWidth="3" /></svg>Fim (vermelho)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><path d="M 9 2 L 16 9 L 9 16 L 2 9 Z" fill="none" stroke="#D97706" strokeWidth="1.4" /><path d="M6 6 L12 12 M12 6 L6 12" stroke="#D97706" strokeWidth="1.6" /></svg>Gateway exclusivo (X)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="18"><path d="M 9 2 L 16 9 L 9 16 L 2 9 Z" fill="none" stroke="#D97706" strokeWidth="1.4" /><circle cx="9" cy="9" r="3.2" fill="none" stroke="#D97706" strokeWidth="1.8" /></svg>Gateway inclusivo (OU)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="20" height="18"><path d="M 3 3 H 13 L 17 7 V 15 H 3 Z" fill="none" stroke="#0E7490" strokeWidth="1.2" /></svg>Objeto de dados (Link SEI)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="20" height="18"><ellipse cx="10" cy="5" rx="7" ry="2.5" fill="none" stroke="#0E7490" strokeWidth="1.2" /><path d="M3 5 V13 A7 2.5 0 0 0 17 13 V5" fill="none" stroke="#0E7490" strokeWidth="1.2" /></svg>Banco de dados (Supabase)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="26" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" /><path d="M 20 1.5 L 25 5 L 20 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>Mensagem / associação</span>
    </div>
  );
}

export function BpmnFluxo({ variante = "fluxo1" }: { variante?: "fluxo1" | "fluxo2" }) {
  const [cheia, setCheia] = useState(false);
  const Diagrama = variante === "fluxo2" ? DiagramaFluxo2Svg : DiagramaSvg;
  const titulo = variante === "fluxo2"
    ? "Mapa do processo (BPMN 2.0) — Fluxo 2 · Liquidação Direta"
    : "Mapa do processo (BPMN 2.0) — Empenho e Prestação de Contas";

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
        <Diagrama />
        <LegendaBpmn />
      </div>

      {cheia && (
        <div className="fixed inset-0 z-50 bg-background/97 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true" aria-label="Fluxograma BPMN em tela cheia">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card">
            <div className="text-sm font-semibold text-primary">{titulo}</div>
            <button onClick={() => setCheia(false)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent" aria-label="Fechar (ESC)">
              <X className="h-4 w-4" />Fechar <span className="text-xs text-muted-foreground">(ESC)</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 overflow-auto flex items-center justify-center">
            <Diagrama fill />
          </div>
          <div className="border-t bg-card px-4"><LegendaBpmn /></div>
        </div>
      )}
    </>
  );
}
