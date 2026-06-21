import { Input } from "@/components/ui/input";

/** Marca "sei!" recriada em SVG para o botão de link do SEI. */
function SeiMark({ className = "h-4 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 66 28" className={className} role="img" aria-label="SEI">
      <text x="0" y="22" fontFamily="'Segoe UI', Arial, sans-serif" fontWeight="800" fontSize="26" fill="#1C9CD8">sei</text>
      <circle cx="53" cy="6" r="5" fill="#8FC23E" />
      <rect x="50.5" y="3" width="5" height="13" rx="1.5" fill="#8FC23E" />
      <circle cx="53" cy="22" r="4" fill="#1C9CD8" />
    </svg>
  );
}

/** Aceita só links http(s) — evita javascript:/phishing. */
const isSafeUrl = (u: string | null | undefined) => !!u && /^https?:\/\//i.test(u.trim());

/** Botão azul amigável "Abrir no SEI" que abre em nova aba. */
export function SeiButton({ href, label = "Abrir no SEI" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-[#1C9CD8] hover:bg-accent transition-colors whitespace-nowrap"
    >
      <SeiMark className="h-4 w-auto" />
      <span>{label}</span>
    </a>
  );
}

/**
 * Campo de link do SEI. No modo edição mostra o input + o botão "Abrir no SEI"
 * (quando a URL é válida). No modo leitura, mostra apenas o botão amigável.
 */
export function SeiLink({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
}) {
  if (!editable) {
    return isSafeUrl(value) ? <SeiButton href={value} /> : <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <div className="flex gap-1.5 items-center">
      <Input value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} placeholder="Cole o link do processo no SEI" />
      {isSafeUrl(value) && <SeiButton href={value} label="Abrir" />}
    </div>
  );
}
