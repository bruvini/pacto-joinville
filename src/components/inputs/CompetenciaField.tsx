import { useEffect, useRef, useState } from "react";
import { CompetenciaInput } from "./CompetenciaInput";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

/**
 * Campo de competência que aceita UM ou MÚLTIPLOS meses (MM/AAAA).
 * Mantém granularidade: cada mês é uma entrada explícita. O valor é
 * persistido como lista separada por vírgula (ex.: "01/2026, 02/2026").
 */
const join = (items: string[]) => items.map((s) => s.trim()).filter(Boolean).join(", ");
const split = (v: string) => (v ? v.split(",").map((s) => s.trim()) : [""]);

export function CompetenciaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<string[]>(() => split(value));
  const lastEmit = useRef(value);

  // Sincroniza quando o valor muda por fora (ex.: carregamento do lançamento),
  // sem entrar em loop com as próprias emissões.
  useEffect(() => {
    if (value !== lastEmit.current) {
      setItems(split(value));
      lastEmit.current = value;
    }
  }, [value]);

  const update = (next: string[]) => {
    setItems(next);
    const j = join(next);
    lastEmit.current = j;
    onChange(j);
  };

  return (
    <div className="space-y-1.5">
      {items.map((m, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <CompetenciaInput value={m} onChange={(v) => update(items.map((x, idx) => (idx === i ? v : x)))} />
          {items.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => update(items.filter((_, idx) => idx !== i))}>
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => update([...items, ""])}>
        <Plus className="h-3 w-3 mr-1" />Adicionar mês
      </Button>
    </div>
  );
}
