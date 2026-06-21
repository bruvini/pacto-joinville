import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Máscara de competência MM/AAAA (ex.: 05/2026).
 * Bloqueia caracteres não numéricos e mês maior que 12.
 */
export function CompetenciaInput({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  className?: string;
}) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 6);
    let mm = d.slice(0, 2);
    const yyyy = d.slice(2, 6);
    if (mm.length === 2) {
      const m = parseInt(mm, 10);
      if (m > 12) mm = "12";
      if (m === 0) mm = "01";
    }
    onChange(d.length > 2 ? `${mm}/${yyyy}` : mm);
  };

  return (
    <Input id={id} inputMode="numeric" placeholder="MM/AAAA" value={value ?? ""} onChange={handle} className={className && cn(className)} />
  );
}
