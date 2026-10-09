import type { CSSProperties } from "react";
import {
  Banknote, ClipboardPlus, FileSignature, Files, HeartPulse,
  Hospital, Milk, Stethoscope,
} from "lucide-react";

// Ícones discretos do universo ACP/SMS: contratos, documentos, repasses,
// dieta enteral, enfermagem e rede hospitalar.
const elementos = [
  { Icon: FileSignature, x: 10, y: 28, duracao: 19, atraso: -3, escala: 22 },
  { Icon: Files, x: 32, y: 14, duracao: 23, atraso: -14, escala: 19 },
  { Icon: Banknote, x: 27, y: 72, duracao: 21, atraso: -8, escala: 23 },
  { Icon: Milk, x: 49, y: 38, duracao: 26, atraso: -18, escala: 20 },
  { Icon: ClipboardPlus, x: 15, y: 86, duracao: 24, atraso: -11, escala: 20 },
  { Icon: HeartPulse, x: 60, y: 65, duracao: 28, atraso: -4, escala: 21 },
  { Icon: Stethoscope, x: 71, y: 24, duracao: 25, atraso: -19, escala: 21 },
  { Icon: Hospital, x: 81, y: 81, duracao: 30, atraso: -7, escala: 23 },
] as const;

export function FloatingWorkIcons() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-80 [mask-image:linear-gradient(to_right,black_0%,black_55%,transparent_90%)]"
    >
      {elementos.map(({ Icon, x, y, duracao, atraso, escala }, indice) => (
        <span
          key={indice}
          className="login-work-icon absolute text-white/30"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            animationDuration: `${duracao}s`,
            animationDelay: `${atraso}s`,
            "--login-drift-x": `${indice % 2 ? 18 : -16}px`,
          } as CSSProperties}
        >
          <Icon size={escala} strokeWidth={1.4} />
        </span>
      ))}
    </div>
  );
}
